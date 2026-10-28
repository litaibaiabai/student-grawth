/**
 * reportDraftService.js — 合同 C6 报告草稿与教师确认服务
 *
 * 合同 C6:
 * buildDraft({ actor, studentKey, expectedSourceRevision, connection }) -> Draft
 * confirmDraft({ actor, draftId, expectedFingerprint, comment, connection }) -> Approval
 * getDraft({ actor, draftId, studentKey, connection }) -> Draft
 */
const crypto = require('crypto');
const { pool } = require('../db');
const evaluationSnapshotService = require('./evaluationSnapshotService');

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.statusCode = status;
  }
}

/**
 * 校验班主任权限 (管理员不能读草稿正文，普通任课老师不能读草稿正文)
 */
async function assertHeadmasterAuth({ actor, studentKey, conn }) {
  if (!actor) {
    throw new HttpError('未授权访问', 401);
  }

  // 管理员禁止读写草稿正文，保护学生与班主任隐私
  if (actor.role === 'admin' || actor.role === 'manager') {
    throw new HttpError('管理员无权查看或操作报告草稿正文', 403);
  }

  if (actor.role !== 'teacher') {
    throw new HttpError('仅限班主任访问', 403);
  }

  const schoolId = actor.schoolId || actor.school_id || studentKey.schoolId || 1;
  if (Number(schoolId) !== Number(studentKey.schoolId || schoolId)) throw new HttpError('禁止跨校访问学生草稿', 403);
  const [[student]] = await conn.query("SELECT id, school_id, username, real_name, grade, class_no FROM users WHERE id = ? AND school_id = ? AND role = 'student'", [studentKey.studentId, schoolId]);
  if (!student) throw new HttpError('学生不存在', 404);
  const termId = Number(studentKey.termId) || 1;
  const grade = student.grade;
  const classNo = student.class_no;
  const teacherId = actor.id;

  const [rows] = await conn.query(
    `SELECT id, is_head_teacher FROM teacher_teaching_assignment 
     WHERE school_id = ? AND term_id = ? AND teacher_id = ? AND grade = ? AND class_no = ? AND is_head_teacher = 1
     LIMIT 1`,
    [schoolId, termId, teacherId, grade, classNo]
  );

  if (rows.length === 0) {
    throw new HttpError('非所负责班级的班主任，无权操作此报告草稿', 403);
  }
  return student;
}

function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * 计算审批指纹
 */
