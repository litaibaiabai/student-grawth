/**
 * renovation_health_auth.integration.test.js — 任务 09 体测与健康导入权限与隔离测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const {
  previewHealthImport,
  commitHealthImport,
  getStudentHealthRecord,
  getHealthImportStatus
} = require('../services/healthImportService');

describe('Task 09: 体测与健康导入集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_health_' + Date.now();
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
        (101, 1, 'teacher_pe', 'hash123', '体育张老师', 'teacher', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES 
        (201, 1, 'student_01', 'hash123', '李同学', 'student', 5, 1, 0);
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, 101, 5, 1, 'PHYSICAL', 1);
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  let createdBatchId = null;

  test('1. 授权教师成功预览并提交体测数据，规范保留 cm 单位', async () => {
    const preview = await previewHealthImport({
      actor: {
        id: 101,
        schoolId: 1,
        role: 'teacher',
        classes: [{ grade: 5, class_no: 1 }]
      },
      termId: 1,
      items: [
        {
          studentNo: 'student_01',
          height: '150.0',
          weight: '42.0',
          vitalCapacity: '2300',
          leftVision: '5.1',
          rightVision: '5.0',
          fiftyRun: '8.4',
          sitAndReach: '16.0',
          status: 'NORMAL'
        }
      ]
    }, connection);

    assert.ok(preview.batchId);
    assert.equal(preview.validCount, 1);
    createdBatchId = preview.batchId;

    const commitRes = await commitHealthImport({
      actor: {
        id: 101,
        schoolId: 1,
        role: 'teacher',
        classes: [{ grade: 5, class_no: 1 }]
      },
      batchId: createdBatchId,
      requestKey: 'COMMIT_' + createdBatchId
    }, connection);

    assert.ok(commitRes.success);
    assert.equal(commitRes.committedCount, 1);

    // 查询明细断言
    const record = await getStudentHealthRecord({
      actor: {
        id: 101,
        schoolId: 1,
        role: 'teacher',
        classes: [{ grade: 5, class_no: 1 }]
      },
      studentId: 201,
      termId: 1
    }, connection);

    assert.ok(record);
    assert.equal(Number(record.height), 150);
    assert.equal(record.height_unit, 'cm');
    assert.equal(Number(record.weight), 42);
    assert.equal(record.weight_unit, 'kg');
  });

  test('2. 管理员禁止越权读取个人健康体测明细（403）', async () => {
    let caught403 = false;
    try {
      await getStudentHealthRecord({
        actor: { id: 1, schoolId: 1, role: 'manager' },
        studentId: 201,
        termId: 1
      }, connection);
    } catch (err) {
      if (err.statusCode === 403 || err.status === 403) caught403 = true;
    }

    assert.equal(caught403, true, '管理员读取个人体测明细必须抛出 403');

    // 管理员允许查看整体状态进度
    const progress = await getHealthImportStatus({
      actor: { id: 1, schoolId: 1, role: 'manager' },
      termId: 1
    }, connection);
    assert.ok(progress.totalStudents >= 1);
    assert.ok(progress.completedCount >= 1);
  });

  test('3. 体测健康数据物理隔离，绝不转为加分账本流水', async () => {
    const [rewardRows] = await connection.query(
      "SELECT * FROM score_record WHERE student_id = 201 AND source = 'HEALTH'"
    );
    assert.equal(rewardRows.length, 0, '体测数据不得进入 score_record');

    // 验证 C2 状态递增
    const [stateRows] = await connection.query(
      "SELECT source_revision FROM student_term_state WHERE student_id = 201 AND term_id = 1"
    );
    assert.ok(stateRows[0].source_revision >= 2);
  });
});
