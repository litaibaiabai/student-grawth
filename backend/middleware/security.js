/**
 * security.js — 学校数据隔离与教师任教班级权限守卫
 */

const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { fail } = require("../utils/response");

/**
 * 校验学生是否在教师任教班级范围内
 * @param {Array|string} teacherClasses - 教师任教班级 JSON，例如 [{"grade":4,"class_no":1}]
 * @param {number|string} studentId - 学生用户 ID
 * @param {number|string} schoolId - 学校 ID
 */
async function assertStudentInScope(teacherClasses, studentId, schoolId) {
  let classes = teacherClasses;
  if (typeof classes === "string") {
    try {
      classes = JSON.parse(classes);
    } catch {
      classes = [];
    }
  }
  if (!Array.isArray(classes) || classes.length === 0) {
    throw { code: ErrorCodes.FORBIDDEN_SCOPE, message: "教师未配置任教班级权限" };
  }

  const [rows] = await pool.query(
    "SELECT id, school_id, grade, class_no FROM users WHERE id = ? AND role = 'student' LIMIT 1",
    [studentId]
  );
  if (rows.length === 0) {
    throw { code: ErrorCodes.NOT_FOUND, message: "目标学生不存在" };
  }

  const student = rows[0];
  if (Number(student.school_id) !== Number(schoolId)) {
    throw { code: ErrorCodes.FORBIDDEN_SCOPE, message: "禁止跨校越权操作" };
  }

  const inScope = classes.some(
    (c) => Number(c.grade) === Number(student.grade) && Number(c.class_no) === Number(student.class_no)
  );

  if (!inScope) {
    throw {
      code: ErrorCodes.FORBIDDEN_SCOPE,
      message: `越权拦截：学生(年级:${student.grade}, 班级:${student.class_no})不在当前教师管辖范围内`
    };
  }

  return student;
}

/**
 * 教师班级权限守卫中间件
 */
function classScopeGuard(paramName = "studentId") {
  return async (req, res, next) => {
    if (req.user?.role === "manager") {
      return next(); // 管理员跳过班级范围限制
    }
    if (req.user?.role !== "teacher") {
      return fail(res, ErrorCodes.FORBIDDEN, "仅教师或管理员可执行此操作", 403);
    }

    const studentId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    if (!studentId) {
      return next();
    }

    try {
      await assertStudentInScope(req.user.classes, studentId, req.user.schoolId || req.user.school_id);
      next();
    } catch (err) {
      return fail(res, err.code || ErrorCodes.FORBIDDEN_SCOPE, err.message || "越权访问", 403);
    }
  };
}

module.exports = {
  assertStudentInScope,
  classScopeGuard
};
