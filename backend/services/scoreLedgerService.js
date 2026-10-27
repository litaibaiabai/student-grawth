/**
 * scoreLedgerService.js — 任务 04 C3 追加账本合同与冲销纠错服务
 *
 * 合同 C3:
 * 1. appendReward(...) -> 物理追加插入，绝不原地修改历史流水
 * 2. correctReward(...) -> 冲销追加负向记录，修改追加冲销+替代项；冲销幂等红线：严禁二次冲销 (409)
 * 3. 所有变更通过 C2 withStudentTermMutation 锁住学生学期状态并原子递增 source_revision
 */
const { withStudentTermMutation } = require('./studentTermStateService');

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * 追加奖励流水记录 (物理追加，不可变)
 */
async function appendReward({
  schoolId = 1,
  termId = 1,
  studentId,
  dimensionCode = 'D',
  categoryId,
  delta = 1,
  source = 'A_DIRECT',
  operatorId = null,
  remark = null,
  requestKey = null,
  classSnapshot = null
}, conn) {
  if (!conn) throw new AppError('数据库连接必须提供', 503);
  if (!studentId) throw new AppError('学生ID必须提供', 422);

  const crypto = require('crypto');
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ studentId, delta, categoryId, source })).digest('hex');

  const { sourceRevision, result } = await withStudentTermMutation({
    connection: conn,
    actor: { id: operatorId, role: 'teacher' },
    studentKey: { schoolId, termId, studentId },
    requestKey: requestKey || `APPEND_${studentId}_${Date.now()}_${Math.random()}`,
    payloadHash
  }, async (mutationConn, state) => {
    // 1. 获取班级快照（如果未提供）
    let snapshotStr = classSnapshot;
    if (!snapshotStr) {
      const [studentRows] = await mutationConn.query(
        'SELECT grade, class_no FROM users WHERE id = ?',
        [studentId]
      );
      if (studentRows.length > 0) {
        snapshotStr = JSON.stringify({
          grade: studentRows[0].grade || 1,
          class_no: studentRows[0].class_no || 1
        });
      }
    }

    // 2. 插入 score_record (物理追加)
    const [insertRes] = await mutationConn.query(
      `INSERT INTO score_record (
        school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
        source, delta, operator_id, request_key, remark, correction_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NONE')`,
      [
        schoolId,
        termId,
        studentId,
        typeof snapshotStr === 'object' ? JSON.stringify(snapshotStr) : snapshotStr,
        dimensionCode,
        categoryId || null,
        source,
        delta,
        operatorId,
        requestKey,
        remark
      ]
    );

    return {
      id: insertRes.insertId,
      schoolId,
      termId,
      studentId,
      dimensionCode,
      categoryId,
      delta,
      source
    };
  });

  return {
    ...result,
    sourceRevision
  };
}

/**
 * 纠错操作：支持撤销 (REVOKE) 与更正 (CORRECT)
 */
async function correctReward({
  schoolId = 1,
  originalScoreId,
  action = 'REVOKE',
  newDimensionCode,
  newCategoryId,
  newPoints = 1,
  reason = '',
  operatorId = null,
  requestKey = null
}, conn) {
  if (!conn) throw new AppError('数据库连接必须提供', 503);
  if (!originalScoreId) throw new AppError('缺少 originalScoreId', 422);

  // 1. 锁查原记录
  const [origRows] = await conn.query(
    'SELECT * FROM score_record WHERE id = ? FOR UPDATE',
    [originalScoreId]
  );
  if (origRows.length === 0) {
    throw new AppError('原积分流水记录不存在', 404);
  }

  const orig = origRows[0];
  if (Number(orig.school_id) !== Number(schoolId)) {
    throw new AppError('禁止操作异校积分流水', 403);
  }
  if (orig.delta <= 0) {
    throw new AppError('仅正向奖励流水可被纠错或撤销', 400);
  }

  // 2. 冲销幂等红线：检查是否已被冲销过
  const [revCheck] = await conn.query(
    "SELECT id FROM score_record WHERE original_id = ? AND source = 'REVERSAL' LIMIT 1",
    [originalScoreId]
  );
  if (revCheck.length > 0) {
    throw new AppError('该笔流水已被冲销，严禁重复扣减', 409);
  }

  // 3. 在 C2 锁住学生学期状态的保护下执行撤销/更正并递增 revision
  const crypto = require('crypto');
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ originalScoreId, action, newCategoryId, newPoints })).digest('hex');

  const { sourceRevision, result } = await withStudentTermMutation({
    connection: conn,
    actor: { id: operatorId, role: 'teacher' },
    studentKey: { schoolId, termId: orig.term_id, studentId: orig.student_id },
    requestKey: requestKey || `CORRECT_${originalScoreId}_${Date.now()}`,
    payloadHash
  }, async (mutationConn, state) => {
    const classSnapshotStr = typeof orig.class_snapshot === 'object' && orig.class_snapshot !== null
      ? JSON.stringify(orig.class_snapshot)
      : orig.class_snapshot;

    // 4. 追加负向冲销记录
    const [revInsert] = await mutationConn.query(
      `INSERT INTO score_record (
        school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
        source, delta, original_id, operator_id, request_key, remark, correction_type
      ) VALUES (?, ?, ?, ?, ?, ?, 'REVERSAL', ?, ?, ?, ?, ?, ?)`,
      [
        schoolId,
        orig.term_id,
        orig.student_id,
        classSnapshotStr,
        orig.dimension_code,
        orig.category_id,
        -orig.delta,
        orig.id,
        operatorId,
        requestKey,
        reason ? `【冲销原记录#${originalScoreId}】${reason}` : `【冲销原记录#${originalScoreId}】`,
        action === 'CORRECT' ? 'CORRECT' : 'REVOKE'
      ]
    );

    const reversalId = revInsert.insertId;

    // 5. 如果是更正（CORRECT），再追加一条新的正向替代流水 (遵守 source ENUM 与 check 约束)
    let replacementId = null;
    if (action === 'CORRECT') {
      const [repInsert] = await mutationConn.query(
        `INSERT INTO score_record (
          school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
          source, delta, original_id, operator_id, request_key, remark, correction_type, correction_chain_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'A_DIRECT', 1, NULL, ?, ?, ?, 'CORRECT', ?)`,
        [
          schoolId,
          orig.term_id,
          orig.student_id,
          classSnapshotStr,
          newDimensionCode || orig.dimension_code,
          newCategoryId || orig.category_id,
          operatorId,
          requestKey ? `${requestKey}_REP` : `REP_${originalScoreId}_${Date.now()}`,
          reason ? `【更正自#${originalScoreId}】${reason}` : `【更正自#${originalScoreId}】`,
          originalScoreId
        ]
      );
      replacementId = repInsert.insertId;
    }

    // 6. 记录审计
    await mutationConn.query(
      `INSERT INTO operation_audit (
        school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, old_summary, new_summary
      ) VALUES (?, ?, 'teacher', 'SCORE_RECORD', ?, ?, ?, ?, ?)`,
      [
        schoolId,
        operatorId,
        originalScoreId,
        action === 'CORRECT' ? 'CORRECT_SCORE' : 'REVOKE_SCORE',
        requestKey || `AUDIT_CORR_${originalScoreId}`,
        JSON.stringify({ originalScoreId, delta: orig.delta }),
        JSON.stringify({ reversalId, replacementId, action, reason })
      ]
    );

    return {
      reversalId,
      replacementId,
      delta: action === 'CORRECT' ? newPoints : -orig.delta,
      action
    };
  });

  return {
    ...result,
    sourceRevision
  };
}

module.exports = {
  appendReward,
  correctReward
};
