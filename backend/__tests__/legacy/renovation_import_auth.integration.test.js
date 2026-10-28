/**
 * renovation_import_auth.integration.test.js — 任务 08 学科成绩导入集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { previewSubjectImport, commitSubjectImport } = require('../services/subjectImportService');

describe('Task 08: 学科成绩导入集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_import_' + Date.now();
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

    // 初始化基础数据
    await connection.query(`
      INSERT INTO academic_year (id, school_id, academic_year, semester, start_date, end_date, is_current, active)
      VALUES (1, 1, '2026-2027', 1, '2026-09-01', '2027-01-31', 1, 1);
      INSERT INTO users (id, school_id, username, password, real_name, role, status)
      VALUES 
        (101, 1, 'teacher_chinese', 'hash123', '张老师', 'teacher', 0),
        (102, 1, 'teacher_math', 'hash123', '李老师', 'teacher', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES 
        (201, 1, 'student_01', 'hash123', '学生甲', 'student', 2, 1, 0),
        (202, 1, 'student_02', 'hash123', '学生乙', 'student', 2, 1, 0);
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, 101, 2, 1, 'CHINESE', 0);
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  let createdBatchId = null;

  test('1. 越权非任教教师导入学科成绩被阻断 403', async () => {
    let caught403 = false;
    try {
      await previewSubjectImport({
        actor: { id: 102, schoolId: 1, role: 'teacher' }, // 102 未获 2年级1班 CHINESE 任教
        termId: 1,
        grade: 2,
        classNo: 1,
        subjectCode: 'CHINESE',
        rows: [{ studentNo: 'student_01', score: '90' }]
      }, connection);
    } catch (err) {
      if (err.statusCode === 403 || err.status === 403) caught403 = true;
    }

    assert.equal(caught403, true, '越权教师导入学科必须抛出 403');
  });

  test('2. 授权教师预览导入，比对原值，有效0分不误判', async () => {
    const preview = await previewSubjectImport({
      actor: { id: 101, schoolId: 1, role: 'teacher' },
      termId: 1,
      grade: 2,
      classNo: 1,
      subjectCode: 'CHINESE',
      rows: [
        { studentNo: 'student_01', score: '0' },
        { studentNo: 'student_02', score: '89.5' }
      ]
    }, connection);

    assert.ok(preview.batchId);
    assert.equal(preview.validCount, 2);
    assert.equal(preview.errorCount, 0);

    createdBatchId = preview.batchId;
  });

  test('3. 正式提交入库，推进 C2 版本，校验有效0分正确保留', async () => {
    const res = await commitSubjectImport({
      actor: { id: 101, schoolId: 1, role: 'teacher' },
      batchId: createdBatchId,
      requestKey: 'REQ_COMMIT_' + createdBatchId
    }, connection);

    assert.ok(res.success);
    assert.equal(res.committedCount, 2);

    // 数据库断言有效 0 分
    const [scores] = await connection.query(
      "SELECT score, raw_score FROM subject_score WHERE student_id = 201 AND subject_code = 'CHINESE'"
    );
    assert.equal(scores.length, 1);
    assert.equal(Number(scores[0].score), 0);
    assert.equal(Number(scores[0].raw_score), 0);
    assert.ok(scores[0].raw_score !== null);

    // 检查 C2 状态推进
    const [state] = await connection.query(
      "SELECT source_revision FROM student_term_state WHERE student_id = 201 AND term_id = 1"
    );
    assert.ok(state[0].source_revision >= 2);
  });

  test('4. 已提交批次再次提交被 409 拦截', async () => {
    let caught409 = false;
    try {
      await commitSubjectImport({
        actor: { id: 101, schoolId: 1, role: 'teacher' },
        batchId: createdBatchId,
        requestKey: 'REQ_REPEAT_' + createdBatchId
      }, connection);
    } catch (err) {
      if (err.statusCode === 409 || err.status === 409) caught409 = true;
    }

    assert.equal(caught409, true, '已提交批次再次提交必须被 409 拦截');
  });
});
