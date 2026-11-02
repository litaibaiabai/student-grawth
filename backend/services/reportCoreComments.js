const { fail, stableHash, narratives } = require('./reportCorePolicy');
const { getTerm, parse, addSource, withMutation } = require('./reportCoreStore');
const { assertScope, assignments } = require('./authorizationService');
const { policyFor, isV2 } = require('./reportCoreV2Policy');
const { assertV2Phase } = require('./reportCoreV2Lifecycle');

const included = e => parse(e.section_meta).roster?.included !== false &&
  !['TRANSFERRED_OUT', 'NOT_APPLICABLE'].includes(parse(e.section_meta).enrollment?.status);
function teacherOnly(actor) {
  if (actor.role !== 'teacher') fail(403, '仅班主任可处理班主任寄语');
}
function validId(id) {
  if (!/^[1-9]\d*$/.test(String(id))) fail(422, '学生或学期编号不合法');
}
function canEdit(term) {
  return term.release_status === 'IDLE' && (!isV2(term.evaluation_config) || ['COLLECTING', 'RECONCILING'].includes(term.business_phase));
}
function assertEditable(term, actor) {
  if (term.release_status !== 'IDLE') fail(423, '全校发布期间寄语只读');
  assertV2Phase(term, { action: 'comment-save', actor });
}
function validateComment(comment) {
  if (typeof comment !== 'string' || !comment.trim() || [...comment.trim()].length > 1000)
    fail(422, '请填写1至1000字的班主任寄语');
  return comment.trim();
}
async function snapshot(connection, fn) {
  const c = await connection.getConnection();
  try {
    await c.beginTransaction();
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally { c.release(); }
}
async function scoped(c, { actor, termId, studentId }) {
  teacherOnly(actor);
  validId(termId); validId(studentId);
  const scope = await assertScope({ actor, studentKey: { schoolId: actor.schoolId, termId, studentId }, action: 'report-front-read' }, c);
  if (!scope.head) fail(403, '仅班主任可处理本班寄语');
  if (!included(scope.evaluation)) fail(404, '学生不在本学期有效名单');
  return scope.evaluation;
}
async function latest(c, { actor, termId, studentId }) {
  const [[row]] = await c.query("SELECT * FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? AND source_type='TEACHER' AND record_kind='FORM' AND target_key='teacher_comment' ORDER BY id DESC LIMIT 1", [actor.schoolId, termId, studentId]);
  return row || null;
}
function reportFields(term) {
  const fields = policyFor(term.evaluation_config).fields;
  return isV2(term.evaluation_config) ? [...fields,
    { column: 'process_summary', label: '本学期各项目过程表现（积分、星级、排名及是否已结算）', valueType: 'json' },
    { column: 'honor_summary', label: '本学期已认定荣誉与获奖详情', valueType: 'json' },
  ] : fields;
}
function reportModel(e, term) {
  const fields = reportFields(term);
  const values = Object.fromEntries([...new Set(fields.map(f => f.column))].map(key => {
    let value = e[key] ?? null;
    if (typeof value === 'string' && ['story_summary', 'process_summary', 'honor_summary', 'sports_specialties', 'art_specialties'].includes(key)) value = parse(value);
    return [key, value];
  }));
  return {
    schemaVersion: term.evaluation_config.schemaVersion || 'CORE_V1',
    student: { id: String(e.student_id), name: e.student_name_snapshot, grade: e.grade_snapshot, classNo: e.class_no_snapshot },
    term: { id: String(term.id), name: term.term_name, academicYear: term.academic_year, semester: term.semester },
    values,
    sportsSpecialties: parse(e.sports_specialties), artSpecialties: parse(e.art_specialties),
    narratives: Object.fromEntries(narratives.filter(key => key !== 'teacher_comment').map(key => [key, e[key] || ''])),
  };
}
function basis(e, term) {
  return stableHash({ report: reportModel(e, term), configVersion: term.config_version, ruleVersion: term.rule_version });
}
function view(e, term, row, full = false) {
  const payload = row ? parse(row.payload_json) : {};
  // Previously saved teacher comments remain approved and editable in this module.
  const comment = row?.status === 'DRAFT' ? payload.comment : (e.teacher_comment || payload.comment || '');
  const status = row?.status === 'DRAFT' ? 'DRAFT' : comment.trim() ? 'APPROVED' : 'EMPTY';
  return {
    student: { id: String(e.student_id), name: e.student_name_snapshot, grade: e.grade_snapshot, classNo: e.class_no_snapshot },
    commentId: row ? String(row.id) : null, comment, status,
    revision: String(e.revision), canEdit: canEdit(term),
    generatedAt: payload.generatedAt || null, updatedAt: row?.created_at || null,
    reportChanged: !!payload.basisHash && payload.basisHash !== basis(e, term),
    ...(full ? { report: reportModel(e, term) } : {}),
  };
}
function checkExpected(e, row, input) {
  if (String(e.revision) !== String(input.expectedRevision) ||
      (row ? String(row.id) : null) !== (input.expectedCommentId === null ? null : String(input.expectedCommentId)))
    fail(409, '报表或寄语已变化，请刷新后核对，当前输入可保留');
}
async function writeComment(c, args, e, term, previous, comment, status, extra = {}) {
  const old = previous ? parse(previous.payload_json) : {};
  const payload = {
    comment, generatedComment: old.generatedComment || null,
    generatedAt: old.generatedAt || null,
    basisHash: old.basisHash || basis(e, term), ...extra,
  };
  const id = await addSource(c, {
    schoolId: args.actor.schoolId, termId: args.termId, studentId: e.student_id,
    actorId: args.actor.id, sourceType: 'TEACHER', kind: 'FORM', target: 'teacher_comment', status,
    parentId: previous?.id, key: ['COMMENT', args.actor.id, args.command.requestKey, String(e.student_id)], payload,
  });
  return { id, status, payload_json: payload };
}
async function getComment(args) {
  return snapshot(args.pool, async c => {
    const e = await scoped(c, args), term = await getTerm(c, args.actor.schoolId, args.termId);
    return view(e, term, await latest(c, args), true);
  });
}
async function listComments(args) {
  teacherOnly(args.actor); validId(args.termId);
  const grade = Number(args.grade), classNo = Number(args.classNo);
  if (!Number.isInteger(grade) || grade < 1 || !Number.isInteger(classNo) || classNo < 1) fail(422, '请选择完整班级');
  return snapshot(args.pool, async c => {
    const term = await getTerm(c, args.actor.schoolId, args.termId);
    const teaching = await assignments(args.actor, args.termId, c);
    if (!teaching.some(a => a.grade === grade && a.class_no === classNo && a.is_head_teacher === 1)) fail(403, '不在班主任负责班级范围');
    const [students] = await c.query('SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND grade_snapshot=? AND class_no_snapshot=? ORDER BY student_id', [args.actor.schoolId, args.termId, grade, classNo]);
    const [records] = await c.query("SELECT r.* FROM evaluation_source_record r JOIN student_term_evaluation e ON e.school_id=r.school_id AND e.term_id=r.term_id AND e.student_id=r.student_id WHERE r.school_id=? AND r.term_id=? AND e.grade_snapshot=? AND e.class_no_snapshot=? AND r.source_type='TEACHER' AND r.record_kind='FORM' AND r.target_key='teacher_comment' ORDER BY r.id", [args.actor.schoolId, args.termId, grade, classNo]);
    const byStudent = new Map(records.map(r => [String(r.student_id), r]));
    return { rows: students.filter(included).map(e => view(e, term, byStudent.get(String(e.student_id)))), canEdit: canEdit(term) };
  });
}
async function generateComment(args) {
  const { actor, termId, studentId, pool } = args;
  const before = await getComment(args);
  if (before.status !== 'EMPTY' && !args.force) return { result: before };
  const term = await getTerm(pool, actor.schoolId, termId);
  assertEditable(term, actor);
  if (args.force && (args.expectedCommentId === undefined || String(args.expectedCommentId) !== String(before.commentId)))
    fail(409, '寄语已变化，请刷新后重新生成');
  const provider = args.provider;
  if (typeof provider?.generateTermComment !== 'function') fail(503, '寄语模型服务尚未配置');
  const startHash = stableHash(before.report);
  const generated = await provider.generateTermComment({ report: before.report, fields: reportFields(term).map(({ column, label, section, valueType, jsonPath }) => ({ column, label, section, valueType, jsonPath })) });
  const comment = validateComment(generated?.comment);
  return withMutation({ pool, actor, termId, studentIds: [studentId], command: args.command, action: 'comment-generate' }, async (c, currentTerm) => {
    const e = await scoped(c, args), row = await latest(c, args);
    if (!args.force && (row || e.teacher_comment)) return { result: view(e, currentTerm, row, true) };
    if (String(e.revision) !== before.revision || stableHash(reportModel(e, currentTerm)) !== startHash || (row ? String(row.id) : null) !== before.commentId)
      fail(409, '生成期间报表或寄语已变化，请重新生成');
    const saved = await writeComment(c, args, e, currentTerm, row, comment, 'DRAFT', { generatedComment: comment, generatedAt: new Date().toISOString(), model: generated.model || null, basisHash: basis(e, currentTerm) });
    return { result: view(e, currentTerm, saved, true) };
  });
}
async function saveComment(args) {
  teacherOnly(args.actor); validId(args.termId); validId(args.studentId);
  const comment = validateComment(args.comment);
  return withMutation({ pool: args.pool, actor: args.actor, termId: args.termId, studentIds: [args.studentId], command: args.command, action: 'comment-save' }, async (c, term) => {
    const e = await scoped(c, args), previous = await latest(c, args);
    checkExpected(e, previous, args);
    const row = await writeComment(c, args, e, term, previous, comment, 'DRAFT');
    return { result: view(e, term, row, true) };
  });
}
async function approveComments(args) {
  teacherOnly(args.actor); validId(args.termId);
  if (!Array.isArray(args.entries) || !args.entries.length || args.entries.length > 100) fail(422, '每次请选择1至100名学生');
  const ids = args.entries.map(entry => { validId(entry.studentId); return String(entry.studentId); });
  if (new Set(ids).size !== ids.length) fail(422, '不能重复审核同一学生');
  return withMutation({ pool: args.pool, actor: args.actor, termId: args.termId, studentIds: ids, command: args.command, action: 'comment-approve' }, async (c, term) => {
    const checked = [];
    for (const input of args.entries) {
      const entry = { ...args, studentId: input.studentId };
      const e = await scoped(c, entry), previous = await latest(c, entry);
      checkExpected(e, previous, input);
      if (!previous && !e.teacher_comment) fail(422, '请先生成或保存寄语草稿后再审核');
      checked.push({ e, previous, comment: validateComment(input.comment) });
    }
    const changed = {};
    for (const { e, previous, comment } of checked) {
      await writeComment(c, args, e, term, previous, comment, 'APPROVED');
      await addSource(c, { schoolId: args.actor.schoolId, termId: args.termId, studentId: e.student_id, actorId: args.actor.id, sourceType: 'TEACHER', kind: 'FORM', status: 'SUBMITTED', key: ['COMMENT_APPROVAL', args.actor.id, args.command.requestKey, String(e.student_id)], payload: { values: { teacher_comment: comment }, previousValues: { teacher_comment: e.teacher_comment } } });
      changed[e.student_id] = ['teacher_comment'];
    }
    return { result: { approved: checked.map(({ e }) => String(e.student_id)) }, changedTargetsByStudent: changed };
  });
}
module.exports = { listComments, getComment, generateComment, saveComment, approveComments };
