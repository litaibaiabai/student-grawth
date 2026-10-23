/**
 * 通用与业务错误码定义（SPEC V2.0 / 附件A）
 */

const ErrorCodes = {
  // 通用
  SUCCESS: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,

  // 账号与鉴权
  AUTH_REQUIRED: 401,
  FORBIDDEN_SCOPE: 403,
  LOGIN_FAILED: 1001,
  ACCOUNT_DISABLED: 1002,

  // 学期与指标
  TERM_CLOSED: 4001,

  // 卡片生命周期与申领
  CARD_EXPIRED: 4002,
  CARD_PENDING: 4091,
  CARD_USED: 4092,
  CARD_VOID: 4093,
  CLAIM_NOT_PENDING: 4003,
  REVIEW_TIMEOUT: 4004,

  // 幂等与冲销
  DUPLICATE_REQUEST: 4094,
  REVERSAL_ALREADY_EXISTS: 4095,

  // 评分与导入与报告
  SCORE_INCOMPLETE: 4005,
  REPORT_SCORE_INCOMPLETE: 4006,
  IMPORT_CONFLICT: 4007
};

const ErrorMessages = {
  [ErrorCodes.SUCCESS]: "操作成功",
  [ErrorCodes.BAD_REQUEST]: "请求参数错误",
  [ErrorCodes.UNAUTHORIZED]: "未登录或 token 已过期",
  [ErrorCodes.FORBIDDEN]: "无权限访问",
  [ErrorCodes.NOT_FOUND]: "资源不存在",
  [ErrorCodes.CONFLICT]: "数据冲突",
  [ErrorCodes.VALIDATION_ERROR]: "参数校验失败",
  [ErrorCodes.RATE_LIMITED]: "请求频率过高，请稍后重试",
  [ErrorCodes.INTERNAL_ERROR]: "服务器内部错误",

  [ErrorCodes.LOGIN_FAILED]: "用户名或密码错误",
  [ErrorCodes.ACCOUNT_DISABLED]: "账号已被停用",
  [ErrorCodes.AUTH_REQUIRED]: "用户会话已过期或未提供有效登录凭据",
  [ErrorCodes.FORBIDDEN_SCOPE]: "教师试图操作非任教班级学生，或跨校越权操作",
  [ErrorCodes.TERM_CLOSED]: "学期处于停用状态或已超过有效截止时间",
  [ErrorCodes.CARD_EXPIRED]: "实体卡跨月未扫码已超期，禁止发起新申领",
  [ErrorCodes.CARD_PENDING]: "该实体卡已被其他同学扫码申领，正在审核中",
  [ErrorCodes.CARD_USED]: "该实体卡已审核通过并入账，属于永久失效卡",
  [ErrorCodes.CARD_VOID]: "该实体卡已被作废，不可继续使用",
  [ErrorCodes.CLAIM_NOT_PENDING]: "该扫卡单据已被处理过（已通过或已驳回），不可重复审核",
  [ErrorCodes.REVIEW_TIMEOUT]: "已超过次月配置的审核宽限期，单据自动作废",
  [ErrorCodes.DUPLICATE_REQUEST]: "幂等请求键 requestKey 重复，直接返回已有处理结果",
  [ErrorCodes.REVERSAL_ALREADY_EXISTS]: "该笔原始正向流水已被冲销过，严禁重复扣减",
  [ErrorCodes.SCORE_INCOMPLETE]: "六育正式百分制成绩存在缺失维度，无法核算综合得分",
  [ErrorCodes.REPORT_SCORE_INCOMPLETE]: "六育任意一维缺失，无法发布学期报告",
  [ErrorCodes.IMPORT_CONFLICT]: "导入数据与已有正式成绩发生版本冲突"
};

module.exports = { ErrorCodes, ErrorMessages };
