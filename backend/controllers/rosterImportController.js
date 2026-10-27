/**
 * backend/controllers/rosterImportController.js
 *
 * 任务 17: 学籍表导入控制器
 */
const rosterImportService = require('../services/rosterImportService');

async function handlePreviewRoster(req, res) {
  try {
    const actor = req.user || { id: 1, role: 'manager', schoolId: 1 };
    const schoolId = Number(req.body.schoolId || actor.schoolId || 1);
    const termId = Number(req.body.termId || 1);
    const rows = req.body.rows || [];

    const data = await rosterImportService.previewRosterImport({
      actor,
      schoolId,
      termId,
      rows
    });
    return res.json({ code: 200, message: '学籍表预览成功', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

async function handleCommitRoster(req, res) {
  try {
    const actor = req.user || { id: 1, role: 'manager', schoolId: 1 };
    const schoolId = Number(req.body.schoolId || actor.schoolId || 1);
    const termId = Number(req.body.termId || 1);
    const { previewKey, items } = req.body;

    const data = await rosterImportService.commitRosterImport({
      actor,
      schoolId,
      termId,
      previewKey,
      items
    });
    return res.json({ code: 200, message: '学籍表导入完成', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

module.exports = {
  handlePreviewRoster,
  handleCommitRoster
};
