// middleware/auth.js — JWT 认证中间件（模板化版本）
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_template_2026";

/**
 * 验证 JWT Token 的中间件
 * 从 Authorization header 中提取 Bearer token 并验证
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: "未登录或 token 已过期"
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // 计算 token 的 sha256 哈希值，检查是否在黑名单中
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    try {
      const [rows] = await pool.query(
        "SELECT 1 FROM token_blacklist WHERE token_hash = ? AND expires_at > NOW() LIMIT 1",
        [tokenHash]
      );
      if (rows.length > 0) {
        return res.status(401).json({
          code: 401,
          message: "token 已失效，请重新登录"
        });
      }
    } catch (dbErr) {
      // 数据库不可用时降级处理，允许认证通过
      console.warn("⚠️ token_blacklist 查询失败，降级模式：", dbErr.message);
    }

    req.user = decoded; // 将用户信息挂载到 req 对象
    next();
  } catch (err) {
    return res.status(401).json({
      code: 401,
      message: "token 无效或已过期"
    });
  }
}

/**
 * 角色权限验证中间件
 * @param {...string} roles - 允许的角色列表
 * @returns {Function} Express 中间件
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        code: 401,
        message: "未登录"
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        code: 403,
        message: "无权限访问"
      });
    }

    next();
  };
}

/**
 * 生成 JWT Token
 * @param {Object} user - 用户信息对象
 * @returns {string} JWT token
 */
function signToken(user) {
  const payload = {
    id: user.id,
    userId: user.id,
    schoolId: user.school_id || 1,
    role: user.role,
    username: user.username,
    real_name: user.real_name || null,
    grade: user.grade ?? null,
    class_no: user.class_no ?? null,
    classes: user.classes ?? null
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "8h" });
}

module.exports = { requireAuth, requireRole, signToken, JWT_SECRET };
