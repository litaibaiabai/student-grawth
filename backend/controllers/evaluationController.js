/**
 * evaluationController.js — 综合评分控制器
 */

const { pool } = require("../db");
const {requireStudentScope}=require("../middleware/studentScope");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");
const { computeStudentScore } = require("../services/evaluationEngine");

/**
 * GET /api/v1/student/comprehensive-score
 * 查阅综合素质折算得分（80/15/5）与封顶状态
 */
async function getComprehensiveScore(req, res, next) {
  let studentId = req.query.studentId;
  if (req.user?.role === "student" || !studentId) {
    studentId = req.user?.id || req.user?.userId;
  }

  const schoolId = req.user?.schoolId || 1;
  const termId = req.query.termId || 1;

  try {
    await requireStudentScope(req.user,studentId);
    const result = await computeStudentScore(studentId, termId, schoolId);
    success(res, {
      ...result,
      status: result.isComplete ? "COMPLETE" : "INCOMPLETE",
      missing_dimensions: result.missingDimensions,
      dimension_scores: result.dimensions,
      calculation: {
        comprehensive_score: result.comprehensiveScore,
        components: {
          B: { raw_value: result.sixAverage },
          P: { raw_value: result.process.netPoints, standard_score: result.process.scaledScore },
          H: { raw_value: result.honor.approvedPoints, standard_score: result.honor.scaledScore }
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/admin/evaluation-rules
 * 获取综合评价规则列表
 */
async function getRules(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;
    const [rows] = await conn.query(
      `SELECT r.*, u.real_name AS approved_by_name
       FROM comprehensive_score_rule r
       LEFT JOIN users u ON r.approved_by = u.id
       WHERE r.school_id = ?
       ORDER BY r.id DESC`,
      [schoolId]
    );

    const formatted = rows.map((r) => ({
      ...r,
      termId: r.term_id,
      ruleVersion: r.rule_version,
      ruleName: r.rule_version,
      sixWeight: r.six_weight,
      processWeight: r.process_weight,
      honorWeight: r.honor_weight,
      processTarget: r.process_target,
      honorTarget: r.honor_target,
      ruleStatus: r.rule_status
    }));

    success(res, formatted);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/admin/evaluation-rules
 * 创建或激活综合评价规则
 */
async function saveRule(req, res, next) {
  const {
    termId,
    term_id,
    ruleVersion,
    rule_version,
    rule_name,
    sixWeight,
    six_weight,
    weight_b,
    processWeight,
    process_weight,
    weight_p,
    honorWeight,
    honor_weight,
    weight_h,
    processTarget,
    process_target,
    process_target_cap,
    honorTarget,
    honor_target,
    honor_target_cap,
    ruleStatus = "ACTIVE"
  } = req.body;

  const b = Number(sixWeight ?? six_weight ?? (weight_b !== undefined ? Number(weight_b) / 100 : 0.8));
  const p = Number(processWeight ?? process_weight ?? (weight_p !== undefined ? Number(weight_p) / 100 : 0.15));
  const h = Number(honorWeight ?? honor_weight ?? (weight_h !== undefined ? Number(weight_h) / 100 : 0.05));
  const pt = Number(processTarget ?? process_target ?? process_target_cap ?? 20);
  const ht = Number(honorTarget ?? honor_target ?? honor_target_cap ?? 12);
  const version = ruleVersion || rule_version || rule_name || `V_${Date.now().toString().slice(-4)}`;

  const sumWeight = b + p + h;
  if (Math.abs(sumWeight - 1.0) > 0.005) {
    return fail(
      res,
      ErrorCodes.VALIDATION_ERROR,
      `六育、过程与荣誉权重之和必须严格等于 1.0000（当前为 ${sumWeight}）`,
      422
    );
  }

  const schoolId = req.user?.schoolId || 1;
  const adminId = req.user?.id || req.user?.userId;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    let targetTermId = termId || term_id;
    if (!targetTermId) {
      const [termRows] = await conn.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      targetTermId = termRows.length > 0 ? termRows[0].id : 1;
    }

    if (ruleStatus === "ACTIVE") {
      await conn.query(
        "UPDATE comprehensive_score_rule SET rule_status = 'SUPERSEDED' WHERE school_id = ? AND term_id = ?",
        [schoolId, targetTermId]
      );
    }

    const [insertRes] = await conn.query(
      `INSERT INTO comprehensive_score_rule (
        school_id, term_id, rule_version, six_weight, process_weight, honor_weight,
        process_target, honor_target, rule_status, approved_by, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        six_weight = VALUES(six_weight),
        process_weight = VALUES(process_weight),
        honor_weight = VALUES(honor_weight),
        process_target = VALUES(process_target),
        honor_target = VALUES(honor_target),
        rule_status = VALUES(rule_status),
        approved_by = VALUES(approved_by),
        approved_at = NOW()`,
      [schoolId, targetTermId, version, b, p, h, pt, ht, ruleStatus, adminId]
    );

    await conn.commit();
    success(res, { id: insertRes.insertId, ruleVersion: version, ruleStatus }, "综合评分规则配置成功");
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getComprehensiveScore,
  getRules,
  saveRule
};
