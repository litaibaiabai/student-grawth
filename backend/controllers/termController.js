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

    const formatted = rows.map((r) => {
      const termName = `${r.academic_year}学年第${Number(r.semester) === 1 ? "一" : "二"}学期`;
      return {
        ...r,
        termId: r.id,
        academicYear: r.academic_year,
        startDate: r.start_date,
        endDate: r.end_date,
        isCurrent: Boolean(r.is_current),
        isActive: Boolean(r.active),
        term_name: termName,
        termName,
        status: r.active ? "ACTIVE" : "ARCHIVED"
      };
    });

    success(res, formatted);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/admin/terms
 * 创建或更新学期 (高度容错：兼容驼峰/下划线、term_name 自动解构)
 */
async function saveTerm(req, res, next) {
  const id = req.body.id;
  let academicYear = req.body.academicYear || req.body.academic_year;
  let semester = req.body.semester;
  const startDate = req.body.startDate || req.body.start_date;
  const endDate = req.body.endDate || req.body.end_date;
  const isCurrent = req.body.isCurrent !== undefined ? req.body.isCurrent : (req.body.is_current !== undefined ? req.body.is_current : false);
  const active = req.body.active !== undefined ? req.body.active : 1;
  const termName = req.body.termName || req.body.term_name;

  // 容错：如果前端传入 term_name (如 "2027-2028学年第一学期")，自动解析 academicYear 与 semester
  if ((!academicYear || !semester) && termName) {
    const match = String(termName).match(/(\d{4}-\d{4}).*?第?([一二12])学期?/);
    if (match) {
      academicYear = academicYear || match[1];
      semester = semester || ((match[2] === "一" || match[2] === "1") ? 1 : 2);
    }
  }

  if (!academicYear || !semester || !startDate || !endDate) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "学年、学期、起止日期均为必填项", 422);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;
    const isCurrentVal = (isCurrent === true || isCurrent === 1 || isCurrent === "1") ? 1 : 0;

    if (isCurrentVal === 1) {
      await conn.query("UPDATE academic_year SET is_current = 0 WHERE school_id = ? OR school_id IS NULL", [schoolId]);
    }

    if (id) {
      await conn.query(
        `UPDATE academic_year
         SET academic_year = ?, semester = ?, start_date = ?, end_date = ?, is_current = ?, active = ?
         WHERE id = ? AND (school_id = ? OR school_id IS NULL)`,
        [academicYear, Number(semester), startDate, endDate, isCurrentVal, active ? 1 : 0, id, schoolId]
      );
      success(res, { id }, "学期更新成功");
    } else {
      const [result] = await conn.query(
        `INSERT INTO academic_year (school_id, academic_year, semester, start_date, end_date, is_current, active, effective_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [schoolId, academicYear, Number(semester), startDate, endDate, isCurrentVal, active ? 1 : 0]
      );
      success(res, { id: result.insertId }, "学期创建成功");
    }
  } catch (err) {
    console.error("saveTerm error:", err);
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
