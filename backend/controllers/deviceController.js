/**
 * backend/controllers/deviceController.js
 *
 * 任务 18A / 18B: 公共设备终端控制器
 */
const deviceSessionService = require('../services/deviceSessionService');

async function handleRegisterDevice(req, res) {
  try {
    const actor = req.user || { id: 1, role: 'manager', schoolId: 1 };
    const { deviceCode, deviceSecret, locationName, schoolId } = req.body;

    const data = await deviceSessionService.registerDevice({
      actor,
      schoolId: Number(schoolId || actor.schoolId || 1),
      deviceCode,
      deviceSecret,
      locationName
    });

    return res.json({ code: 200, message: '设备注册成功', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

async function handleIssueSession(req, res) {
  try {
    const { deviceCode, deviceSecret, studentId, studentCardNumber } = req.body;

    const data = await deviceSessionService.issueDeviceSession({
      deviceCode,
      deviceSecret,
      studentId: studentId ? Number(studentId) : null,
      studentCardNumber
    });

    return res.json({ code: 200, message: '学生身份认证通过，受限会话已签发', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

async function handleRevokeSession(req, res) {
  try {
    const { sessionToken } = req.body;
    const data = await deviceSessionService.revokeDeviceSession({ sessionToken });
    return res.json({ code: 200, message: '设备会话已注销清屏', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

async function handleKioskRedeem(req, res) {
  try {
    const { sessionToken, cardToken, requestKey } = req.body;
    if (!sessionToken || !cardToken) {
      return res.status(400).json({ code: 400, message: '会话凭证与卡片Token不可为空' });
    }

    const data = await deviceSessionService.redeemKioskCard({
      sessionToken,
      cardToken,
      requestKey
    });

    return res.json({ code: 200, message: '即时兑换入账成功', data });
  } catch (err) {
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({ code: status, message: err.message });
  }
}

async function handleClearKioskSession(req, res) {
  try {
    const { sessionToken } = req.body;
    const data = await deviceSessionService.clearKioskSession({ sessionToken });
    return res.json({ code: 200, message: '终端会话已清理清屏', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

module.exports = {
  handleRegisterDevice,
  handleIssueSession,
  handleRevokeSession,
  handleKioskRedeem,
  handleClearKioskSession
};

