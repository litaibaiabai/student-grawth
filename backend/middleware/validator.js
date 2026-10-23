/**
 * 参数校验中间件（示例）
 * 使用方式：
 *   router.post("/example", validate({ name: "required", age: "number" }), handler)
 */

const { AppError } = require("./errorHandler");

const validators = {
  required: (value, field) => {
    if (value === undefined || value === null || value === "") {
      throw new AppError(400, `字段 ${field} 不能为空`);
    }
  },
  string: (value, field) => {
    if (value !== undefined && typeof value !== "string") {
      throw new AppError(400, `字段 ${field} 必须为字符串`);
    }
  },
  number: (value, field) => {
    if (value !== undefined && isNaN(Number(value))) {
      throw new AppError(400, `字段 ${field} 必须为数字`);
    }
  },
  email: (value, field) => {
    if (value !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new AppError(400, `字段 ${field} 格式不正确`);
    }
  }
};

const validate = (rules) => {
  return (req, res, next) => {
    try {
      for (const [field, ruleStr] of Object.entries(rules)) {
        const ruleList = ruleStr.split("|");
        for (const rule of ruleList) {
          if (validators[rule]) {
            validators[rule](req.body[field], field);
          }
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { validate };
