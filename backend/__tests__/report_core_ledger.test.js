const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCoreTestDb } = require('./helpers/reportCoreDb');
const { recordUtcCutover } = require('../scripts/runCoreMigrations');
const cards = require('../services/reportCoreCards');
const ledger = require('../services/reportCoreLedger');
const teacher = { id: '2', schoolId: '1', role: 'teacher', tokenVersion: 1 };
const manager = { ...teacher, id: '1', role: 'manager' };
let seq = 0;
const command = () => ({ requestKey: 'ledger-' + ++seq, payloadHash: String(seq).padStart(64, '0') });
async function setup(t, count = 80, quota = 100) {
  const db = await createCoreTestDb(t); await db.seedBase();
  const connection = await db.pool.getConnection();
  try { await recordUtcCutover({ connection, targetDb: db.name, schoolId: '1', verifiedLegacyOffsetMinutes: 0 }); } finally { connection.release(); }
  const q = await cards.saveQuota({ pool: db.pool, actor: manager, termId: '1', teacherId: '2', monthKey: '2026-10', total: quota, command: command() });
  const quotaId = q.result.quotaId;
  await cards.savePlan({ pool: db.pool, actor: teacher, quotaId, expectedRevision: '1', plans: [{ grade: 4, classNo: 1, classTotal: count, items: [{ categoryCode: 'CONDUCT_POLITENESS_OTHER_STAR', count }] }], command: command() });
  await cards.generateCards({ pool: db.pool, actor: teacher, quotaId, expectedRevision: '2', command: command() });
  const [rawCards] = await db.pool.query("SELECT id,revision FROM evaluation_source_record WHERE record_kind='CARD' ORDER BY id");
  await db.pool.query("UPDATE evaluation_source_record SET created_at='2026-10-01 00:00:00'");
  const filters = ledger.normalizeLedgerQuery({ termId: '1', monthFrom: '2026-10', monthTo: '2026-10' }, teacher);
  return { ...db, quotaId, rawCards, filters };
}
test('ledger reconciles generated/redeemed/void/reversed counts and never exposes card credentials', async t => {
  const db = await setup(t);
  for (const row of db.rawCards.slice(0, 52)) {
    const token = await cards.cardToken({ pool: db.pool, actor: teacher, sourceId: String(row.id) });
    await cards.redeemCard({ pool: db.pool, actor: { ...teacher, id: '3', role: 'student' }, token, now: new Date('2026-10-15T00:00:00Z'), command: command() });
  }
  for (const row of db.rawCards.slice(0, 2)) await cards.reverseSource({ pool: db.pool, actor: teacher, sourceId: String(row.id), reason: '更正', command: command() });
  for (const row of db.rawCards.slice(78)) await cards.voidCard({ pool: db.pool, actor: teacher, sourceId: String(row.id), expectedRevision: '1', reason: '作废', command: command() });
  const summary = await ledger.getLedgerSummary({ pool: db.pool, actor: teacher, filters: db.filters, asOf: '2026-10-30T00:00:00Z' });
  assert.equal(summary.quota, 100); assert.equal(summary.planned, 80); assert.equal(summary.generated, 80);
  assert.equal(summary.redeemed, 52); assert.equal(summary.pending, 26); assert.equal(summary.voided, 2);
  assert.equal(summary.reversed, 2); assert.equal(summary.net, 50); assert.equal(summary.remaining, 20);
  assert.equal(summary.classRows[0].planned, 80);
  assert.equal(summary.pending + summary.future + summary.expired + summary.voided + summary.redeemed, summary.generated);
  const filtered = ledger.normalizeLedgerQuery({ termId: '1', monthFrom: '2026-10', monthTo: '2026-10', studentId: '3', status: 'USED' }, teacher);
  const page = await ledger.listLedgerCards({ pool: db.pool, actor: teacher, filters: filtered, limit: 25, asOf: '2026-10-30T00:00:00Z' });
  assert.equal(page.total, 52); assert.equal(page.rows.length, 25); assert.equal(page.filteredSummary.net, 50);
  assert.ok(!/token|cipher|password|teacher_comment|self_conduct_text/i.test(JSON.stringify(page)));
  const detail = await ledger.getLedgerCardDetail({ pool: db.pool, actor: teacher, filters: db.filters, sourceId: String(db.rawCards[78].id), asOf: '2026-10-30T00:00:00Z' });
  assert.equal(detail.voidReason, '作废');
  assert.ok(detail.history.some(event => event.action === 'VOIDED' && event.reason === '作废'));
});
test('ledger pagination includes cards after the old 100-row limit and binds cursors to the scope', async t => {
  const db = await setup(t, 121, 130);
  let cursor, ids = [];
  do {
    const page = await ledger.listLedgerCards({ pool: db.pool, actor: teacher, filters: db.filters, limit: 50, cursor, asOf: '2026-10-15T00:00:00Z' });
    assert.equal(page.total, 121); ids.push(...page.rows.map(row => row.id)); cursor = page.nextCursor;
  } while (cursor);
  assert.equal(new Set(ids).size, 121);
  const first = await ledger.listLedgerCards({ pool: db.pool, actor: teacher, filters: db.filters, limit: 25 });
  await assert.rejects(ledger.listLedgerCards({ pool: db.pool, actor: teacher, filters: { ...db.filters, categoryCode: 'MORAL_PROCESS_STAR' }, cursor: first.nextCursor, limit: 25 }), { statusCode: 422 });
  assert.throws(() => ledger.normalizeLedgerQuery({ termId: '1', teacherId: '999' }, teacher), { statusCode: 403 });
  assert.throws(() => ledger.normalizeLedgerQuery({ termId: '1' }, { ...teacher, role: 'student' }), { statusCode: 403 });
  await assert.rejects(ledger.getLedgerSummary({ pool: db.pool, actor: manager, filters: ledger.normalizeLedgerQuery({ termId: '1', teacherId: '999' }, manager) }), { statusCode: 404 });
});
test('ledger HTTP routes require a live role and provide safe card detail, audits and aggregates', async t => {
  const db = await setup(t, 2, 3);
  const server = require('../app').createApp({ pool: db.pool, schoolId: '1' }).listen(0);
  t.after(() => server.close());
  const { signToken } = require('../middleware/auth');
  const get = (path, actor = teacher) => fetch(`http://127.0.0.1:${server.address().port}/api/v1/report-core/card-ledger/${path}`, { headers: { Authorization: 'Bearer ' + signToken(actor) } });
  const suffix = '?termId=1&monthFrom=2026-10&monthTo=2026-10';
  for (const path of ['summary', 'cards', 'audits', 'usage?groupBy=student&termId=1&monthFrom=2026-10&monthTo=2026-10', 'cards/' + db.rawCards[0].id]) {
    const response = await get(path.includes('?') ? path : path + suffix);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(!/token|cipher|password|teacher_comment/i.test(JSON.stringify(body)));
    if (path === 'audits') assert.equal(body.data.rows.length, 3);
    if (path.startsWith('cards/')) assert.equal(body.data.studentId, null);
  }
  assert.equal((await get('summary' + suffix, { ...teacher, id: '3', role: 'student' })).status, 403);
  assert.equal((await get('summary' + suffix + '&teacherId=999')).status, 403);
});
test('cross-month reversals belong to original month while the event keeps its actual date', async t => {
  const db = await setup(t, 1, 1);
  const direct = await cards.directScore({ pool: db.pool, actor: teacher, termId: '1', studentIds: ['3'], categoryCode: 'MORAL_PROCESS_STAR', now: new Date('2026-09-30T16:00:00Z'), command: command() });
  assert.equal(direct.result.count, 1);
  const [[row]] = await db.pool.query("SELECT id FROM evaluation_source_record WHERE record_kind='DIRECT'");
  await cards.reverseSource({ pool: db.pool, actor: teacher, sourceId: String(row.id), reason: '跨月更正', command: command() });
  await db.pool.query("UPDATE evaluation_source_record SET created_at='2026-11-02 00:00:00' WHERE record_kind='REVERSAL'");
  const before = await ledger.getLedgerSummary({ pool: db.pool, actor: teacher, filters: db.filters, asOf: '2026-10-31T15:59:59Z' });
  const after = await ledger.getLedgerSummary({ pool: db.pool, actor: teacher, filters: db.filters, asOf: '2026-11-03T00:00:00Z' });
  assert.equal(before.net, 1); assert.equal(after.net, 0);
  const events = await ledger.listLedgerUsage({ pool: db.pool, actor: teacher, filters: db.filters, groupBy: 'event', sourceMode: 'direct', asOf: '2026-11-03T00:00:00Z' });
  assert.equal(events.rows.length, 2);
  assert.equal(events.rows.find(row => row.kind === 'REVERSAL').attributionMonth, '2026-10');
  assert.equal(events.rows.find(row => row.kind === 'REVERSAL').occurredAt, '2026-11-02T00:00:00.000Z');
  const changes = await ledger.listLedgerUsage({ pool: db.pool, actor: teacher, filters: { ...db.filters, eventFrom: '2026-11-01T00:00:00Z', eventTo: '2026-11-03T00:00:00Z' }, groupBy: 'event', sourceMode: 'direct', asOf: '2026-11-03T00:00:00Z' });
  assert.equal(changes.rows.length, 1);
  assert.equal(changes.eventSummary.net, -1);
});
test('historical asOf does not expose a future recipient or apply a later void; old unverified clock stays unknown', async t => {
  const db = await setup(t, 2, 2);
  const token = await cards.cardToken({ pool: db.pool, actor: teacher, sourceId: String(db.rawCards[0].id) });
  await cards.redeemCard({ pool: db.pool, actor: { ...teacher, id: '3', role: 'student' }, token, now: new Date('2026-10-20T00:00:00Z'), command: command() });
  await cards.voidCard({ pool: db.pool, actor: teacher, sourceId: String(db.rawCards[1].id), expectedRevision: '1', reason: '作废', command: command() });
  await db.pool.query("UPDATE evaluation_source_record SET payload_json=JSON_SET(payload_json,'$.voidedAt','2026-10-20T01:00:00.000Z') WHERE status='VOID'");
  const old = await ledger.listLedgerCards({ pool: db.pool, actor: teacher, filters: db.filters, asOf: '2026-10-15T00:00:00Z' });
  assert.equal(old.summary.redeemed, 0); assert.equal(old.summary.voided, 0); assert.equal(old.summary.pending, 2);
  assert.ok(old.rows.every(row => row.studentId === null));
  assert.deepEqual(ledger.resolveSourceInstant({ id: '1', record_kind: 'DIRECT', created_at: new Date('2026-10-01T08:00:00Z'), payload_json: {} }, { lastLegacySourceId: '10', verifiedLegacyOffsetMinutes: null }), { occurredAt: null, timeBasis: 'UNKNOWN' });
  assert.deepEqual(ledger.resolveSourceInstant({ id: '1', record_kind: 'DIRECT', created_at: new Date('2026-10-01T08:00:00Z'), payload_json: {} }, { lastLegacySourceId: '10', verifiedLegacyOffsetMinutes: 480 }), { occurredAt: '2026-10-01T00:00:00.000Z', timeBasis: 'VERIFIED_LEGACY' });
  await db.pool.query("DELETE FROM evaluation_source_record WHERE record_kind='AUDIT' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.action'))='QUOTA_CHANGE'");
  const unknown = await ledger.getLedgerSummary({ pool: db.pool, actor: teacher, filters: db.filters, asOf: '2026-10-15T00:00:00Z' });
  assert.equal(unknown.quota, null); assert.equal(unknown.historyCompleteness.quota, 'UNKNOWN');
  await db.pool.query("DELETE FROM evaluation_source_record WHERE record_kind='AUDIT' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.action'))='SOURCE_CLOCK_BASELINE'");
  const unknownCards = await ledger.getLedgerSummary({ pool: db.pool, actor: teacher, filters: db.filters, asOf: '2026-10-15T00:00:00Z' });
  assert.equal(unknownCards.generated, null);
  assert.equal(unknownCards.historyCompleteness.cardState, 'PARTIAL');
});
