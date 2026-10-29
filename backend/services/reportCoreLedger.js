const { fail, catalog, stableHash, schoolDayStart, getSchoolMonthBounds } = require('./reportCorePolicy');
const { getTerm, parse } = require('./reportCoreStore');
const id = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const statuses = ['UNUSED', 'FUTURE', 'EXPIRED', 'VOID', 'USED', 'REVERSED', 'UNKNOWN'];
const sorts = { id: 's.id', student: 'COALESCE(e.student_name_snapshot,u.real_name)', usedAt: "JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.usedAt'))" };
function normalizeLedgerQuery(query = {}, actor) {
  if (!['manager', 'teacher'].includes(actor.role)) fail(403, '无卡台账权限');
  const requested = query.teacherId || query.ownerId;
  if (actor.role === 'teacher' && requested && String(requested) !== actor.id) fail(403, '仅能查看本人卡台账');
  const ownerId = actor.role === 'teacher' ? actor.id : String(requested || '');
  if (!id(ownerId) || !id(String(query.termId || ''))) fail(422, '请选择学期及教师');
  const out = { termId: String(query.termId), ownerId, sort: query.sort || 'id', order: String(query.order || 'desc').toLowerCase() };
  if (!sorts[out.sort] || !['asc', 'desc'].includes(out.order)) fail(422, '排序不合法');
  for (const key of ['monthFrom', 'monthTo']) if (query[key]) { getSchoolMonthBounds(query[key]); out[key] = query[key]; }
  if (out.monthFrom && out.monthTo && out.monthFrom > out.monthTo) fail(422, '月份范围不合法');
  for (const key of ['grade', 'classNo']) if (query[key] !== undefined && query[key] !== '') {
    const n = Number(query[key]); if (!Number.isInteger(n) || n < 1 || n > 999) fail(422, '班级范围不合法'); out[key] = n;
  }
  for (const key of ['studentId', 'cardId']) if (query[key]) { if (!id(String(query[key]))) fail(422, '记录编号不合法'); out[key] = String(query[key]); }
  if (query.categoryCode) { if (!catalog.cardCatalog.some(c => c.code === query.categoryCode)) fail(422, '卡指标不合法'); out.categoryCode = query.categoryCode; }
  if (query.section) { if (!['conduct', 'wisdom', 'health', 'art', 'labor', 'story'].includes(query.section)) fail(422, '六育板块不合法'); out.section = query.section; }
  if (query.primary) out.primary = String(query.primary).slice(0, 80);
  if (query.status) { if (!statuses.includes(query.status)) fail(422, '卡状态不合法'); out.status = query.status; }
  if (query.keyword) { if (typeof query.keyword !== 'string' || query.keyword.length > 100) fail(422, '查询文字过长'); out.keyword = query.keyword.trim(); }
  for (const key of ['usedFrom', 'usedTo', 'eventFrom', 'eventTo']) if (query[key]) {
    const value = query[key];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? schoolDayStart(value) : /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(value) : null;
    if (!date || !Number.isFinite(+date)) fail(422, '日期范围不合法'); out[key] = date.toISOString();
  }
  for (const prefix of ['used', 'event']) if (out[prefix + 'From'] && out[prefix + 'To'] && out[prefix + 'From'] >= out[prefix + 'To']) fail(422, '日期范围不合法');
  return out;
}
function resolveSourceInstant(source, clockBaseline) {
  const p = source.payload || parse(source.payload_json);
  const explicit = source.record_kind === 'CARD' ? p.usedAt : p.occurredAt;
  if (typeof explicit === 'string' && /Z$/.test(explicit) && Number.isFinite(+new Date(explicit))) return { occurredAt: new Date(explicit).toISOString(), timeBasis: 'UTC' };
  const raw = source.created_at instanceof Date ? source.created_at : source.created_at ? new Date(source.created_at) : null;
  if (!raw || !Number.isFinite(+raw)) return { occurredAt: null, timeBasis: 'UNKNOWN' };
  if (clockBaseline && BigInt(source.id) > BigInt(clockBaseline.lastLegacySourceId)) return { occurredAt: raw.toISOString(), timeBasis: 'UTC' };
  if (clockBaseline?.verifiedLegacyOffsetMinutes !== null && clockBaseline?.verifiedLegacyOffsetMinutes !== undefined) return { occurredAt: new Date(+raw - clockBaseline.verifiedLegacyOffsetMinutes * 60000).toISOString(), timeBasis: 'VERIFIED_LEGACY' };
  return { occurredAt: null, timeBasis: 'UNKNOWN' };
}
const sectionOf = group => group === '德美' ? 'conduct' : ['体育与健康', '体质健康测试'].includes(group) ? 'health' : ['音乐', '美术'].includes(group) ? 'art' : 'wisdom';
const iso = value => value && Number.isFinite(+new Date(value)) ? new Date(value).toISOString() : null;
const schoolMonth = instant => new Date(+new Date(instant) + 8 * 3600000).toISOString().slice(0, 7);
const inRange = (value, from, to) => value !== null && (!from || value >= from) && (!to || value < to);
function monthMatches(month, f) { return month !== null && month >= f.monthFrom && month <= f.monthTo; }
async function snapshot(args, run) {
  const f = normalizeLedgerQuery(args.filters || {}, args.actor), c = await args.pool.getConnection();
  try {
    await c.beginTransaction();
    const term = await getTerm(c, args.actor.schoolId, f.termId);
    const [owners] = await c.query("SELECT id,real_name,username FROM users WHERE school_id=? AND id=? AND role='teacher'", [args.actor.schoolId, f.ownerId]);
    if (!owners.length) fail(404, '教师不存在');
    const first = term.start_date instanceof Date ? term.start_date.toISOString().slice(0, 7) : term.start_date.slice(0, 7);
    const last = term.end_date instanceof Date ? term.end_date.toISOString().slice(0, 7) : term.end_date.slice(0, 7);
    f.monthFrom ||= first; f.monthTo ||= last;
    if (f.monthFrom < first || f.monthTo > last) fail(422, '月份超出所选学期');
    const asOf = iso(args.asOf || args.now || new Date()); if (!asOf) fail(422, '截至时间不合法');
    const [[clock]] = await c.query("SELECT payload_json FROM evaluation_source_record WHERE school_id=? AND business_key=?", [args.actor.schoolId, stableHash(['SOURCE_CLOCK_BASELINE', args.actor.schoolId, 'UTC_V1'])]);
    const baseline = clock ? parse(clock.payload_json) : null;
    const [metadata] = await c.query("SELECT id,parent_id,actor_id,record_kind,month_key,payload_json,revision,created_at FROM evaluation_source_record WHERE school_id=? AND term_id=? AND owner_teacher_id=? AND month_key>=? AND month_key<=? AND record_kind IN ('QUOTA','AUDIT') ORDER BY id", [args.actor.schoolId, f.termId, f.ownerId, f.monthFrom, f.monthTo]);
    const context = { c, actor: args.actor, f, asOf, baseline, metadata, owner: owners[0], currentSnapshot: !args.asOf };
    const result = await run(context);
    await c.commit(); return result;
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
function project(source, ctx) {
  const p = parse(source.payload_json), category = catalog.cardCatalog.find(c => c.targetColumn === source.target_key);
  const paper = source.record_kind === 'CARD';
  const created = resolveSourceInstant({ ...source, payload: {}, payload_json: {} }, ctx.baseline);
  if (created.occurredAt && created.occurredAt > ctx.asOf) return null;
  const occurred = resolveSourceInstant(source, ctx.baseline);
  const usedAt = paper ? iso(p.usedAt) : null;
  const redeemed = paper && source.status === 'USED' && (usedAt ? usedAt <= ctx.asOf : ctx.currentSnapshot);
  const voidAt = iso(p.voidedAt);
  const voided = paper && source.status === 'VOID' && (voidAt ? voidAt <= ctx.asOf : ctx.currentSnapshot);
  let status = paper ? redeemed ? 'USED' : voided ? 'VOID' : +source.valid_from > +new Date(ctx.asOf) ? 'FUTURE' : +source.valid_until <= +new Date(ctx.asOf) ? 'EXPIRED' : 'UNUSED' : 'CONFIRMED';
  const generatedTimeUnknown = paper && !ctx.currentSnapshot && !created.occurredAt && !redeemed && !voided;
  const stateUnknown = generatedTimeUnknown || paper && !ctx.currentSnapshot && ((source.status === 'USED' && !usedAt) || (source.status === 'VOID' && !voidAt));
  if (stateUnknown) status = 'UNKNOWN';
  const reverse = source.reverse_id ? resolveSourceInstant({ id: source.reverse_id, created_at: source.reverse_created_at, payload_json: source.reverse_payload, record_kind: 'REVERSAL' }, ctx.baseline) : null;
  const reverseUnknown = !!reverse && !reverse.occurredAt && !ctx.currentSnapshot;
  const reversed = !!reverse && (reverse.occurredAt ? reverse.occurredAt <= ctx.asOf : ctx.currentSnapshot);
  const attributionMonth = paper ? source.month_key : occurred.occurredAt ? schoolMonth(occurred.occurredAt) : null;
  const studentId = paper && !redeemed ? null : source.student_id ? String(source.student_id) : null;
  return {
    id: String(source.id), kind: source.record_kind, sourceMode: paper ? 'paper' : 'direct', quotaId: source.parent_id ? String(source.parent_id) : null,
    teacherId: ctx.f.ownerId, teacherName: ctx.owner.real_name, attributionMonth,
    grade: paper ? p.grade : source.grade_snapshot, classNo: paper ? p.classNo : source.class_no_snapshot,
    classBasis: paper ? 'ISSUED_CLASS' : 'CURRENT_TERM_SNAPSHOT',
    categoryCode: category?.code || p.categoryCode || null, categoryName: category?.item || source.target_key,
    section: category ? sectionOf(category.group) : null, primary: category?.group === '德美' ? '日常行为' : category?.group || null,
    targetKey: source.target_key, status, studentId, studentName: studentId ? source.student_name_snapshot || source.student_name || `学生#${studentId}` : null,
    studentNumber: studentId ? source.student_number || null : null, generatedAt: created.occurredAt, occurredAt: occurred.occurredAt, usedAt: redeemed ? usedAt : null,
    validFrom: iso(source.valid_from), validUntil: iso(source.valid_until), revision: String(source.revision),
    reversed, reverseId: reversed && source.reverse_id ? String(source.reverse_id) : null, reversedAt: reversed ? reverse?.occurredAt || null : null,
    reverseReason: reversed ? parse(source.reverse_payload).reason || '' : '',
    reversedBy: reversed ? source.reverse_actor_name || null : null,
    voidReason: voided && typeof p.voidReason === 'string' ? p.voidReason : '', voidedAt: voided ? voidAt : null,
    reason: typeof p.reason === 'string' ? p.reason : '', timeBasis: occurred.timeBasis,
    net: stateUnknown || reverseUnknown ? null : paper ? (redeemed ? 1 : 0) - (redeemed && reversed ? 1 : 0) : (occurred.occurredAt && occurred.occurredAt > ctx.asOf ? 0 : 1) - (reversed ? 1 : 0),
    stateUnknown, reverseUnknown, generatedTimeUnknown,
  };
}
async function* scan(ctx) {
  const sql = `SELECT s.id,s.parent_id,s.student_id,s.target_key,s.record_kind,s.month_key,s.status,s.revision,s.payload_json,s.created_at,s.valid_from,s.valid_until,
    e.student_name_snapshot,e.grade_snapshot,e.class_no_snapshot,u.real_name student_name,u.username student_number,
    r.id reverse_id,r.created_at reverse_created_at,r.payload_json reverse_payload,ru.real_name reverse_actor_name
    FROM evaluation_source_record s
    LEFT JOIN student_term_evaluation e ON e.school_id=s.school_id AND e.term_id=s.term_id AND e.student_id=s.student_id
    LEFT JOIN users u ON u.school_id=s.school_id AND u.id=s.student_id
    LEFT JOIN evaluation_source_record r ON r.school_id=s.school_id AND r.reversal_of=s.id
    LEFT JOIN users ru ON ru.school_id=r.school_id AND ru.id=r.actor_id
    WHERE s.school_id=? AND s.term_id=? AND s.source_type='CARD' AND ((s.record_kind='CARD' AND s.owner_teacher_id=? AND s.month_key>=? AND s.month_key<=?) OR (s.record_kind='DIRECT' AND s.actor_id=?))
    ORDER BY ${sorts[ctx.f.sort]} ${ctx.f.order.toUpperCase()},s.id ${ctx.f.order.toUpperCase()}`;
  const stream = ctx.c.connection.query(sql, [ctx.actor.schoolId, ctx.f.termId, ctx.f.ownerId, ctx.f.monthFrom, ctx.f.monthTo, ctx.f.ownerId]).stream({ highWaterMark: 64 });
  try {
    for await (const source of stream) {
      const row = project(source, ctx);
      if (row && (row.kind !== 'DIRECT' || !row.occurredAt || row.occurredAt <= ctx.asOf)) yield row;
    }
  } finally { stream.destroy(); }
}
function matches(row, f, { ignoreEventRange = false } = {}) {
  if (!monthMatches(row.attributionMonth, f)) return false;
  if (f.grade && row.grade !== f.grade || f.classNo && row.classNo !== f.classNo) return false;
  if (f.studentId && row.studentId !== f.studentId || f.cardId && row.id !== f.cardId) return false;
  if (f.categoryCode && row.categoryCode !== f.categoryCode || f.section && row.section !== f.section || f.primary && row.primary !== f.primary) return false;
  if (f.status && (f.status === 'REVERSED' ? !row.reversed : row.status !== f.status)) return false;
  if (f.keyword && ![row.studentName, row.studentNumber, row.id].some(v => v && String(v).includes(f.keyword))) return false;
  if ((f.usedFrom || f.usedTo) && !inRange(row.usedAt, f.usedFrom, f.usedTo)) return false;
  if (!ignoreEventRange && (f.eventFrom || f.eventTo) && !inRange(row.kind === 'CARD' ? row.usedAt : row.occurredAt, f.eventFrom, f.eventTo)) return false;
  return true;
}
function emptyCounts() { return { generated: 0, redeemed: 0, pending: 0, future: 0, expired: 0, voided: 0, reversed: 0, direct: 0, directReversed: 0, net: 0, unknownTimeCount: 0, unknownStateCount: 0, unknownGenerationCount: 0 }; }
function addCount(counts, row) {
  if (!row.occurredAt) counts.unknownTimeCount++;
  if (row.kind === 'CARD') {
    counts.generated++;
    const field = { USED: 'redeemed', UNUSED: 'pending', FUTURE: 'future', EXPIRED: 'expired', VOID: 'voided' }[row.status];
    if (field) counts[field]++; else counts.unknownStateCount++;
    if (row.reversed) counts.reversed++;
    if (row.generatedTimeUnknown) counts.unknownGenerationCount++;
  } else { counts.direct++; if (row.reversed) counts.directReversed++; }
  if (row.reverseUnknown) counts.unknownStateCount++;
  if (row.net === null) counts.net = null; else if (counts.net !== null) counts.net += row.net;
}
function quotaValues(ctx) {
  let quota = 0, planned = 0, quotaKnown = true, planKnown = true;
  const classPlans = new Map();
  function addPlans(plans) {
    for (const plan of plans || []) {
      const key = `${plan.grade}:${plan.classNo}`;
      if (!classPlans.has(key)) classPlans.set(key, { grade: plan.grade, classNo: plan.classNo, planned: 0, indicatorPlans: {} });
      const row = classPlans.get(key); row.planned += plan.classTotal;
      for (const item of plan.items || []) row.indicatorPlans[item.categoryCode] = (row.indicatorPlans[item.categoryCode] || 0) + item.count;
    }
  }
  const events = ctx.metadata.filter(r => r.record_kind === 'AUDIT').map(r => ({ ...r, p: parse(r.payload_json), at: resolveSourceInstant(r, ctx.baseline).occurredAt }));
  for (const q of ctx.metadata.filter(r => r.record_kind === 'QUOTA')) {
    const p = parse(q.payload_json), created = resolveSourceInstant(q, ctx.baseline).occurredAt;
    if (created && created > ctx.asOf) continue;
    if (ctx.currentSnapshot) { quota += p.quotaTotal; planned += (p.plans || []).reduce((n, v) => n + v.classTotal, 0); addPlans(p.plans); continue; }
    const changes = events.filter(a => String(a.parent_id) === String(q.id) && a.p.action === 'QUOTA_CHANGE' && a.at && a.at <= ctx.asOf);
    const plans = events.filter(a => String(a.parent_id) === String(q.id) && a.p.action === 'PLAN_SAVE' && a.at && a.at <= ctx.asOf);
    if (changes.length) quota += changes.at(-1).p.newTotal; else quotaKnown = false;
    if (plans.length) { planned += plans.at(-1).p.plans.reduce((n, v) => n + v.classTotal, 0); addPlans(plans.at(-1).p.plans); }
    else if (p.planVersion !== 0) {
      const firstPlan = events.find(a => String(a.parent_id) === String(q.id) && a.p.action === 'PLAN_SAVE');
      if (!(firstPlan?.p.planVersion === 1 && firstPlan.at > ctx.asOf)) planKnown = false;
    }
  }
  return { quota: quotaKnown ? quota : null, planned: planKnown ? planned : null, classPlans, historyCompleteness: { quota: quotaKnown ? 'FULL' : 'UNKNOWN', plan: planKnown ? 'FULL' : 'UNKNOWN', cardState: 'FULL' } };
}
function pageSpec(ctx, args, view) {
  const limit = Number(args.limit || 25); if (![25, 50, 100].includes(limit)) fail(422, '分页大小需为25/50/100');
  const hash = stableHash({ schoolId: ctx.actor.schoolId, filters: ctx.f, view });
  let offset = 0;
  if (args.cursor) {
    try { const p = JSON.parse(Buffer.from(args.cursor, 'base64url').toString()); if (p.hash !== hash || !Number.isSafeInteger(p.offset) || p.offset < 0) throw Error(); offset = p.offset; } catch { fail(422, '分页游标与查询条件不匹配'); }
  }
  return { limit, offset, next: total => total > offset + limit ? Buffer.from(JSON.stringify({ hash, offset: offset + limit })).toString('base64url') : null };
}
async function collect(ctx, { select, page }) {
  const overall = emptyCounts(), filtered = emptyCounts(), classes = new Map(), rows = [];
  let total = 0;
  for await (const row of scan(ctx)) {
    if (!row.attributionMonth) { overall.unknownTimeCount++; if (row.kind === 'DIRECT') overall.net = null; continue; }
    if (!monthMatches(row.attributionMonth, ctx.f)) continue;
    addCount(overall, row);
    const key = `${row.grade}:${row.classNo}`;
    if (!classes.has(key)) classes.set(key, { grade: row.grade, classNo: row.classNo, ...emptyCounts() });
    addCount(classes.get(key), row);
    if (matches(row, ctx.f)) addCount(filtered, row);
    for (const item of select ? select(row) : []) { if (!page || total >= page.offset && rows.length < page.limit) rows.push(item); total++; }
  }
  const quantities = quotaValues(ctx);
  for (const [key, plan] of quantities.classPlans) {
    if (!classes.has(key)) classes.set(key, { grade: plan.grade, classNo: plan.classNo, ...emptyCounts() });
    Object.assign(classes.get(key), plan);
  }
  const normalizeCounts = counts => ({ ...counts, generatedRecords: counts.generated, generated: counts.unknownGenerationCount ? null : counts.generated });
  const { classPlans, ...totals } = quantities;
  const summary = { ...normalizeCounts(overall), ...totals, remaining: quantities.quota === null || overall.unknownGenerationCount ? null : quantities.quota - overall.generated, classRows: [...classes.values()].map(row => ({ ...normalizeCounts(row), planned: quantities.planned === null ? null : row.planned || 0, indicatorPlans: row.indicatorPlans || {} })), asOf: ctx.asOf, quotaScope: 'TEACHER_MONTH_RANGE' };
  if (overall.unknownStateCount) summary.historyCompleteness.cardState = 'PARTIAL';
  return { rows, total, summary, filteredSummary: normalizeCounts(filtered), asOf: ctx.asOf, nextCursor: page?.next(total) || null };
}
async function getLedgerSummary(args) { return snapshot(args, async ctx => { const result = await collect(ctx, {}); return { ...result.summary, filteredSummary: result.filteredSummary }; }); }
async function listLedgerCards(args) { return snapshot(args, ctx => collect(ctx, { page: pageSpec(ctx, args, 'cards'), select: row => row.kind === 'CARD' && matches(row, ctx.f) ? [row] : [] })); }
function eventsOf(row, ctx, sourceMode) {
  if (sourceMode !== 'all' && sourceMode !== row.sourceMode || !matches(row, ctx.f, { ignoreEventRange: true })) return [];
  const events = [];
  if (row.kind === 'DIRECT' || row.status === 'USED') {
    const at = row.kind === 'CARD' ? row.usedAt : row.occurredAt;
    if (!ctx.f.eventFrom && !ctx.f.eventTo || inRange(at, ctx.f.eventFrom, ctx.f.eventTo)) events.push({ ...row, id: row.id, delta: 1, occurredAt: at });
  }
  if (row.reversed && (!ctx.f.eventFrom && !ctx.f.eventTo || inRange(row.reversedAt, ctx.f.eventFrom, ctx.f.eventTo))) events.push({ ...row, id: row.reverseId, originalId: row.id, kind: 'REVERSAL', delta: -1, occurredAt: row.reversedAt });
  return events;
}
async function listLedgerUsage(args) {
  const groupBy = args.groupBy || 'event', sourceMode = args.sourceMode || 'all';
  if (!['event', 'student', 'indicator'].includes(groupBy) || !['paper', 'direct', 'all'].includes(sourceMode)) fail(422, '评价流向视图不合法');
  return snapshot(args, async ctx => {
    const page = pageSpec(ctx, args, 'usage:' + groupBy + ':' + sourceMode);
    const eventSummary = { positive: 0, reversals: 0, net: 0 };
    function selectedEvents(row) {
      const events = eventsOf(row, ctx, sourceMode);
      for (const event of events) { eventSummary.net += event.delta; if (event.delta > 0) eventSummary.positive++; else eventSummary.reversals++; }
      return events;
    }
    if (groupBy === 'event') {
      const result = await collect(ctx, { page, select: selectedEvents });
      result.eventSummary = eventSummary;
      result.summaryLabel = ctx.f.eventFrom || ctx.f.eventTo ? '筛选事件变动合计' : '按原评价归属月'; return result;
    }
    const groups = new Map();
    const result = await collect(ctx, { select: row => {
      for (const event of selectedEvents(row)) {
        const key = groupBy === 'student' ? event.studentId : event.categoryCode;
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, { id: key, studentId: groupBy === 'student' ? key : null, studentName: groupBy === 'student' ? event.studentName : null, categoryCode: groupBy === 'indicator' ? key : null, categoryName: groupBy === 'indicator' ? event.categoryName : null, positive: 0, reversals: 0, net: 0 });
        const g = groups.get(key); g.net += event.delta; if (event.delta > 0) g.positive++; else g.reversals++;
      }
      return [];
    } });
    const all = [...groups.values()].sort((a, b) => a.id.localeCompare(b.id, 'zh-CN', { numeric: true }));
    return { ...result, eventSummary, rows: all.slice(page.offset, page.offset + page.limit), total: all.length, nextCursor: page.next(all.length) };
  });
}
async function getLedgerCardDetail(args) {
  return snapshot(args, async ctx => {
    if (!id(String(args.sourceId || ''))) fail(422, '卡编号不合法');
    let found;
    for await (const row of scan(ctx)) if (row.kind === 'CARD' && row.id === String(args.sourceId) && matches(row, ctx.f)) { found = row; break; }
    if (!found) fail(404, '卡片不存在或不在查询范围');
    const history = [];
    if (found.generatedAt) history.push({ action: 'GENERATED', occurredAt: found.generatedAt, actorName: found.teacherName });
    if (found.usedAt) history.push({ action: 'REDEEMED', occurredAt: found.usedAt, actorName: found.studentName });
    if (found.voidedAt) history.push({ action: 'VOIDED', occurredAt: found.voidedAt, actorName: found.teacherName, reason: found.voidReason });
    if (found.reversed) history.push({ action: 'REVERSED', occurredAt: found.reversedAt, actorName: found.reversedBy, reason: found.reverseReason });
    for (const row of ctx.metadata.filter(r => r.record_kind === 'AUDIT')) {
      const p = parse(row.payload_json), at = resolveSourceInstant(row, ctx.baseline).occurredAt;
      if (p.action === 'PRINT_REQUEST' && Array.isArray(p.cardIds) && p.cardIds.map(String).includes(found.id) && at && at <= ctx.asOf) history.push({ action: 'PRINT_REQUEST', occurredAt: at, actorName: found.teacherName, requestId: String(row.id) });
    }
    history.sort((a, b) => (a.occurredAt || '').localeCompare(b.occurredAt || ''));
    return { ...found, history, asOf: ctx.asOf };
  });
}
async function listLedgerAudits(args) {
  return snapshot(args, async ctx => {
    const page = pageSpec(ctx, args, 'audits');
    const actions = ['QUOTA_CHANGE', 'PLAN_SAVE', 'CARD_GENERATE', 'CARD_VOID', 'PRINT_REQUEST'];
    const rows = ctx.metadata.filter(r => r.record_kind === 'AUDIT').map(r => ({ r, p: parse(r.payload_json), time: resolveSourceInstant(r, ctx.baseline) })).filter(v => actions.includes(v.p.action) && (!v.time.occurredAt || v.time.occurredAt <= ctx.asOf)).map(({ r, p, time }) => ({ id: String(r.id), action: p.action, quotaId: p.quotaId || null, sourceId: p.sourceId || null, monthKey: r.month_key, occurredAt: time.occurredAt, timeBasis: time.timeBasis, oldTotal: p.oldTotal ?? null, newTotal: p.newTotal ?? null, delta: p.delta ?? null, planVersion: p.planVersion ?? null, generated: p.generated ?? null, reason: p.reason || '' })).reverse();
    return { rows: rows.slice(page.offset, page.offset + page.limit), total: rows.length, nextCursor: page.next(rows.length), asOf: ctx.asOf };
  });
}
module.exports = { normalizeLedgerQuery, resolveSourceInstant, getLedgerSummary, listLedgerCards, listLedgerUsage, getLedgerCardDetail, listLedgerAudits };
// Export reads share the same repeatable-read snapshot and filters as the screen.
function exportView(view = 'events') {
  if (!['monthly', 'cards', 'students', 'indicators', 'events'].includes(view)) fail(422, '导出视图不合法');
  return view;
}
const exportColumns = {
  events: [['编号','id',true],['教师','teacherName'],['学生','studentName'],['学号','studentNumber',true],['归属月','attributionMonth'],['指标','categoryName'],['发生时间','occurredAt'],['变动分','delta'],['说明','reason']],
  cards: [['卡号','id',true],['教师','teacherName'],['学生','studentName'],['学号','studentNumber',true],['归属月','attributionMonth'],['年级','grade'],['班级','classNo'],['指标','categoryName'],['状态','status'],['净分','net']],
  students: [['学生编号','id',true],['学生','studentName'],['学号','studentNumber',true],['加分','positive'],['撤销','reversals'],['净分','net']],
  indicators: [['指标','categoryName'],['加分','positive'],['撤销','reversals'],['净分','net']],
  monthly: [['月份','month'],['教师','teacherName'],['已制卡','generated'],['已领取','redeemed'],['直评','direct'],['净分','net']],
};
async function exportRows(ctx, view, max) {
  let count = 0; const grouped = new Map();
  async function* rows() {
    for await (const row of scan(ctx)) {
      if (view === 'cards') { if (row.kind === 'CARD' && matches(row, ctx.f)) yield row; continue; }
      if (view === 'monthly') {
        if (!matches(row, ctx.f)) continue;
        const key = row.attributionMonth;
        if (!grouped.has(key)) grouped.set(key, { month: key, teacherName: ctx.owner.real_name, ...emptyCounts() });
        addCount(grouped.get(key), row); continue;
      }
      for (const event of eventsOf(row, ctx, 'all')) {
        if (view === 'events') { yield event; continue; }
        const key = view === 'students' ? event.studentId : event.categoryCode;
        if (!key) continue;
        if (!grouped.has(key)) grouped.set(key, { ...event, id: key, positive: 0, reversals: 0, net: 0 });
        const g = grouped.get(key); g.net += event.delta; g[event.delta > 0 ? 'positive' : 'reversals']++;
        if (grouped.size > max) fail(422, `最多导出${max}行，请缩小查询范围`);
      }
    }
    yield* grouped.values();
  }
  // Preflight counting never retains event/card rows; only bounded grouped views.
  for await (const row of rows()) { if (++count > max) fail(422, `最多导出${max}行，请缩小查询范围`); }
  return { count, grouped, iterate: grouped.size ? async function* () { yield* grouped.values(); } : rows };
}
function csvCell(value, textId = false) {
  if (value === null || value === undefined) value = '';
  if (typeof value !== 'number') {
    value = String(value);
    if (value && (textId || /^[\s]*[=+\-@\t\r\n]/.test(value))) value = "'" + value;
  }
  return '"' + String(value).replaceAll('"', '""') + '"';
}
async function writeResponse(response, chunk) {
  if (response.destroyed) throw Object.assign(new Error('下载连接已断开'), { code: 'CLIENT_DISCONNECTED' });
  if (!response.write(chunk)) await new Promise((resolve, reject) => {
    const clean = () => { response.off('drain', drained); response.off('close', closed); response.off('error', closed); };
    const drained = () => { clean(); resolve(); };
    const closed = () => { clean(); reject(new Error('下载连接已断开')); };
    response.once('drain', drained); response.once('close', closed); response.once('error', closed);
    if (response.destroyed) closed();
  });
}
async function streamLedgerCsv(args) {
  const view = exportView(args.view);
  return snapshot(args, async ctx => {
    const model = await exportRows(ctx, view, 50000), columns = exportColumns[view], response = args.response;
    if (response.destroyed) throw new Error('下载连接已断开');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="card-ledger.csv"');
    response.setHeader('Cache-Control', 'no-store');
    await writeResponse(response, '\uFEFF' + ['时区','Asia/Shanghai','截至',ctx.asOf,'筛选',JSON.stringify(ctx.f)].map(v => csvCell(v)).join(',') + '\r\n');
    await writeResponse(response, columns.map(c => csvCell(c[0])).join(',') + '\r\n');
    for await (const row of model.iterate()) await writeResponse(response, columns.map(c => csvCell(row[c[1]], c[2])).join(',') + '\r\n');
    response.end(); return { rowCount: model.count, asOf: ctx.asOf };
  });
}
const htmlText = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
async function getLedgerPrintModel(args) {
  const view = exportView(args.view);
  return snapshot(args, async ctx => {
    const model = await exportRows(ctx, view, 1000), columns = exportColumns[view], body = [];
    let net = 0;
    for await (const row of model.iterate()) { body.push('<tr>' + columns.map(c => '<td>' + htmlText(row[c[1]]) + '</td>').join('') + '</tr>'); net += row.delta ?? row.net ?? 0; }
    return { rowCount: model.count, asOf: ctx.asOf, html: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>卡片台账</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px sans-serif;color:#172b38}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:6px;white-space:pre-wrap;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}</style><h1>卡片台账</h1><p>Asia/Shanghai · 截至 ${htmlText(ctx.asOf)}</p><p>筛选：${htmlText(JSON.stringify(ctx.f))}</p><p>共 ${model.count} 行 · 筛选净分 ${net}</p><table><thead><tr>${columns.map(c => '<th>'+htmlText(c[0])+'</th>').join('')}</tr></thead><tbody>${body.join('')}</tbody></table></html>` };
  });
}
module.exports.streamLedgerCsv = streamLedgerCsv;
module.exports.getLedgerPrintModel = getLedgerPrintModel;
