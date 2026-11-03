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
  const facePath=/\/(?:auth|me)\/face(?:\/|$)/i.test(req.originalUrl||'');
  const bodyError=err.type==='entity.too.large'||err.type==='entity.parse.failed';
  if(facePath||bodyError)console.error(JSON.stringify({event:'face_auth_failed',userId:req.actor?.id||null,status:Number(err.status||err.code)||500,at:new Date().toISOString()}));
  else console.error(`[Error] ${err.name}: ${err.message}`);
  if(err.type==='entity.too.large')return res.status(413).json({code:413,message:'提交数据超出大小限制'});
  if(err.type==='entity.parse.failed')return res.status(400).json({code:400,message:'请求格式无效'});

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...(err.safeDetails?{details:err.details}:{})
    });
  }
  if(err.name==='MulterError')return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({code:err.code==='LIMIT_FILE_SIZE'?413:400,message:err.code==='LIMIT_FILE_SIZE'?'上传文件超出大小限制':'上传字段或文件数量不合法'});

  // JWT 验证失败
  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      code: 401,
      message: "未授权，请重新登录"
    });
  }

  // 业务层直接 throw { code, message } 的情形（如班级越权校验），code 即 HTTP 状态码
  if (typeof err.code === "number" && err.code >= 400 && err.code < 600 && err.message) {
    return res.status(err.code).json({ code: err.code, message: err.message });
  }

  // 数据库错误
  if (typeof err.code === "string" && err.code.startsWith("ER_")) {
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
