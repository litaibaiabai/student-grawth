const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCoreTestDb } = require('./helpers/reportCoreDb');
const { withMutation } = require('../services/reportCoreStore');
const migrations = require('../scripts/runCoreMigrations');
test('every new pooled connection uses UTC before its first business query', async t => {
  const db = await createCoreTestDb(t);
  const connections = await Promise.all([db.pool.getConnection(), db.pool.getConnection(), db.pool.getConnection()]);
  try {
    for (const c of connections) {
      const [[clock]] = await c.query('SELECT @@session.time_zone zone,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW()) offsetSeconds');
      assert.equal(clock.zone, '+00:00'); assert.equal(Number(clock.offsetSeconds), 0);
    }
  } finally { connections.forEach(c => c.release()); }
});
test('explicit UTC cutover records a stable boundary once; default schema check never writes it', async t => {
  const db = await createCoreTestDb(t); await db.seedBase();
  await migrations.runCoreMigrations({ connection: db.pool, targetDb: db.name });
  const [[before]] = await db.pool.query('SELECT COUNT(*) n FROM evaluation_source_record');
  assert.equal(Number(before.n), 0);
  const c = await db.pool.getConnection();
  try {
    await c.query("SET time_zone='+08:00'");
    const args = { connection: c, targetDb: db.name, schoolId: '1', verifiedLegacyOffsetMinutes: 480 };
    const first = await migrations.recordUtcCutover(args), second = await migrations.recordUtcCutover(args);
    assert.equal(first.auditId, second.auditId);
    assert.equal(first.previousSessionOffsetMinutes, 480);
    assert.equal(first.lastLegacySourceId, '0');
    assert.equal(second.replayed, true);
    const [[n]] = await c.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.action'))='SOURCE_CLOCK_BASELINE'");
    assert.equal(Number(n.n), 1);
  } finally { await c.query("SET time_zone='+00:00'"); c.release(); }
});
test('exclusive term mutations prevent concurrent shared source writers', async t => {
  const db = await createCoreTestDb(t); await db.seedBase();
  const other = await db.pool.getConnection();
  try {
    await withMutation({ pool: db.pool, actor: { id: '1', schoolId: '1', role: 'manager', tokenVersion: 1 }, termId: '1', termLock: 'exclusive', action: 'exclusive-test', command: { requestKey: 'exclusive-1', payloadHash: 'a'.repeat(64) } }, async () => {
      await assert.rejects(other.query('SELECT id FROM academic_year WHERE id=1 FOR SHARE NOWAIT'), e => e.code === 'ER_LOCK_NOWAIT');
      return { result: { locked: true } };
    });
  } finally { other.release(); }
});
