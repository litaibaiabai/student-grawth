const { presentAudit } = require('./reportCoreAuditPresentation');
const auditLabels = require('../config/reportCoreAuditLabels.json');
const bcrypt = require('bcrypt');
const { fail, schoolDayStart, schoolDayEnd } = require('./reportCorePolicy');
const { getTerm, withMutation, addSource, parse } = require('./reportCoreStore');
const { pagination } = require('./reportCoreReadModels');
const { createV2Config } = require('./reportCoreV2Policy');
const manager = actor => { if (actor.role !== 'manager') fail(403, '仅管理员可维护账号及学期'); };
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
function reasonOf(value) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > 500) fail(422, '请填写500字内的操作原因');
  return value.trim();
}
function accountInput(args) {
  manager(args.actor);
  if (!/^[1-9]\d*$/.test(String(args.accountId)) || !Number.isSafeInteger(args.expectedTokenVersion) || args.expectedTokenVersion < 1) fail(422, '账号及预期版本不合法');
  return reasonOf(args.reason);
}
async function changeAccount(args, kind) {
  const reason = accountInput(args);
  if (kind === 'status' && ![0, 1].includes(args.status)) fail(422, '账号状态需为0或1');
  if (kind === 'password' && (typeof args.password !== 'string' || args.password.length < 8 || Buffer.byteLength(args.password) > 72)) fail(422, '密码需至少8字符且不超过72字节');
  return withMutation({ ...args, action: `admin-account-${kind}`, termLock: 'exclusive', readCommitted: true, schoolAccountLock: true }, async (c) => {
    const [[user]] = await c.query('SELECT id,role,status,token_version FROM users WHERE school_id=? AND id=? FOR UPDATE', [args.actor.schoolId, args.accountId]);
    if (!user) fail(404, '账号不存在');
    if (!['student', 'teacher'].includes(user.role)) fail(422, '仅可维护学生和教师账号');
    if (user.token_version !== args.expectedTokenVersion) fail(409, '账号版本已变化，请刷新');
    const tokenVersion = user.token_version + 1;
    if (kind === 'status') await c.query('UPDATE users SET status=?,token_version=? WHERE school_id=? AND id=?', [args.status, tokenVersion, args.actor.schoolId, args.accountId]);
    else await c.query('UPDATE users SET password=?,token_version=? WHERE school_id=? AND id=?', [await bcrypt.hash(args.password, 12), tokenVersion, args.actor.schoolId, args.accountId]);
    const result = { accountId: String(user.id), status: kind === 'status' ? args.status : user.status, tokenVersion, ...(kind === 'password' ? { passwordChanged: true } : {}) };
    await addSource(c, { schoolId: args.actor.schoolId, termId: args.termId, actorId: args.actor.id, kind: 'AUDIT', status: 'COMMITTED', key: ['ADMIN_ACCOUNT', kind, args.actor.id, args.command.requestKey], payload: { action: kind === 'status' ? 'ACCOUNT_STATUS' : 'ACCOUNT_PASSWORD', accountId: String(user.id), reason, diffs: kind === 'status' ? [{ field: 'status', before: user.status, after: args.status }] : [{ field: 'passwordChanged', before: false, after: true }], tokenVersionBefore: user.token_version, tokenVersionAfter: tokenVersion } });
    return { result };
  });
}
const setAccountStatus = args => changeAccount(args, 'status');
const resetAccountPassword = args => changeAccount(args, 'password');
// Every cell is quoted and spreadsheet formula prefixes are neutralized, including
// prefixes hidden behind whitespace. Both exports use this one encoder.
function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}
const safeScalar = value => value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && /^(?:\d{1,20}|\d{4}-\d{2}(?:-\d{2})?|ACTIVE|TRANSFERRED_OUT|NOT_APPLICABLE|COLLECTING|RECONCILING|FROZEN|ARCHIVED)$/.test(value);
const publicFields = new Set(['status', 'passwordChanged', 'grade', 'classNo', 'responsibleTeacherId', 'teacherId', 'studentCount', 'registrationDate', 'defaultMonthlyTotal', 'quotaTotal', 'businessPhase', 'isCurrent']);
const publicSubjects = new Set(['MORAL', 'CHINESE', 'MATH', 'SCIENCE', 'ENGLISH', 'PE', 'MUSIC', 'FINE_ART', 'INFORMATION_TECHNOLOGY', 'LABOR', 'INTEGRATED_PRACTICE', 'LOCAL_COURSE', 'STORY']);
const publicId = value => /^[1-9]\d{0,19}$/.test(String(value)) ? String(value) : undefined;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
function classAudit(payload, action) {
  const diffs = [], metadata = {}, changes = Array.isArray(payload.diffs) ? payload.diffs : [];
  for (const key of ['classId', 'targetClassId']) if (publicId(payload[key])) metadata[key] = publicId(payload[key]);
  for (const key of ['grade', 'classNo']) if (positiveInteger(payload[key])) metadata[key] = payload[key];
  for (const key of ['created', 'updated', 'skipped', 'errors']) if (Number.isSafeInteger(payload.counts?.[key]) && payload.counts[key] >= 0) metadata[key] = payload.counts[key];
  for (const key of ['studentCount']) if (Number.isSafeInteger(payload.impact?.[key]) && payload.impact[key] >= 0) metadata[key] = payload.impact[key];
  for (const key of ['permissionsChanged', 'confirmationsInvalidated', 'rankingsRebuilt']) if (typeof payload.impact?.[key] === 'boolean') metadata[key] = payload.impact[key];
  for (const change of changes) {
    if (!change || typeof change !== 'object') continue;
    if (action === 'CLASS_IMPORT') {
      if (change.action === 'UPDATE' && publicId(change.classId) && (change.before?.displayName === null || typeof change.before?.displayName === 'string' && change.before.displayName.length<=100) && (change.after?.displayName === null || typeof change.after?.displayName === 'string' && change.after.displayName.length<=100)) {
        diffs.push({field:'displayName',classId:publicId(change.classId),...(positiveInteger(change.rowNo)?{rowNo:change.rowNo}:{}),before:change.before.displayName,after:change.after.displayName});
        continue;
      }
      if (change.action !== 'NEW' || change.before !== null || !positiveInteger(change.after?.grade) || !positiveInteger(change.after?.classNo)) continue;
      const context = { ...(positiveInteger(change.rowNo) ? { rowNo: change.rowNo } : {}), grade: change.after.grade, classNo: change.after.classNo };
      diffs.push({ field: 'classCreated', ...context, before: null, after: true });
      const head = change.after.responsibleTeacherId;
      if (head === null || publicId(head)) diffs.push({ field: 'responsibleTeacherId', ...context, before: null, after: head === null ? null : publicId(head) });
    } else if (action === 'CLASS_TRANSFER') {
      const studentId = publicId(change.studentId);
      if (!studentId) continue;
      for (const field of ['grade', 'classNo']) if (positiveInteger(change.before?.[field]) && positiveInteger(change.after?.[field])) diffs.push({ field, studentId, before: change.before[field], after: change.after[field] });
    } else if (action === 'CLASS_TEACHERS') {
      const context = metadata.classId ? { classId: metadata.classId } : {};
      const beforeHead = change.before?.responsibleTeacherId, afterHead = change.after?.responsibleTeacherId;
      if ((beforeHead === null || publicId(beforeHead)) && (afterHead === null || publicId(afterHead))) diffs.push({ field: 'responsibleTeacherId', ...context, before: beforeHead === null ? null : publicId(beforeHead), after: afterHead === null ? null : publicId(afterHead) });
      const assignments = side => new Map((Array.isArray(side?.assignments) ? side.assignments : []).filter(a => a && publicSubjects.has(a.subjectCode) && publicId(a.teacherId)).map(a => [`${a.subjectCode}:${publicId(a.teacherId)}`, { subjectCode: a.subjectCode, teacherId: publicId(a.teacherId) }]));
      const before = assignments(change.before), after = assignments(change.after);
      for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) if (before.has(key) !== after.has(key)) diffs.push({ field: 'assignment', ...context, ...(after.get(key) || before.get(key)), before: before.has(key), after: after.has(key) });
    }
  }
  return { diffs, metadata };
}
function publicAudit(row) {
  const payload = parse(row.payload_json);
  const roster = row.record_kind === 'BATCH' && row.source_type === 'IMPORT' && payload.kind === 'ROSTER';
  const action = roster ? 'ROSTER_IMPORT' : typeof payload.action === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(payload.action) ? payload.action : 'UNKNOWN';
  const diffs = (Array.isArray(payload.diffs) ? payload.diffs : []).filter(d => d && publicFields.has(d.field) && safeScalar(d.before) && safeScalar(d.after)).map(d => ({ field: d.field, before: d.before, after: d.after }));
  const meta = {};
  for (const key of ['accountId', 'classId', 'sourceTermId', 'termId', 'studentCount', 'rowCount', 'tokenVersionBefore', 'tokenVersionAfter']) if (safeScalar(payload[key]) && payload[key] !== undefined) meta[key] = payload[key];
  if (['registration', 'rules', 'assignments'].includes(payload.section)) meta.section = payload.section;
  if (['CLASS_IMPORT', 'CLASS_TEACHERS', 'CLASS_TRANSFER'].includes(action)) {
    const projected = classAudit(payload, action);
    diffs.push(...projected.diffs);
    Object.assign(meta, projected.metadata);
  }
  if (action === 'COURSE_CARD_SETTINGS') {
    const quota = value => value === null || Number.isInteger(value) && value>=0 && value<=10000;
    if (quota(payload.beforeDefaultMonthlyTotal) && quota(payload.afterDefaultMonthlyTotal) && payload.beforeDefaultMonthlyTotal !== payload.afterDefaultMonthlyTotal) diffs.push({field:'defaultMonthlyTotal',before:payload.beforeDefaultMonthlyTotal,after:payload.afterDefaultMonthlyTotal});
    for (const subjectCode of publicSubjects) {
      const before=payload.before?.[subjectCode]??null,after=payload.after?.[subjectCode]??null;
      if (quota(before) && quota(after) && before!==after) diffs.push({field:'monthlyTotal',subjectCode,before,after});
    }
  }
  if (roster) {
    meta.batchId=String(row.id);meta.termId=String(row.term_id);
    for (const key of ['rowCount']) if (Number.isSafeInteger(payload[key]) && payload[key]>=0) meta[key]=payload[key];
    for (const key of ['created','updated','skipped','errors']) if (Number.isSafeInteger(payload.counts?.[key]) && payload.counts[key]>=0) meta[key]=payload.counts[key];
    for (const d of Array.isArray(payload.commitDiffs)?payload.commitDiffs:[]) {
      if (!d || !['NEW','UPDATE'].includes(d.action)) continue;
      const context={...(positiveInteger(d.rowNo)?{rowNo:d.rowNo}:{}),...(publicId(d.accountId||d.studentId)?{accountId:publicId(d.accountId||d.studentId)}:{}),...(['student','teacher'].includes(d.role)?{role:d.role}:{}),action:d.action};
      if (typeof d.username==='string' && d.username.length<=100) context.username=d.username;
      for (const field of ['real_name','grade','classNo']) {
        const before=d.before?.[field]??null,after=d.after?.[field]??null;
        const valid=value=>value===null || (field==='real_name'?typeof value==='string'&&value.length<=100:positiveInteger(value));
        if (valid(before)&&valid(after)&&before!==after) diffs.push({field,...context,before,after});
      }
    }
  }
  if (action === 'confirm-report') {
    for (const key of ['studentId','termId','confirmedRevision']) if (publicId(payload[key])) meta[key]=publicId(payload[key]);
  }
  if (['begin-release','activate-release','cancel-release','resume-release'].includes(action)) {
    for (const key of ['termId','fence']) if (publicId(payload[key])) meta[key]=publicId(payload[key]);
    // releaseKey is an operation identifier, never a card credential or content fingerprint.
    if (typeof payload.releaseKey==='string' && /^[a-f0-9]{64}$/.test(payload.releaseKey)) meta.releaseKey=payload.releaseKey;
    for (const key of ['releaseVersion','total','prepared','activeVersion']) if (Number.isSafeInteger(payload[key])&&payload[key]>=0) meta[key]=payload[key];
    if (['IDLE','PREPARING','READY','FAILED'].includes(payload.releaseStatus)) meta.releaseStatus=payload.releaseStatus;
  }
  const result = { id: String(row.id), type: action, createdAt: row.created_at, actorId: row.actor_id === null ? null : String(row.actor_id), actorName: row.actorName, status: row.status, diffs, metadata: meta };
  return { ...result, display: presentAudit(result) };
}
async function auditQuery(args, all) {
  manager(args.actor);
  await getTerm(args.pool, args.actor.schoolId, args.termId);
  const { type, q = '', from, to } = args;
  if (typeof q !== 'string' || q.length > 100 || type && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(type)) fail(422, '操作记录筛选不合法');
  if (from) schoolDayStart(from);
  if (to) schoolDayStart(to);
  if (from && to && from > to) fail(422, '开始日期不能晚于结束日期');
  const page = pagination(args, { schoolId: args.actor.schoolId, termId: args.termId, type, q, from, to });
  let sql = `FROM evaluation_source_record s LEFT JOIN users u ON u.school_id=s.school_id AND u.id=s.actor_id WHERE s.school_id=? AND s.term_id=? AND (s.record_kind='AUDIT' OR (s.record_kind='BATCH' AND s.source_type='IMPORT' AND JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.kind'))='ROSTER')) AND s.status='COMMITTED'`;
  const params = [args.actor.schoolId, args.termId];
  // Match publicAudit's displayed type, including synthesized import actions
  // and the safe UNKNOWN fallback for malformed/old action values.
  const displayedAction = `CASE WHEN s.record_kind='BATCH' AND s.source_type='IMPORT' AND JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.kind'))='ROSTER' THEN 'ROSTER_IMPORT' WHEN JSON_TYPE(JSON_EXTRACT(s.payload_json,'$.action'))='STRING' AND REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.action')),'^[A-Za-z][A-Za-z0-9_-]{0,63}$','c') THEN JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.action')) ELSE 'UNKNOWN' END`;
  if (type) { sql += ` AND (${displayedAction})=?`; params.push(type); }
  if (q) {
    const localizedTypes = Object.entries(auditLabels.actions).filter(([, label]) => label.includes(q)).map(([code]) => code);
    sql += ` AND (LOCATE(?,${displayedAction})>0 OR LOCATE(?,u.real_name)>0 OR LOCATE(?,u.username)>0${localizedTypes.length ? ` OR (${displayedAction}) IN (${localizedTypes.map(() => '?').join(',')})` : ''})`;
    params.push(q, q, q, ...localizedTypes);
  }
  if (from) { sql += ' AND s.created_at>=?'; params.push(schoolDayStart(from)); }
  if (to) { sql += ' AND s.created_at<?'; params.push(schoolDayEnd(to)); }
  const [[count]] = await args.pool.query('SELECT COUNT(*) n ' + sql, params);
  const [rows] = await args.pool.query('SELECT s.id,s.term_id,s.record_kind,s.source_type,s.actor_id,s.status,s.created_at,s.payload_json,u.real_name actorName ' + sql + ' ORDER BY s.id DESC' + (all ? '' : ' LIMIT ? OFFSET ?'), all ? params : [...params, page.limit, page.offset]);
  return { rows: rows.map(publicAudit), total: Number(count.n), nextCursor: all ? null : page.next(Number(count.n)) };
}
const listAudits = args => auditQuery(args, false);
async function exportAudits(args) {
  const { rows } = await auditQuery({ ...args, cursor: undefined }, true);
  return csv([['记录编号', '操作时间', '操作', '操作人编号', '操作人', '结果', '实际差异', '影响与详情', '操作代码', '状态代码', '差异代码（排查用）', '详情代码（排查用）'], ...rows.map(r => [r.id, r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt, r.display.type, r.actorId, r.actorName, r.display.status, r.display.diffs.join('；'), r.display.metadata.join('；'), r.type, r.status, JSON.stringify(r.diffs), JSON.stringify(r.metadata)])]);
}
function newTermInput(args) {
  manager(args.actor);
  if (!/^\d{4}-\d{4}$/.test(args.academicYear) || Number(args.academicYear.slice(5)) !== Number(args.academicYear.slice(0, 4)) + 1 || ![1, 2].includes(args.semester)) fail(422, '学年或学期不合法');
  if (typeof args.termName !== 'string' || !args.termName.trim() || args.termName.length > 80) fail(422, '请填写80字内的学期名称');
  for (const key of ['startDate', 'endDate', 'collectionDeadline']) schoolDayStart(args[key]);
  if (args.startDate > args.collectionDeadline || args.collectionDeadline > args.endDate || args.startDate >= args.endDate) fail(422, '采集截止日须在新学期起止日期内');
  if (args.makeCurrent !== undefined && typeof args.makeCurrent !== 'boolean') fail(422, '当前学期选项不合法');
}
async function lockSchoolTerms(c, schoolId) {
  const [terms] = await c.query('SELECT id,release_status,is_current FROM academic_year WHERE school_id=? ORDER BY id FOR UPDATE', [schoolId]);
  if (terms.some(t => t.release_status !== 'IDLE')) fail(423, '学校存在未结束发布，暂不能创建或切换学期');
  return terms;
}
const termView = t => ({ id: String(t.id), academicYear: t.academic_year, semester: t.semester, name: t.term_name, startDate: day(t.start_date), endDate: day(t.end_date), isCurrent: !!t.is_current, schemaVersion: t.evaluation_config.schemaVersion });
async function createTerm(args) {
  newTermInput(args);
  return withMutation({ ...args, termId: args.sourceTermId, action: 'admin-term-create', termLock: 'exclusive', readCommitted: true }, async (c, source) => {
    await lockSchoolTerms(c, args.actor.schoolId);
    const startYear = Number(source.academic_year.slice(0, 4)), expectedYear = source.semester === 1 ? source.academic_year : `${startYear + 1}-${startYear + 2}`;
    if (args.academicYear !== expectedYear || args.semester !== (source.semester === 1 ? 2 : 1) || args.startDate <= day(source.end_date)) fail(422, '新学期须为来源学期的下一学期且开始日应晚于其结束日');
    const [[existing]] = await c.query('SELECT id FROM academic_year WHERE school_id=? AND academic_year=? AND semester=?', [args.actor.schoolId, args.academicYear, args.semester]);
    if (existing) fail(409, '本校该学年学期已存在');
    if (args.makeCurrent) await c.query('UPDATE academic_year SET is_current=0 WHERE school_id=? AND is_current=1', [args.actor.schoolId]);
    const config = { ...createV2Config(), adminClassRegistryVersion: 1, courseCardDefaultQuota: 100, collectionDeadline: args.collectionDeadline };
    const [insert] = await c.query("INSERT INTO academic_year(school_id,academic_year,semester,term_name,start_date,end_date,is_current,evaluation_config,config_version,template_version,rule_version,business_phase) VALUES(?,?,?,?,?,?,?,?, '1','CORE_V2','V2_1','COLLECTING')", [args.actor.schoolId, args.academicYear, args.semester, args.termName.trim(), args.startDate, args.endDate, args.makeCurrent ? 1 : 0, JSON.stringify(config)]);
    const term = await getTerm(c, args.actor.schoolId, insert.insertId);
    await addSource(c, { schoolId: args.actor.schoolId, termId: source.id, actorId: args.actor.id, kind: 'AUDIT', status: 'COMMITTED', key: ['ADMIN_TERM_CREATE', args.actor.id, args.command.requestKey], payload: { action: 'TERM_CREATE', sourceTermId: String(source.id), termId: String(term.id) } });
    return { result: { term: termView(term) } };
  });
}
async function makeTermCurrent(args) {
  manager(args.actor);
  return withMutation({ ...args, action: 'admin-term-current', termLock: 'exclusive', readCommitted: true }, async (c, term) => {
    const terms = await lockSchoolTerms(c, args.actor.schoolId);
    await c.query('UPDATE academic_year SET is_current=0 WHERE school_id=? AND is_current=1', [args.actor.schoolId]);
    await c.query('UPDATE academic_year SET is_current=1 WHERE school_id=? AND id=?', [args.actor.schoolId, term.id]);
    await addSource(c, { schoolId: args.actor.schoolId, termId: term.id, actorId: args.actor.id, kind: 'AUDIT', status: 'COMMITTED', key: ['ADMIN_TERM_CURRENT', args.actor.id, args.command.requestKey], payload: { action: 'TERM_CURRENT', termId: String(term.id), diffs: [{ field: 'isCurrent', before: terms.find(t => String(t.id) === String(term.id))?.is_current === 1, after: true }] } });
    return { result: { term: termView({ ...term, is_current: 1 }) } };
  });
}
module.exports = { setAccountStatus, resetAccountPassword, listAudits, exportAudits, createTerm, makeTermCurrent, csv };
