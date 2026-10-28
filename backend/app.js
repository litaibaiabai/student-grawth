const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { errorHandler } = require("./middleware/errorHandler");
function createApp({
  pool,
  provider,
  clock = () => new Date(),
  schoolId = process.env.SCHOOL_ID,
} = {}) {
  if (!pool || !schoolId) throw Error("pool and SCHOOL_ID are required");
  const app = express();
  Object.assign(app.locals, {
    pool,
    provider,
    clock,
    schoolId: String(schoolId),
  });
  app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "6mb" }));
  app.post(
    ["/api/auth/login", "/api/v1/auth/login"],
    rateLimit({ windowMs: 900000, limit: 30, skipSuccessfulRequests: true }),
  );
  const { createCoreRouter } = require("./routes/reportCore");
  app.use(
    "/api/auth",
    (req, res, next) => {
      req.url = "/auth" + req.url;
      next();
    },
    createCoreRouter(),
  );
  app.use("/api/v1", createCoreRouter());
  app.get("/api/health", (req, res) =>
    res.json({ code: 200, data: { status: "ok" } }),
  );
  app.use("/api", (req, res) =>
    res.status(410).json({ code: 410, message: "旧业务接口已退役" }),
  );
  const dist = path.join(__dirname, "../frontend/dist");
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api"))
      return res.sendFile(path.join(dist, "index.html"), (e) => e && next());
    next();
  });
  app.use((req, res) =>
    res.status(404).json({ code: 404, message: "接口不存在" }),
  );
  app.use(errorHandler);
  return app;
}
if (require.main === module) {
  const { createDbPool } = require("./db");
  if (!process.env.REPORT_DB_NAME?.startsWith("liuyu_report_"))
    throw Error("Set dedicated REPORT_DB_NAME before starting report core");
  const pool = createDbPool({ database: process.env.REPORT_DB_NAME });
  const provider = require("./services/reportCoreProvider").createProvider();
  const app = createApp({ pool, provider });
  const worker = require("./services/reportCoreWorker").startCoreWorker({
    pool,
    provider,
  });
  process.on("SIGTERM", async () => {
    await worker.stop();
    await pool.end();
    process.exit(0);
  });
  app.listen(Number(process.env.PORT || 3000), () =>
    console.log("Report core listening"),
  );
}
module.exports = { createApp };
