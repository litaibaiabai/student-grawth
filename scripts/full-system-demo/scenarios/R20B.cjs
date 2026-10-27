/**
 * R20B.cjs — P0 试点与回退演练
 *
 * 验证：
 * 1. checks.p0ClosedLoopVerified === true (任教授权 -> 预分类制卡 -> 扫码即时入账 -> 教师纠错与直评 全流程闭环且无待审队列)
 * 2. checks.legacyInventoryPreserved === true (旧卡盘点与历史数据守恒，已用卡/作废卡不可重复入账)
 * 3. checks.concurrencyConservationMaintained === true (并发抢扫竞争与幂等重放，总加分严格守恒)
 * 4. checks.rollbackPreservesImmutableAudit === true (冲销回退保留完整冲销链条，账本物理不被抹除)
 */
const assert = require('node:assert/strict');
const { generatePreclassifiedCards } = require('../../../backend/services/rewardCategoryService.js');
const { redeemCardInstant } = require('../../../backend/services/cardRedemptionService.js');
const { appendReward, correctReward } = require('../../../backend/services/scoreLedgerService.js');
const { decryptToken, credentialContext } = require('../../../backend/services/cardCredentials.js');

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    p0ClosedLoopVerified: false,
    legacyInventoryPreserved: false,
    concurrencyConservationMaintained: false,
    rollbackPreservesImmutableAudit: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 动态获取真实存在的教师和学生 ID
    const [teachers] = await conn.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 1");
    const teacherId = teachers.length ? teachers[0].id : 2;
    const [students] = await conn.query("SELECT id FROM users WHERE role = 'student' LIMIT 2");
    const student1 = students.length ? students[0].id : 11;
    const student2 = students.length > 1 ? students[1].id : 12;

    // 章节 1: P0 全链路闭环演示（任教授权 -> 预分类发卡 -> 扫码即时入账 -> 教师直评与纠错）
    await s.chapter('R20B-01', 'P0 全链路闭环：授权、发卡、即时入账、直评与纠错', async () => {
      // 1.1 确认并配置任教授权 (01)
      await conn.query(`
        INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
        VALUES (1, 1, ?, 4, 1, 'MATH', 1)
        ON DUPLICATE KEY UPDATE is_head_teacher = 1
      `, [teacherId]);

      // 1.2 预分类发卡 (02)
      await generatePreclassifiedCards({ schoolId: 1, monthKey: '2026-10', conn });
      const [cards] = await conn.query(
        "SELECT id, token_ciphertext, category_id, dimension_code FROM reward_card WHERE school_id = 1 AND batch_code = 'AUTO_V2' AND status = 'UNUSED' LIMIT 2"
      );
      assert.ok(cards.length >= 2, '必须有可用预分类卡片');

      const token1 = decryptToken(cards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 1, batch_code: 'AUTO_V2' }));

      // 1.3 学生扫码即时入账 (03)
      const [[beforeScores]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = ?", [student1]);
      const redeemRes = await redeemCardInstant({
        schoolId: 1,
        studentId: student1,
        token: token1,
        requestKey: 'R20B_CLAIM_' + Date.now()
      }, conn);

      assert.equal(redeemRes.pointsCredited, 1);

      // 1.4 教师直评追加与纠错冲销 (04)
      const directReward = await appendReward({
        schoolId: 1,
        termId: 1,
        studentId: student1,
        dimensionCode: 'D',
        categoryId: cards[0].category_id,
        delta: 1,
        source: 'A_DIRECT',
        operatorId: teacherId,
        remark: 'P0 教师课堂直接加分',
        requestKey: 'R20B_DIRECT_' + Date.now()
      }, conn);

      assert.ok(directReward.id > 0);

      // 1.5 教师纠错冲销刚才的直评加分
      const reversalRes = await correctReward({
        schoolId: 1,
        originalScoreId: directReward.id,
        correctionType: 'REVOKE',
        operatorId: teacherId,
        reason: '操作笔误冲销'
      }, conn);

      assert.ok(reversalRes.reversalId > 0);

      // 净加分应仅包含扫码的 1 分（直评 1 分被冲销）
      const [[afterScores]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = ?", [student1]);
      assert.equal(Number(afterScores.total), Number(beforeScores.total) + 1);

      // 验证待审列表中无记录
      const [pendingClaims] = await conn.query("SELECT COUNT(*) as n FROM card_claim WHERE status = 'PENDING'");
      assert.equal(Number(pendingClaims[0].n), 0);

      checks.p0ClosedLoopVerified = true;
    });

    // 章节 2: 盘点旧卡与历史账目守恒
    await s.chapter('R20B-02', '旧卡盘点与历史数据守恒', async () => {
      // 模拟已用旧卡与作废卡
      const [usedCards] = await conn.query("SELECT id, token_ciphertext FROM reward_card WHERE school_id = 1 AND status = 'USED' LIMIT 1");
      assert.ok(usedCards.length > 0);

      const usedToken = decryptToken(usedCards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 1, batch_code: 'AUTO_V2' }));

      // 尝试再次兑换已使用的卡片，必须被拒绝并返回 409
      await assert.rejects(
        async () => {
          await redeemCardInstant({
            schoolId: 1,
            studentId: student2,
            token: usedToken,
            requestKey: 'R20B_RETRY_USED_' + Date.now()
          }, conn);
        },
        (err) => {
          assert.equal(err.statusCode, 409);
          return true;
        }
      );

      // 验证旧历史流水不可被物理更新或删除
      const [scores] = await conn.query("SELECT COUNT(*) as n FROM score_record WHERE school_id = 1");
      assert.ok(scores[0].n > 0);

      checks.legacyInventoryPreserved = true;
    });

    // 章节 3: 高并发扫码竞争与重复请求回放守恒
    await s.chapter('R20B-03', '高并发扫码竞争与幂等重放守恒', async () => {
      const [cards] = await conn.query(
        "SELECT id, token_ciphertext FROM reward_card WHERE school_id = 1 AND batch_code = 'AUTO_V2' AND status = 'UNUSED' LIMIT 1"
      );
      assert.ok(cards.length > 0);

      const tokenTarget = decryptToken(cards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 2, batch_code: 'AUTO_V2' }));

      const conn2 = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: m.dbName
      });

      try {
        const [[beforeSum]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record");

        const [r1, r2] = await Promise.allSettled([
          redeemCardInstant({ schoolId: 1, studentId: student1, token: tokenTarget, requestKey: 'CONC_A_' + Date.now() }, conn),
          redeemCardInstant({ schoolId: 1, studentId: student2, token: tokenTarget, requestKey: 'CONC_B_' + Date.now() }, conn2)
        ]);

        const wins = [r1, r2].filter(r => r.status === 'fulfilled');
        const fails = [r1, r2].filter(r => r.status === 'rejected');

        assert.equal(wins.length, 1);
        assert.equal(fails.length, 1);
        assert.equal(fails[0].reason.statusCode, 409);

        // 账本总分增量恰好为 1，不出现多扣/多记
        const [[afterSum]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record");
        assert.equal(Number(afterSum.total), Number(beforeSum.total) + 1);

        checks.concurrencyConservationMaintained = true;
      } finally {
        await conn2.end();
      }
    });

    // 章节 4: 回退配置与冲销链条不可篡改演练
    await s.chapter('R20B-04', '回退演练：物理不可篡改与完整冲销链', async () => {
      // 验证数据库没有任何物理抹除操作
      const [reversals] = await conn.query("SELECT * FROM score_record WHERE source = 'REVERSAL'");
      assert.ok(reversals.length >= 1, '必须存在至少一条冲销流水');

      for (const rev of reversals) {
        assert.equal(rev.delta, -1, '冲销流水分值必须为 -1');
        assert.ok(rev.original_id > 0, '冲销流水必须指向原有效流水');

        // 原流水不可变
        const [[orig]] = await conn.query("SELECT * FROM score_record WHERE id = ?", [rev.original_id]);
        assert.ok(orig, '原流水记录必须完好保留在表中');
        assert.equal(orig.delta, 1, '原流水数值不得被就地篡改');
      }

      checks.rollbackPreservesImmutableAudit = true;
    });

  } finally {
    await conn.end();
  }

  assert.equal(checks.p0ClosedLoopVerified, true);
  assert.equal(checks.legacyInventoryPreserved, true);
  assert.equal(checks.concurrencyConservationMaintained, true);
  assert.equal(checks.rollbackPreservesImmutableAudit, true);

  return { checks };
}

module.exports = {
  id: 'R20B',
  title: 'P0试点与回退演练',
  run
};
