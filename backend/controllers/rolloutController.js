/**
 * backend/controllers/rolloutController.js
 *
 * 任务 20C: 试点上线与历史对账控制器
 */
const rolloutService = require('../services/rolloutService');

async function handleGetStatus(req, res) {
  try {
    const actor = req.user;
    const { schoolId, termId } = req.query;
    const data = await rolloutService.verifyP1FullChain({
      schoolId: schoolId ? Number(schoolId) : (actor?.schoolId || 1),
      termId: termId ? Number(termId) : 1
    });
    return res.json({ code: 200, message: '获取全链路就绪状态成功', data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ code: status, message: err.message });
  }
}

async function handleReconciliation(req, res) {
  try {
    const actor = req.user;
    const { schoolId } = req.query;
    const data = await rolloutService.reconcileHistoricReports({
      schoolId: schoolId ? Number(schoolId) : (actor?.schoolId || 1)
    });
    return res.json({ code: 200, message: '历史报告对账完成', data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ code: status, message: err.message });
  }
}

async function handleGetChecklist(req, res) {
  try {
    const actor = req.user;
    const { schoolId } = req.query;
    const data = await rolloutService.getRolloutChecklist({
      schoolId: schoolId ? Number(schoolId) : (actor?.schoolId || 1)
    });
    return res.json({ code: 200, message: '获取上线放行检查单成功', data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ code: status, message: err.message });
  }
}

module.exports = {
  handleGetStatus,
  handleReconciliation,
  handleGetChecklist
};
