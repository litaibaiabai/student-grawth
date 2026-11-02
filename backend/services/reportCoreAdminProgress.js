const { fail } = require('./reportCorePolicy');
const { getTerm } = require('./reportCoreStore');
const { evaluateCompletion, resolveTermRoster, getBlockingMaterials } = require('./reportCoreReadModels');
const sectionNames = ['conduct', 'wisdom', 'health', 'art', 'labor', 'story'];
function empty() {
  return { counts: { students: 0, complete: 0, incomplete: 0, confirmed: 0, published: 0, ready: 0, pendingMaterials: 0 }, sections: Object.fromEntries(sectionNames.map(s => [s, { total: 0, complete: 0, missing: 0 }])) };
}
async function getProgress({ pool, actor, termId, grade, classNo }) {
  if (actor.role !== 'manager') fail(403, '仅管理员查看完整性统计');
  for (const value of [grade, classNo]) if (value !== undefined && value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 1)) fail(422, '年级或班级不合法');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const term = await getTerm(c, actor.schoolId, termId);
    const heads = await require("./authorizationService").responsibleTeachers(c,term);
    const roster = (await resolveTermRoster({ connection: c, schoolId: actor.schoolId, termId })).filter(e => (!grade || e.grade_snapshot === Number(grade)) && (!classNo || e.class_no_snapshot === Number(classNo)));
    const blocking = await getBlockingMaterials({ connection: c, schoolId: actor.schoolId, termId, config: term.evaluation_config });
    const byStudent = new Map();
    for (const material of blocking) { const id = String(material.student_id); if (!byStudent.has(id)) byStudent.set(id, []); byStudent.get(id).push(material); }
    const [reports] = await c.query("SELECT student_id FROM term_report WHERE school_id=? AND term_id=? AND release_version=? AND status='PUBLISHED'", [actor.schoolId, termId, term.active_release_version]);
    const published = new Set(reports.map(r => String(r.student_id))), aggregate = empty(), classes = new Map(), missing = [];
    if (term.evaluation_config.adminClassRegistryVersion === 1) {
      const [registered] = await c.query('SELECT id,grade,class_no,display_name FROM school_class WHERE school_id=? AND term_id=? ORDER BY grade,class_no', [actor.schoolId, termId]);
      for (const cls of registered) if ((!grade || cls.grade === Number(grade)) && (!classNo || cls.class_no === Number(classNo))) classes.set(`${cls.grade}:${cls.class_no}`, { id: String(cls.id), grade: cls.grade, classNo: cls.class_no, displayName: cls.display_name || `${cls.grade}年级${cls.class_no}班`, ...empty() });
    }
    for (const e of roster) {
      const studentId = String(e.student_id), pending = byStudent.get(studentId) || [];
      const completion = evaluateCompletion({ evaluation: e, config: term.evaluation_config, blockingMaterials: pending });
      if (heads !== null && !heads.get(`${e.grade_snapshot}:${e.class_no_snapshot}`)) completion.missingItems.push({field:'responsibleTeacher',reason:'班级需要本校启用的负责教师'});
      const confirmed = require('./authorizationService').responsibleReviewValid(heads,e) && e.status === 'CONFIRMED' && String(e.confirmed_revision) === String(e.revision) && e.approval_fingerprint === require('./reportCoreEvaluation').reportFingerprint(e, term);
      const key = `${e.grade_snapshot}:${e.class_no_snapshot}`;
      if (!classes.has(key)) classes.set(key, { grade: e.grade_snapshot, classNo: e.class_no_snapshot, ...empty() });
      for (const target of [aggregate, classes.get(key)]) {
        target.counts.students++;
        target.counts[completion.missingItems.length ? 'incomplete' : 'complete']++;
        if (confirmed) target.counts.confirmed++;
        if (confirmed && !completion.missingItems.length) target.counts.ready++;
        if (published.has(studentId)) target.counts.published++;
        target.counts.pendingMaterials += pending.length;
        for (const section of sectionNames) { const p = completion.sectionProgress[section]; target.sections[section].total += p.total; target.sections[section].complete += p.complete; target.sections[section].missing += p.total - p.complete; }
      }
      if (completion.missingItems.length) missing.push({ studentId, name: e.student_name_snapshot, grade: e.grade_snapshot, classNo: e.class_no_snapshot, fields: completion.missingItems });
    }
    await c.commit();
    return { asOf: new Date().toISOString(), versions: { config: String(term.config_version), rule: String(term.rule_version), data: String(term.data_revision || 0), activeRelease: Number(term.active_release_version) }, ...aggregate, classes: [...classes.values()].sort((a, b) => a.grade - b.grade || a.classNo - b.classNo), missing };
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
async function exportProgress(args) {
  const model = await getProgress(args);
  const rows = [['scope', 'grade', 'classNo', 'studentId', 'name', 'metric', 'total', 'complete', 'missing']];
  for (const [scope, group] of [['school', model], ...model.classes.map(c => ['class', c])]) {
    for (const [key, value] of Object.entries(group.counts)) rows.push([scope, group.grade, group.classNo, '', '', key, value, '', '']);
    for (const [key, value] of Object.entries(group.sections)) rows.push([scope, group.grade, group.classNo, '', '', key, value.total, value.complete, value.missing]);
  }
  for (const student of model.missing) for (const field of student.fields) rows.push(['student', student.grade, student.classNo, student.studentId, student.name, field.field, '', '', field.reason]);
  return require('./reportCoreAdminOps').csv(rows);
}
module.exports = { getProgress, exportProgress };
