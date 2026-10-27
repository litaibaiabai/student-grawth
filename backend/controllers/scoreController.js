/**
 * scoreController.js — 过程积分流水与冲销控制器 (严格对接 SPEC V2.0 数据库架构)
 */

const { pool } = require("../db");
const {requireStudentScope}=require("../middleware/studentScope");
const {AppError}=require("../middleware/errorHandler");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");
const { assertStudentInScope } = require("../middleware/security");

/**
 * POST /api/v1/teacher/scores/direct-batch
 * A模式教师批量直评发分 (delta: +1, source: 'A_DIRECT')
 */
async function directScoreBatch(req, res, next) {
  const { studentIds, student_ids, categoryId, category_id, categoryCode, category_code, remark, requestKey } =
    req.body;
  const sIds = Array.isArray(studentIds) ? studentIds : Array.isArray(student_ids) ? student_ids : [];
  const cId = categoryId || category_id;
  const cCode = categoryCode || category_code;

  if (sIds.length === 0 || (!cId && !cCode)) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "请选择至少一名学生和有效三级指标", 422);
  }

  const teacherId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. 获取当前学期
    const [termRows] = await conn.query(
      "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
      [schoolId]
    );
    const termId = termRows.length > 0 ? termRows[0].id : 1;

    // 2. 校验指标 (支持按照 categoryId 或 categoryCode 查找)
    let catRows = [];
    if (cId) {
      [catRows] = await conn.query(
        "SELECT id, category_name, category_code, score FROM edu_evaluation_category WHERE id = ? AND category_level = 3 AND status = 1",
        [cId]
      );
    } else if (cCode) {
      [catRows] = await conn.query(
        "SELECT id, category_name, category_code, score FROM edu_evaluation_category WHERE category_code = ? AND category_level = 3 AND status = 1",
        [cCode]
      );
    }

    if (catRows.length === 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.NOT_FOUND, "指定的评价三级指标无效或未启用", 404);
    }
    const cat = catRows[0];
    const targetCategoryId = cat.id;
    const dimCode = (cat.category_code || "D").charAt(0);

    // 3. 逐个验证学生权限并插入流水
    const createdRecords = [];
    for (const sid of sIds) {
      let student;
      if (req.user?.role !== "manager") {
        student = await assertStudentInScope(req.user?.classes, sid, schoolId);
      } else {
        student = await requireStudentScope(req.user,sid,conn);
      }

      const classSnapshot = JSON.stringify({ grade: student.grade || 1, class_no: student.class_no || 1 });
      const reqKey = `${requestKey || "DIRECT"}_${sid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const [insertRes] = await conn.query(
        `INSERT INTO score_record (
          school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
          source, delta, operator_id, request_key, remark
        ) VALUES (?, ?, ?, ?, ?, ?, 'A_DIRECT', 1, ?, ?, ?)`,
        [schoolId, termId, sid, classSnapshot, dimCode, targetCategoryId, teacherId, reqKey, remark || null]
      );

      createdRecords.push({
        scoreRecordId: insertRes.insertId,
        studentId: sid,
        delta: 1
      });
    }

    // 4. 写入审计
    await conn.query(
      `INSERT INTO operation_audit (
        school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
      ) VALUES (?, ?, ?, 'SCORE_RECORD', ?, 'DIRECT_SCORE_BATCH', ?, ?)`,
      [
        schoolId,
        teacherId,
        req.user?.role || "teacher",
        createdRecords[0]?.scoreRecordId || 0,
        `REQ_DIRECT_${createdRecords[0]?.scoreRecordId || 0}_${Date.now()}`,
        JSON.stringify({ count: createdRecords.length, categoryId: targetCategoryId })
      ]
    );

    await conn.commit();
    success(res, { count: createdRecords.length, records: createdRecords }, "批量直评发分成功");
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/admin/scores/reversal
 * 授权执行积分纠错冲销 (-1流水, source: 'REVERSAL')
 */
async function reverseScore(req, res, next) {
  const originalScoreId = req.body?.originalScoreId || req.body?.original_score_id;
  const reason = req.body?.reason;
  const requestKey = req.body?.requestKey || req.body?.request_key;

  if (!originalScoreId) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "缺少 originalScoreId / original_score_id", 422);
  }

  const adminId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. 悲观锁锁定原流水
    const [origRows] = await conn.query("SELECT * FROM score_record WHERE id = ? FOR UPDATE", [originalScoreId]);
    if (origRows.length === 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.NOT_FOUND, "原积分流水记录不存在", 404);
    }

    const orig = origRows[0];
    if(Number(orig.school_id)!==Number(schoolId))throw new AppError(403,"禁止冲销异校流水",403);
    if (orig.delta <= 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.BAD_REQUEST, "仅正向奖励流水(+1)可被冲销", 400);
    }

    // 2. 检查是否已经存在该原流水的冲销记录
    const [revCheck] = await conn.query("SELECT id FROM score_record WHERE original_id = ? LIMIT 1", [originalScoreId]);
    if (revCheck.length > 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.REVERSAL_ALREADY_EXISTS, "该笔原始正向流水已被冲销过，严禁重复扣减", 409);
    }

    // 3. 写入负向冲销流水 (-1)
    const reqKey = requestKey || `REV_${originalScoreId}_${Date.now()}`;
    const classSnapshot =
      typeof orig.class_snapshot === "object" && orig.class_snapshot !== null
        ? JSON.stringify(orig.class_snapshot)
        : orig.class_snapshot;

    const [revInsert] = await conn.query(
      `INSERT INTO score_record (
        school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
        source, delta, original_id, operator_id, request_key, remark
      ) VALUES (?, ?, ?, ?, ?, ?, 'REVERSAL', -1, ?, ?, ?, ?)`,
      [
        schoolId,
        orig.term_id,
        orig.student_id,
        classSnapshot,
        orig.dimension_code,
        orig.category_id,
        orig.id,
        adminId,
        reqKey,
        reason ? `【冲销原记录#${originalScoreId}】${reason}` : `【冲销原记录#${originalScoreId}】`
      ]
    );

    // 4. 写入审计日志
    await conn.query(
      `INSERT INTO operation_audit (
        school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, old_summary, new_summary
      ) VALUES (?, ?, ?, 'SCORE_RECORD', ?, 'SCORE_REVERSAL', ?, ?, ?)`,
      [
        schoolId,
        adminId,
        req.user?.role || "manager",
        originalScoreId,
        reqKey,
        JSON.stringify({ originalScoreId, delta: orig.delta }),
        JSON.stringify({ reversalScoreId: revInsert.insertId, delta: -1, reason })
      ]
    );

    await conn.commit();
    success(
      res,
      {
        reversalScoreId: revInsert.insertId,
        originalScoreId,
        delta: -1,
        reversedAt: new Date().toISOString()
      },
      "积分冲销成功"
    );
  } catch (err) {
    if (conn) await conn.rollback();
    if (String(err.code) === "ER_DUP_ENTRY") {
      return fail(res, ErrorCodes.REVERSAL_ALREADY_EXISTS, "该笔原始正向流水已被冲销过，严禁重复扣减", 409);
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/student/scores
 * 查阅本人或指定学生的各维度过程积分统计与不可篡改流水
 */
async function getStudentScores(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();

    let studentId = req.query.studentId;
    if (req.user?.role === "student" || !studentId) {
      studentId = req.user?.id || req.user?.userId;
    }

    const schoolId = req.user?.schoolId || 1;

    await requireStudentScope(req.user,studentId,conn);

    // 1. 各维度积分统计
    const [dimRows] = await conn.query(
      `SELECT
         dimension_code,
         COALESCE(SUM(delta), 0) AS score
       FROM score_record
       WHERE student_id = ? AND school_id = ?
       GROUP BY dimension_code`,
      [studentId, schoolId]
    );

    const dimensionMap = {
      D: { name: "德育", code: "D", score: 0 },
      Z: { name: "智育", code: "Z", score: 0 },
      T: { name: "体育", code: "T", score: 0 },
      M: { name: "美育", code: "M", score: 0 },
      L: { name: "劳育", code: "L", score: 0 },
      G: { name: "故事", code: "G", score: 0 }
    };

    let totalPoints = 0;
    for (const r of dimRows) {
      if (dimensionMap[r.dimension_code]) {
        dimensionMap[r.dimension_code].score = Number(r.score);
        totalPoints += Number(r.score);
      }
    }

    // 2. 积分明细流水（时间倒序）
    const [records] = await conn.query(
      `SELECT
         s.id, s.delta, s.source, s.remark, s.created_at, s.dimension_code,
         s.original_id,
         c.category_name, c.category_code,
         u.real_name AS operator_name,
         u.role AS operator_role
       FROM score_record s
       LEFT JOIN edu_evaluation_category c ON s.category_id = c.id
       LEFT JOIN users u ON s.operator_id = u.id
       WHERE s.student_id = ? AND s.school_id = ?
       ORDER BY s.id DESC
       LIMIT 200`,
      [studentId, schoolId]
    );

    success(res, {
      studentId: Number(studentId),
      totalPoints,
      summary: {
        total_process_score: totalPoints,
        dimensions: Object.fromEntries(Object.values(dimensionMap).map((d) => [d.code, d.score]))
      },
      dimensions: Object.values(dimensionMap),
      records
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/teacher/scores/correction
 * 教师对本班级学生流水发起撤销或更正 (C3 correctReward)
 */
async function teacherCorrectScore(req, res, next) {
  const { originalScoreId, action, newDimensionCode, newCategoryId, newPoints, reason, requestKey } = req.body;
  if (!originalScoreId) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "缺少 originalScoreId", 422);
  }

  const teacherId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();

    // 校验原流水学生是否在该教师管辖范围内
    const [origRows] = await conn.query("SELECT student_id FROM score_record WHERE id = ?", [originalScoreId]);
    if (origRows.length === 0) {
      return fail(res, ErrorCodes.NOT_FOUND, "原积分流水记录不存在", 404);
    }
    await requireStudentScope(req.user, origRows[0].student_id, conn);

    const { correctReward } = require("../services/scoreLedgerService");
    const result = await correctReward({
      schoolId,
      originalScoreId,
      action: action || "REVOKE",
      newDimensionCode,
      newCategoryId,
      newPoints: newPoints || 1,
      reason,
      operatorId: teacherId,
      requestKey
    }, conn);

    success(res, result, action === "CORRECT" ? "流水更正成功" : "流水撤销成功");
  } catch (err) {
    if (err.statusCode === 409 || String(err.code) === "ER_DUP_ENTRY") {
      return fail(res, ErrorCodes.REVERSAL_ALREADY_EXISTS, err.message || "该笔原始流水已被冲销过，严禁重复扣减", 409);
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  directScoreBatch,
  reverseScore,
  teacherCorrectScore,
  getStudentScores
};
