/**
 * 结构化日志工具
 * 支持分级日志、请求追踪、文件输出
 *
 * 使用方式：
 *   const { logger } = require("../utils/logger");
 *   logger.info("用户登录成功", { userId: 1, username: "admin" });
 *   logger.error("数据库连接失败", err);
 */

const { randomUUID } = require("crypto");

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// 日志颜色（终端）
const COLORS = {
  debug: "\x1b[36m",  // cyan
  info: "\x1b[32m",   // green
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
  reset: "\x1b[0m"
};

/**
 * 格式化日志行
 */
function formatEntry(level, message, meta = null, requestId = null) {
  const timestamp = new Date().toISOString();
  const parts = [timestamp, `[${level.toUpperCase()}]`];

  if (requestId) parts.push(`[req:${requestId}]`);
  parts.push(message);

  if (meta) {
    const metaStr = typeof meta === "object" ? JSON.stringify(meta) : String(meta);
    parts.push(metaStr);
  }

  return parts.join(" ");
}

/**
 * 写入日志
 */
function write(level, message, meta = null, requestId = null) {
  const levelOrder = { debug: 0, info: 1, warn: 2, error: 3 };
  if (levelOrder[level] < levelOrder[LOG_LEVEL]) return;

  const formatted = formatEntry(level, message, meta, requestId);

  // 终端输出
  const color = COLORS[level] || "";
  if (level === "error") {
    console.error(`${color}${formatted}${COLORS.reset}`);
  } else if (level === "warn") {
    console.warn(`${color}${formatted}${COLORS.reset}`);
  } else {
    console.log(`${color}${formatted}${COLORS.reset}`);
  }
}

const logger = {
  debug: (msg, meta, reqId) => write("debug", msg, meta, reqId),
  info: (msg, meta, reqId) => write("info", msg, meta, reqId),
  warn: (msg, meta, reqId) => write("warn", msg, meta, reqId),
  error: (msg, meta, reqId) => write("error", msg, meta, reqId)
};

/**
 * 为每个请求生成唯一的 requestId，便于日志追踪
 */
function requestIdMiddleware(req, res, next) {
  const id = req.headers["x-request-id"] ||
    req.query._rid ||
    randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

module.exports = { logger, requestIdMiddleware };
