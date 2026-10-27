/**
 * backend/services/deviceSessionService.js
 *
 * 任务 18A: 公共设备身份与受限短会话服务 (C10 issueDeviceSession)
 *
 * 职责：
 * 1. 受控设备注册与白名单：仅校级管理员可登记合法设备，设备绑定学校
 * 2. 身份凭证核验：终端核验学生身份凭证有效性
 * 3. 最小能力会话签发 (C10): 签发极短生命周期 (默认 120 秒) 的受限会话，scope 仅限 'CARD_REDEEM'
 * 4. 越权阻断：受限会话严禁访问任何个人成绩、健康、报告或修改个人资料
 * 5. 生命周期管理：会话超时自动失效，切人或完成时支持主动撤销
 */
const crypto = require('crypto');
const db = require('../db');

async function registerDevice({ actor, schoolId = 1, deviceCode, deviceSecret, locationName, connection = null }) {
  const conn = connection || db;

  if (actor.role !== 'manager' && actor.role !== 'admin') {
    const err = new Error('仅校级管理员可注册公共终端设备');
    err.status = 403;
    throw err;
  }

  if (!deviceCode || !deviceSecret) {
    const err = new Error('设备编码与密钥不可为空');
    err.status = 400;
    throw err;
  }

  await conn.query(`
    INSERT INTO kiosk_device (device_code, device_secret, school_id, location_name, status)
    VALUES (?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE device_secret = VALUES(device_secret), location_name = VALUES(location_name), status = 1
  `, [deviceCode, deviceSecret, schoolId, locationName || '公共区域终端']);

  return {
    deviceCode,
    schoolId,
    locationName
  };
}

async function issueDeviceSession({ deviceCode, deviceSecret, studentId, studentCardNumber, connection = null }) {
  const conn = connection || db;

  // 1. 验证设备凭证
  const [devices] = await conn.query(
    "SELECT device_code, device_secret, school_id, status FROM kiosk_device WHERE device_code = ?",
    [deviceCode]
  );

  if (!devices || devices.length === 0 || devices[0].device_secret !== deviceSecret || devices[0].status !== 1) {
    const err = new Error('公共终端设备未授权或凭证错误');
    err.status = 401;
    throw err;
  }
  const device = devices[0];

  // 2. 验证学生凭证
  let querySql = "SELECT id, username, real_name, grade, class_no, role, status FROM users WHERE school_id = ? AND role = 'student'";
  const queryParams = [device.school_id];

  if (studentId) {
    querySql += " AND id = ?";
    queryParams.push(studentId);
  } else if (studentCardNumber) {
    querySql += " AND username = ?";
    queryParams.push(studentCardNumber);
  } else {
    const err = new Error('缺少学生身份凭证');
    err.status = 400;
    throw err;
  }

  const [students] = await conn.query(querySql, queryParams);
  if (!students || students.length === 0 || students[0].status !== 0) {
    const err = new Error('学生身份凭证无效或不在本校就读');
    err.status = 404;
    throw err;
  }
  const student = students[0];

  // 3. 签发受限短会话 (120 秒过期)
  const sessionToken = 'KIOSK_SES_' + crypto.randomBytes(16).toString('hex');
  const durationSec = 120;
  const expiresAt = new Date(Date.now() + durationSec * 1000);

  await conn.query(`
    INSERT INTO kiosk_session (session_token, device_code, school_id, student_id, scope, expires_at)
    VALUES (?, ?, ?, ?, 'CARD_REDEEM', ?)
  `, [sessionToken, deviceCode, device.school_id, student.id, expiresAt]);

  return {
    sessionToken,
    student: {
      id: student.id,
      name: student.real_name,
      studentNo: student.username,
      grade: student.grade,
      classNo: student.class_no
    },
    scope: 'CARD_REDEEM',
    expiresAt,
    expiresInSeconds: durationSec
  };
}

async function validateDeviceSession({ sessionToken, connection = null }) {
  const conn = connection || db;

  if (!sessionToken) {
    const err = new Error('缺少设备会话凭证');
    err.status = 401;
    throw err;
  }

  const [rows] = await conn.query(
    "SELECT id, session_token, device_code, school_id, student_id, scope, expires_at, revoked_at FROM kiosk_session WHERE session_token = ?",
    [sessionToken]
  );

  if (!rows || rows.length === 0) {
    const err = new Error('无效的设备会话凭证');
    err.status = 401;
    throw err;
  }

  const session = rows[0];

  if (session.revoked_at !== null) {
    const err = new Error('该设备会话已被注销');
    err.status = 401;
    throw err;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    const err = new Error('设备会话已超时过期');
    err.status = 401;
    throw err;
  }

  return session;
}

async function revokeDeviceSession({ sessionToken, connection = null }) {
  const conn = connection || db;

  if (!sessionToken) {
    return { success: true };
  }

  await conn.query(
    "UPDATE kiosk_session SET revoked_at = NOW() WHERE session_token = ? AND revoked_at IS NULL",
    [sessionToken]
  );

  return { success: true, sessionToken };
}

async function redeemKioskCard({ sessionToken, cardToken, requestKey, connection = null }) {
  const conn = connection || db;
  const session = await validateDeviceSession({ sessionToken, connection: conn });

  if (session.scope !== 'CARD_REDEEM') {
    const err = new Error('此会话无扫码兑换权限');
    err.status = 403;
    throw err;
  }

  const cardRedemptionService = require('./cardRedemptionService');
  const result = await cardRedemptionService.redeemCardInstant({
    schoolId: session.school_id,
    studentId: session.student_id,
    token: cardToken,
    requestKey
  }, conn);

  return {
    success: true,
    claimId: result.claimId,
    pointsCredited: result.pointsCredited,
    dimensionCode: result.dimensionCode || 'D',
    categoryName: result.categoryName,
    replayed: !!result.replayed
  };
}

async function clearKioskSession({ sessionToken, connection = null }) {
  return await revokeDeviceSession({ sessionToken, connection });
}

module.exports = {
  registerDevice,
  issueDeviceSession,
  validateDeviceSession,
  revokeDeviceSession,
  redeemKioskCard,
  clearKioskSession
};

