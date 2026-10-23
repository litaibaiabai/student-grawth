/**
 * termController.js — 学年学期控制器
 */

const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");

/**
 * GET /api/v1/terms/current
 * 获取当前默认展示与活动学期
 */
async function getCurrentTerm(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;

    const [rows] = await conn.query(
      `SELECT id, school_id, academic_year, semester, start_date, end_date, is_current, active, effective_at
       FROM academic_year
       WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 AND active = 1
       ORDER BY school_id DESC, id DESC
       LIMIT 1`,
      [schoolId]
    );

    if (rows.length === 0) {
      return fail(res, ErrorCodes.TERM_CLOSED, "暂无当前活动学期，请联系教务管理员配置", 400);
    }

    const term = rows[0];
    success(res, {
      termId: term.id,
      id: term.id,
      schoolId: term.school_id,
      academicYear: term.academic_year,
      semester: term.semester,
      startDate: term.start_date,
      endDate: term.end_date,
      isCurrent: Boolean(term.is_current),
      isActive: Boolean(term.active),
      timezone: "Asia/Shanghai"
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/terms
 * 获取所有学期列表
 */
async function getTerms(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;

    const [rows] = await conn.query(
      `SELECT id, school_id, academic_year, semester, start_date, end_date, is_current, active, effective_at
       FROM academic_year
       WHERE school_id = ? OR school_id IS NULL
       ORDER BY academic_year DESC, semester DESC`,
      [schoolId]
    );

    success(res, rows);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/admin/terms
 * 创建或更新学期
 */
async function saveTerm(req, res, next) {
  const { id, academicYear, semester, startDate, endDate, isCurrent, active } = req.body;
  if (!academicYear || !semester || !startDate || !endDate) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "学年、学期、起止日期均为必填项", 422);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;

    if (isCurrent) {
      await conn.query("UPDATE academic_year SET is_current = 0 WHERE school_id = ? OR school_id IS NULL", [schoolId]);
    }

    if (id) {
      await conn.query(
        `UPDATE academic_year
         SET academic_year = ?, semester = ?, start_date = ?, end_date = ?, is_current = ?, active = ?
         WHERE id = ? AND (school_id = ? OR school_id IS NULL)`,
        [academicYear, semester, startDate, endDate, isCurrent ? 1 : 0, active !== undefined ? (active ? 1 : 0) : 1, id, schoolId]
      );
      success(res, { id }, "学期更新成功");
    } else {
      const [result] = await conn.query(
        `INSERT INTO academic_year (school_id, academic_year, semester, start_date, end_date, is_current, active, effective_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [schoolId, academicYear, semester, startDate, endDate, isCurrent ? 1 : 0, 1]
      );
      success(res, { id: result.insertId }, "学期创建成功");
    }
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getCurrentTerm,
  getTerms,
  saveTerm
};
