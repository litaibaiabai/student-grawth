// app.js — Express 后端入口（模板化版本）
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { errorHandler } = require("./middleware/errorHandler");
const { requestIdMiddleware, logger } = require("./utils/logger");

// 导入路由
const authRoutes = require("./routes/auth");
const healthRoutes = require("./routes/health");
const apiV1Routes = require("./routes/api");
const { startSchedulers } = require("./services/scheduler");

const app = express();

// 部署在 Nginx 之后时按 X-Forwarded-For 计数；后端端口直接对外暴露时请设 TRUST_PROXY=0
const trustProxy = process.env.TRUST_PROXY === undefined ? 1 : Number(process.env.TRUST_PROXY);
app.set("trust proxy", trustProxy > 0 ? trustProxy : false);

// 中间件配置
app.use(requestIdMiddleware); // 请求追踪（生成 requestId）
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(helmet({ contentSecurityPolicy: false })); // 报告页自带 CSP meta
// 登录暂力破解防护：仅失败请求计数
app.post(
  ["/api/v1/auth/login", "/api/auth/login"],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 20,
    skipSuccessfulRequests: true,
    message: { code: 429, message: "登录尝试过于频繁，请 15 分钟后再试" }
  })
);
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 3000,
    message: { code: 429, message: "请求过于频繁，请稍后重试" }
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// 请求级日志（带 requestId）
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, { ip: req.ip }, req.requestId);
  next();
});

// 静态文件托管（安全：仅在 dist 存在时加载）
const distPath = path.join(__dirname, "dist");
try {
  require("fs").accessSync(distPath, require("fs").F_OK);
  app.use(express.static(distPath));
} catch {
  // dist 不存在时跳过（开发环境）
}

// API 路由挂载
app.use("/api/v1", apiV1Routes);
app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);
app.use("/api", apiV1Routes);

// SPA 单页路由支持（非 /api 请求且前端构建存在时回退至 index.html，适配 Express 5）
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  const indexPath = path.join(distPath, "index.html");
  try {
    require("fs").accessSync(indexPath, require("fs").F_OK);
    return res.sendFile(indexPath);
  } catch {
    return next();
  }
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ code: 404, message: "接口不存在", data: null });
});

// 统一错误处理
app.use(errorHandler);

// 启动服务器
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 六育评价系统后端运行在端口 ${PORT}`);
    console.log(`🔗 API 基础路径：http://localhost:${PORT}/api/v1`);
    startSchedulers();
  });
}

module.exports = app;
