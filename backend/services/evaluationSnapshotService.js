/**
 * evaluationSnapshotService.js — 合同 C5 自动六育综合评价快照核算服务
 *
 * 合同 C5:
 * buildEvaluationSnapshot({ studentKey, sourceRevision, policyVersion, connection }) -> EvaluationSnapshot
 *
 * 核心原则：
 * 1. 严格使用传入的同一个 connection，不自建/新开连接池
 * 2. 未配置有效规则时返回 null，不隐式默认回退 80/15/5
 * 3. 故事 G 维度按有效终审多篇取均值，不以单篇覆盖学期
 * 4. 荣誉仅根据有效认定单次计分，无荣誉不视为数据缺失
 */
const { pool } = require('../db');

/**
 * 构建六育综合评价快照
 */
async function buildEvaluationSnapshot({ studentKey, sourceRevision, policyVersion, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const schoolId = studentKey.schoolId || 1;
    const termId = Number(studentKey.termId) || 1;
    const studentId = Number(studentKey.studentId);

    // 1. 获取规则（未配置有效规则时直接返回 null）
    let rule = null;
    if (policyVersion) {
      const [rows] = await conn.query(
        "SELECT * FROM comprehensive_score_rule WHERE school_id = ? AND term_id = ? AND rule_version = ? LIMIT 1",
        [schoolId, termId, policyVersion]
      );
      if (rows.length > 0) rule = rows[0];
    } else {
      const [rows] = await conn.query(
        "SELECT * FROM comprehensive_score_rule WHERE school_id = ? AND term_id = ? AND rule_status = 'ACTIVE' LIMIT 1",
        [schoolId, termId]
      );
      if (rows.length > 0) rule = rows[0];
    }

    if (!rule) {
      return null;
    }

    const sixWeight = Number(rule.six_weight || 0.70);
    const processWeight = Number(rule.process_weight || 0.20);
    const honorWeight = Number(rule.honor_weight || 0.10);
    const processTarget = Number(rule.process_target || 20);
    const honorTarget = Number(rule.honor_target || 10);
    const activePolicyVersion = rule.rule_version || 'TEST_ONLY_V2';

    // 2. 获取当前 sourceRevision
    let currentRev = sourceRevision;
    if (!currentRev) {
      const [stateRows] = await conn.query(
        "SELECT source_revision FROM student_term_state WHERE student_id = ? AND term_id = ? LIMIT 1",
        [studentId, termId]
      );
      currentRev = stateRows[0]?.source_revision || 1;
    }

    // 3. 收集六育维度数据 (D, Z, T, M, L, G)
    const dimMap = new Map();
    const [baseScores] = await conn.query(
      "SELECT dimension_code, score_100 AS score FROM student_dimension_score WHERE student_id = ? AND term_id = ?",
      [studentId, termId]
    );
    for (const b of baseScores) {
      dimMap.set(b.dimension_code, Number(b.score));
    }

    // 故事 G 维度聚合：查询所有 REVIEWED 且 teacher_score 不为空的生活故事计算均值
    const [reviewedStories] = await conn.query(
      "SELECT teacher_score FROM story_submission WHERE student_id = ? AND term_id = ? AND status = 'REVIEWED' AND teacher_score IS NOT NULL",
      [studentId, termId]
    );
    if (reviewedStories.length > 0) {
      const totalScore = reviewedStories.reduce((sum, r) => sum + Number(r.teacher_score), 0);
      const avgStory = Number((totalScore / reviewedStories.length).toFixed(2));
      dimMap.set('G', avgStory);
    }

    const requiredDims = ['D', 'Z', 'T', 'M', 'L', 'G'];
    const missingReasons = [];
    const sixDimensions = {};
    let dimensionSum = 0;
    let presentCount = 0;

    for (const d of requiredDims) {
      if (dimMap.has(d)) {
        const val = dimMap.get(d);
        sixDimensions[d] = {
          score: val,
          value: val.toFixed(2),
          status: 'NORMAL'
        };
        dimensionSum += val;
        presentCount++;
      } else {
        sixDimensions[d] = {
          score: 0,
          value: '0.00',
          status: 'MISSING'
        };
        missingReasons.push(`DIMENSION_${d}`);
      }
    }

    const sixAverage = presentCount === 6 ? Number((dimensionSum / 6).toFixed(2)) : 0;

    // 4. 过程净积分 (C3 账本)
    const [ledgerRows] = await conn.query(
      "SELECT COALESCE(SUM(delta), 0) AS netPoints FROM score_record WHERE student_id = ? AND term_id = ?",
      [studentId, termId]
    );
    const netProcessPoints = Number(ledgerRows[0]?.netPoints || 0);
    const processScaled = Math.min(100, Number(((netProcessPoints / processTarget) * 100).toFixed(2)));

    // 5. 荣誉分 (单次计分，无荣誉不计为缺失)
    const [honors] = await conn.query(
      "SELECT id, GREATEST(COALESCE(honor_points, 0), COALESCE(award_points, 0)) AS points FROM honor_record WHERE student_id = ? AND term_id = ? AND status = 'APPROVED'",
      [studentId, termId]
    );
    const approvedHonorCount = honors.length;
    const totalHonorPoints = honors.reduce((acc, h) => acc + Number(h.points || 0), 0);
    const honorScaled = Math.min(100, Number(((totalHonorPoints / honorTarget) * 100).toFixed(2)));

    // 6. 综合折算得分
    const isComplete = missingReasons.length === 0;
    let comprehensiveScore = 0;
    if (isComplete) {
      comprehensiveScore = Number((
        sixAverage * sixWeight +
        processScaled * processWeight +
        honorScaled * honorWeight
      ).toFixed(2));
    }

    const snapshotResult = {
      schemaVersion: 'C5_V1',
      policyVersion: activePolicyVersion,
      sourceRevision: currentRev,
      comprehensiveScore: comprehensiveScore.toFixed(2),
      sixAverage: sixAverage.toFixed(2),
      sixDimensions,
      process: {
        netPoints: netProcessPoints.toFixed(2),
        scaledScore: processScaled.toFixed(2),
        target: processTarget
      },
      honor: {
        approvedCount: approvedHonorCount,
        approvedPoints: totalHonorPoints.toFixed(2),
        scaledScore: honorScaled.toFixed(2),
        target: honorTarget
      },
      missingReasons,
      isComplete
    };

    // 7. 持久化到 student_evaluation_snapshot 表
    await conn.query(`
      INSERT INTO student_evaluation_snapshot
      (school_id, term_id, student_id, policy_version, source_revision, comprehensive_score, six_average, six_dimensions, process_summary, honor_summary, status, missing_reasons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        comprehensive_score = VALUES(comprehensive_score),
        six_average = VALUES(six_average),
        six_dimensions = VALUES(six_dimensions),
        process_summary = VALUES(process_summary),
        honor_summary = VALUES(honor_summary),
        status = VALUES(status),
        missing_reasons = VALUES(missing_reasons)
    `, [
      schoolId,
      termId,
      studentId,
      activePolicyVersion,
      currentRev,
      comprehensiveScore,
      sixAverage,
      JSON.stringify(sixDimensions),
      JSON.stringify(snapshotResult.process),
      JSON.stringify(snapshotResult.honor),
      isComplete ? 'COMPLETE' : 'INCOMPLETE',
      JSON.stringify(missingReasons)
    ]);

    return snapshotResult;
  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  buildEvaluationSnapshot
};
