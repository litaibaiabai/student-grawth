/**
 * Auth Controller — 认证与用户身份控制器
 */

const bcrypt = require("bcrypt");
const { pool } = require("../db");
const { signToken } = require("../middleware/auth");
const { ErrorCodes } = require("../constants/errorCodes");
const { fail, success } = require("../utils/response");

/**
 * 用户登录
 */
async function login(req, res, next) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return fail(res, ErrorCodes.BAD_REQUEST, "请输入用户名和密码", 400);
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.query(
      `SELECT id, school_id, username, password, role, real_name, grade, class_no, classes, status
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [username]
    );

    if (rows.length === 0) {
      return fail(res, ErrorCodes.LOGIN_FAILED, "用户名或密码错误", 401);
    }

    const user = rows[0];

    if (user.status === 1) {
      return fail(res, ErrorCodes.ACCOUNT_DISABLED, "账号已被停用", 403);
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return fail(res, ErrorCodes.LOGIN_FAILED, "用户名或密码错误", 401);
    }

    const token = signToken(user);

    let classes = user.classes;
    if (typeof classes === "string") {
      try { classes = JSON.parse(classes); } catch { classes = []; }
    }

    success(res, {
      token,
      user: {
        id: user.id,
        userId: user.id,
        schoolId: user.school_id,
        username: user.username,
        role: user.role,
        real_name: user.real_name,
        grade: user.grade,
        class_no: user.class_no,
        classes: classes
      }
    }, "登录成功");
  } catch (err) {
    console.error("Login error:", err);
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * 获取当前登录用户信息
 * GET /api/v1/me
 */
async function getMe(req, res, next) {
  if (!req.user) {
    return fail(res, ErrorCodes.AUTH_REQUIRED, "用户未登录", 401);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query(
      `SELECT id, school_id, username, role, real_name, grade, class_no, classes, status
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id || req.user.userId]
    );

    if (rows.length === 0) {
      return fail(res, ErrorCodes.NOT_FOUND, "用户不存在", 404);
    }

    const user = rows[0];
    let classes = user.classes;
    if (typeof classes === "string") {
      try { classes = JSON.parse(classes); } catch { classes = []; }
    }

    success(res, {
      id: user.id,
      userId: user.id,
      schoolId: user.school_id,
      username: user.username,
      role: user.role,
      real_name: user.real_name,
      grade: user.grade,
      class_no: user.class_no,
      classes: classes
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * 创建测试用户（开发模式）
 */
async function createDevUser(req, res, next) {
  const { username, password, role, real_name, grade, class_no, classes, school_id } = req.body || {};

  if (!["student", "teacher", "manager"].includes(role)) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "角色必须是 student, teacher 或 manager", 422);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const hashedPassword = await bcrypt.hash(password || "123456", 10);
    const schoolId = school_id || 1;

    const [result] = await conn.query(
      `INSERT INTO users (school_id, username, password, role, real_name, grade, class_no, classes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        schoolId,
        username,
        hashedPassword,
        role,
        real_name || username,
        grade || null,
        class_no || null,
        classes ? JSON.stringify(classes) : null
      ]
    );

    success(res, { id: result.insertId }, "用户创建成功");
  } catch (err) {
    if (String(err.code) === "ER_DUP_ENTRY") {
      return fail(res, ErrorCodes.CONFLICT, "用户名已存在", 409);
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { login, getMe, createDevUser };
