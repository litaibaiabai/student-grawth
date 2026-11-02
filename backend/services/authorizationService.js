const { fail, subjectFor } = require("./reportCorePolicy");
async function resolveActorContext(
  { userId, tokenVersion, schoolId },
  connection,
) {
  const [[u]] = await connection.query(
    "SELECT id,school_id,role,status,token_version FROM users WHERE id=?",
    [userId],
  );
  if (
    !u ||
    u.status !== 0 ||
    u.token_version !== tokenVersion ||
    (schoolId && String(u.school_id) !== String(schoolId))
  )
    fail(401, "账号或登录已失效");
  return {
    id: String(u.id),
    schoolId: String(u.school_id),
    role: u.role,
    tokenVersion: u.token_version,
  };
}
async function scopeAssignments(schoolId,termId,connection,teacherId) {
  const [rows]=await connection.query('SELECT a.*,u.real_name FROM teacher_teaching_assignment a LEFT JOIN users u ON u.school_id=a.school_id AND u.id=a.teacher_id WHERE a.school_id=? AND a.term_id=? AND a.enabled=1'+(teacherId?' AND a.teacher_id=?':''),[schoolId,termId,...(teacherId?[teacherId]:[])]);
  const term=await require('./reportCoreStore').getTerm(connection,schoolId,termId);
  if(term.evaluation_config.adminClassRegistryVersion!==1)return rows;
  const [classes]=await connection.query('SELECT c.*,u.real_name FROM school_class c JOIN users u ON u.school_id=c.school_id AND u.id=c.responsible_teacher_id WHERE c.school_id=? AND c.term_id=? AND u.status=0 AND u.role=\'teacher\''+(teacherId?' AND c.responsible_teacher_id=?':''),[schoolId,termId,...(teacherId?[teacherId]:[])]);
  for(const row of rows)row.is_head_teacher=0;
  for(const cls of classes)rows.push({school_id:cls.school_id,term_id:cls.term_id,teacher_id:cls.responsible_teacher_id,grade:cls.grade,class_no:cls.class_no,subject_code:'CLASS_HEAD',is_head_teacher:1,enabled:1,real_name:cls.real_name,virtual:true});
  return rows;
}
async function assignments(actor,termId,connection){return scopeAssignments(actor.schoolId,termId,connection,actor.id);}
async function assertScope(
  { actor, studentKey, action = "read", fields = [] },
  connection,
) {
  if (actor.schoolId !== String(studentKey.schoolId)) fail(403, "学校范围不符");
  const [[e]] = await connection.query(
    "SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?",
    [actor.schoolId, studentKey.termId, studentKey.studentId],
  );
  if (!e) fail(404, "学生学期记录不存在");
  if (actor.role === "student") {
    if (actor.id !== String(studentKey.studentId)) fail(403, "仅可操作本人");
    if (["report", "read", "form", "material"].includes(action))
      return { allowedFields: fields, evaluation: e, head: false };
    fail(403, "需要教师权限");
  }
  if (actor.role === "manager") {
    if (["report", "report-detail-read", "report-front-read", "confirm", "form", "material"].includes(action))
      fail(403, "管理员无权访问报告正文");
    return { allowedFields: fields, evaluation: e, head: false };
  }
  const all = await assignments(actor, studentKey.termId, connection);
  const rows = all.filter(
    (a) => a.grade === e.grade_snapshot && a.class_no === e.class_no_snapshot,
  );
  if (!rows.length) fail(403, "不在任教范围");
  const head = rows.some((a) => a.is_head_teacher === 1);
  const term=await require('./reportCoreStore').getTerm(connection,actor.schoolId,studentKey.termId);
  const v2=require('./reportCoreV2Policy').isV2(term.evaluation_config);
  if (["report", "report-front-read", "confirm"].includes(action) && !head)
    fail(403, "仅班主任可查看完整报告");
  const allowedFields = fields.filter(
    (f) =>
      (v2 && head && action==='import') || (head &&
        ["read", "report", "confirm", "material", "award",...(v2?["reverse"]:[])].includes(action)) ||
      (head &&
        action === "score" &&
        (["sports_specialties", "art_specialties"].includes(f) ||
          subjectFor(f) === "STORY")) ||
      (f === "art_specialties" &&
        rows.some((a) => ["MUSIC", "FINE_ART"].includes(a.subject_code))) ||
      (subjectFor(f) === "CONDUCT" && !(v2 && action==='import' && !head)) ||
      rows.some((a) => a.subject_code === subjectFor(f)),
  );
  if (allowedFields.length !== fields.length) fail(403, "不在学科字段范围");
  return { allowedFields, evaluation: e, head, assignments: rows };
}
function canManageCertificate(scope) {
  if(scope.head)return true;
  const subjects=new Set((scope.assignments||[]).map(a=>a.subject_code));
  return ['PE','MUSIC','FINE_ART'].some(s=>subjects.has(s)) || require('./reportCorePolicy').fixedFields.some(f=>f.sourceType==='CERTIFICATE'&&subjects.has(subjectFor(f.column)));
}
module.exports = { scopeAssignments, canManageCertificate, resolveActorContext, assertScope, assignments };

// Enhanced terms have one authoritative, active class owner. Legacy terms retain
// their existing assignment/confirmation rules.
async function responsibleTeachers(connection, term) {
  if (term.evaluation_config.adminClassRegistryVersion !== 1) return null;
  const [rows] = await connection.query("SELECT c.grade,c.class_no,c.responsible_teacher_id,u.id active_teacher_id FROM school_class c LEFT JOIN users u ON u.school_id=c.school_id AND u.id=c.responsible_teacher_id AND u.role='teacher' AND u.status=0 WHERE c.school_id=? AND c.term_id=?",[term.school_id,term.id]);
  return new Map(rows.map(c=>[`${c.grade}:${c.class_no}`,c.active_teacher_id ? String(c.active_teacher_id) : null]));
}
function responsibleReviewValid(heads, evaluation) {
  return heads === null || !!heads.get(`${evaluation.grade_snapshot}:${evaluation.class_no_snapshot}`) && heads.get(`${evaluation.grade_snapshot}:${evaluation.class_no_snapshot}`) === String(evaluation.confirmed_by);
}
module.exports.responsibleTeachers = responsibleTeachers;
module.exports.responsibleReviewValid = responsibleReviewValid;
