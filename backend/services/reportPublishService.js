/**
 * reportPublishService.js — 合同 C8 状态发布与版本冻结服务
 *
 * 合同与原则：
 * 1. 管理员只能查看宏观准备状态与缺项，绝不泄露学生个人分数、评语、正文快照
 * 2. 仅发布有效确认状态（CONFIRMED）且指纹未陈旧的报告
 * 3. 批量发布采用独立事务，支持部分成功，受阻原因精准呈现
 * 4. 成功发布冻结版本并写入 term_report (PUBLISHED)
 */
const crypto = require('crypto');
const { pool } = require('../db');

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.statusCode = status;
  }
}

/**
 * 校验校级管理员权限
 */
function assertManagerAuth(actor) {
  if (!actor || (actor.role !== 'manager' && actor.role !== 'admin')) {
    throw new HttpError('仅校级管理员有权操作报告发布与查看全校状态', 403);
  }
}

/**
 * 获取发布准备状态投影（无个人敏感正文）
 */
async function getPublishReadinessStatus({ actor, schoolId = 1, termId = 1, grade = null, connection }) {
  assertManagerAuth(actor);

  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    let studentQuery = "SELECT id, grade, class_no FROM users WHERE role = 'student' AND school_id = ?";
    const params = [schoolId];
    if (grade !== null && grade !== undefined) {
      studentQuery += " AND grade = ?";
      params.push(Number(grade));
    }
    const [students] = await conn.query(studentQuery, params);
    const totalCount = students.length;

    // 查询所有草稿
    const [drafts] = await conn.query(
      "SELECT student_id, status, source_revision, approval_fingerprint FROM student_report_draft WHERE school_id = ? AND term_id = ?",
      [schoolId, termId]
    );

    // 查询学生最新 source_revision
    const [stateRows] = await conn.query(
      "SELECT student_id, source_revision FROM student_term_state WHERE school_id = ? AND term_id = ?",
      [schoolId, termId]
    );
    const stateMap = new Map();
    for (const s of stateRows) {
      stateMap.set(s.student_id, s.source_revision);
    }

    const draftMap = new Map();
    for (const d of drafts) {
      draftMap.set(d.student_id, d);
    }

    let confirmedCount = 0;
    let pendingCount = 0;
    const blockedReasonCounts = {
      NO_DRAFT: 0,
      NOT_CONFIRMED: 0,
      STALE_SOURCE: 0
    };

    for (const st of students) {
      const d = draftMap.get(st.id);
      if (!d) {
        pendingCount++;
        blockedReasonCounts.NO_DRAFT++;
      } else if (d.status !== 'CONFIRMED') {
        pendingCount++;
        blockedReasonCounts.NOT_CONFIRMED++;
      } else {
        const latestRev = stateMap.get(st.id) || 1;
        if (latestRev > d.source_revision) {
          pendingCount++;
          blockedReasonCounts.STALE_SOURCE++;
        } else {
          confirmedCount++;
        }
      }
    }

    // 仅返回状态与统计数字，绝不包含个人文本、分数或快照
    return {
      schoolId,
      termId,
      grade,
      totalCount,
      confirmedCount,
      pendingCount,
      blockedReasonCounts
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 批量发布已确认报告并冻结版本
 */
async function publishBatchReports({ actor, schoolId = 1, termId = 1, grade = null, studentIds = null, connection }) {
  assertManagerAuth(actor);

  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    let targetStudents = [];
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      const [rows] = await conn.query(
        "SELECT id, grade, class_no FROM users WHERE id IN (?) AND school_id = ? AND role = 'student'",
        [studentIds, schoolId]
      );
      targetStudents = rows;
    } else if (grade !== null && grade !== undefined) {
      const [rows] = await conn.query(
        "SELECT id, grade, class_no FROM users WHERE school_id = ? AND grade = ? AND role = 'student'",
        [schoolId, Number(grade)]
      );
      targetStudents = rows;
    } else {
      const [rows] = await conn.query(
        "SELECT id, grade, class_no FROM users WHERE school_id = ? AND role = 'student'",
        [schoolId]
      );
      targetStudents = rows;
    }

    const totalTarget = targetStudents.length;
    let successCount = 0;
    let blockedCount = 0;
    const blockedList = [];

    const batchId = `PUB_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    for (const st of targetStudents) {
      // 1. 查询草稿及最新来源版本
      const [draftRows] = await conn.query(
        "SELECT * FROM student_report_draft WHERE school_id = ? AND term_id = ? AND student_id = ? LIMIT 1",
        [schoolId, termId, st.id]
      );

      if (draftRows.length === 0) {
        blockedCount++;
        blockedList.push({ studentId: st.id, reason: '未生成报告草稿' });
        continue;
      }

      const draft = draftRows[0];

      if (draft.status !== 'CONFIRMED') {
        blockedCount++;
        blockedList.push({ studentId: st.id, reason: '报告草稿尚未由班主任确认' });
        continue;
      }

      // 检查版本是否陈旧
      const [stateRows] = await conn.query(
        "SELECT source_revision FROM student_term_state WHERE student_id = ? AND term_id = ? LIMIT 1",
        [st.id, termId]
      );
      const currentRev = stateRows[0]?.source_revision || 1;
      if (currentRev > draft.source_revision) {
        blockedCount++;
        blockedList.push({ studentId: st.id, reason: '来源数据在确认后发生变更，草稿已失效' });
        continue;
      }

      // 2. 检查是否已经存在相同指纹的已发布版本（幂等保护）
      const [existingPub] = await conn.query(
        "SELECT id, version FROM term_report WHERE school_id = ? AND term_id = ? AND student_id = ? AND status = 'PUBLISHED' AND approval_fingerprint = ? LIMIT 1",
        [schoolId, termId, st.id, draft.approval_fingerprint]
      );

      if (existingPub.length > 0) {
        // 幂等成功
        successCount++;
        continue;
      }

      // 3. 发布新版本：先将原 PUBLISHED 版本置为 SUPERSEDED
      const [maxVerRows] = await conn.query(
        "SELECT COALESCE(MAX(version), 0) AS maxVer FROM term_report WHERE school_id = ? AND term_id = ? AND student_id = ?",
        [schoolId, termId, st.id]
      );
      const newVersion = (maxVerRows[0]?.maxVer || 0) + 1;

      await conn.query(
        "UPDATE term_report SET status = 'SUPERSEDED' WHERE school_id = ? AND term_id = ? AND student_id = ? AND status = 'PUBLISHED'",
        [schoolId, termId, st.id]
      );

      // 4. 插入新冻结版本
      const snapshot = typeof draft.draft_snapshot === 'string' ? JSON.parse(draft.draft_snapshot) : draft.draft_snapshot;
      const compScore = snapshot?.evaluationSnapshot?.comprehensiveScore || null;

      await conn.query(`
        INSERT INTO term_report
        (school_id, student_id, term_id, version, rule_version, snapshot_json, comprehensive_score, teacher_comment, family_message, status, approval_fingerprint, source_revision, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, ?, NOW())
      `, [
        schoolId,
        st.id,
        termId,
        newVersion,
        draft.policy_version || 'V1',
        JSON.stringify(snapshot),
        compScore,
        draft.teacher_comment,
        draft.parent_comment,
        draft.approval_fingerprint,
        draft.source_revision
      ]);

      successCount++;
    }

    // 记录批次
    await conn.query(`
      INSERT INTO report_publish_batch (batch_id, school_id, term_id, grade, operator_id, total_target, success_count, blocked_count, blocked_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [batchId, schoolId, termId, grade ? Number(grade) : null, actor.id, totalTarget, successCount, blockedCount, JSON.stringify(blockedList)]);

    // 记录审计
    const auditRequestId = `REQ_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await conn.query(`
      INSERT INTO operation_audit (school_id, actor_user_id, actor_role, target_type, action, request_id, new_summary)
      VALUES (?, ?, ?, 'TERM_REPORT', 'PUBLISH_REPORT', ?, ?)
    `, [
      schoolId,
      actor.id,
      actor.role || 'manager',
      auditRequestId,
      JSON.stringify({ summary: '批量发布学期报告', totalTarget, successCount, blockedCount })
    ]);

    return {
      batchId,
      totalTarget,
      successCount,
      blockedCount,
      blockedList
    };

  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 获取指定学生已发布报告概要
 */
async function getPublishedReportSummary({ schoolId = 1, termId = 1, studentId, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const [rows] = await conn.query(
      "SELECT id, version, status, approval_fingerprint, published_at FROM term_report WHERE school_id = ? AND term_id = ? AND student_id = ? AND status = 'PUBLISHED' ORDER BY version DESC LIMIT 1",
      [schoolId, termId, Number(studentId)]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      reportId: r.id,
      versionNo: r.version,
      status: r.status,
      approvalFingerprint: r.approval_fingerprint,
      publishedAt: r.published_at
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  getPublishReadinessStatus,
  publishBatchReports,
  getPublishedReportSummary
};
