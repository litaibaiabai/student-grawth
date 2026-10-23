/**
 * evaluationEngine.js — 综合素质评分核算引擎
 * 实现 80/15/5 权重折算、满分目标线封顶与维度完整性强校验
 */

const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");

/**
 * 计算单个学生的综合素质得分
 * @param {number} studentId
 * @param {number} termId
 * @param {number} schoolId
 */
async function computeStudentScore(studentId, termId = 1, schoolId = 1) {
  // 1. 获取有效激活的综合评价规则
  const [ruleRows] = await pool.query(
    `SELECT * FROM comprehensive_score_rule
     WHERE school_id = ? AND term_id = ? AND rule_status = 'ACTIVE'
     LIMIT 1`,
    [schoolId, termId]
  );

  const rule = ruleRows.length > 0 ? ruleRows[0] : {
    six_weight: 0.8000,
    process_weight: 0.1500,
    honor_weight: 0.0500,
    process_target: 20,
    honor_target: 12
  };

  // 2. 获取六育百分制得分 (D, Z, T, M, L, G)
  const [dimRows] = await pool.query(
    `SELECT dimension_code, score_100 AS score FROM student_dimension_score
     WHERE student_id = ? AND term_id = ?`,
    [studentId, termId]
  );
  const dimMap = new Map();
  for (const r of dimRows) {
    dimMap.set(r.dimension_code, Number(r.score));
  }

  // 检查故事得分 (G) — 取生活故事正式审定分 (teacher_score)
  const [storyRows] = await pool.query(
    `SELECT teacher_score FROM story_submission
     WHERE student_id = ? AND term_id = ? AND status = 'REVIEWED'
     ORDER BY id DESC LIMIT 1`,
    [studentId, termId]
  );
  if (storyRows.length > 0 && storyRows[0].teacher_score !== null) {
    dimMap.set("G", Number(storyRows[0].teacher_score));
  }

  // 检查六育缺失维度 (D, Z, T, M, L, G)
  const requiredDims = ["D", "Z", "T", "M", "L", "G"];
  const missingDims = [];
  const dimDetails = {};

  for (const dim of requiredDims) {
    if (!dimMap.has(dim)) {
      missingDims.push(dim);
    } else {
      dimDetails[dim] = dimMap.get(dim);
    }
  }

  // 3. 计算过程净积分 SUM(delta)
  const [procRows] = await pool.query(
    `SELECT COALESCE(SUM(delta), 0) AS total_process
     FROM score_record
     WHERE student_id = ? AND term_id = ?`,
    [studentId, termId]
  );
  const netProcessPoints = Number(procRows[0].total_process || 0);
  const processTarget = Number(rule.process_target || 20);
  const processScaled = Math.min(100, Math.max(0, (netProcessPoints / processTarget) * 100));

  // 4. 计算荣誉积分 (APPROVED)
  const [honorRows] = await pool.query(
    `SELECT COALESCE(SUM(honor_points), 0) AS total_honor
     FROM honor_record
     WHERE student_id = ? AND term_id = ? AND status = 'APPROVED'`,
    [studentId, termId]
  );
  const approvedHonorPoints = Number(honorRows[0].total_honor || 0);
  const honorTarget = Number(rule.honor_target || 12);
  const honorScaled = Math.min(100, Math.max(0, (approvedHonorPoints / honorTarget) * 100));

  // 5. 六育平均分与综合总分
  let sixAverage = null;
  let comprehensiveScore = null;
  const isComplete = missingDims.length === 0;

  if (isComplete) {
    const sumSix = requiredDims.reduce((acc, dim) => acc + dimDetails[dim], 0);
    sixAverage = sumSix / 6.0;

    const wSix = Number(rule.six_weight);
    const wProc = Number(rule.process_weight);
    const wHonor = Number(rule.honor_weight);

    comprehensiveScore = Number((wSix * sixAverage + wProc * processScaled + wHonor * honorScaled).toFixed(2));
  }

  return {
    studentId,
    termId,
    isComplete,
    missingDimensions: missingDims,
    dimensions: dimDetails,
    sixAverage: sixAverage ? Number(sixAverage.toFixed(2)) : null,
    process: {
      netPoints: netProcessPoints,
      targetPoints: processTarget,
      scaledScore: Number(processScaled.toFixed(2))
    },
    honor: {
      approvedPoints: approvedHonorPoints,
      targetPoints: honorTarget,
      scaledScore: Number(honorScaled.toFixed(2))
    },
    weights: {
      six: Number(rule.six_weight),
      process: Number(rule.process_weight),
      honor: Number(rule.honor_weight)
    },
    comprehensiveScore
  };
}

module.exports = {
  computeStudentScore
};
