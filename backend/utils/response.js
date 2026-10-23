/**
 * 统一响应格式
 * 提供成功和失败的标准化响应函数
 */

/**
 * 成功响应
 * @param {object} res - Express response 对象
 * @param {*} data - 响应数据
 * @param {string} message - 成功消息
 * @param {number} statusCode - HTTP 状态码
 */
function success(res, data = null, message = "操作成功", statusCode = 200) {
  return res.status(statusCode).json({
    code: 200,
    message,
    data
  });
}

/**
 * 失败响应
 * @param {object} res - Express response 对象
 * @param {number} code - 业务错误码
 * @param {string} message - 错误消息
 * @param {number} statusCode - HTTP 状态码
 */
function fail(res, code = 400, message = "请求失败", statusCode = 400) {
  return res.status(statusCode).json({
    code,
    message,
    data: null
  });
}

module.exports = { success, fail };
