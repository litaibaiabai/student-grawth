/**
 * backend/controllers/externalIdentityController.js
 *
 * 任务 19: 钉钉身份预留控制器
 */
const externalIdentityService = require('../services/externalIdentityService');

async function handleListLinks(req, res) {
  try {
    const actor = req.user;
    const { schoolId } = req.query;
    const data = await externalIdentityService.listIdentityLinks({
      actor,
      schoolId: schoolId ? Number(schoolId) : actor.schoolId
    });
    return res.json({ code: 200, message: '获取外部身份映射成功', data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ code: status, message: err.message });
  }
}

async function handleBindLink(req, res) {
  try {
    const actor = req.user;
    const { schoolId, userId, provider, tenantId, externalSubject, externalName } = req.body;

    const data = await externalIdentityService.bindExternalIdentity({
      actor,
      schoolId: schoolId ? Number(schoolId) : actor.schoolId,
      userId: Number(userId),
      provider,
      tenantId,
      externalSubject,
      externalName
    });

    return res.json({ code: 200, message: '外部身份关联成功', data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ code: status, message: err.message });
  }
}

async function handleUnbindLink(req, res) {
  try {
    const actor = req.user;
    const { schoolId, userId, provider, externalSubject } = req.body;

    const data = await externalIdentityService.unbindExternalIdentity({
      actor,
      schoolId: schoolId ? Number(schoolId) : actor.schoolId,
      userId: Number(userId),
      provider,
      externalSubject
    });

    return res.json({ code: 200, message: '外部身份关联已解除', data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ code: status, message: err.message });
  }
}

async function handleCallback(req, res) {
  try {
    const { provider, authCode } = req.body;
    const data = await externalIdentityService.handleExternalCallback({
      provider,
      authCode
    });
    return res.json({ code: 200, message: '回调成功', data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ code: status, message: err.message });
  }
}

module.exports = {
  handleListLinks,
  handleBindLink,
  handleUnbindLink,
  handleCallback
};
