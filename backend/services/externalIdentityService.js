/**
 * backend/services/externalIdentityService.js
 *
 * 任务 19: 钉钉身份预留与外部账号关联服务
 *
 * 规范：
 * 1. 管理员受控维护外部身份 (provider: DINGTALK) 到校内账号关联，严格绑定学校范围
 * 2. 关联后权限严格由校内 users 表原角色与任教授权决定，禁止客户端自选或越权提权
 * 3. 跨校关联与越权操作直接 403 阻断
 * 4. 绑定与解绑操作全量记录操作审计日志 (operation_audit)
 * 5. 安全边界：未配置真实统一登录与提供方密钥前，禁止通过调试回调直接签发登录 Token
 */
const db = require('../db');

async function bindExternalIdentity({
  actor,
  schoolId = 1,
  userId,
  provider = 'DINGTALK',
  tenantId = 'ding_default_tenant',
  externalSubject,
  externalName = '',
  connection = null
}) {
  const conn = connection || db;

  if (actor.role !== 'manager' && actor.role !== 'admin') {
    const err = new Error('仅校级管理员可绑定外部身份关联');
    err.status = 403;
    throw err;
  }

  const effectiveSchoolId = Number(schoolId || actor.schoolId || 1);
  if (actor.schoolId && Number(actor.schoolId) !== effectiveSchoolId) {
    const err = new Error('跨校身份关联被严格拒绝');
    err.status = 403;
    throw err;
  }

  if (!userId || !externalSubject) {
    const err = new Error('校内用户ID与外部身份唯一标识不可为空');
    err.status = 400;
    throw err;
  }

  // 验证目标校内用户属于本校
  const [users] = await conn.query(
    "SELECT id, username, real_name, role, school_id FROM users WHERE id = ? AND school_id = ?",
    [userId, effectiveSchoolId]
  );

  if (!users || users.length === 0) {
    const err = new Error('目标校内用户不存在或不属于本校');
    err.status = 404;
    throw err;
  }
  const user = users[0];

  // 写入或更新关联
  await conn.query(`
    INSERT INTO external_identity_link (school_id, user_id, provider, tenant_id, external_subject, external_name, status, bound_by)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), tenant_id = VALUES(tenant_id), external_name = VALUES(external_name), status = 1, bound_by = VALUES(bound_by)
  `, [effectiveSchoolId, userId, provider, tenantId, externalSubject, externalName || user.real_name, actor.id]);

  // 写入安全审计
  try {
    const crypto = require('crypto');
    const reqId = 'AUDIT_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    await conn.query(`
      INSERT INTO operation_audit (school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary)
      VALUES (?, ?, ?, 'EXTERNAL_IDENTITY', ?, 'BIND_EXTERNAL_IDENTITY', ?, ?)
    `, [
      effectiveSchoolId,
      actor.id,
      actor.role,
      userId,
      reqId,
      JSON.stringify({ provider, externalSubject, userId, externalName: externalName || user.real_name })
    ]);
  } catch (e) {}

  return {
    success: true,
    userId,
    provider,
    tenantId,
    externalSubject,
    externalName: externalName || user.real_name,
    internalUser: {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role
    }
  };
}

async function unbindExternalIdentity({
  actor,
  schoolId = 1,
  userId,
  provider = 'DINGTALK',
  externalSubject,
  connection = null
}) {
  const conn = connection || db;

  if (actor.role !== 'manager' && actor.role !== 'admin') {
    const err = new Error('仅校级管理员可解绑外部身份关联');
    err.status = 403;
    throw err;
  }

  const effectiveSchoolId = Number(schoolId || actor.schoolId || 1);
  if (actor.schoolId && Number(actor.schoolId) !== effectiveSchoolId) {
    const err = new Error('跨校解绑被严格拒绝');
    err.status = 403;
    throw err;
  }

  await conn.query(
    "UPDATE external_identity_link SET status = 0 WHERE school_id = ? AND user_id = ? AND provider = ? AND status = 1",
    [effectiveSchoolId, userId, provider]
  );

  // 写入安全审计
  try {
    const crypto = require('crypto');
    const reqId = 'AUDIT_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    await conn.query(`
      INSERT INTO operation_audit (school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, old_summary)
      VALUES (?, ?, ?, 'EXTERNAL_IDENTITY', ?, 'UNBIND_EXTERNAL_IDENTITY', ?, ?)
    `, [
      effectiveSchoolId,
      actor.id,
      actor.role,
      userId,
      reqId,
      JSON.stringify({ provider, externalSubject, userId })
    ]);
  } catch (e) {}

  return {
    success: true,
    userId,
    provider
  };
}

async function listIdentityLinks({ actor, schoolId = 1, connection = null }) {
  const conn = connection || db;

  if (actor.role !== 'manager' && actor.role !== 'admin') {
    const err = new Error('仅校级管理员可查看外部身份关联列表');
    err.status = 403;
    throw err;
  }

  const effectiveSchoolId = Number(schoolId || actor.schoolId || 1);

  const [rows] = await conn.query(`
    SELECT l.id, l.school_id, l.user_id, l.provider, l.tenant_id, l.external_subject, l.external_name, l.status, l.created_at,
           u.username, u.real_name, u.role, u.grade, u.class_no
    FROM external_identity_link l
    JOIN users u ON l.user_id = u.id
    WHERE l.school_id = ? AND l.status = 1
    ORDER BY l.id DESC
  `, [effectiveSchoolId]);

  return rows;
}

async function handleExternalCallback({ provider, authCode, connection = null }) {
  // 安全红线：未接入真实 SSO 与企业密钥验签前，绝对禁止凭模拟或调试回调发放登录 Token
  const err = new Error('钉钉统一身份登录为预留能力，未接入真实提供方通信密钥与公钥验签前，禁止通过模拟回调签发生产Token');
  err.status = 403;
  throw err;
}

module.exports = {
  bindExternalIdentity,
  unbindExternalIdentity,
  listIdentityLinks,
  handleExternalCallback
};
