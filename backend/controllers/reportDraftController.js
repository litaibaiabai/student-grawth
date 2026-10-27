/**
 * reportDraftController.js — 报告草稿与教师确认控制器
 */
const reportDraftService = require('../services/reportDraftService');
const { success, fail } = require('../utils/response');

/**
 * POST /api/v1/teacher/reports/draft
 * 构建或刷新报告草稿
 */
async function buildDraft(req, res, next) {
  try {
    const actor = {
      id: req.user?.id || req.user?.userId,
      role: req.user?.role
    };

    const { studentId, termId, schoolId, grade, classNo, expectedSourceRevision } = req.body;
    if (!studentId) {
      return fail(res, 'VALIDATION_ERROR', '学生ID不能为空', 422);
    }

    const draft = await reportDraftService.buildDraft({
      actor,
      studentKey: {
        schoolId: schoolId || req.user?.schoolId || 1,
        termId: termId || 1,
        studentId: Number(studentId),
        grade,
        classNo
      },
      expectedSourceRevision
    });

    return success(res, draft, '报告草稿生成成功');
  } catch (err) {
    if (err.status) {
      return fail(res, 'REPORT_DRAFT_ERROR', err.message, err.status);
    }
    next(err);
  }
}

/**
 * GET /api/v1/teacher/reports/draft/:draftId
 * 获取报告草稿详情
 */
async function getDraft(req, res, next) {
  try {
    const actor = {
      id: req.user?.id || req.user?.userId,
      role: req.user?.role
    };
    const { draftId } = req.params;

    const draft = await reportDraftService.getDraft({
      actor,
      draftId: Number(draftId)
    });

    return success(res, draft, '获取草稿成功');
  } catch (err) {
    if (err.status) {
      return fail(res, 'REPORT_DRAFT_ERROR', err.message, err.status);
    }
    next(err);
  }
}

/**
 * POST /api/v1/teacher/reports/confirm
 * 确认报告草稿与手写寄语
 */
async function confirmDraft(req, res, next) {
  try {
    const actor = {
      id: req.user?.id || req.user?.userId,
      role: req.user?.role
    };

    const { draftId, expectedFingerprint, comment } = req.body;
    if (!draftId || !expectedFingerprint) {
      return fail(res, 'VALIDATION_ERROR', '草稿ID和预期审批指纹不能为空', 422);
    }

    const result = await reportDraftService.confirmDraft({
      actor,
      draftId: Number(draftId),
      expectedFingerprint,
      comment: comment || ''
    });

    return success(res, result, '报告草稿确认成功');
  } catch (err) {
    if (err.status) {
      return fail(res, 'CONFIRM_ERROR', err.message, err.status);
    }
    next(err);
  }
}

/**
 * POST /api/v1/teacher/reports/draft/:draftId/ai-comment
 * 请求生成 AI 寄语建议
 */
async function requestAiComment(req, res, next) {
  try {
    const actor = {
      id: req.user?.id || req.user?.userId,
      role: req.user?.role
    };
    const { draftId } = req.params;
    const { expectedFingerprint } = req.body;

    const commentGenerationService = require('../services/commentGenerationService');
    const job = await commentGenerationService.requestComment({
      actor,
      draftId: Number(draftId),
      expectedFingerprint
    });

    const result = await commentGenerationService.processCommentJob({
      jobId: job.jobId
    });

    return success(res, result, 'AI 寄语生成成功');
  } catch (err) {
    if (err.status) {
      return fail(res, 'AI_COMMENT_ERROR', err.message, err.status);
    }
    next(err);
  }
}

/**
 * POST /api/v1/teacher/reports/draft/:draftId/ai-comment/apply
 * 采纳或保存 AI 寄语建议（带 CAS 防覆盖）
 */
async function applyAiComment(req, res, next) {
  try {
    const actor = {
      id: req.user?.id || req.user?.userId,
      role: req.user?.role
    };
    const { draftId } = req.params;
    const { jobId, expectedFingerprint, result } = req.body;

    const commentGenerationService = require('../services/commentGenerationService');
    const applyResult = await commentGenerationService.applyCommentResult({
      actor,
      jobId,
      draftId: Number(draftId),
      expectedFingerprint,
      result
    });

    return success(res, applyResult, '建议应用成功');
  } catch (err) {
    if (err.status) {
      return fail(res, 'APPLY_ERROR', err.message, err.status);
    }
    next(err);
  }
}

module.exports = {
  buildDraft,
  getDraft,
  confirmDraft,
  requestAiComment,
  applyAiComment
};
