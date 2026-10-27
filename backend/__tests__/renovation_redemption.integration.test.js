/**
 * renovation_redemption.integration.test.js — 任务 03 扫码即时入账集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { redeemCardInstant } = require('../services/cardRedemptionService');
const { generatePreclassifiedCards } = require('../services/rewardCategoryService');
const { decryptToken, credentialContext } = require('../services/cardCredentials');

describe('Task 03: 扫码即时入账集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_redemption_' + Date.now();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${testDbName}\``);

    // 加载 schema 并应用改造迁移
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
      VALUES 
        (201, 1, 'student_test1', 'hash123', '王同学', 'student', 4, 1, 0),
        (202, 1, 'student_test2', 'hash123', '张同学', 'student', 4, 1, 0);
      INSERT INTO edu_evaluation_category (id, parent_id, category_level, category_code, category_name, score, status, version)
      VALUES 
        (1, 0, 1, 'D', '德育', 0, 1, 'V2'),
        (2, 1, 2, 'D01', '日常品德', 0, 1, 'V2'),
        (3, 2, 3, 'D01-01', '爱护公物', 1, 1, 'V2'),
        (4, 0, 1, 'Z', '智育', 0, 1, 'V2'),
        (5, 4, 2, 'Z01', '学习探究', 0, 1, 'V2'),
        (6, 5, 3, 'Z01-01', '钻研求知', 1, 1, 'V2');
    `);

    // 生成预分类卡片
    await generatePreclassifiedCards({ schoolId: 1, monthKey: '2026-10', conn: connection });
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('学生扫有效预分类卡即时入账 +1，直接进入 APPROVED 且流水不可篡改', async () => {
    const [cards] = await connection.query(
      "SELECT id, token_ciphertext FROM reward_card WHERE school_id = 1 AND status = 'UNUSED' LIMIT 1"
    );
    assert.ok(cards.length > 0);
    const token = decryptToken(cards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 1, batch_code: 'AUTO_V2' }));

    const reqKey = 'TEST_REDEMPTION_' + Date.now();
    const result = await redeemCardInstant({
      schoolId: 1,
      studentId: 201,
      token,
      requestKey: reqKey
    }, connection);

    assert.equal(result.pointsCredited, 1);
    assert.ok(result.claimId > 0);
    assert.ok(result.scoreRecordId > 0);

    // 检查 card 状态
    const [[card]] = await connection.query('SELECT status, used_student_id FROM reward_card WHERE id = ?', [cards[0].id]);
    assert.equal(card.status, 'USED');
    assert.equal(card.used_student_id, 201);

    // 检查 card_claim 状态（直接 APPROVED，无 PENDING）
    const [[claim]] = await connection.query('SELECT status FROM card_claim WHERE id = ?', [result.claimId]);
    assert.equal(claim.status, 'APPROVED');

    // 检查 score_record 账本流水
    const [[score]] = await connection.query('SELECT * FROM score_record WHERE id = ?', [result.scoreRecordId]);
    assert.equal(score.delta, 1);
    assert.equal(score.source, 'B_CARD');
    assert.equal(score.student_id, 201);
    assert.equal(score.card_claim_id, result.claimId);

    // 检查幂等重试返回相同结果
    const replayed = await redeemCardInstant({
      schoolId: 1,
      studentId: 201,
      token,
      requestKey: reqKey
    }, connection);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.scoreRecordId, result.scoreRecordId);
  });

  test('并发抢扫同一张卡片只有 1 人成功，抢扫失败者返回 409', async () => {
    const [cards] = await connection.query(
      "SELECT id, token_ciphertext FROM reward_card WHERE school_id = 1 AND status = 'UNUSED' LIMIT 1"
    );
    assert.ok(cards.length > 0);
    const token = decryptToken(cards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 2, batch_code: 'AUTO_V2' }));

    const conn2 = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: testDbName
    });

    try {
      const claim1 = redeemCardInstant({
        schoolId: 1,
        studentId: 201,
        token,
        requestKey: 'CONCURRENT_1_' + Date.now()
      }, connection);

      const claim2 = redeemCardInstant({
        schoolId: 1,
        studentId: 202,
        token,
        requestKey: 'CONCURRENT_2_' + Date.now()
      }, conn2);

      const [res1, res2] = await Promise.allSettled([claim1, claim2]);
      const successes = [res1, res2].filter(r => r.status === 'fulfilled');
      const failures = [res1, res2].filter(r => r.status === 'rejected');

      assert.equal(successes.length, 1);
      assert.equal(failures.length, 1);
      assert.equal(failures[0].reason.statusCode, 409);
    } finally {
      await conn2.end();
    }
  });

  test('过期卡片被拦截并返回 400', async () => {
    // 构造一张过期卡片
    const [expiredCards] = await connection.query(
      "SELECT id, token_ciphertext FROM reward_card WHERE school_id = 1 AND status = 'UNUSED' LIMIT 1"
    );
    await connection.query(
      "UPDATE reward_card SET valid_until = '2020-01-01 00:00:00' WHERE id = ?",
      [expiredCards[0].id]
    );

    const token = decryptToken(expiredCards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 3, batch_code: 'AUTO_V2' }));

    await assert.rejects(
      async () => {
        await redeemCardInstant({
          schoolId: 1,
          studentId: 201,
          token
        }, connection);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /截止时间/);
        return true;
      }
    );
  });
});
