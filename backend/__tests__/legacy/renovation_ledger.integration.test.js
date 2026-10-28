/**
 * renovation_ledger.integration.test.js — 任务 04 C3 追加账本与冲销纠错集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { appendReward, correctReward } = require('../services/scoreLedgerService');

describe('Task 04: 教师纠错与直评 (C3 合同)', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_ledger_' + Date.now();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${testDbName}\``);

    // 加载 schema 并应用迁移
    const root = path.resolve(__dirname, '../..');
    const fullSchema = fs.readFileSync(path.join(root, 'sql/00_full_schema.sql'), 'utf8')
      .replaceAll('`student_growth`', '`' + testDbName + '`');
    await connection.query(fullSchema);

    const { applyRegisteredMigrations } = require('../services/migrationRunner');
    require('../migrations/renovation');
    await applyRegisteredMigrations({ connection, databaseName: testDbName });

    // 基础数据
    await connection.query(`
      INSERT INTO academic_year (id, school_id, academic_year, semester, start_date, end_date, is_current, active)
      VALUES (1, 1, '2026-2027', 1, '2026-09-01', '2027-01-31', 1, 1);
      INSERT INTO users (id, school_id, username, password, real_name, role, status)
      VALUES (101, 1, 'teacher_demo', 'hash123', '李老师', 'teacher', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES (201, 1, 'student_test', 'hash123', '王同学', 'student', 4, 1, 0);
      INSERT INTO edu_evaluation_category (id, parent_id, category_level, category_code, category_name, score, status, version)
      VALUES 
        (1, 0, 1, 'D', '德育', 0, 1, 'V2'),
        (2, 1, 2, 'D01', '日常品德', 0, 1, 'V2'),
        (3, 2, 3, 'D01-01', '爱护公物', 1, 1, 'V2'),
        (4, 0, 1, 'Z', '智育', 0, 1, 'V2'),
        (5, 4, 2, 'Z01', '学习探究', 0, 1, 'V2'),
        (6, 5, 3, 'Z01-01', '钻研求知', 1, 1, 'V2');
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('C3 appendReward 物理追加写入，绝不覆盖已有记录', async () => {
    const res = await appendReward({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      dimensionCode: 'D',
      categoryId: 3,
      delta: 1,
      source: 'A_DIRECT',
      operatorId: 101,
      remark: '主动打扫教室',
      requestKey: 'REQ_APPEND_1'
    }, connection);

    assert.ok(res.id > 0);
    assert.equal(res.delta, 1);
    assert.ok(res.sourceRevision >= 1);

    const [rows] = await connection.query('SELECT * FROM score_record WHERE id = ?', [res.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].delta, 1);
  });

  test('C3 correctReward REVOKE 负向冲销流水，原记录物理不可篡改且禁二次冲销 (409)', async () => {
    // 1. 发起一条测试流水
    const orig = await appendReward({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      dimensionCode: 'D',
      categoryId: 3,
      delta: 1,
      source: 'A_DIRECT',
      operatorId: 101,
      remark: '待冲销的测试流水',
      requestKey: 'REQ_APPEND_REVOKE_TARGET'
    }, connection);

    const [beforeRows] = await connection.query('SELECT * FROM score_record WHERE id = ?', [orig.id]);
    const origSnapshot = JSON.stringify(beforeRows[0]);

    // 2. 第一次冲销
    const revResult = await correctReward({
      schoolId: 1,
      originalScoreId: orig.id,
      action: 'REVOKE',
      reason: '手滑误评',
      operatorId: 101,
      requestKey: 'REQ_REVOKE_1'
    }, connection);

    assert.ok(revResult.reversalId > 0);
    assert.equal(revResult.delta, -1);

    // 验证原记录分毫未改
    const [afterRows] = await connection.query('SELECT * FROM score_record WHERE id = ?', [orig.id]);
    assert.equal(JSON.stringify(afterRows[0]), origSnapshot, '原流水记录必须不可篡改');

    // 3. 再次冲销同一原记录必须抛出 409
    await assert.rejects(
      async () => {
        await correctReward({
          schoolId: 1,
          originalScoreId: orig.id,
          action: 'REVOKE',
          reason: '二次冲销尝试',
          operatorId: 101,
          requestKey: 'REQ_REVOKE_DUPLICATE'
        }, connection);
      },
      (err) => err.statusCode === 409 || (err.message && err.message.includes('重复'))
    );
  });

  test('C3 correctReward CORRECT 生成冲销与更正替代项链条', async () => {
    const orig = await appendReward({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      dimensionCode: 'D',
      categoryId: 3,
      delta: 1,
      source: 'A_DIRECT',
      operatorId: 101,
      remark: '分类选错流水',
      requestKey: 'REQ_APPEND_CORRECT_TARGET'
    }, connection);

    const corrResult = await correctReward({
      schoolId: 1,
      originalScoreId: orig.id,
      action: 'CORRECT',
      newDimensionCode: 'Z',
      newCategoryId: 6,
      newPoints: 1,
      reason: '实为智育探究表现',
      operatorId: 101,
      requestKey: 'REQ_CORRECT_1'
    }, connection);

    assert.ok(corrResult.reversalId > 0);
    assert.ok(corrResult.replacementId > 0);

    // 验证冲销记录
    const [rev] = await connection.query('SELECT * FROM score_record WHERE id = ?', [corrResult.reversalId]);
    assert.equal(rev[0].delta, -1);
    assert.equal(rev[0].original_id, orig.id);
    assert.equal(rev[0].source, 'REVERSAL');

    // 验证替代记录
    const [rep] = await connection.query('SELECT * FROM score_record WHERE id = ?', [corrResult.replacementId]);
    assert.equal(rep[0].delta, 1);
    assert.equal(rep[0].dimension_code, 'Z');
    assert.equal(rep[0].category_id, 6);
    assert.equal(rep[0].correction_chain_id, orig.id);
    assert.equal(rep[0].source, 'A_DIRECT');
  });
});
