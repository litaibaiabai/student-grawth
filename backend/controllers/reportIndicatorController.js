/**
 * reportIndicatorController.js — 年级指标与教师评价控制器
 */
const { pool } = require('../db');
const { success, fail } = require('../utils/response');
const {
  configureGradeIndicators: configureService,
  saveStudentIndicatorValues: saveValuesService,
  getGradeIndicators: getIndicatorsService,
  getStudentIndicatorValues: getValuesService,
  getGradeIndicatorProgress: getProgressService
} = require('../services/reportIndicatorService');

/**
 * POST /api/v1/admin/grade-indicators/configure
 * 管理员配置年级指标字典
 */
async function configureGradeIndicators(req, res, next) {
  try {
    const schoolId = req.user?.schoolId || 1;
    const { grade, termId, indicators } = req.body;
    if (!grade || !indicators || !Array.isArray(indicators)) {
      return fail(res, '缺少必要参数 (grade, indicators 数组)', 422);
    }

    const data = await configureService(
      { schoolId, termId: Number(termId) || 1, grade: Number(grade), indicators },
      req.conn
    );
    success(res, data, '年级指标配置成功');
  } catch (err) {
    if (next) next(err);
    else res.status(err.statusCode || 500).json({ code: err.statusCode || 500, message: err.message });
  }
}

/**
 * POST /api/v1/teacher/students/:studentId/indicator-values
 * 教师录入/更新学生指标评价值
 */
async function saveStudentIndicatorValues(req, res, next) {
  try {
    const studentId = req.params?.studentId || req.body?.studentId;
    const { termId, values } = req.body;
    if (!studentId || !values || !Array.isArray(values)) {
      return fail(res, '缺少必要参数 (studentId, values 数组)', 422);
    }

    const result = await saveValuesService(
      {
        actor: req.user,
        studentId: Number(studentId),
        termId: Number(termId) || 1,
        values
      },
      req.conn
    );

    success(res, result, '指标评价保存成功');
  } catch (err) {
    if (next) next(err);
    else res.status(err.statusCode || 500).json({ code: err.statusCode || 500, message: err.message });
  }
}

/**
 * GET /api/v1/grade-indicators
 * 获取指定年级适用指标列表
 */
async function getGradeIndicators(req, res, next) {
  try {
    const schoolId = req.user?.schoolId || 1;
    const grade = Number(req.query?.grade || 1);
    const termId = Number(req.query?.termId || 1);

    const data = await getIndicatorsService({ schoolId, termId, grade }, req.conn);
    success(res, data);
  } catch (err) {
    if (next) next(err);
    else res.status(err.statusCode || 500).json({ code: err.statusCode || 500, message: err.message });
  }
}

/**
 * GET /api/v1/students/:studentId/indicator-values
 * 查询学生指标评价值
 */
async function getStudentIndicatorValues(req, res, next) {
  try {
    const studentId = Number(req.params?.studentId || req.user?.id);
    const termId = Number(req.query?.termId || 1);

    const data = await getValuesService(
      { actor: req.user, studentId, termId },
      req.conn
    );
    success(res, data);
  } catch (err) {
    if (next) next(err);
    else res.status(err.statusCode || 500).json({ code: err.statusCode || 500, message: err.message });
  }
}

/**
 * GET /api/v1/admin/grade-indicators/progress
 * 管理员查看年级指标评定进度统计
 */
async function getGradeIndicatorProgress(req, res, next) {
  try {
    const schoolId = req.user?.schoolId || 1;
    const grade = Number(req.query?.grade || 1);
    const termId = Number(req.query?.termId || 1);

    const data = await getProgressService({ schoolId, grade, termId }, req.conn);
    success(res, data);
  } catch (err) {
    if (next) next(err);
    else res.status(err.statusCode || 500).json({ code: err.statusCode || 500, message: err.message });
  }
}

module.exports = {
  configureGradeIndicators,
  saveStudentIndicatorValues,
  getGradeIndicators,
  getStudentIndicatorValues,
  getGradeIndicatorProgress
};