function computeApprovalFingerprint({ schoolId, termId, studentId, sourceRevision, policyVersion, draftSnapshot, teacherComment }) {
  const content = canonicalStringify({
    schoolId,
    termId,
    studentId,
    sourceRevision,
    policyVersion: policyVersion || 'DEFAULT',
    draftSnapshot,
    teacherComment: teacherComment || ''
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 构建或刷新报告草稿
 */
async function buildDraft({ actor, studentKey, expectedSourceRevision, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const schoolId = studentKey.schoolId || 1;
    const termId = Number(studentKey.termId) || 1;
    const studentId = Number(studentKey.studentId);

    const student = await assertHeadmasterAuth({ actor, studentKey: {schoolId,termId,studentId}, conn });
    const grade = student.grade;
    const classNo = student.class_no;
    const key = { schoolId, termId, studentId, grade, classNo };

    // 1. 获取最新 source_revision
    const [stateRows] = await conn.query(
      "SELECT source_revision, profile_revision FROM student_term_state WHERE student_id = ? AND term_id = ? LIMIT 1",
      [studentId, termId]
    );
    const sourceRevision = stateRows[0]?.source_revision || 1;

    // 2. 获取六育评价快照 C5
    const evaluationSnapshot = await evaluationSnapshotService.buildEvaluationSnapshot({
      studentKey: key,
      connection: conn
    });

    // 3. 收集学科成绩
    const [subjects] = await conn.query(
      "SELECT subject_code, subject_name, raw_score, score FROM subject_score WHERE student_id = ? AND term_id = ?",
      [studentId, termId]
    );

    // 4. 收集荣誉事实
    const [honors] = await conn.query(
      "SELECT id, title, award_level, prize_level, award_points FROM honor_record WHERE student_id = ? AND term_id = ? AND status = 'APPROVED'",
      [studentId, termId]
    );

    // 5. 组装证据快照
    const draftSnapshot = {
      student: {id:student.id,name:student.real_name,username:student.username,grade,classNo},
      profileRevision: stateRows[0]?.profile_revision || 1,
      evaluationSnapshot,
      subjects,
      honors,
      missingItems: evaluationSnapshot?.missingReasons || []
    };

    const policyVersion = evaluationSnapshot?.policyVersion || 'V1';

    // 检查是否已有草稿
    const [existing] = await conn.query(
      "SELECT * FROM student_report_draft WHERE school_id = ? AND term_id = ? AND student_id = ? LIMIT 1",
      [schoolId, termId, studentId]
    );

    // Freeze only feedback visible when this draft was built. Later feedback waits for a new draft.
    const [[family]] = await conn.query('SELECT id,comment_text,proxy_by_student FROM family_feedback_record WHERE school_id=? AND term_id=? AND student_id=? ORDER BY id DESC LIMIT 1',[schoolId,termId,studentId]);
    draftSnapshot.familyMessage = family?.comment_text ?? existing[0]?.parent_comment ?? null;
    draftSnapshot.familyRevision = family?.id ?? null;
    draftSnapshot.familySource = family && !family.proxy_by_student ? 'PARENT_DIRECT' : 'STUDENT_TRANSCRIBED';
    const teacherComment = existing[0]?.teacher_comment || null;
    const approvalFingerprint = computeApprovalFingerprint({
      schoolId,
      termId,
      studentId,
      sourceRevision,
      policyVersion,
      draftSnapshot,
      teacherComment
    });

    let draftId;
    if (existing.length > 0) {
      draftId = existing[0].id;
      await conn.query(`
        UPDATE student_report_draft
        SET source_revision = ?, policy_version = ?, approval_fingerprint = ?, draft_snapshot = ?, status = 'DRAFT'
        WHERE id = ?
      `, [sourceRevision, policyVersion, approvalFingerprint, JSON.stringify(draftSnapshot), draftId]);
    } else {
      const [insertResult] = await conn.query(`
        INSERT INTO student_report_draft
        (school_id, term_id, student_id, grade, class_no, status, source_revision, policy_version, approval_fingerprint, draft_snapshot, teacher_comment)
        VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)
      `, [
        schoolId, termId, studentId, grade, classNo, sourceRevision, policyVersion, approvalFingerprint, JSON.stringify(draftSnapshot), teacherComment
      ]);
      draftId = insertResult.insertId;
    }

    return {
      draftId,
      schoolId,
      termId,
      studentId,
      grade,
      classNo,
      status: 'DRAFT',
      sourceRevision,
      policyVersion,
      approvalFingerprint,
      draftSnapshot,
      teacherComment,
      isStale: false
    };

  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 确认报告草稿
 */
async function confirmDraft({ actor, draftId, expectedFingerprint, comment, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const [draftRows] = await conn.query("SELECT * FROM student_report_draft WHERE id = ? LIMIT 1", [draftId]);
    if (draftRows.length === 0) {
      throw new HttpError('草稿不存在', 404);
    }
    const draft = draftRows[0];

    const studentKey = {
      schoolId: draft.school_id,
      termId: draft.term_id,
      studentId: draft.student_id,
      grade: draft.grade,
      classNo: draft.class_no
    };
    await assertHeadmasterAuth({ actor, studentKey, conn });

    // 检查最新来源版本，判断是否陈旧
    const [stateRows] = await conn.query(
      "SELECT source_revision, profile_revision FROM student_term_state WHERE student_id = ? AND term_id = ? LIMIT 1",
      [draft.student_id, draft.term_id]
    );
    const currentRev = stateRows[0]?.source_revision || 1;

    if (currentRev !== draft.source_revision || draft.approval_fingerprint !== expectedFingerprint) {
      throw new HttpError('报告草稿来源或版本已发生变动，请先刷新草稿确认', 409);
    }

    // 记录寄语修订
    const commentVersion = draft.comment_version + 1;
    await conn.query(`
      INSERT INTO report_comment_revision (draft_id, revision_no, author_id, author_role, comment_text)
      VALUES (?, ?, ?, 'TEACHER', ?)
    `, [draftId, commentVersion, actor.id, comment]);

    // 计算确认后的指纹
    const newFingerprint = computeApprovalFingerprint({
      schoolId: draft.school_id,
      termId: draft.term_id,
      studentId: draft.student_id,
      sourceRevision: draft.source_revision,
      policyVersion: draft.policy_version,
      draftSnapshot: typeof draft.draft_snapshot === 'string' ? JSON.parse(draft.draft_snapshot) : draft.draft_snapshot,
      teacherComment: comment
    });

    await conn.query(`
      UPDATE student_report_draft
      SET status = 'CONFIRMED', teacher_comment = ?, comment_version = ?, approval_fingerprint = ?, confirmed_by = ?, confirmed_at = NOW()
      WHERE id = ?
    `, [comment, commentVersion, newFingerprint, actor.id, draftId]);

    return {
      draftId,
      status: 'CONFIRMED',
      teacherComment: comment,
      commentVersion,
      approvalFingerprint: newFingerprint,
      confirmedBy: actor.id
    };

  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 获取草稿详情并做失效判定
 */
async function getDraft({ actor, draftId, studentKey, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    let draft;
    if (draftId) {
      const [rows] = await conn.query("SELECT * FROM student_report_draft WHERE id = ? LIMIT 1", [draftId]);
      if (rows.length === 0) throw new HttpError('草稿不存在', 404);
      draft = rows[0];
    } else {
      const schoolId = studentKey.schoolId || 1;
      const termId = Number(studentKey.termId) || 1;
      const studentId = Number(studentKey.studentId);
      const [rows] = await conn.query(
        "SELECT * FROM student_report_draft WHERE school_id = ? AND term_id = ? AND student_id = ? LIMIT 1",
        [schoolId, termId, studentId]
      );
      if (rows.length === 0) throw new HttpError('草稿不存在', 404);
      draft = rows[0];
    }

    const key = {
      schoolId: draft.school_id,
      termId: draft.term_id,
      studentId: draft.student_id,
      grade: draft.grade,
      classNo: draft.class_no
    };
    await assertHeadmasterAuth({ actor, studentKey: key, conn });

    // 检查来源变更
    const [stateRows] = await conn.query(
      "SELECT source_revision, profile_revision FROM student_term_state WHERE student_id = ? AND term_id = ? LIMIT 1",
      [draft.student_id, draft.term_id]
    );
    const latestRevision = stateRows[0]?.source_revision || 1;

    let isStale = false;
    let status = draft.status;

    if (latestRevision > draft.source_revision) {
      isStale = true;
      if (status === 'CONFIRMED') {
        status = 'PENDING_CONFIRMATION';
      }
    }

    return {
      draftId: draft.id,
      schoolId: draft.school_id,
      termId: draft.term_id,
      studentId: draft.student_id,
      grade: draft.grade,
      classNo: draft.class_no,
      status,
      sourceRevision: draft.source_revision,
      latestRevision,
      isStale,
      policyVersion: draft.policy_version,
      approvalFingerprint: draft.approval_fingerprint,
      draftSnapshot: typeof draft.draft_snapshot === 'string' ? JSON.parse(draft.draft_snapshot) : draft.draft_snapshot,
      teacherComment: draft.teacher_comment,
      commentVersion: draft.comment_version,
      confirmedBy: draft.confirmed_by,
      confirmedAt: draft.confirmed_at
    };

  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  buildDraft,
  confirmDraft,
  getDraft,
  computeApprovalFingerprint
};
