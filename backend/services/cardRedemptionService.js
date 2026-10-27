/**
 * cardRedemptionService.js — 任务 03 扫码即时入账服务
 *
 * 规范：
 * 1. 学生扫有效预分类卡片立即入账 +1，教师无需二次审核
 * 2. 消费 C3 appendReward 合同，source = 'B_CARD'，保持账本不可变
 * 3. 并发抢扫悲观锁排他，单一命中，失败者 409
 * 4. 同一 requestKey 幂等重放，返回已有结果
 */
const { tokenHash } = require('./cardCredentials');
const { appendReward } = require('./scoreLedgerService');

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * 学生扫码即时兑换入账
 */
async function redeemCardInstant({ schoolId = 1, studentId, token, requestKey }, conn) {
  if (!conn) throw new AppError('数据库连接必须提供', 503);
  if (!token) throw new AppError('卡片凭证不能为空', 422);
  if (!studentId) throw new AppError('学生ID不能为空', 422);

  const reqKey = requestKey || `CLAIM_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const hash = tokenHash(token);

  await conn.beginTransaction();
  try {
    // 1. 锁查卡片
    const [cardRows] = await conn.query(
      'SELECT * FROM reward_card WHERE token_hash = ? FOR UPDATE',
      [hash]
    );
    if (!cardRows.length) {
      throw new AppError('卡片不存在或凭证无效', 404);
    }

    const card = cardRows[0];

    // 2. 基础安全性校验
    if (card.school_id && Number(card.school_id) !== Number(schoolId)) {
      throw new AppError('该卡片不属于本校', 403);
    }

    // 3. 检查卡片状态与幂等重试
    if (card.status !== 'UNUSED') {
      // 检查是否为同学生同幂等键的重试
      const [existingClaim] = await conn.query(
        'SELECT id, student_id, request_key FROM card_claim WHERE card_id = ?',
        [card.id]
      );
      if (existingClaim.length && Number(existingClaim[0].student_id) === Number(studentId)) {
        if (existingClaim[0].request_key === reqKey) {
          // 幂等命中：查询已写入的流水
          const [existingScore] = await conn.query(
            "SELECT id, delta, category_id FROM score_record WHERE card_claim_id = ? LIMIT 1",
            [existingClaim[0].id]
          );
          await conn.commit();
          return {
            claimId: existingClaim[0].id,
            scoreRecordId: existingScore.length ? existingScore[0].id : null,
            pointsCredited: card.points || 1,
            categoryId: card.category_id,
            categoryName: card.category_name,
            dimensionCode: card.dimension_code,
            replayed: true
          };
        }
      }
      throw new AppError('该卡已被使用或已被其他学生领取', 409);
    }

    // 检查有效期
    const now = new Date();
    if (card.valid_until && new Date(card.valid_until) < now) {
      throw new AppError('该卡已超过申领截止时间', 400);
    }

    // 4. 原子锁定并更新卡片状态为 USED (满足 chk_card_used_consistency 约束)
    await conn.query(
      "UPDATE reward_card SET status = 'USED', used_student_id = ?, used_at = NOW() WHERE id = ?",
      [studentId, card.id]
    );

    // 5. 写入 card_claim 表（直接 APPROVED，教师无需二次待审）
    const [claimInsert] = await conn.query(
      `INSERT INTO card_claim (
        school_id, card_id, student_id, status, claimed_at, reviewer_id, reviewed_at,
        request_key, category_id, category_version
      ) VALUES (?, ?, ?, 'APPROVED', NOW(), ?, NOW(), ?, ?, ?)`,
      [
        schoolId,
        card.id,
        studentId,
        card.teacher_id,
        reqKey,
        card.category_id,
        card.category_version || 'V2'
      ]
    );
    const claimId = claimInsert.insertId;

    // 6. 消费 C3 appendReward 合同，写入 score_record 流水
    const rewardRes = await appendReward({
      schoolId,
      termId: card.term_id || 1,
      studentId,
      dimensionCode: card.dimension_code || 'D',
      categoryId: card.category_id,
      delta: card.points || 1,
      source: 'B_CARD',
      operatorId: card.teacher_id,
      remark: card.category_name ? `实体卡即时兑换入账：${card.category_name}` : '实体卡扫码即时入账',
      requestKey: reqKey
    }, conn);

    // 7. 回填 card_claim_id 到 score_record
    await conn.query(
      'UPDATE score_record SET card_claim_id = ? WHERE id = ?',
      [claimId, rewardRes.id]
    );

    await conn.commit();

    return {
      claimId,
      scoreRecordId: rewardRes.id,
      pointsCredited: card.points || 1,
      categoryId: card.category_id,
      categoryName: card.category_name,
      dimensionCode: card.dimension_code
    };
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    if (err.code === 'ER_DUP_ENTRY' || err.code === 'ER_LOCK_DEADLOCK') {
      throw new AppError('该卡已被使用或已被其他学生领取', 409);
    }
    throw err;
  }
}

module.exports = {
  redeemCardInstant
};
