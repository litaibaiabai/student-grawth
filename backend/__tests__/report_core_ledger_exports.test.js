const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { execFileSync } = require('node:child_process');
const ledger = require('../services/reportCoreLedger');
const cards = require('../services/reportCoreCards');
const { fixture, teacher, command } = require('./helpers/ledgerFixtures');
class Response extends Writable {
  constructor() { super(); this.headers = {}; this.chunks = []; this.headersSent = false; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  _write(chunk, encoding, done) { this.headersSent = true; this.chunks.push(Buffer.from(chunk)); done(); }
  get data() { return Buffer.concat(this.chunks); }
}
const parseCsv = buffer => JSON.parse(execFileSync('python3', ['-c', 'import csv,sys,json; print(json.dumps(list(csv.reader(sys.stdin))))'], { input: buffer.toString('utf8').replace(/^\uFEFF/, ''), encoding: 'utf8' }));
test('filtered CSV exports all 121 events with BOM, escaped text, safe formulas and text student numbers', async t => {
  const db = await fixture(t, 121);
  const [[source]] = await db.pool.query("SELECT id FROM evaluation_source_record WHERE record_kind='DIRECT' LIMIT 1");
  await cards.reverseSource({ pool: db.pool, actor: teacher, sourceId: String(source.id), reason: '更正', command: command() });
  const response = new Response();
  await ledger.streamLedgerCsv({ pool: db.pool, actor: teacher, filters: db.filters, view: 'events', response });
  assert.deepEqual(response.data.subarray(0, 3), Buffer.from([239, 187, 191]));
  const parsed = parseCsv(response.data), header = parsed.findIndex(row => row.includes('变动分'));
  assert.ok(header >= 0);
  const columns = parsed[header], rows = parsed.slice(header + 1).filter(row => row.length === columns.length);
  assert.equal(rows.length, 122);
  assert.equal(rows[0][columns.indexOf('教师')], '陈老师, "引号"\n下一行');
  assert.ok(rows.some(row => row[columns.indexOf('学生')] === "'=1+1"));
  assert.ok(rows.every(row => row[columns.indexOf('学号')] === "'0012"));
  assert.ok(rows.some(row => row[columns.indexOf('说明')].startsWith("'@x")));
  assert.ok(rows.some(row => row[columns.indexOf('变动分')] === '-1'));
  assert.ok(!/token_hash|token_ciphertext|password/i.test(response.data.toString()));
  await assert.rejects(ledger.streamLedgerCsv({ pool: db.pool, actor: { ...teacher, id: '3', role: 'student' }, filters: db.filters, view: 'events', response: new Response() }), { statusCode: 403 });
});
test('HTML ledger printing includes full filtered rows and escapes user content', async t => {
  const db = await fixture(t, 121);
  const result = await ledger.getLedgerPrintModel({ pool: db.pool, actor: teacher, filters: db.filters, view: 'events' });
  assert.equal(result.rowCount, 121);
  assert.match(result.html, /<thead>/);
  assert.match(result.html, /Asia\/Shanghai/);
  assert.ok(!result.html.includes('<script>alert(1)</script>'));
  assert.ok(result.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.match(result.html, /2026-10/);
});
test('50001-row CSV and more than 1000 print rows are rejected before any partial response', async t => {
  const db = await fixture(t, 50001), response = new Response();
  await assert.rejects(ledger.streamLedgerCsv({ pool: db.pool, actor: teacher, filters: db.filters, view: 'events', response }), { statusCode: 422 });
  assert.equal(response.headersSent, false); assert.equal(response.data.length, 0);
  await assert.rejects(ledger.getLedgerPrintModel({ pool: db.pool, actor: teacher, filters: db.filters, view: 'events' }), { statusCode: 422 });
});
test('filtered views agree and an interrupted download releases its connection', async t => {
  const db = await fixture(t, 121);
  const filtered = { ...db.filters, studentId: '3', categoryCode: 'CONDUCT_POLITENESS_OTHER_STAR' };
  for (const view of ['students', 'indicators', 'monthly']) {
    const result = await ledger.getLedgerPrintModel({ pool: db.pool, actor: teacher, filters: filtered, view });
    assert.equal(result.rowCount, 1);
  }
  const empty = await ledger.getLedgerPrintModel({ pool: db.pool, actor: teacher, filters: { ...filtered, studentId: '4' }, view: 'events' });
  assert.equal(empty.rowCount, 0);
  const response = new Response();
  response._write = function(chunk, encoding, done) { this.destroy(); done(); };
  await assert.rejects(ledger.streamLedgerCsv({ pool: db.pool, actor: teacher, filters: filtered, view: 'events', response }));
  const [[row]] = await db.pool.query('SELECT 1 AS healthy');
  assert.equal(Number(row.healthy), 1);
});
