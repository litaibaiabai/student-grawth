# 管理系统模板

一个基于 React + Express + MySQL 的全栈管理系统模板，提供完整的登录认证、路由鉴权、侧边栏导航和基础布局。

## 项目结构

```
template/
├── .github/workflows/ci.yml        # GitHub Actions CI（自动测试+构建）
├── frontend/                       # 前端（React + Vite + Antd）
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/              # 登录页（支持角色选择）
│   │   │   ├── dashboard/          # 通用仪表盘
│   │   │   ├── admin/              # 管理后台（admin only）
│   │   │   ├── not-found/          # 404 页面
│   │   │   └── forbidden/          # 403 页面
│   │   ├── component/
│   │   │   ├── Nav/                # 顶部导航栏（含退出登录）
│   │   │   ├── Sidebar/            # 侧边栏菜单（按角色动态显示）
│   │   │   ├── ExampleTable/       # 示例表格组件
│   │   │   └── ErrorBoundary/      # 错误边界组件
│   │   ├── constant/
│   │   │   ├── menu.js             # 共享菜单配置（按角色分组）
│   │   │   ├── errorCodes.js       # 前端错误码定义
│   │   │   ├── apis.js             # API 服务器地址（从环境变量读取）
│   │   │   └── urls.js             # API 端点路径
│   │   ├── util/
│   │   │   ├── request.js          # Axios 封装（拦截器、错误处理）
│   │   │   ├── token.js            # JWT Token 本地存储
│   │   │   └── fn.js               # 通用工具函数
│   │   ├── store/
│   │   │   └── auth.js             # 认证状态管理（Jotai）
│   │   ├── types/
│   │   │   └── user.js             # 类型定义（JSDoc）
│   │   ├── index.less              # 全局样式
│   │   └── var.less                # CSS 变量
│
│   ├── backend/                        # 后端（Express + MySQL）
│   │   ├── Dockerfile                  # 后端 Docker 镜像
│   │   ├── controllers/
│   │   │   └── authController.js       # 认证控制器（登录/创建用户）
│   │   ├── middleware/
│   │   │   ├── auth.js                 # JWT 鉴权（requireAuth, requireRole, signToken）
│   │   │   ├── errorHandler.js         # 统一错误处理（含 AppError 类）
│   │   │   └── validator.js            # 参数校验中间件
│   │   ├── routes/
│   │   │   ├── auth.js                 # 登录/用户信息/创建测试用户
│   │   │   └── health.js               # 健康检查
│   │   ├── services/
│   │   │   └── example.js              # 示例服务层（三层架构示例）
│   │   ├── utils/
│   │   │   ├── response.js             # 统一响应 helper（success/fail）
│   │   │   └── logger.js               # 结构化日志工具
│   │   ├── docs/
│   │   │   └── api.md                  # API 接口文档
│   │   ├── scripts/
│   │   │   └── seed.js                 # 数据库初始化脚本
│   │   ├── app.js                      # 入口文件
│   │   ├── db.js                       # 数据库连接池
│   │   ├── package.json
│   │   └── .env.example                # 环境变量模板
├── .dockerignore                   # Docker 忽略文件
└── README.md
```

## 技术栈

### 前端

| 技术 | 用途 |
|------|------|
| React 18 | UI 框架 |
| Vite 5 | 构建工具 |
| Antd 5 | UI 组件库 |
| @ant-design/icons | 图标库 |
| React Router 7 | 前端路由 |
| Jotai | 全局状态管理 |
| Axios | HTTP 请求 |
| Less | 样式预处理 |

### 后端

| 技术 | 用途 |
|------|------|
| Express 5 | Web 框架 |
| MySQL2 | 数据库驱动 |
| JWT | 认证鉴权 |
| bcrypt | 密码加密 |
| cors | 跨域支持 |
| morgan | 请求日志 |

### 工程化

| 工具 | 用途 |
|------|------|
| GitHub Actions | CI 流水线（后端测试 + 前端构建） |
| Docker | 容器化部署 |
| Docker Compose | 一键启动 MySQL + 后端 + 前端 |
| nodemon | 后端开发热重载 |
| ESLint | 代码规范检查 |
| Prettier | 代码格式化 |

## 快速开始

### 1. 数据库准备

一键初始化（自动创建数据库、表、测试用户）：

