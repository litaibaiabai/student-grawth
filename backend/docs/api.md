# API 文档

## 通用约定

### 请求格式

所有请求体使用 `application/json`，包含字段：

```json
{
  "username": "string",
  "password": "string"
}
```

认证请求需在 Header 中携带：

```
Authorization: Bearer <token>
```

### 响应格式

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | number | 错误码，见下方 |
| message | string | 提示信息 |
| data | object/null | 响应数据，失败时为 null |

### 错误码

| 错误码 | HTTP 状态码 | 含义 | 处理建议 |
|--------|------------|------|---------|
| 200 | 200 | 成功 | — |
| 400 | 400 | 请求参数错误 | 检查请求参数 |
| 401 | 401 | 未授权 | 清除 token，跳转登录 |
| 403 | 403 | 无权限 | 跳转 403 页面 |
| 404 | 404 | 资源不存在 | 检查 API 路径 |
| 409 | 409 | 资源冲突 | 检查唯一性约束 |
| 422 | 422 | 校验失败 | 显示具体字段错误 |
| 500 | 500 | 服务器错误 | 显示 500 页面 |
| 1001 | 401 | 登录失败 | 检查用户名和密码 |
| 1002 | 401 | 账号已禁用 | 联系管理员 |
| 1003 | 401 | 账号已锁定 | 等待解锁或联系管理员 |
| 2001 | 400 | 创建失败 | 检查输入数据 |
| 2002 | 400 | 更新失败 | 检查输入数据 |
| 2003 | 400 | 删除失败 | 检查依赖关系 |

## 认证接口

### POST /api/auth/login

用户登录，返回 JWT token。

**请求体：**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**成功响应 (200)：**

```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "real_name": "管理员"
    }
  }
}
```

**失败响应 (401)：**

```json
{
  "code": 1001,
  "message": "用户名或密码错误",
  "data": null
}
```

### GET /api/auth/me

获取当前登录用户信息。

**认证：** 需要 Bearer Token

**成功响应 (200)：**

```json
{
  "code": 200,
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "real_name": "管理员"
    }
  }
}
```

### POST /api/auth/logout

注销当前 token，将其加入黑名单。

**认证：** 需要 Bearer Token

**成功响应 (200)：**

```json
{
  "code": 200,
  "message": "退出登录成功",
  "data": null
}
```

## 开发接口

### POST /api/auth/dev-create-user

**仅限开发环境**，用于创建测试用户。

**请求体：**

```json
{
  "username": "testuser",
  "password": "123456",
  "role": "user",
  "real_name": "测试用户"
}
```

**成功响应 (200)：**

```json
{
  "code": 200,
  "message": "用户创建成功",
  "data": {
    "id": 3
  }
}
```

## Health Check

### GET /health

健康检查接口。

**成功响应 (200)：**

```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "status": "ok"
  }
}
```

## 测试账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | admin（可访问所有页面） |
| user1 | 123456 | user（仅可访问 Dashboard） |
