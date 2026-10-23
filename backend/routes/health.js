/**
 * 健康检查路由
 * GET /api/health — 检查服务是否正常运行
 */
const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    code: 200,
    message: "ok",
    data: {
      status: "running",
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;
