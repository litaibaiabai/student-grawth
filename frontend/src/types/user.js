/**
 * 用户类型定义
 */

/**
 * @typedef {Object} User
 * @property {number} id - 用户 ID
 * @property {string} username - 用户名
 * @property {string} role - 角色: 'admin' | 'user'
 * @property {string|null} [real_name] - 真实姓名
 * @property {string} [created_at] - 创建时间
 */

/**
 * @typedef {Object} LoginResponse
 * @property {string} token - JWT token
 * @property {User} user - 用户信息
 */

/**
 * @typedef {Object} AuthState
 * @property {boolean} isAuthenticated - 是否已登录
 * @property {User|null} user - 当前用户
 * @property {string|null} token - 当前 token
 */

/**
 * @typedef {Object} MenuConfigItem
 * @property {string} key - 路由路径
 * @property {string} label - 菜单名称
 * @property {string} [icon] - 图标
 * @property {string[]} roles - 允许访问的角色
 */

module.exports = {};
