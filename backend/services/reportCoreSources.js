const { parse } = require("./reportCoreStore");
const { assertScope, assignments } = require("./authorizationService");
const { subjectFor, fail, fixedFields } = require("./reportCorePolicy");
function mayReadField(scope, field) {
  return (
    scope.head ||
    subjectFor(field) === "CONDUCT" ||
    scope.assignments?.some((a) => a.subject_code === subjectFor(field)) ||
    (field === "sports_specialties" &&
      scope.assignments?.some((a) => a.subject_code === "PE")) ||
    (field === "art_specialties" &&
      scope.assignments?.some((a) =>
        ["MUSIC", "FINE_ART"].includes(a.subject_code),
      ))
  );
}
async function listSources({
  pool,
  actor,
  termId,
  studentId,
  monthKey, sourceType, recordKind, sourceId, latest = false,
  offset = 0,
  limit = 100,
}) {
  offset = Math.max(0, Math.floor(Number(offset) || 0));
  limit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 100)));
  const params = [actor.schoolId, termId];
  let filter = " AND s.record_kind<>'AUDIT'";
  if (actor.role === "student") {
    filter += " AND s.student_id=?";
    params.push(actor.id);
  }
  if (actor.role === "teacher") {
    filter +=
      " AND ((s.student_id IS NULL AND (s.owner_teacher_id=? OR s.actor_id=?)) OR EXISTS (SELECT 1 FROM student_term_evaluation e JOIN teacher_teaching_assignment a ON a.school_id=e.school_id AND a.term_id=e.term_id AND a.grade=e.grade_snapshot AND a.class_no=e.class_no_snapshot WHERE e.school_id=s.school_id AND e.term_id=s.term_id AND e.student_id=s.student_id AND a.teacher_id=? AND a.enabled=1 AND (s.source_type<>'STORY' OR a.subject_code='STORY' OR a.is_head_teacher=1)))";
    params.push(actor.id, actor.id, actor.id);
  }
  if(sourceId){if(!/^[1-9]\d*$/.test(String(sourceId)))fail(422,'材料编号不合法');filter+=' AND s.id=?';params.push(sourceId);}
  if (studentId) {
    filter += " AND s.student_id=?";
    params.push(studentId);
  }
  if (monthKey) { if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))fail(422,'月份不合法');filter+=' AND s.month_key=?';params.push(monthKey); }
  if (sourceType) { if(!['CARD','IMPORT','CERTIFICATE','SELF','TEACHER','STORY'].includes(sourceType))fail(422,'来源类型不合法');filter+=' AND s.source_type=?';params.push(sourceType); }
  if (recordKind) { if(!['QUOTA','CARD','DIRECT','BATCH','ITEM','FORM','REVERSAL'].includes(recordKind))fail(422,'记录类型不合法');filter+=' AND s.record_kind=?';params.push(recordKind); }
  if(latest === true || latest === 'true')filter+=" AND NOT EXISTS(SELECT 1 FROM evaluation_source_record newer WHERE newer.school_id=s.school_id AND newer.term_id=s.term_id AND newer.student_id=s.student_id AND newer.source_type=s.source_type AND newer.record_kind=s.record_kind AND newer.month_key<=>s.month_key AND newer.version>s.version)";
  const [rows] = await pool.query(
    `SELECT s.*,b.status parent_status FROM evaluation_source_record s LEFT JOIN evaluation_source_record b ON b.school_id=s.school_id AND b.id=s.parent_id WHERE s.school_id=? AND s.term_id=? ${filter} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const out = [];
  for (const s of rows) {
    const summary = {
      id: s.id,
      student_id: s.student_id,
      source_type: s.source_type,
      record_kind: s.record_kind,
      status: s.status,
      target_key: s.target_key,
      parent_id: s.parent_id,
      month_key: s.month_key,
      version: s.version,
      revision: s.revision,
    };
    if (actor.role === "manager") {
      out.push(summary);
      continue;
    }
    let scope;
    if (s.student_id) {
      try {
        scope = await assertScope(
          {
            actor,
            studentKey: {
              schoolId: actor.schoolId,
              termId,
              studentId: s.student_id,
            },
            action: "read",
          },
          pool,
        );
      } catch {
        continue;
      }
    }
    const payload = parse(s.payload_json);
    delete payload.fileRef;
    delete payload.passwordHash;
    delete payload.rows;
    if (actor.role === "teacher" && scope) {
      if (s.target_key && !mayReadField(scope, s.target_key)) continue;
      for (const key of ["values", "previousValues", "outputs"])
        if (payload[key] && typeof payload[key] === "object")
          payload[key] = Object.fromEntries(
            Object.entries(payload[key]).filter(([field]) =>
              mayReadField(scope, field),
            ),
          );
      if (payload.specialtyChanges)
        payload.specialtyChanges = payload.specialtyChanges.filter((i) =>
          mayReadField(
            scope,
            i.collection === "sports"
              ? "sports_specialties"
              : "art_specialties",
          ),
        );
      for (const key of ["targetKeys", "approvedTargets", "candidateTargets"])
        if (Array.isArray(payload[key]))
          payload[key] = payload[key].filter(
            (field) => typeof field === "string" && mayReadField(scope, field),
          );
      if (payload.changedFields)
        payload.changedFields = payload.changedFields.filter((field) =>
          mayReadField(scope, field),
        );
    }
    const pending=['QUEUED','PROCESSING','SUBMITTED','FAILED'].includes(s.status);
    const isTeacher=actor.role==='teacher', own=actor.role==='student'&&String(s.student_id)===actor.id;
    const allowedTargets=isTeacher&&s.source_type==='CERTIFICATE'?[...fixedFields.filter(f=>f.sourceType==='CERTIFICATE').map(f=>f.column),'sports_specialties','art_specialties'].filter((key,i,a)=>a.indexOf(key)===i&&mayReadField(scope,key)):[];
    const storyTeacher=isTeacher&&['SUBMITTED','SCORED'].includes(s.parent_status)&&(scope?.head||scope?.assignments?.some(a=>a.subject_code==='STORY'));
    const canRecognize=s.source_type==='CERTIFICATE'?isTeacher&&allowedTargets.length>0&&pending:s.source_type==='STORY'&&storyTeacher&&['QUEUED','PROCESSING','SUBMITTED','FAILED','SCORED'].includes(s.status);
    out.push({ ...summary, payload, allowedTargets, canRecognize, canRetry:s.status==='FAILED'&&(s.source_type==='STORY'?storyTeacher:isTeacher&&allowedTargets.length>0), canReject:s.source_type==='CERTIFICATE'&&canRecognize, canRevoke:s.source_type==='CERTIFICATE'&&s.status!=='REVOKED'&&(own||isTeacher&&allowedTargets.length>0), canResubmit:own&&['REJECTED','FAILED','REVOKED'].includes(s.status) });
  }
  return {
    rows: out,
    nextOffset: rows.length === limit ? offset + limit : null,
  };
}
module.exports = { listSources, mayReadField };
