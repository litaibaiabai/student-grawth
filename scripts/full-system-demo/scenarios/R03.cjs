/**
 * R03.cjs — 扫码即时入账场景
 *
 * 验证：
 * 1. checks.instantPointsCredited === true (学生扫码无延迟获得 +1，无需等待教师二次审核)
 * 2. checks.teacherPendingQueueClean === true (教师端待审列表不增加 PENDING 申领)
 * 3. checks.concurrencyWinnerOnlyOne === true (并发抢扫同一张卡单一命中，失败者返回 409)
 * 4. checks.idempotentReplaySuccess === true (同一 requestKey 重复提交幂等返回原结果，不重复加分)
 */
const assert = require('node:assert/strict');
const crypto = require('crypto');

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    instantPointsCredited: false,
    teacherPendingQueueClean: false,
    concurrencyWinnerOnlyOne: false,
    idempotentReplaySuccess: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 1. 登录学生端打开扫卡领取页面
    await s.chapter('R03-01', '学生进入扫卡领取界面', async () => {
      await s.login('demo_s01');
      await s.menu('qrcode 扫卡领取', '扫卡领取');
    });

    // 2. 获取预分类卡片的可用凭证
    const { redeemCardInstant } = require('../../../backend/services/cardRedemptionService.js');
    const { generatePreclassifiedCards } = require('../../../backend/services/rewardCategoryService.js');

    await generatePreclassifiedCards({ schoolId: 1, monthKey: '2026-10', conn });

    // 从数据库中选取一张未使用的 AUTO_V2 卡片
    const [unusedCards] = await conn.query(
      "SELECT id, token_ciphertext FROM reward_card WHERE school_id = 1 AND batch_code = 'AUTO_V2' AND status = 'UNUSED' LIMIT 2"
    );
    assert.ok(unusedCards.length >= 2, '需要至少两张可用预分类卡片');

    const { decryptToken, credentialContext } = require('../../../backend/services/cardCredentials.js');
    const token1 = decryptToken(unusedCards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 1, batch_code: 'AUTO_V2' }));

    // 3. 学生即时兑换入账
    await s.chapter('R03-02', '学生扫码即时入账 +1，无需等待教师二次审核', async () => {
      const [[beforeScores]] = await conn.query(
        "SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = 11"
      );

      const requestKey = 'R03_CLAIM_' + Date.now();
      const redeemRes = await redeemCardInstant({
        schoolId: 1,
        studentId: 11,
        token: token1,
        requestKey
      }, conn);

      assert.equal(redeemRes.pointsCredited, 1);
      assert.ok(redeemRes.categoryId > 0);

      // 验证学生总分立即 +1
      const [[afterScores]] = await conn.query(
        "SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = 11"
      );
      assert.equal(Number(afterScores.total), Number(beforeScores.total) + 1);
      checks.instantPointsCredited = true;

      // 验证教师待审队列中没有此记录（直接入账，无 PENDING）
      const [pendingClaims] = await conn.query(
        "SELECT COUNT(*) as n FROM card_claim WHERE card_id = ? AND status = 'PENDING'",
        [unusedCards[0].id]
      );
      assert.equal(Number(pendingClaims[0].n), 0);
      checks.teacherPendingQueueClean = true;

      // 验证同一 requestKey 重试幂等
      const replayRes = await redeemCardInstant({
        schoolId: 1,
        studentId: 11,
        token: token1,
        requestKey
      }, conn);
      assert.equal(replayRes.pointsCredited, 1);
      assert.equal(replayRes.scoreRecordId, redeemRes.scoreRecordId);
      checks.idempotentReplaySuccess = true;
    });

    // 4. 验证并发抢扫同一张卡：单一命中 (409)
    await s.chapter('R03-03', '并发抢扫同一张卡单一成功，抢扫失败者返回 409', async () => {
      const token2 = decryptToken(unusedCards[1].token_ciphertext, credentialContext({ school_id: 1, serial_no: 2, batch_code: 'AUTO_V2' }));

      const conn2 = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: m.dbName
      });
      try {
        const runClaim = (sid, c) => redeemCardInstant({
          schoolId: 1,
          studentId: sid,
          token: token2,
          requestKey: 'R03_CONCURRENT_' + sid + '_' + Date.now()
        }, c);

        const [res1, res2] = await Promise.allSettled([runClaim(11, conn), runClaim(12, conn2)]);

        const successes = [res1, res2].filter(r => r.status === 'fulfilled');
        const failures = [res1, res2].filter(r => r.status === 'rejected');

        assert.equal(successes.length, 1, '并发申领只能有一次成功');
        assert.equal(failures.length, 1, '并发抢扫失败者应被拒绝');
        const err = failures[0].reason;
        assert.ok(
          err.statusCode === 409 || (err.message && err.message.includes('已')) || (err.message && err.message.includes('409')),
          '失败原因必须为 409 重复或冲突: ' + (err?.message || err)
        );
        checks.concurrencyWinnerOnlyOne = true;
      } finally {
        await conn2.end();
      }
    });

  } finally {
    await conn.end();
  }

  assert.equal(checks.instantPointsCredited, true);
  assert.equal(checks.teacherPendingQueueClean, true);
  assert.equal(checks.concurrencyWinnerOnlyOne, true);
  assert.equal(checks.idempotentReplaySuccess, true);

  return { checks };
}

module.exports = {
  id: 'R03',
  title: '扫码即时入账',
  run
};
