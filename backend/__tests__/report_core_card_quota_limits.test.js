const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCoreTestDb } = require('./helpers/reportCoreDb');
const cards = require('../services/reportCoreCards');
const { stableHash } = require('../services/reportCorePolicy');
const teacher = { id: '2', schoolId: '1', role: 'teacher', tokenVersion: 1 };
const manager = { ...teacher, id: '1', role: 'manager' };
let seq = 0;
const command = () => ({ requestKey: 'quota-regression-' + ++seq, payloadHash: stableHash(seq) });
async function setup(t) { const db = await createCoreTestDb(t); await db.seedBase(); return db; }
async function plan(db, { month = '2026-10', count = 2, categoryCode = 'CONDUCT_POLITENESS_OTHER_STAR', total = count } = {}) {
  const q = await cards.saveQuota({ pool: db.pool, actor: manager, termId: '1', teacherId: '2', monthKey: month, total, command: command() });
  const quotaId = q.result.quotaId;
  const saved = await cards.savePlan({ pool: db.pool, actor: teacher, quotaId, expectedRevision: '1', plans: [{ grade: 4, classNo: 1, classTotal: count, items: [{ categoryCode, count }] }], command: command() });
  return { quotaId, expectedRevision: saved.result.revision };
}
test('direct evaluations accept empty notes, replay once, reject non-text and roll back a mixed-scope batch', async t => {
  const db = await setup(t);
  const base = { pool: db.pool, actor: teacher, termId: '1', studentIds: ['3'], categoryCode: 'CONDUCT_POLITENESS_OTHER_STAR' };
  for (const reason of [undefined, null, '', '  ']) {
    const cmd = command();
    await cards.directScore({ ...base, reason, command: cmd });
    assert.equal((await cards.directScore({ ...base, reason, command: cmd })).replayed, true);
  }
  const [direct] = await db.pool.query("SELECT payload_json FROM evaluation_source_record WHERE record_kind='DIRECT'");
  assert.equal(direct.length, 4);
  for (const row of direct) assert.equal(JSON.parse(JSON.stringify(row.payload_json)).reason, '');
  for (const reason of [{}, 9, []]) await assert.rejects(cards.directScore({ ...base, reason, command: command() }), { statusCode: 422 });
  await db.pool.query('UPDATE student_term_evaluation SET class_no_snapshot=2 WHERE student_id=4');
  await assert.rejects(cards.directScore({ ...base, studentIds: ['3', '4'], command: command() }), { statusCode: 403 });
  const [[count]] = await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE record_kind='DIRECT'");
  assert.equal(Number(count.n), 4);
  const [[source]] = await db.pool.query("SELECT id FROM evaluation_source_record WHERE record_kind='DIRECT' LIMIT 1");
  await assert.rejects(cards.reverseSource({ pool: db.pool, actor: teacher, sourceId: String(source.id), reason: '', command: command() }), { statusCode: 403 });
});
test('quota cannot fall below saved plan and generation independently rejects an inconsistent quota', async t => {
  const db = await setup(t);
  const p = await plan(db, { total: 100, count: 80 });
  await assert.rejects(cards.saveQuota({ pool: db.pool, actor: manager, termId: '1', teacherId: '2', monthKey: '2026-10', total: 50, command: command() }), { statusCode: 422 });
  await db.pool.query("UPDATE evaluation_source_record SET payload_json=JSON_SET(payload_json,'$.quotaTotal',20) WHERE id=?", [p.quotaId]);
  await assert.rejects(cards.generateCards({ pool: db.pool, actor: teacher, ...p, command: command() }), { statusCode: 422 });
  const [[n]] = await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE record_kind='CARD'");
  assert.equal(Number(n.n), 0);
});
test('generation rechecks live subject assignments after saving a plan', async t => {
  const db = await setup(t);
  const p = await plan(db, { categoryCode: 'SCIENCE_PROCESS_STAR' });
  await db.pool.query("UPDATE teacher_teaching_assignment SET enabled=0 WHERE subject_code='SCIENCE'");
  await assert.rejects(cards.generateCards({ pool: db.pool, actor: teacher, ...p, command: command() }), { statusCode: 403 });
  const [[n]] = await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE record_kind='CARD'");
  assert.equal(Number(n.n), 0);
});
test('a paper card ID cannot be used as a quota to mutate its state or generate nested cards', async t => {
  const db = await setup(t), p = await plan(db, { count: 1 });
  await cards.generateCards({ pool: db.pool, actor: teacher, ...p, command: command() });
  const [[card]] = await db.pool.query("SELECT id,revision,status FROM evaluation_source_record WHERE record_kind='CARD'");
  const bad = { pool: db.pool, actor: teacher, quotaId: String(card.id), expectedRevision: String(card.revision), command: command() };
  await assert.rejects(cards.savePlan({ ...bad, plans: [{ grade: 4, classNo: 1, classTotal: 1, items: [{ categoryCode: 'CONDUCT_POLITENESS_OTHER_STAR', count: 1 }] }] }), { statusCode: 422 });
  await assert.rejects(cards.generateCards({ ...bad, command: command() }), { statusCode: 422 });
  const [[after]] = await db.pool.query('SELECT status,revision FROM evaluation_source_record WHERE id=?', [card.id]);
  assert.equal(after.status, 'UNUSED');
  assert.equal(String(after.revision), String(card.revision));
});
test('card periods use Shanghai calendar month and include the school last day', async t => {
  const db = await setup(t);
  for (const row of [
    ['2026-10', '2026-01-01', '2026-12-31', '2026-09-30T16:00:00.000Z', '2026-10-31T16:00:00.000Z'],
    ['2026-04', '2026-01-01', '2026-12-31', '2026-03-31T16:00:00.000Z', '2026-04-30T16:00:00.000Z'],
    ['2028-02', '2028-02-01', '2028-02-29', '2028-01-31T16:00:00.000Z', '2028-02-29T16:00:00.000Z'],
    ['2027-01', '2026-09-01', '2027-01-31', '2026-12-31T16:00:00.000Z', '2027-01-31T16:00:00.000Z'],
  ]) {
    await db.pool.query("UPDATE academic_year SET start_date=?,end_date=?,evaluation_config=JSON_SET(evaluation_config,'$.collectionDeadline',?)", [row[1], row[2], row[2]]);
    const p = await plan(db, { month: row[0], count: 1 });
    await cards.generateCards({ pool: db.pool, actor: teacher, ...p, command: command() });
    const [[card]] = await db.pool.query("SELECT valid_from,valid_until FROM evaluation_source_record WHERE parent_id=? AND record_kind='CARD'", [p.quotaId]);
    assert.equal(card.valid_from.toISOString(), row[3], row[0] + ' begins at school midnight');
    assert.equal(card.valid_until.toISOString(), row[4], row[0] + ' ends at next school midnight');
  }
});
test('quota, plan and generation audit history records actual before/after values without tokens', async t => {
  const db = await setup(t);
  const p = await plan(db, { total: 4, count: 2 });
  await cards.generateCards({ pool: db.pool, actor: teacher, ...p, command: command() });
  const [rows] = await db.pool.query("SELECT payload_json FROM evaluation_source_record WHERE record_kind='AUDIT'");
  const payloads = rows.map(r => typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json);
  const quota = payloads.find(p => p.action === 'QUOTA_CHANGE');
  assert.ok(quota);
  assert.equal(quota.oldTotal, 0);
  assert.equal(quota.newTotal, 4);
  assert.ok(payloads.some(p => p.action === 'PLAN_SAVE'));
  assert.ok(payloads.some(p => p.action === 'CARD_GENERATE'));
  assert.ok(!JSON.stringify(payloads).includes('token_ciphertext'));
});
test('void and redeem race has exactly one winner and never refunds issued quota', async t => {
  const db = await setup(t);
  const p = await plan(db, { count: 1 });
  await cards.generateCards({ pool: db.pool, actor: teacher, ...p, command: command() });
  const [[row]] = await db.pool.query("SELECT id,revision FROM evaluation_source_record WHERE record_kind='CARD'");
  const sourceId = String(row.id), token = await cards.cardToken({ pool: db.pool, actor: teacher, sourceId });
  await assert.rejects(cards.voidCard({ pool: db.pool, actor: manager, sourceId, expectedRevision: String(row.revision), reason: '错误', command: command() }), { statusCode: 403 });
  const outcomes = await Promise.allSettled([
    cards.voidCard({ pool: db.pool, actor: teacher, sourceId, expectedRevision: String(row.revision), reason: '重印前核对', command: command() }),
    cards.redeemCard({ pool: db.pool, actor: { ...teacher, id: '3', role: 'student' }, token, now: new Date('2026-10-15T00:00:00Z'), command: command() }),
  ]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  const [[card]] = await db.pool.query('SELECT status FROM evaluation_source_record WHERE id=?', [sourceId]);
  const [[quota]] = await db.pool.query('SELECT payload_json FROM evaluation_source_record WHERE id=?', [p.quotaId]);
  assert.ok(['VOID', 'USED'].includes(card.status));
  assert.equal(quota.payload_json.quotaTotal, 1);
});
