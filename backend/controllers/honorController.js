/**
 * honorController.js — 荣誉奖项申报、认定与材料多版本留痕控制器 (严格对接 SPEC V2.0 数据库架构)
 */

const crypto = require("crypto");
const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");

/**
 * POST /api/v1/student/honors
 * 学生申报荣誉
 */
async function submitHonor(req, res, next) {
  const {
    title, awardName, awardLevel = "CITY", prizeLevel = "FIRST",
    awardDate, certificateUrl, description, requestKey
  } = req.body;

  const eventTitle = title || awardName;
  if (!eventTitle) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "请填写荣誉/赛事项目名称", 422);
  }

  // 映射级别与等次
  const lvl = ["DISTRICT", "CITY", "PROVINCE"].includes(awardLevel) ? awardLevel : "CITY";
  const prize = ["FIRST", "SECOND", "THIRD"].includes(prizeLevel) ? prizeLevel : "FIRST";

  const studentId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();

    // 1. 获取当前学期
    const [termRows] = await conn.query(
      "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
      [schoolId]
    );
    const termId = termRows.length > 0 ? termRows[0].id : 1;

    // 2. 生成 event_key (去重键)
    const eventKey = `${crypto.createHash("md5").update(eventTitle.trim()).digest("hex").slice(0, 16)}_${Date.now().toString().slice(-4)}`;

    const [resInsert] = await conn.query(
      `INSERT INTO honor_record (
        school_id, student_id, term_id, event_key, title, award_level, prize_level,
        status, award_date, material_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 1)`,
      [
        schoolId, studentId, termId, eventKey, eventTitle, lvl, prize,
        awardDate || new Date().toISOString().slice(0, 10)
      ]
    );
    const honorId = resInsert.insertId;

    // 3. 写入材料版本留痕表 material_revision
    const fileRef = certificateUrl || "/uploads/honor/mock_cert.png";
    const contentHash = crypto.createHash("sha256").update(fileRef + (description || "")).digest("hex");

    await conn.query(
      `INSERT INTO material_revision (
        school_id, owner_type, owner_id, version_no, text_content, file_ref, content_hash, created_by
      ) VALUES (?, 'HONOR', ?, 1, ?, ?, ?, ?)`,
      [schoolId, honorId, description || eventTitle, fileRef, contentHash, studentId]
    );

    // 查询自动计算的荣誉积分 honor_points
    const [[honorRow]] = await conn.query("SELECT honor_points FROM honor_record WHERE id = ?", [honorId]);

    success(res, {
      id: honorId,
      status: "PENDING",
      honorPoints: Number(honorRow.honor_points)
    }, "荣誉申报已提交，等待教师审阅");
  } catch (err) {
    if (String(err.code) === "ER_DUP_ENTRY") {
      return fail(res, ErrorCodes.CONFLICT, "该荣誉项目已在当前学期申报过，请勿重复提交", 409);
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/student/honors/:id/resubmit
 * 被退回后补充材料重新提交，记录 material_revision 履历
 */
async function resubmitHonor(req, res, next) {
  const honorId = req.params.id;
  const { certificateUrl, description, reason } = req.body;
  const studentId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM honor_record WHERE id = ? AND student_id = ? FOR UPDATE",
      [honorId, studentId]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.NOT_FOUND, "未找到该荣誉记录", 404);
    }

    const prev = rows[0];
    const nextVersion = Number(prev.material_version) + 1;
    const fileRef = certificateUrl || "/uploads/honor/resubmit_cert.png";
    const contentHash = crypto.createHash("sha256").update(fileRef + (description || "")).digest("hex");

    // 1. 写入新材料版本留痕
    await conn.query(
      `INSERT INTO material_revision (
        school_id, owner_type, owner_id, version_no, text_content, file_ref, content_hash, created_by
      ) VALUES (?, 'HONOR', ?, ?, ?, ?, ?, ?)`,
      [schoolId, honorId, nextVersion, description || reason || "补充材料重新提交", fileRef, contentHash, studentId]
    );

    // 2. 更新主表状态重置为 PENDING
    await conn.query(
      `UPDATE honor_record
       SET material_version = ?, status = 'PENDING', reject_reason = NULL, reviewer_id = NULL, reviewed_at = NULL
       WHERE id = ?`,
      [nextVersion, honorId]
    );

    await conn.commit();
    success(res, { id: Number(honorId), status: "PENDING", version: nextVersion }, "荣誉补充材料已成功重新提交");
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/teacher/honors/:id/review
 * 教师审核荣誉申报 (APPROVED | REJECTED)
 */
async function reviewHonor(req, res, next) {
  const honorId = req.params.id;
  const { decision, rejectReason, comment } = req.body;

  if (!["APPROVED", "REJECTED"].includes(decision)) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "审核决定只能是 APPROVED 或 REJECTED", 422);
  }

  const teacherId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query("SELECT * FROM honor_record WHERE id = ? FOR UPDATE", [honorId]);
    if (rows.length === 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.NOT_FOUND, "荣誉记录不存在", 404);
    }

    const prev = rows[0];
    await conn.query(
      `UPDATE honor_record
       SET status = ?, reviewer_id = ?, reviewed_at = NOW(), reject_reason = ?
       WHERE id = ?`,
      [decision, teacherId, decision === "REJECTED" ? (rejectReason || comment || "材料不符要求") : null, honorId]
    );

    // 写入审计
    await conn.query(
      `INSERT INTO operation_audit (
        school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
      ) VALUES (?, ?, ?, 'HONOR_RECORD', ?, 'REVIEW_HONOR', ?, ?)`,
      [schoolId, teacherId, req.user?.role || "teacher", honorId, `REQ_HONOR_REV_${honorId}_${Date.now()}`, JSON.stringify({ decision, honorPoints: prev.honor_points })]
    );

    await conn.commit();
    success(res, { id: Number(honorId), status: decision, honorPoints: Number(prev.honor_points) }, "荣誉审核操作成功");
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/honors
 * 查阅荣誉列表
 */
async function getHonors(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;
    const { status, studentId } = req.query;

    let sql = `
      SELECT h.*, u.real_name AS student_name, u.grade, u.class_no,
             t.real_name AS reviewer_name,
             mr.file_ref AS certificate_url,
             mr.text_content AS description
      FROM honor_record h
      JOIN users u ON h.student_id = u.id
      LEFT JOIN users t ON h.reviewer_id = t.id
      LEFT JOIN material_revision mr ON (mr.owner_type = 'HONOR' AND mr.owner_id = h.id AND mr.version_no = h.material_version)
      WHERE h.school_id = ?
    `;
    const params = [schoolId];

    if (req.user?.role === "student") {
      sql += " AND h.student_id = ?";
      params.push(req.user.id || req.user.userId);
    } else if (studentId) {
      sql += " AND h.student_id = ?";
      params.push(studentId);
    }

    if (status) {
      sql += " AND h.status = ?";
      params.push(status);
    }

    sql += " ORDER BY h.id DESC LIMIT 100";

    const [rows] = await conn.query(sql, params);
    success(res, rows);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  submitHonor,
  resubmitHonor,
  reviewHonor,
  getHonors
};
