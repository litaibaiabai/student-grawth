/**
 * familyFeedbackController.js — 家长寄语与反馈控制器
 */
const familyFeedbackService = require('../services/familyFeedbackService');
const { success, fail } = require('../utils/response');

/**
 * POST /api/v1/family/token
 * 签发家长访问凭证
 */
async function issueToken(req, res, next) {
  try {
    const { studentId, termId, schoolId, parentName, parentPhone } = req.body;
    if (!studentId) {
      return fail(res, 'VALIDATION_ERROR', '学生ID不能为空', 422);
    }

    const tokenInfo = await familyFeedbackService.issueFamilyToken({
      schoolId: schoolId || req.user?.schoolId || 1,
      termId: termId || 1,
      studentId: Number(studentId),
      parentName,
      parentPhone
    });

    return success(res, tokenInfo, '家长凭证签发成功');
  } catch (err) {
    if (err.status) {
      return fail(res, 'TOKEN_ERROR', err.message, err.status);
    }
    next(err);
  }
}

/**
 * POST /api/v1/family/comment
 * 家长凭 token 提交寄语
 */
async function submitComment(req, res, next) {
  try {
    const { token, studentId, schoolId, termId, commentText, proxyByStudent } = req.body;
    if (!token || !studentId || !commentText) {
      return fail(res, 'VALIDATION_ERROR', 'token、studentId 和寄语内容均不能为空', 422);
    }

    const result = await familyFeedbackService.submitFamilyComment({
      token,
      studentKey: {
        schoolId: schoolId || 1,
        termId: termId || 1,
        studentId: Number(studentId)
      },
      commentText,
      proxyByStudent: !!proxyByStudent
    });

    return success(res, result, '家长寄语提交成功');
  } catch (err) {
    if (err.status) {
      return fail(res, 'FEEDBACK_ERROR', err.message, err.status);
    }
    next(err);
  }
}

/**
 * GET /api/v1/family/feedbacks/:studentId
 * 获取学生家长反馈流
 */
async function getFeedbacks(req, res, next) {
  try {
    const { studentId } = req.params;
    const { schoolId, termId } = req.query;

    const list = await familyFeedbackService.getStudentFamilyFeedbacks({
      schoolId: schoolId || req.user?.schoolId || 1,
      termId: termId || 1,
      studentId: Number(studentId)
    });

    return success(res, list, '获取家长反馈成功');
  } catch (err) {
    if (err.status) {
      return fail(res, 'FEEDBACK_ERROR', err.message, err.status);
    }
    next(err);
  }
}

module.exports = {
  issueToken,
  submitComment,
  getFeedbacks
};
