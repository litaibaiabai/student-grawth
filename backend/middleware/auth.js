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
    let blacklisted = false;
    try {
      const [rows] = await pool.query(
        "SELECT 1 FROM token_blacklist WHERE token_hash = ? AND expires_at > NOW() LIMIT 1",
        [tokenHash]
      );
      if (rows.length > 0) {
        blacklisted = true;
      }
    } catch (dbErr) {
      if (dbErr.code !== 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({
          code: 503,
          message: "权限敏感依赖不可用，请稍后重试"
        });
      }
    }

    if (blacklisted) {
      return res.status(401).json({
        code: 401,
        message: "token 已失效，请重新登录"
      });
    }

    // 实时构建 ActorContext，禁止盲信旧 JWT 快照
    const { resolveActorContext } = require('../services/authorizationService');
    let actor;
    try {
      actor = await resolveActorContext({
        userId: decoded.id,
        tokenHash,
        issuedRole: decoded.role,
        termId: req.query.termId || req.body?.termId || null
      }, pool);
    } catch (actorErr) {
      const status = actorErr.statusCode || 500;
      return res.status(status).json({
        code: status,
        message: actorErr.message
      });
    }

    req.actor = actor;
    let effectiveClasses = (actor.assignments || []).map(a => ({ grade: a.grade, class_no: a.classNo, subject_code: a.subjectCode }));
    if (effectiveClasses.length === 0) {
      const rawClasses = actor.classes || decoded.classes;
      if (rawClasses) {
        try {
          const parsed = typeof rawClasses === 'string' ? JSON.parse(rawClasses) : rawClasses;
          if (Array.isArray(parsed)) {
            effectiveClasses = parsed.map(c => ({ grade: Number(c.grade), class_no: Number(c.class_no || c.classNo) }));
          }
        } catch {}
      }
    }
    req.user = {
      ...decoded,
      ...actor,
      classes: effectiveClasses
    };
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
