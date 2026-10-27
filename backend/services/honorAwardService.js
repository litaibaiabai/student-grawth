/**
 * honorAwardService.js — 任务 05 荣誉认定与奖励服务
 *
 * 核心规范：
 * 1. 教师审核通过时确认 T/M/L 归属、分类与分值
 * 2. 消费 C3 appendReward 合同，将正式奖励同事务计入账本
 * 3. 幂等保护：重复审核返回已有结果，严禁重复记分
 * 4. 撤销认定（revokeHonorWithLedger）时，调用 C3 correctReward 进行负向冲销，保持状态与账本严格守恒
 */
const { appendReward, correctReward } = require('./scoreLedgerService');
const { requireStudentScope } = require('../middleware/studentScope');

class ServiceAppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.code = statusCode;
  }
}
const AppError = ServiceAppError;

/**
 * 教师审核荣誉并同步记入 C3 账本
 */
async function reviewHonorWithLedger({
  schoolId = 1,
  honorId,
  decision,
  rejectReason,
  comment,
  dimensionCode = 'T',
  categoryId,
  awardPoints = 1,
  teacherId,
  actorRole = 'teacher',
  actorUser,
  requestKey
}, conn) {
  if (!conn) throw new AppError('数据库连接必须提供', 503);
  if (!honorId) throw new AppError('缺少 honorId', 422);

  let dec = String(decision || '').toUpperCase();
  if (['APPROVE', 'PASS', '通过'].includes(dec)) dec = 'APPROVED';
  if (['REJECT', 'REFUSE', '驳回'].includes(dec)) dec = 'REJECTED';
  if (!['APPROVED', 'REJECTED'].includes(dec)) {
    throw new AppError('审核决定只能是 APPROVED 或 REJECTED', 422);
  }

  // 1. 锁查荣誉记录
  const [rows] = await conn.query('SELECT * FROM honor_record WHERE id = ? FOR UPDATE', [honorId]);
  if (rows.length === 0) {
    throw new AppError('荣誉记录不存在', 404);
  }

  const prev = rows[0];
  if (Number(prev.school_id) !== Number(schoolId)) {
    throw new AppError('禁止跨校审核', 403);
  }
  if (actorUser) {
    await requireStudentScope(actorUser, prev.student_id, conn);
  }

  // 2. 幂等保护
  if (prev.status === 'APPROVED' && dec === 'APPROVED') {
    return {
      id: Number(honorId),
      status: 'APPROVED',
      honorPoints: Number(prev.honor_points),
      scoreRecordId: prev.score_record_id,
      replayed: true
    };
  }
  if (prev.status !== 'PENDING') {
    throw new AppError('仅待审核荣誉可审核，请刷新列表', 409);
  }

  let scoreRecordId = null;
  if (dec === 'APPROVED') {
    const pts = Number(awardPoints) > 0 ? Number(awardPoints) : 1;
    const dim = dimensionCode || 'T';

    // 3. 消费 C3 appendReward 合同，写入学生评价账本
    const rewardRes = await appendReward({
      schoolId,
      termId: prev.term_id,
      studentId: prev.student_id,
      dimensionCode: dim,
      categoryId: categoryId || null,
      delta: pts,
      source: 'A_DIRECT',
      operatorId: teacherId,
      remark: `荣誉奖项认定加分：${prev.title}`,
      requestKey: requestKey || `HONOR_REWARD_${honorId}_${Date.now()}`
    }, conn);

    scoreRecordId = rewardRes.id;

    // 4. 更新 honor_record 主表
    await conn.query(
      `UPDATE honor_record
       SET status = 'APPROVED', reviewer_id = ?, reviewed_at = NOW(),
           dimension_code = ?, category_id = ?, award_points = ?, score_record_id = ?
       WHERE id = ?`,
      [teacherId, dim, categoryId || null, pts, scoreRecordId, honorId]
    );
  } else {
    await conn.query(
      `UPDATE honor_record
       SET status = 'REJECTED', reviewer_id = ?, reviewed_at = NOW(), reject_reason = ?
       WHERE id = ?`,
      [teacherId, rejectReason || comment || '材料不符要求', honorId]
    );
  }

  // 5. 记录审计
  await conn.query(
    `INSERT INTO operation_audit (
      school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
    ) VALUES (?, ?, ?, 'HONOR_RECORD', ?, 'REVIEW_HONOR', ?, ?)`,
    [
      schoolId,
      teacherId,
      actorRole,
      honorId,
      requestKey || `REQ_HONOR_REV_${honorId}_${Date.now()}`,
      JSON.stringify({ decision: dec, honorPoints: prev.honor_points, scoreRecordId })
    ]
  );

  return {
    id: Number(honorId),
    status: dec,
    honorPoints: Number(prev.honor_points),
    scoreRecordId
  };
}

/**
 * 撤销已认定的荣誉并负向冲销 C3 账本
 */
async function revokeHonorWithLedger({
  schoolId = 1,
  honorId,
  teacherId,
  actorRole = 'teacher',
  reason = '撤销荣誉认定',
  requestKey
}, conn) {
  if (!conn) throw new AppError('数据库连接必须提供', 503);
  if (!honorId) throw new AppError('缺少 honorId', 422);

  const [rows] = await conn.query('SELECT * FROM honor_record WHERE id = ? FOR UPDATE', [honorId]);
  if (rows.length === 0) {
    throw new AppError('荣誉记录不存在', 404);
  }

  const honor = rows[0];
  if (Number(honor.school_id) !== Number(schoolId)) {
    throw new AppError('禁止跨校操作', 403);
  }

  if (honor.status !== 'APPROVED') {
    throw new AppError('仅已认定的荣誉可执行撤销', 409);
  }

  // 若有关联的 C3 账本流水，执行负向冲销
  if (honor.score_record_id) {
    await correctReward({
      schoolId,
      originalScoreId: honor.score_record_id,
      correctionType: 'REVOKE',
      operatorId: teacherId,
      reason: reason || `撤销荣誉认定#${honorId}`,
      requestKey: requestKey || `REVOKE_HONOR_${honorId}_${Date.now()}`
    }, conn);
  }

  // 更新荣誉状态为 REJECTED
  await conn.query(
    `UPDATE honor_record
     SET status = 'REJECTED', reject_reason = ?, score_record_id = NULL, updated_at = NOW()
     WHERE id = ?`,
    [`【已撤销】${reason}`, honorId]
  );

  // 记录审计
  await conn.query(
    `INSERT INTO operation_audit (
      school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
    ) VALUES (?, ?, ?, 'HONOR_RECORD', ?, 'REVOKE_HONOR', ?, ?)`,
    [
      schoolId,
      teacherId,
      actorRole,
      honorId,
      requestKey || `REQ_HONOR_REVOKE_${honorId}_${Date.now()}`,
      JSON.stringify({ honorId, reason, scoreRecordId: honor.score_record_id })
    ]
  );

  return {
    id: Number(honorId),
    status: 'REJECTED'
  };
}

module.exports = {
  reviewHonorWithLedger,
  revokeHonorWithLedger
};
