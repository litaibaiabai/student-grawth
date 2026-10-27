/**
 * renovation_indicators.integration.test.js — 任务 07 年级指标与教师评价集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const {
  configureGradeIndicators,
  saveStudentIndicatorValues,
  getGradeIndicators,
  getGradeIndicatorProgress
} = require('../controllers/reportIndicatorController');

describe('Task 07: 年级指标与教师评价集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_indicators_' + Date.now();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${testDbName}\``);

    // 加载 schema 并应用全量迁移
    const root = path.resolve(__dirname, '../..');
    const fullSchema = fs.readFileSync(path.join(root, 'sql/00_full_schema.sql'), 'utf8')
      .replaceAll('`student_growth`', '`' + testDbName + '`');
    await connection.query(fullSchema);

    const { applyRegisteredMigrations } = require('../services/migrationRunner');
    require('../migrations/renovation');
    await applyRegisteredMigrations({ connection, databaseName: testDbName });

    // 初始化基础用户与任教数据
    await connection.query(`
      INSERT INTO academic_year (id, school_id, academic_year, semester, start_date, end_date, is_current, active)
      VALUES (1, 1, '2026-2027', 1, '2026-09-01', '2027-01-31', 1, 1);
      INSERT INTO users (id, school_id, username, password, real_name, role, status)
      VALUES 
        (101, 1, 'teacher_auth', 'hash123', '张老师', 'teacher', 0),
        (102, 1, 'teacher_unauth', 'hash123', '李老师', 'teacher', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES (201, 1, 'student_test', 'hash123', '小明', 'student', 3, 2, 0);
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, 101, 3, 2, 'CHINESE', 1);
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('1. 管理员成功配置年级适用指标字典（star/grade/number/text）', async () => {
    const req = {
      conn: connection,
      user: { id: 1, schoolId: 1, role: 'admin' },
      body: {
        grade: 3,
        termId: 1,
        indicators: [
          { indicatorCode: 'HABIT_STAR', indicatorName: '书写规范', dimension: 'Z', valueType: 'star', unit: '星', isRequired: 1 },
          { indicatorCode: 'BEHAVIOR_GRADE', indicatorName: '课堂纪律', dimension: 'D', valueType: 'grade', unit: '等', isRequired: 1 },
          { indicatorCode: 'RUN_50M', indicatorName: '50米跑', dimension: 'T', valueType: 'number', unit: '秒', isRequired: 0 },
          { indicatorCode: 'ART_WORK', indicatorName: '美术手作', dimension: 'M', valueType: 'text', unit: '', isRequired: 0 }
        ]
      }
    };

    let resData = null;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { resData = data; return this; }
    };

    await configureGradeIndicators(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(resData.data && resData.data.length >= 4);

    // 验证数据库字典
    const [rows] = await connection.query("SELECT * FROM grade_indicator_definition WHERE school_id = 1 AND grade = 3");
    assert.equal(rows.length, 4);
  });

  test('2. 授权教师录入指标评价，原值保留，等级不映射数值，有效0分不作缺失，C2版本递增', async () => {
    const req = {
      conn: connection,
      user: {
        id: 101,
        schoolId: 1,
        role: 'teacher',
        classes: [{ grade: 3, class_no: 2 }]
      },
      params: { studentId: '201' },
      body: {
        termId: 1,
        values: [
          { indicatorCode: 'HABIT_STAR', valueType: 'star', rawValue: '★★★', status: 'RECORDED' },
          { indicatorCode: 'BEHAVIOR_GRADE', valueType: 'grade', rawValue: 'A', status: 'RECORDED' },
          { indicatorCode: 'RUN_50M', valueType: 'number', rawValue: '0', status: 'RECORDED' },
          { indicatorCode: 'ART_WORK', valueType: 'text', rawValue: '', status: 'NOT_APPLICABLE' }
        ]
      }
    };

    let resData = null;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { resData = data; return this; }
    };

    await saveStudentIndicatorValues(req, res);
    assert.equal(res.statusCode, 200);

    // 数据库断言
    const [valRows] = await connection.query("SELECT * FROM student_indicator_value WHERE student_id = 201 AND term_id = 1");
    assert.equal(valRows.length, 4);

    const starRow = valRows.find(r => r.indicator_code === 'HABIT_STAR');
    const gradeRow = valRows.find(r => r.indicator_code === 'BEHAVIOR_GRADE');
    const zeroRow = valRows.find(r => r.indicator_code === 'RUN_50M');
    const naRow = valRows.find(r => r.indicator_code === 'ART_WORK');

    // 星级原值 '★★★'
    assert.equal(starRow.raw_value, '★★★');
    // 等级 A 不得被私自映射为百分分
    assert.equal(gradeRow.numeric_value, null);
    // 有效 0 分 status 必须是 RECORDED，不能是 MISSING
    assert.equal(zeroRow.status, 'RECORDED');
    assert.equal(zeroRow.raw_value, '0');
    assert.equal(Number(zeroRow.numeric_value), 0);
    // 不适用状态保留
    assert.equal(naRow.status, 'NOT_APPLICABLE');

    // 验证 C2 学期状态原子递增
    const [termState] = await connection.query("SELECT source_revision FROM student_term_state WHERE student_id = 201 AND term_id = 1");
    assert.ok(termState[0].source_revision >= 2);
  });

  test('3. 越权跨班教师录入指标打分被拒绝 403', async () => {
    const unauthReq = {
      conn: connection,
      user: {
        id: 102,
        schoolId: 1,
        role: 'teacher',
        classes: [{ grade: 4, class_no: 1 }] // 不教 3 年级 2 班
      },
      params: { studentId: '201' },
      body: {
        termId: 1,
        values: [
          { indicatorCode: 'HABIT_STAR', valueType: 'star', rawValue: '★★★★★', status: 'RECORDED' }
        ]
      }
    };

    let caught403 = false;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { return this; }
    };

    try {
      await saveStudentIndicatorValues(unauthReq, res, (err) => {
        if (err && (err.statusCode === 403 || err.status === 403)) {
          caught403 = true;
        }
      });
      if (res.statusCode === 403) caught403 = true;
    } catch (err) {
      if (err.statusCode === 403 || err.status === 403) caught403 = true;
    }

    assert.equal(caught403, true, '越权教师跨班打分必须被拒绝 403');
  });
});