```bash
cd backend
cp .env.example .env        # 编辑环境变量（数据库名、密码等）
node scripts/seed.js        # 自动创建数据库和测试数据
```

或手动执行 SQL：

```sql
CREATE DATABASE IF NOT EXISTS template_db DEFAULT CHARSET utf8mb4;
USE template_db;
CREATE TABLE users (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  username    VARCHAR(50)  NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'user',
  real_name   VARCHAR(50)  DEFAULT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT INTO users (username, password, role, real_name) VALUES
('admin', '$2b$10$xxxxxxxx', 'admin', '管理员'),
('user1', '$2b$10$yyyyyyyy', 'user', '张三');
```

> **注意**：密码应使用 bcrypt 加密。运行 `node scripts/seed.js` 即可自动加密。

### 2. 后端

```bash
cd backend
cp .env.example .env        # 编辑环境变量（数据库名、密码等）
npm install
npm run dev                 # 开发模式（nodemon 热重载）
```

### 3. 前端

```bash
cd frontend
cp .env.example .env        # 编辑环境变量
npm install
npm run dev                 # Vite 开发服务器（默认 :5173）
```

打开浏览器访问 `http://localhost:5173`，使用测试账号登录：
- **管理员**: `admin` / `admin123`
- **普通用户**: `user1` / `123456`

## 路由与权限

| 路径 | 组件 | 权限要求 | 说明 |
|------|------|---------|------|
| `/login` | Login | 未登录 | 登录页，支持角色选择 |
| `/dashboard` | Dashboard | 已登录 | 通用仪表盘 |
| `/admin` | Admin | admin | 系统管理后台 |
| `/403` | Forbidden | - | 禁止访问提示页 |
| `/500` | ServerError | - | 服务器错误提示页 |
| `*` | NotFound | - | 404 页面 |

## 扩展指南

### 添加新页面

1. 在 `src/app/` 下创建目录（如 `users/`）
2. 编写组件 `index.jsx` + `index.module.less`
3. 在 `App.jsx` 中添加路由和权限配置
4. 在 `constant/menu.js` 的对应角色菜单中添加新菜单项

### 添加新 API

1. 在 `backend/routes/` 下创建路由文件
2. 在 `backend/app.js` 中挂载路由
3. 在 `frontend/src/constant/urls.js` 中添加 API 端点
4. 在 `frontend/src/constant/apis.js` 中确认 API 服务器地址

### 添加新角色

1. 在 `constant/menu.js` 的 `menuConfig` 中添加新角色的菜单项
2. 修改 `backend/routes/auth.js` 中的角色校验（如需要）
3. 在登录页的 `roleOptions` 中添加角色选项

## 构建部署

```bash
# 前端构建
cd frontend && npm run build    # 产物在 dist/

# 后端生产模式
cd backend && npm start         # node app.js（自动托管前端 dist/ 产物）
```

## Docker 部署

### 一键启动（推荐）

```bash
cd ../          # 回到 template 根目录
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

docker-compose up -d
```

启动后访问 `http://localhost`，自动包含 MySQL + 后端 + 前端。

### 环境变量配置

编辑 `backend/.env` 修改以下关键变量：

```ini
DB_PASSWORD=your_password    # 数据库密码
JWT_SECRET=your_secret       # JWT 签名密钥（生产环境必须修改）
```

### Dockerfile

前端使用 Nginx 托管 + API 反向代理，后端使用多阶段构建缩小镜像体积。

## 持续集成

项目包含 GitHub Actions CI 配置（`.github/workflows/ci.yml`），自动执行：

- 后端依赖安装 + 数据库初始化 + 测试用例
- 前端 ESLint 检查 + 构建验证

推送 `main` / `develop` 分支或创建 PR 时自动触发。

## 错误码约定

| 错误码 | 含义 | 处理建议 |
|--------|------|---------|
| 200 | 成功 | — |
| 400 | 请求参数错误 | 检查请求参数 |
| 401 | 未授权 | 清除 token，跳转登录 |
| 403 | 无权限 | 跳转 403 页面 |
| 404 | 资源不存在 | 检查 API 路径 |
| 422 | 校验失败 | 显示具体字段错误 |
| 500 | 服务器错误 | 显示 500 页面 |

详细错误码定义见 `frontend/src/constant/errorCodes.js` 和 `backend/constants/errorCodes.js`。
