/**
 * teachingAssignmentController.js — 任务 01 教师任教与班主任职责管理控制器
 */
const { pool } = require("../db");
const { success, fail } = require("../utils/response");
const { ErrorCodes } = require("../constants/errorCodes");
const { assertScope } = require("../services/authorizationService");
const { withStudentTermsMutation } = require("../services/studentTermStateService");

/**
 * GET /api/v1/admin/teaching-assignments
 * 查询当前学期的任教授权与班主任列表
 */
async function getTeachingAssignments(req, res, next) {
  try {
    const schoolId = req.user.schoolId || req.user.school_id;
    let termId = req.query.termId || req.query.term_id;
    if (!termId) {
      const [termRows] = await pool.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      termId = termRows.length > 0 ? termRows[0].id : 1;
    }

    const grade = req.query.grade ? Number(req.query.grade) : null;
    let querySql = `
      SELECT 
        a.id, a.school_id, a.term_id, a.teacher_id, a.grade, a.class_no, a.subject_code, a.is_head_teacher, a.created_at,
        u.real_name as teacher_name, u.username as teacher_username
      FROM teacher_teaching_assignment a
      JOIN users u ON a.teacher_id = u.id
      WHERE a.school_id = ? AND a.term_id = ?
    `;
    const queryParams = [schoolId, termId];
    if (grade) {
      querySql += " AND a.grade = ?";
      queryParams.push(grade);
    }
    querySql += " ORDER BY a.grade, a.class_no, a.subject_code";

    const [rows] = await pool.query(querySql, queryParams);

    const formattedRows = (rows || []).map((r) => ({
      ...r,
      termId: r.term_id,
      teacherId: r.teacher_id,
      teacher_code: r.teacher_username,
      teacherCode: r.teacher_username,
      classNo: r.class_no,
      class_name: `${r.class_no}班`,
      subject: r.subject_code,
      subjectCode: r.subject_code,
      isHeadTeacher: Boolean(r.is_head_teacher),
      status: "ACTIVE"
    }));

    // 同时兼顾直接返回数组与 { assignments } 结构
    success(res, formattedRows);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/admin/teaching-assignments
 * 管理员分配教师任教班级、学科或班主任职责
 */
async function saveTeachingAssignment(req, res, next) {
  try {
    const schoolId = req.user.schoolId || req.user.school_id;
    const body = req.body || {};
    const teacherId = body.teacherId || body.teacher_id;
    const grade = body.grade ? Number(body.grade) : null;
    
    let rawClassNo = body.classNo !== undefined ? body.classNo : (body.class_no !== undefined ? body.class_no : body.class_name);
    let classNo = null;
    if (typeof rawClassNo === "number") {
      classNo = rawClassNo;
    } else if (typeof rawClassNo === "string") {
      const match = rawClassNo.match(/\d+/);
      if (match) classNo = parseInt(match[0], 10);
    }

    const subjectCode = body.subjectCode || body.subject_code || body.subject;
    const isHeadTeacher = body.isHeadTeacher !== undefined 
      ? (body.isHeadTeacher ? 1 : 0) 
      : (body.is_head_teacher ? 1 : 0);
    const termId = body.termId || body.term_id;

    if (!teacherId || !grade || !classNo || !subjectCode) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "缺少教师、年级、班级或学科参数", 422);
    }

    let resolvedTermId = termId;
    if (!resolvedTermId) {
      const [termRows] = await pool.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      resolvedTermId = termRows.length > 0 ? termRows[0].id : 1;
    }

    // 校验教师存在且同校
    const [tRows] = await pool.query("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'teacher'", [teacherId, schoolId]);
    if (!tRows || tRows.length === 0) {
      return fail(res, ErrorCodes.NOT_FOUND, "目标教师不存在或不属于本校", 404);
    }

    await pool.query(`
      INSERT INTO teacher_teaching_assignment 
        (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE is_head_teacher = VALUES(is_head_teacher)
    `, [schoolId, resolvedTermId, teacherId, grade, classNo, subjectCode, isHeadTeacher]);

    success(res, {
      saved: true,
      termId: resolvedTermId,
      teacherId,
      grade,
      classNo,
      subjectCode,
      isHeadTeacher
    }, "任教授权保存成功");
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/admin/teaching-assignments/:id
 * 撤销任教授权
 */
async function deleteTeachingAssignment(req, res, next) {
  try {
    const schoolId = req.user.schoolId || req.user.school_id;
    const { id } = req.params;

    const [delResult] = await pool.query(
      "DELETE FROM teacher_teaching_assignment WHERE id = ? AND school_id = ?",
      [id, schoolId]
    );

    if (delResult && delResult.affectedRows === 0) {
      return fail(res, ErrorCodes.NOT_FOUND, "未找到该任教授权记录或无权删除", 404);
    }

    success(res, { deleted: true }, "任教授权已撤销");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/admin/import/subject-scores
 * 提交学科成绩（严格遵循 C1 任教授权校验与 C2 状态版本推进）
 */
async function submitSubjectScores(req, res, next) {
  try {
    const schoolId = req.user.schoolId || req.user.school_id;
    const { termId = 1, grade, classNo, subjectCode, scores = [] } = req.body;

    if (!grade || !classNo || !subjectCode) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "缺少班级或学科代码", 422);
    }

    // 1. C1 作用域校验：非管理员角色必须具备此年级班级与学科的任教授权
    try {
      await assertScope({
        actor: req.actor,
        grade,
        classNo,
        subjectCode
      }, pool);
    } catch (scopeErr) {
      return fail(res, ErrorCodes.FORBIDDEN, scopeErr.message, 403);
    }

    // 2. C2 事务批量写与版本推进
    const studentKeys = scores.map(s => ({
      schoolId,
      termId: Number(termId),
      studentId: Number(s.studentId)
    }));

    const mutationResult = await withStudentTermsMutation({
      connection: pool,
      actor: req.actor,
      studentKeys,
      requestKey: req.headers["x-request-key"] || null,
      payloadHash: "subj_" + grade + "_" + classNo + "_" + subjectCode
    }, async (conn) => {
      for (const s of scores) {
        await conn.query(`
          INSERT INTO subject_score (school_id, term_id, student_id, subject_code, score, raw_score)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE score = VALUES(score), raw_score = VALUES(raw_score)
        `, [schoolId, termId, s.studentId, subjectCode, s.score, String(s.score)]);
      }
      return { insertedCount: scores.length };
    });

    success(res, mutationResult, "学科成绩提交成功");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTeachingAssignments,
  saveTeachingAssignment,
  deleteTeachingAssignment,
  submitSubjectScores
};
