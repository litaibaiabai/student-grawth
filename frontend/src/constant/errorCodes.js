/**
 * 通用错误码定义 — 前端版本
 * 与后端 constants/errorCodes.js 保持同步
 *
 * 使用方式：
 *   import { ErrorCodes, getErrorMessage } from "@/constant/errorCodes";
 *   if (code === ErrorCodes.UNAUTHORIZED) { ... }
 */

export const ErrorCodes = {
  // 通用成功
  SUCCESS: 200,

  // 4xx 客户端错误
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,

  // 5xx 服务器错误
  INTERNAL_ERROR: 500,

  // 业务错误码 (1000+)
  LOGIN_FAILED: 1001,
  ACCOUNT_DISABLED: 1002,
  ACCOUNT_LOCKED: 1003,
  CREATE_FAILED: 2001,
  UPDATE_FAILED: 2002,
  DELETE_FAILED: 2003,
  FILE_UPLOAD_FAILED: 3001,
  FILE_NOT_FOUND: 3002
};

const ErrorMessages = {
  [ErrorCodes.SUCCESS]: "操作成功",
  [ErrorCodes.BAD_REQUEST]: "请求参数错误",
  [ErrorCodes.UNAUTHORIZED]: "未登录或 token 已过期",
  [ErrorCodes.FORBIDDEN]: "无权限访问",
  [ErrorCodes.NOT_FOUND]: "资源不存在",
  [ErrorCodes.CONFLICT]: "数据已存在",
  [ErrorCodes.VALIDATION_ERROR]: "参数校验失败",
  [ErrorCodes.RATE_LIMITED]: "请求频率过高，请稍后重试",
  [ErrorCodes.INTERNAL_ERROR]: "服务器内部错误",
  [ErrorCodes.LOGIN_FAILED]: "用户名或密码错误",
  [ErrorCodes.ACCOUNT_DISABLED]: "账号已被禁用",
  [ErrorCodes.ACCOUNT_LOCKED]: "账号已被锁定，请稍后重试",
  [ErrorCodes.CREATE_FAILED]: "创建失败",
  [ErrorCodes.UPDATE_FAILED]: "更新失败",
  [ErrorCodes.DELETE_FAILED]: "删除失败",
  [ErrorCodes.FILE_UPLOAD_FAILED]: "文件上传失败",
  [ErrorCodes.FILE_NOT_FOUND]: "文件不存在"
};

/**
 * 根据错误码获取错误消息
 * @param {number} code 错误码
 * @param {string} fallback 默认消息
 * @returns {string}
 */
export function getErrorMessage(code, fallback = "") {
  return ErrorMessages[code] || fallback || `未知错误(${code})`;
}
