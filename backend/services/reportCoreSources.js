const { parse } = require("./reportCoreStore");
const { assertScope, assignments } = require("./authorizationService");
const { subjectFor } = require("./reportCorePolicy");
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
  if (studentId) {
    filter += " AND s.student_id=?";
    params.push(studentId);
  }
  const [rows] = await pool.query(
    `SELECT s.* FROM evaluation_source_record s WHERE s.school_id=? AND s.term_id=? ${filter} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
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
    out.push({ ...summary, payload });
  }
  return {
    rows: out,
    nextOffset: rows.length === limit ? offset + limit : null,
  };
}
module.exports = { listSources, mayReadField };
