const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createV2TestDb } = require('./helpers/reportCoreV2Db');

// One second of actual PCM silence, including valid RIFF/fmt/data chunks.
function audioFixture() {
  const buffer = Buffer.alloc(44 + 16000);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(16000, 40);
  return buffer;
}
async function setup(t) {
  const db = await createV2TestDb(t);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'story-recordings-'));
  const previous = process.env.REPORT_FILES_DIR;
  process.env.REPORT_FILES_DIR = directory;
  t.after(async () => { if (previous === undefined) delete process.env.REPORT_FILES_DIR; else process.env.REPORT_FILES_DIR = previous; await fs.rm(directory, { recursive: true, force: true }); });
  const server = require('../app').createApp({ pool: db.pool, schoolId: '1' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (suffix = '?termId=1', body, actor = db.actors.student, extraHeaders = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/report-core/v2/story-recordings${suffix}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(actor ? { Authorization: 'Bearer ' + require('../middleware/auth').signToken(actor) } : {}), ...extraHeaders },
      body,
    });
    if (response.headers.get('content-type')?.startsWith('audio/')) return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) };
    return { status: response.status, headers: response.headers, ...(await response.json()) };
  };
  const upload = ({ actor, key = randomUUID(), durationMs = 1000, buffer = audioFixture(), mime = 'audio/wav', termId = '1' } = {}) => {
    const body = new FormData();
    body.set('termId', termId); body.set('requestKey', key); body.set('durationMs', String(durationMs));
    body.set('file', new Blob([buffer], { type: mime }), '我的故事.wav');
    return request('', body, actor);
  };
  return { ...db, request, upload, directory };
}

test('saved recordings persist privately, replay only once, and immediately count for school rank', async t => {
  const { request, upload, pool, directory } = await setup(t), key = randomUUID();
  const empty = await request();
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.ranking.me, { rank: null, value: 0 });
  const first = await upload({ key });
  assert.equal(first.status, 200, first.message);
  const replay = await upload({ key });
  assert.equal(replay.data.result.id, first.data.result.id);
  assert.equal(replay.data.replayed, true);
  assert.equal((await upload({ key, durationMs: 2000 })).status, 409);
  const listing = await request();
  assert.equal(listing.data.rows.length, 1);
  assert.equal(listing.data.rows[0].durationMs, 1000);
  assert.deepEqual(listing.data.ranking.me, { rank: 1, value: 1 });
  assert.equal(listing.data.ranking.population, 1);
  assert.equal(listing.data.rows[0].fileRef, undefined);
  const audio = await request(`/${first.data.result.id}/audio`);
  assert.equal(audio.status, 200);
  assert.deepEqual(audio.bytes, audioFixture());
  const part = await request(`/${first.data.result.id}/audio`, undefined, undefined, { Range: 'bytes=0-15' });
  assert.equal(part.status, 206);
  assert.deepEqual(part.bytes, audioFixture().subarray(0, 16));
  assert.match(audio.headers.get('cache-control'), /private/);
  assert.equal((await fs.readdir(directory)).length, 1);
  const [[term]] = await pool.query('SELECT data_revision FROM academic_year WHERE id=1');
  assert.equal(Number(term.data_revision), 2, 'the term starts at revision 1 and only the first save increments it');
  const [[evaluation]] = await pool.query('SELECT story_tell_star FROM student_term_evaluation WHERE student_id=3');
  assert.equal(evaluation.story_tell_star, null, 'counts must not be written as a legacy story score');
});

