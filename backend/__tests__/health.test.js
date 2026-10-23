/**
 * 健康检查接口测试
 * 使用 Node.js 内置测试框架 (node:test)
 *
 * 运行方式:
 *   npm test
 *   或
 *   node --test __tests__/health.test.js
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

describe("Routes Loading", () => {
  it("health 路由应能正常加载", () => {
    const router = require("../routes/health");
    assert.ok(router, "health route should load");
    assert.strictEqual(typeof router, "function", "router should be a function (Express Router)");
  });

  it("auth 路由应能正常加载", () => {
    const router = require("../routes/auth");
    assert.ok(router, "auth route should load");
    assert.strictEqual(typeof router, "function", "router should be a function (Express Router)");
  });
});

describe("Error Codes Constants", () => {
  it("ErrorCodes 应包含所有必要的错误码", () => {
    const { ErrorCodes, ErrorMessages } = require("../constants/errorCodes");
    assert.ok(ErrorCodes);
    assert.ok(ErrorMessages);
    assert.strictEqual(ErrorCodes.SUCCESS, 200);
    assert.strictEqual(ErrorCodes.UNAUTHORIZED, 401);
    assert.strictEqual(ErrorCodes.FORBIDDEN, 403);
    assert.strictEqual(ErrorCodes.INTERNAL_ERROR, 500);
    assert.strictEqual(ErrorCodes.RATE_LIMITED, 429);
  });
});

describe("Auth Middleware", () => {
  it("中间件应导出所有必要函数", () => {
    const auth = require("../middleware/auth");
    assert.ok(auth.requireAuth, "requireAuth should exist");
    assert.ok(auth.requireRole, "requireRole should exist");
    assert.ok(auth.signToken, "signToken should exist");
    assert.ok(auth.JWT_SECRET, "JWT_SECRET should exist");
    assert.strictEqual(typeof auth.requireAuth, "function", "requireAuth should be async function");
    assert.strictEqual(typeof auth.requireRole, "function", "requireRole should be function");
    assert.strictEqual(typeof auth.signToken, "function", "signToken should be function");
  });

  it("signToken 应生成有效的 JWT", () => {
    const auth = require("../middleware/auth");
    const token = auth.signToken({ id: 1, role: "admin", username: "test" });
    assert.ok(token, "token should be generated");
    assert.strictEqual(typeof token, "string", "token should be a string");
    assert.ok(token.split(".").length === 3, "token should have 3 parts (JWT format)");
  });
});

describe("Utility Functions", () => {
  it("response.js 应导出 success 和 fail", () => {
    const response = require("../utils/response");
    assert.ok(response.success);
    assert.ok(response.fail);
    assert.strictEqual(typeof response.success, "function");
    assert.strictEqual(typeof response.fail, "function");
  });

  it("validator.js 应导出 validate", () => {
    const val = require("../middleware/validator");
    assert.ok(val.validate);
    assert.strictEqual(typeof val.validate, "function");
  });

  it("db.js 应导出 pool, execute, query", () => {
    const db = require("../db");
    assert.ok(db.pool);
    assert.ok(db.execute);
    assert.ok(db.query);
  });
});
