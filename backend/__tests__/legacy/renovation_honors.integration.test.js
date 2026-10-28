/**
 * renovation_honors.integration.test.js — 任务 05 荣誉认定与奖励集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { reviewHonorWithLedger, revokeHonorWithLedger } = require('../services/honorAwardService');

describe('Task 05: 荣誉认定与奖励 (C3 账本联动)', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_honors_' + Date.now();
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
      VALUES (101, 1, 'teacher_demo', 'hash123', '李老师', 'teacher', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES (201, 1, 'student_test', 'hash123', '王同学', 'student', 4, 1, 0);
      INSERT INTO edu_evaluation_category (id, parent_id, category_level, category_code, category_name, score, status, version)
      VALUES 
        (1, 0, 1, 'T', '体育', 0, 1, 'V2'),
        (2, 1, 2, 'T01', '运动技能', 0, 1, 'V2'),
        (3, 2, 3, 'T01-01', '足球技能', 1, 1, 'V2');
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('教师审核通过荣誉，同事务记入 C3 账本且学生总分 +1', async () => {
    // 插入待审荣誉
    const [ins] = await connection.query(
      `INSERT INTO honor_record (
        school_id, student_id, term_id, event_key, title, award_level, prize_level,
        status, award_date, material_version
      ) VALUES (1, 201, 1, 'EVENT_TEST_01', '市级足球赛一等奖', 'CITY', 'FIRST', 'PENDING', CURDATE(), 1)`
    );
    const honorId = ins.insertId;

    const res = await reviewHonorWithLedger({
      schoolId: 1,
      honorId,
      decision: 'APPROVED',
      dimensionCode: 'T',
      categoryId: 3,
      awardPoints: 1,
      teacherId: 101,
      requestKey: 'REQ_HONOR_TEST_01'
    }, connection);

    assert.equal(res.status, 'APPROVED');
    assert.ok(res.scoreRecordId > 0);

    // 检查 honor_record 更新
    const [[honor]] = await connection.query('SELECT * FROM honor_record WHERE id = ?', [honorId]);
    assert.equal(honor.status, 'APPROVED');
    assert.equal(honor.dimension_code, 'T');
    assert.equal(honor.category_id, 3);
    assert.equal(honor.score_record_id, res.scoreRecordId);

    // 检查 score_record 流水
    const [[score]] = await connection.query('SELECT * FROM score_record WHERE id = ?', [res.scoreRecordId]);
    assert.equal(score.delta, 1);
    assert.equal(score.source, 'A_DIRECT');
    assert.equal(score.dimension_code, 'T');

    // 检查重复审核幂等重放
    const replayed = await reviewHonorWithLedger({
      schoolId: 1,
      honorId,
      decision: 'APPROVED',
      dimensionCode: 'T',
      categoryId: 3,
      awardPoints: 1,
      teacherId: 101,
      requestKey: 'REQ_HONOR_TEST_01'
    }, connection);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.scoreRecordId, res.scoreRecordId);
  });

  test('撤销已认定荣誉，触发负向冲销，保持状态与账本一致', async () => {
    const [ins] = await connection.query(
      `INSERT INTO honor_record (
        school_id, student_id, term_id, event_key, title, award_level, prize_level,
        status, award_date, material_version
      ) VALUES (1, 201, 1, 'EVENT_TEST_02', '区级游泳比赛二等奖', 'DISTRICT', 'SECOND', 'PENDING', CURDATE(), 1)`
    );
    const honorId = ins.insertId;

    // 先通过
    const appRes = await reviewHonorWithLedger({
      schoolId: 1,
      honorId,
      decision: 'APPROVED',
      dimensionCode: 'T',
      categoryId: 3,
      awardPoints: 1,
      teacherId: 101
    }, connection);

    // 查询当前学生账本总分
    const [[before]] = await connection.query(
      'SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = 201'
    );

    // 执行撤销
    const revRes = await revokeHonorWithLedger({
      schoolId: 1,
      honorId,
      teacherId: 101,
      reason: '发现材料伪造'
    }, connection);

    assert.equal(revRes.status, 'REJECTED');

    // 检查 honor_record 状态
    const [[honor]] = await connection.query('SELECT status, score_record_id, reject_reason FROM honor_record WHERE id = ?', [honorId]);
    assert.equal(honor.status, 'REJECTED');
    assert.equal(honor.score_record_id, null);
    assert.match(honor.reject_reason, /伪造/);

    // 检查学生总分减少 1 分
    const [[after]] = await connection.query(
      'SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = 201'
    );
    assert.equal(Number(after.total), Number(before.total) - 1);

    // 检查产生冲销记录
    const [[revScore]] = await connection.query(
      "SELECT * FROM score_record WHERE original_id = ? AND source = 'REVERSAL'",
      [appRes.scoreRecordId]
    );
    assert.equal(revScore.delta, -1);
  });

  test('禁止跨校审核荣誉', async () => {
    const [ins] = await connection.query(
      `INSERT INTO honor_record (
        school_id, student_id, term_id, event_key, title, award_level, prize_level,
        status, award_date, material_version
      ) VALUES (999, 201, 1, 'EVENT_CROSS_SCHOOL', '异校比赛一等奖', 'CITY', 'FIRST', 'PENDING', CURDATE(), 1)`
    );

    await assert.rejects(
      async () => {
        await reviewHonorWithLedger({
          schoolId: 1,
          honorId: ins.insertId,
          decision: 'APPROVED',
          teacherId: 101
        }, connection);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });
});
