/**
 * 统一错误处理中间件
 * 捕获所有未被处理的错误，返回统一格式的响应
 */

class AppError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}

const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${err.name}: ${err.message}`);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message
    });
  }

  // JWT 验证失败
  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      code: 401,
      message: "未授权，请重新登录"
    });
  }

  // 数据库错误
  if (err.code && err.code.startsWith("ER_")) {
    return res.status(500).json({
      code: 500,
      message: "数据库操作失败"
    });
  }

  // 默认 500
  return res.status(500).json({
    code: 500,
    message: "服务器内部错误"
  });
};

module.exports = { errorHandler, AppError };
