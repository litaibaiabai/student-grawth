// routes/auth.js — 认证路由（模板化版本）
const express = require("express");
const { requireAuth, signToken } = require("../middleware/auth");
const { login, getMe, createDevUser } = require("../controllers/authController");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");

const router = express.Router();

/**
 * POST /api/auth/login
 * 用户登录接口
 * 请求体: { username: string, password: string }
 * 响应: { token: string, user: Object }
 */
router.post("/login", login);

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 * 需要 Bearer Token 认证
 */
router.get("/me", requireAuth, getMe);

/**
 * POST /api/auth/logout
 * 退出登录接口
 * 需要 Bearer Token 认证
 */
router.post("/logout", requireAuth, async (req, res, next) => {
  const crypto = require("crypto");
  const { pool } = require("../db");

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return fail(res, ErrorCodes.UNAUTHORIZED, "未提供 token", ErrorCodes.UNAUTHORIZED);
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const exp = req.user.exp;
  const expiresAt = exp ? new Date(exp * 1000).toISOString().slice(0, 19).replace("T", " ") : null;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO token_blacklist (token_hash, expires_at) VALUES (?, ?)`,
      [tokenHash, expiresAt]
    );
    success(res, null, "退出登录成功");
  } catch (err) {
    console.error("Logout error:", err);
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

/**
 * POST /api/auth/dev-create-user
 * 仅限开发环境：创建测试用户
 * 生产环境自动禁用
 */
router.post("/dev-create-user", async (req, res, next) => {
  if (process.env.NODE_ENV !== "development") {
    return fail(res, ErrorCodes.FORBIDDEN, "仅限开发环境使用", ErrorCodes.FORBIDDEN);
  }
  await createDevUser(req, res, next);
});

module.exports = router;
