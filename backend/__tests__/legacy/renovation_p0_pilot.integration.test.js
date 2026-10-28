/**
 * renovation_p0_pilot.integration.test.js — 任务 20B P0 试点与回退演练集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { generatePreclassifiedCards } = require('../services/rewardCategoryService');
const { redeemCardInstant } = require('../services/cardRedemptionService');
const { appendReward, correctReward } = require('../services/scoreLedgerService');
const { decryptToken, credentialContext } = require('../services/cardCredentials');

describe('Task 20B: P0 试点与回退演练集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_p0_' + Date.now();
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

    // 配置教师任教授权
    await connection.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, 101, 4, 1, 'MATH', 1);
    `);

    // 预分类发卡
    await generatePreclassifiedCards({ schoolId: 1, monthKey: '2026-10', conn: connection });
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('P0 闭环：授权、预分类制卡、即时入账与直评纠错', async () => {
    const [cards] = await connection.query(
      "SELECT id, token_ciphertext, category_id FROM reward_card WHERE school_id = 1 AND status = 'UNUSED' LIMIT 1"
    );
    assert.ok(cards.length > 0);

    const token = decryptToken(cards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 1, batch_code: 'AUTO_V2' }));

    // 1. 学生扫码即时入账 +1
    const claimRes = await redeemCardInstant({
      schoolId: 1,
      studentId: 201,
      token,
      requestKey: 'PILOT_CLAIM_' + Date.now()
    }, connection);
    assert.equal(claimRes.pointsCredited, 1);

    // 2. 教师直评追加 +1
    const directRes = await appendReward({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      dimensionCode: 'D',
      categoryId: cards[0].category_id,
      delta: 1,
      source: 'A_DIRECT',
      operatorId: 101,
      remark: '试点直评加分',
      requestKey: 'PILOT_DIRECT_' + Date.now()
    }, connection);
    assert.ok(directRes.id > 0);

    // 3. 教师纠错冲销直评 -1
    const revRes = await correctReward({
      schoolId: 1,
      originalScoreId: directRes.id,
      correctionType: 'REVOKE',
      operatorId: 101,
      reason: '试点纠错测试'
    }, connection);
    assert.ok(revRes.reversalId > 0);

    // 4. 验证学生总分为 1（直评已被冲销），且待审队列无数据
    const [[scoreSum]] = await connection.query(
      "SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = 201"
    );
    assert.equal(Number(scoreSum.total), 1);

    const [pending] = await connection.query("SELECT COUNT(*) as n FROM card_claim WHERE status = 'PENDING'");
    assert.equal(Number(pending[0].n), 0);

    // 5. 验证学期状态 source_revision 已经递增
    const [[state]] = await connection.query(
      "SELECT source_revision FROM student_term_state WHERE student_id = 201 AND term_id = 1"
    );
    assert.ok(Number(state.source_revision) >= 3);
  });

  test('回退演练：物理不可篡改与完整冲销链', async () => {
    const [revs] = await connection.query("SELECT * FROM score_record WHERE source = 'REVERSAL'");
    assert.ok(revs.length >= 1);

    for (const rev of revs) {
      assert.equal(rev.delta, -1);
      assert.ok(rev.original_id > 0);

      // 验证原有效流水原封不动保留
      const [[orig]] = await connection.query("SELECT * FROM score_record WHERE id = ?", [rev.original_id]);
      assert.equal(orig.delta, 1);
    }
  });
});