test('quantity ranks share ties, count every saved take, paginate privately, and exclude other terms and withdrawn pupils', async t => {
  const { request, upload, pool, actors } = await setup(t);
  const other = await upload({ actor: actors.other });
  const first = await upload();
  assert.deepEqual((await request()).data.ranking.me, { rank: 1, value: 1 });
  await upload({ actor: actors.other });
  assert.deepEqual((await request()).data.ranking.me, { rank: 2, value: 1 });
  const second = await upload();
  const listing = await request('?termId=1&limit=1');
  assert.deepEqual(listing.data.ranking.me, { rank: 1, value: 2 });
  assert.equal(listing.data.rows[0].id, second.data.result.id);
  const older = await request(`?termId=1&limit=1&beforeId=${listing.data.nextCursor}`);
  assert.equal(older.data.rows[0].id, first.data.result.id);
  assert.equal(older.data.nextCursor, null);
  assert.equal((await request(`/${other.data.result.id}/audio`)).status, 404);
  const ownOnly = await request('?termId=1&studentId=4');
  assert.equal(ownOnly.data.rows.some(row => row.id === other.data.result.id), false);
  await pool.query("UPDATE student_term_evaluation SET section_meta=JSON_OBJECT('enrollment',JSON_OBJECT('status','TRANSFERRED_OUT')) WHERE student_id=4");
  assert.equal((await request()).data.ranking.population, 1);
  assert.equal((await upload({ actor: actors.other })).status, 403);
  assert.equal((await request('?termId=999')).status, 404);
  assert.equal((await request('?termId=1&beforeId=bad')).status, 422);
  assert.equal((await request('?termId=1&limit=1000')).status, 422);
});

test('recordings enforce authentication, student ownership, school isolation and collection closure', async t => {
  const { request, upload, pool, actors } = await setup(t), key = randomUUID();
  const saved = await upload({ key });
  assert.equal(saved.status, 200, saved.message);
  assert.equal((await request('?termId=1', undefined, null)).status, 401);
  assert.equal((await request('?termId=1', undefined, actors.teacher)).status, 403);
  assert.equal((await upload({ actor: actors.teacher })).status, 403);
  assert.equal((await request(`/${saved.data.result.id}/audio`, undefined, actors.other)).status, 404);
  assert.equal((await request(`/${saved.data.result.id}/audio`, undefined, { ...actors.student, schoolId: '2' })).status, 401);
  await pool.query("UPDATE academic_year SET business_phase='FROZEN' WHERE id=1");
  assert.equal((await upload()).status, 423);
  const replay = await upload({ key });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.result.id, saved.data.result.id);
  assert.equal((await request()).data.collection.open, false);
  assert.equal((await request(`/${saved.data.result.id}/audio`)).status, 200);
});

test('invalid, empty, disguised and oversized audio never creates records or leaves private files', async t => {
  const { request, upload, directory } = await setup(t);
  for (const data of [
    { buffer: Buffer.alloc(0) },
    { buffer: Buffer.from('not an audio file'), mime: 'audio/webm' },
    { buffer: audioFixture(), mime: 'audio/mp4' },
    { buffer: Buffer.from('RIFF\0\0\0\0WAVEfmt '), mime: 'audio/wav' },
    { durationMs: 0 }, { durationMs: 300001 }, { durationMs: 'NaN' },
  ]) {
    const response = await upload(data);
    assert.ok([415, 422].includes(response.status), `${response.status}: ${response.message}`);
  }
  assert.equal((await upload({ buffer: Buffer.alloc(20 * 1024 * 1024 + 1) })).status, 413);
  assert.equal((await request()).data.ranking.me.value, 0);
  assert.deepEqual(await fs.readdir(directory), []);
});

test('a file write failure rolls back the record and permits a clean retry', async t => {
  const { request, upload, directory } = await setup(t), key = randomUUID();
  const blocked = path.join(directory, 'not-a-directory');
  await fs.writeFile(blocked, 'existing file');
  process.env.REPORT_FILES_DIR = blocked;
  assert.equal((await upload({ key })).status, 500);
  process.env.REPORT_FILES_DIR = directory;
  assert.equal((await request()).data.ranking.me.value, 0);
  assert.equal((await upload({ key })).status, 200);
  assert.equal((await request()).data.ranking.me.value, 1);
});

test('browser MP4 and Ogg audio remain playable without transcoding', async t => {
  const { request, upload } = await setup(t);
  for (const [filename, mime] of [['story-recording.m4a', 'audio/mp4'], ['story-recording.ogg', 'audio/ogg']]) {
    const buffer = await fs.readFile(path.join(__dirname, 'fixtures', filename));
    const saved = await upload({ buffer, mime });
    assert.equal(saved.status, 200, saved.message);
    const audio = await request(`/${saved.data.result.id}/audio`);
    assert.equal(audio.headers.get('content-type'), mime);
    assert.deepEqual(audio.bytes, buffer);
  }
  assert.equal((await request()).data.ranking.me.value, 2);
});

module.exports = { audioFixture };
