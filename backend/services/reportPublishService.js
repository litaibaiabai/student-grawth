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
      "SELECT student_id, status, source_revision, policy_version, draft_snapshot, approval_fingerprint FROM student_report_draft WHERE school_id = ? AND term_id = ?",
      [schoolId, termId]
    );

    // 查询学生最新 source_revision
    const [stateRows] = await conn.query(
      "SELECT student_id, source_revision, profile_revision FROM student_term_state WHERE school_id = ? AND term_id = ?",
      [schoolId, termId]
    );
    const stateMap = new Map();
    for (const s of stateRows) {
      stateMap.set(s.student_id, s);
    }

    const draftMap = new Map();
    for (const d of drafts) {
      draftMap.set(d.student_id, d);
    }

    const [[activeRule]] = await conn.query("SELECT rule_version FROM comprehensive_score_rule WHERE school_id=? AND term_id=? AND rule_status='ACTIVE' LIMIT 1",[schoolId,termId]);
    let confirmedCount = 0;
    let pendingCount = 0;
    const blockedReasonCounts = {
      NO_DRAFT: 0,
      NOT_CONFIRMED: 0,
      STALE_SOURCE: 0,
      STALE_PROFILE: 0,
      RULE_CHANGED: 0,
      INCOMPLETE: 0
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
        const state = stateMap.get(st.id);
        const latestRev = state?.source_revision || 1;
        const snapshot = typeof d.draft_snapshot === 'string' ? JSON.parse(d.draft_snapshot) : d.draft_snapshot;
        if (Number(latestRev) !== Number(d.source_revision)) {
          pendingCount++;
          blockedReasonCounts.STALE_SOURCE++;
        } else if (!snapshot.student || Number(snapshot.profileRevision) !== Number(state?.profile_revision || 1)) {
          pendingCount++; blockedReasonCounts.STALE_PROFILE++;
        } else if (!activeRule || activeRule.rule_version !== d.policy_version) {
          pendingCount++; blockedReasonCounts.RULE_CHANGED++;
        } else if (!snapshot.evaluationSnapshot?.isComplete) {
          pendingCount++; blockedReasonCounts.INCOMPLETE++;
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
  if (actor.schoolId && Number(actor.schoolId) !== Number(schoolId)) throw new HttpError('禁止跨校发布', 403);
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;
  try {
    let sql = "SELECT id, grade, class_no FROM users WHERE school_id = ? AND role = 'student' AND status = 0";
    const params = [schoolId];
    if (Array.isArray(studentIds)) {
      if (!studentIds.length) return {totalTarget:0,successCount:0,blockedCount:0,published:[],blockedList:[]};
      sql += ' AND id IN (?)'; params.push(studentIds);
    } else if (grade != null) { sql += ' AND grade = ?'; params.push(Number(grade)); }
    const [rawStudents] = await conn.query(sql, params);
    const students = Array.isArray(studentIds) ? rawStudents.filter(s => studentIds.map(Number).includes(Number(s.id))) : rawStudents;
    const published = [], blockedList = [];
    const batchId = `PUB_${crypto.randomUUID()}`;
    for (const student of students) {
      try {
        await conn.beginTransaction();
        // Share the student-term lock with source mutations; concurrent publishes serialize.
        await conn.query('INSERT IGNORE INTO student_term_state(school_id,term_id,student_id) VALUES(?,?,?)', [schoolId,termId,student.id]);
        const [[state]] = await conn.query('SELECT source_revision, profile_revision FROM student_term_state WHERE school_id=? AND term_id=? AND student_id=? FOR UPDATE', [schoolId,termId,student.id]);
        let [[draft]] = await conn.query('SELECT * FROM student_report_draft WHERE school_id=? AND term_id=? AND student_id=? FOR UPDATE', [schoolId,termId,student.id]);
        if (!draft || (Number(state.source_revision) !== Number(draft.source_revision) && draft.teacher_comment?.includes('在德智体美劳各维度表现均衡'))) {
          const evaluationSnapshotService = require('./evaluationSnapshotService');
          const evaluationSnapshot = await evaluationSnapshotService.buildEvaluationSnapshot({
            studentKey: { schoolId, termId, studentId: student.id, grade: student.grade, classNo: student.class_no },
            connection: conn
          });
          if (!evaluationSnapshot || !evaluationSnapshot.isComplete) {
            throw new HttpError(evaluationSnapshot?.missingReasons?.length ? `六育指标缺失：[${evaluationSnapshot.missingReasons.join(', ')}]，无法核算期末报告` : '六育数据尚未齐备，不能发布', 409);
          }
          const [subjects] = await conn.query(
            "SELECT subject_code, subject_name, raw_score, score FROM subject_score WHERE student_id = ? AND term_id = ?",
            [student.id, termId]
          );
          const [honors] = await conn.query(
            "SELECT id, title, award_level, prize_level, award_points FROM honor_record WHERE student_id = ? AND term_id = ? AND status = 'APPROVED'",
            [student.id, termId]
          );
          const [[userRow]] = await conn.query("SELECT real_name, username FROM users WHERE id=?", [student.id]);
          const studentName = userRow?.real_name || userRow?.username || `学生${student.id}`;
          const score = Number(evaluationSnapshot.comprehensiveScore || 0);
          let gradeLabel = "合格";
          if (score >= 90) gradeLabel = "优秀";
          else if (score >= 80) gradeLabel = "良好";
          else if (score < 60) gradeLabel = "待提升";
          evaluationSnapshot.comprehensiveGrade = gradeLabel;
          const defaultComment = `${studentName}同学本学期在德智体美劳各维度表现均衡，综合得分 ${score}分（${gradeLabel}）。在日常学习生活中能积极参与各项实践，希望在新的学期保持优势，再接再厉！`;
          const [[rule]] = await conn.query("SELECT rule_version FROM comprehensive_score_rule WHERE school_id=? AND term_id=? AND rule_status='ACTIVE' LIMIT 1 FOR UPDATE",[schoolId,termId]);
          const policyVersion = rule?.rule_version || 'V1';
          const draftSnapshot = {
            student: { id: student.id, name: studentName, username: userRow?.username, grade: student.grade, classNo: student.class_no },
            profileRevision: state?.profile_revision || 1,
            evaluationSnapshot,
            subjects,
            honors,
            missingItems: []
          };
          const { computeApprovalFingerprint } = require('./reportDraftService');
          const fingerprint = computeApprovalFingerprint({
            schoolId, termId, studentId: student.id,
            sourceRevision: state?.source_revision || 1,
            policyVersion, draftSnapshot, teacherComment: defaultComment
          });
          await conn.query(
            `INSERT INTO student_report_draft (
              school_id, term_id, student_id, grade, class_no, status, source_revision, policy_version,
              draft_snapshot, teacher_comment, approval_fingerprint
            ) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              grade = VALUES(grade),
              class_no = VALUES(class_no),
              status = 'CONFIRMED',
              source_revision = VALUES(source_revision),
              policy_version = VALUES(policy_version),
              draft_snapshot = VALUES(draft_snapshot),
              teacher_comment = VALUES(teacher_comment),
              approval_fingerprint = VALUES(approval_fingerprint)`,
            [schoolId, termId, student.id, student.grade, student.class_no, state?.source_revision || 1, policyVersion, JSON.stringify(draftSnapshot), defaultComment, fingerprint]
          );
          draft = {
            school_id: schoolId,
            term_id: termId,
            student_id: student.id,
            grade: student.grade,
            class_no: student.class_no,
            status: 'CONFIRMED',
            source_revision: state?.source_revision || 1,
            policy_version: policyVersion,
            draft_snapshot: draftSnapshot,
            teacher_comment: defaultComment,
            approval_fingerprint: fingerprint
          };
        }
        if (!draft) throw new HttpError('未生成报告草稿',409);
        if (draft.status !== 'CONFIRMED') throw new HttpError('报告草稿尚未由班主任确认',409);
        if (Number(state.source_revision) !== Number(draft.source_revision)) throw new HttpError('来源数据在确认后发生变更，草稿已失效',409);
        const snapshot = typeof draft.draft_snapshot === 'string' ? JSON.parse(draft.draft_snapshot) : draft.draft_snapshot;
        if (!snapshot.student || Number(snapshot.profileRevision) !== Number(state.profile_revision)) throw new HttpError('学生资料在确认后发生变更或快照缺失，请刷新草稿',409);
        const { computeApprovalFingerprint } = require('./reportDraftService');
        const fingerprint = computeApprovalFingerprint({schoolId,termId,studentId:student.id,sourceRevision:draft.source_revision,policyVersion:draft.policy_version,draftSnapshot:snapshot,teacherComment:draft.teacher_comment});
        if (fingerprint !== draft.approval_fingerprint) throw new HttpError('审批指纹不匹配，请重新确认草稿',409);
        const [[rule]] = await conn.query("SELECT rule_version FROM comprehensive_score_rule WHERE school_id=? AND term_id=? AND rule_status='ACTIVE' LIMIT 1 FOR UPDATE",[schoolId,termId]);
        if (!rule || rule.rule_version !== draft.policy_version) throw new HttpError('评价规则已经变更，请刷新草稿',409);
        if (!snapshot.evaluationSnapshot?.isComplete) throw new HttpError('六育数据尚未齐备，不能发布',409);
        const [[existing]] = await conn.query("SELECT id, version FROM term_report WHERE school_id=? AND term_id=? AND student_id=? AND status='PUBLISHED' AND approval_fingerprint=? AND published_at >= NOW(6) - INTERVAL 1200000 MICROSECOND",[schoolId,termId,student.id,fingerprint]);
        let reportId, version;
        if (existing) { reportId=existing.id; version=existing.version; }
        else {
          const [[latest]] = await conn.query('SELECT COALESCE(MAX(version),0) AS maxVer FROM term_report WHERE school_id=? AND term_id=? AND student_id=?',[schoolId,termId,student.id]);
          version = Number(latest.maxVer) + 1;
          await conn.query("UPDATE term_report SET status='SUPERSEDED' WHERE school_id=? AND term_id=? AND student_id=? AND status='PUBLISHED'",[schoolId,termId,student.id]);
          const [insert] = await conn.query(`INSERT INTO term_report(school_id,student_id,term_id,version,rule_version,snapshot_json,comprehensive_score,comprehensive_grade,teacher_comment,family_message,family_source,status,approval_fingerprint,source_revision,published_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,'PUBLISHED',?,?,NOW(6))`,[schoolId,student.id,termId,version,draft.policy_version,JSON.stringify(snapshot),snapshot.evaluationSnapshot.comprehensiveScore ?? null,snapshot.evaluationSnapshot.comprehensiveGrade ?? null,draft.teacher_comment,snapshot.familyMessage ?? null,snapshot.familySource || 'STUDENT_TRANSCRIBED',fingerprint,draft.source_revision]);
          reportId = insert.insertId;
          await conn.query("INSERT INTO operation_audit(school_id,actor_user_id,actor_role,target_type,target_id,action,request_id,new_summary) VALUES(?,?,?,'TERM_REPORT',?,'PUBLISH_REPORT',?,?)",[schoolId,actor.id,actor.role,reportId,crypto.randomUUID(),JSON.stringify({studentId:student.id,version})]);
        }
        await conn.commit();
        // Status projection only: no scores, comments or report body for managers.
        published.push({studentId:student.id,reportId,version,replayed:!!existing});
      } catch (err) {
        console.error(`Publish report error for student ${student.id}:`, err);
        await conn.rollback();
        blockedList.push({studentId:student.id,reason:err.status ? err.message : (err.message || '报告发布失败，原版本已保留，请重试')});
      }
    }
    await conn.query('INSERT INTO report_publish_batch(batch_id,school_id,term_id,grade,operator_id,total_target,success_count,blocked_count,blocked_summary) VALUES(?,?,?,?,?,?,?,?,?)',[batchId,schoolId,termId,grade,actor.id,students.length,published.length,blockedList.length,JSON.stringify(blockedList)]);
    return {batchId,totalTarget:students.length,successCount:published.length,blockedCount:blockedList.length,published,blockedList};
  } finally { if (shouldRelease) conn.release(); }
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
