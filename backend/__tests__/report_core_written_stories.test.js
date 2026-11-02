const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { createV2TestDb } = require('./helpers/reportCoreV2Db');
const { storyText, docx, pdf, doc } = require('./helpers/writtenStoryFixtures');

async function setup(t) {
  const db = await createV2TestDb(t);
  const server = require('../app').createApp({ pool: db.pool, schoolId: '1' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (suffix = '', body, actor = db.actors.student) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/report-core/v2/written-stories${suffix}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(actor ? { Authorization: `Bearer ${require('../middleware/auth').signToken(actor)}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
    });
    return { status: response.status, ...(await response.json()) };
  };
  const submit = (text, actor, requestKey = randomUUID()) => request('', { termId: '1', text, requestKey }, actor);
  const upload = (buffer, filename, type) => {
    const body = new FormData();
    body.set('termId', '1'); body.set('requestKey', randomUUID());
    body.set('file', new Blob([buffer], { type }), filename);
    return request('', body);
  };
  return { ...db, request, submit, upload };
}

test('written stories persist complete text, count immediately and replay a request only once', async t => {
  const { request, submit, pool } = await setup(t), key = randomUUID();
  const empty = await request('?termId=1');
  assert.equal(empty.status, 200);
  assert.equal(empty.data.ranking.me.value, 0);
  const first = await submit(storyText, undefined, key);
  assert.equal(first.status, 200, first.message);
  const replay = await submit(storyText, undefined, key);
  assert.equal(replay.data.result.id, first.data.result.id);
  assert.equal((await submit('同一个请求键的不同正文', undefined, key)).status, 409);
  const listing = await request('?termId=1');
  assert.equal(listing.data.rows.length, 1);
  assert.deepEqual(listing.data.ranking.me, { rank: 1, value: 1 });
  const detail = await request(`/${first.data.result.id}?termId=1`);
  assert.equal(detail.data.text, storyText);
  const [[evaluation]] = await pool.query('SELECT story_summary FROM student_term_evaluation WHERE student_id=3');
  assert.equal(evaluation.story_summary.WRITE.value, 1);
});

test('school writing ranks use counts with ties, while history is private and paginated', async t => {
  const { request, submit, actors } = await setup(t);
  const other = await submit('另一位同学的私密故事', actors.other);
  const first = await submit('我的第一篇');
  assert.equal(first.status, 200, first.message);
  assert.deepEqual((await request('?termId=1')).data.ranking.me, { rank: 1, value: 1 });
  await submit('另一位同学第二篇', actors.other);
  assert.deepEqual((await request('?termId=1')).data.ranking.me, { rank: 2, value: 1 });
  const second = await submit('我的第二篇');
  const listing = await request('?termId=1&limit=1');
  assert.deepEqual(listing.data.ranking.me, { rank: 1, value: 2 });
  assert.equal(listing.data.rows[0].id, second.data.result.id);
  const older = await request(`?termId=1&limit=1&before=${listing.data.nextCursor}`);
  assert.equal(older.data.rows[0].id, first.data.result.id);
  assert.equal(older.data.nextCursor, null);
  assert.equal((await request(`/${other.data.result.id}?termId=1`)).status, 404);
  assert.equal((await request(`/${first.data.result.id}?termId=1`, undefined, { ...actors.student, schoolId: '2' })).status, 401);
  assert.equal((await request('?termId=1&studentId=4')).data.rows.some(row => row.id === other.data.result.id), false);
  assert.equal((await request('?termId=1', undefined, actors.teacher)).status, 403);
  assert.equal((await request('?termId=1', undefined, null)).status, 401);
  assert.equal((await request('?termId=1&before=invalid')).status, 422);
});

test('real Chinese PDF, DOC and DOCX uploads save readable paragraphs as one story each', async t => {
  const { request, upload } = await setup(t);
  for (const [buffer, name, mime] of [
    [await pdf(), '校园故事.pdf', 'application/pdf'],
    [await docx(), '校园故事.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    [await doc(), '校园故事.doc', 'application/msword'],
  ]) {
    const result = await upload(buffer, name, mime);
    assert.equal(result.status, 200, result.message);
    const detail = await request(`/${result.data.result.id}?termId=1`);
    assert.match(detail.data.text, /放学后，我和同学一起给小树浇水。/);
    assert.match(detail.data.text, /\n/);
    assert.equal(detail.data.originalName, name);
  }
  assert.equal((await request('?termId=1')).data.ranking.me.value, 3);
});

test('empty, oversized, damaged or disguised stories never count and a closed term stays readable', async t => {
  const { request, submit, upload, pool } = await setup(t);
  assert.equal((await submit('  \n ')).status, 422);
  assert.equal((await submit('😀'.repeat(20001))).status, 422);
  assert.equal((await upload(Buffer.from('not a pdf'), 'fake.pdf', 'application/pdf')).status, 415);
  assert.equal((await upload(Buffer.from('PK\x03\x04broken'), 'broken.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).status, 422);
  assert.equal((await upload(Buffer.from(storyText), 'story.txt', 'text/plain')).status, 415);
  assert.equal((await upload(await pdf(''), 'empty.pdf', 'application/pdf')).status, 422);
  assert.equal((await upload(Buffer.alloc(10 * 1024 * 1024 + 1), 'large.pdf', 'application/pdf')).status, 413);
  const savedRequestKey = randomUUID();
  const saved = await submit('保留的故事', undefined, savedRequestKey);
  assert.equal(saved.status, 200);
  await pool.query("UPDATE academic_year SET business_phase='RECONCILING' WHERE id=1");
  const replay = await submit('保留的故事', undefined, savedRequestKey);
  assert.equal(replay.status, 200, 'a successful request must still replay if the response was lost before collection closed');
  assert.equal(replay.data.result.id, saved.data.result.id);
  assert.equal((await submit('截止后不能提交')).status, 423);
  const listing = await request('?termId=1');
  assert.equal(listing.status, 200);
  assert.equal(listing.data.collection.open, false);
  assert.equal(listing.data.ranking.me.value, 1);
});
