const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createV2TestDb, command } = require('./helpers/reportCoreV2Db');
const { signToken } = require('../middleware/auth');

test('student catalog endpoint supplies 100 playable stories without awarding points', async t => {
  const db = await createV2TestDb(t);
  const server = require('../app').createApp({ pool: db.pool, schoolId: '1' }).listen(0);
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const [[user]] = await db.pool.query('SELECT * FROM users WHERE id=3');
  const headers = { Authorization: 'Bearer ' + signToken(user) };
  const url = `http://127.0.0.1:${server.address().port}/api/v1/report-core/v2`;
  const response = await fetch(url + '/catalog?termId=1', { headers });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.length, 100);
  assert.equal(new Set(data.map(s => s.id)).size, 100);
  assert.ok(data.every(s => s.title && s.durationMs > 1000 && !s.completed));
  const audio = await fetch(url + `/catalog/${data[0].id}/audio`, { headers });
  assert.equal(audio.status, 200);
  assert.match(audio.headers.get('content-type'), /audio/);
  assert.ok((await audio.arrayBuffer()).byteLength > 1000);
  assert.equal(Number((await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE event_type='LISTEN_COMPLETE'"))[0][0].n), 0);
});

test('only a complete uninterrupted timeline earns one point and immediately updates school rank', async t => {
  const db = await createV2TestDb(t);
  const listening = require('../services/stories/reportCoreListening');
  const args = { pool: db.pool, actor: db.actors.student, termId: '1' };
  const stories = await listening.listCatalog(args);
  let seq = 0;
  const start = async (actor = args.actor, storyId = stories[0].id) => (await listening.startListening({ ...args, actor, storyId, command: command('start-' + ++seq), now: new Date('2026-11-01T00:00:00Z') })).result;
  const s = await start();
  const beat = (position, playing, seconds = position, sessionId = s.sessionId, actor = args.actor) => listening.heartbeat({ ...args, actor, sessionId, position, playing, sampleMs:seconds*1000, command: command('beat-' + ++seq), now: new Date(+new Date('2026-11-01T00:00:00Z') + seconds * 1000) });
  const complete = (sessionId = s.sessionId, actor = args.actor) => listening.completeListening({ ...args, actor, sessionId, command: command('complete-' + ++seq) });
  await assert.rejects(complete(), { statusCode: 409 });
  await beat(0, true);
  const duration = stories[0].durationMs / 1000;
  await assert.rejects(beat(duration, false, 1), { statusCode: 409 });
  for (let p = 3; p < duration * .95; p += 3) await beat(p, true);
  await beat(duration * .95, false);
  await assert.rejects(complete(), { statusCode: 409 });
  assert.equal((await listening.listHistory(args)).length, 0);
  await beat(duration * .95, true);
  for (let p = Math.ceil(duration * .95 / 3) * 3; p < duration; p += 3) await beat(p, true);
  // A pause interval must never be counted as listening time.
  const last = Math.floor((duration - .001) / 3) * 3;
  await beat(last, false, duration + 1);
  await beat(last, true, duration + 40);
  await beat(duration, false, duration + 40 + duration - last);
  const completions = await Promise.all([complete(),complete()]);
  assert.equal(completions.filter(c => c.result.awarded).length, 1);
  const result = completions.find(c => c.result.awarded).result;
  assert.equal(result.awarded, true);
  assert.equal(result.ranking.me.value, 1);
  assert.equal(result.ranking.me.rank, 1);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].id, stories[0].id);
  assert.equal((await complete()).result.awarded, false);
  const replay = await start();
  assert.equal(replay.alreadyCompleted, true);
  const history = await listening.listHistory(args);
  assert.equal(history.length, 1);
  assert.equal(history[0].id, stories[0].id);
  assert.ok(history[0].completedAt);
  assert.equal((await listening.listHistory({...args,actor:db.actors.other})).length, 0);
  const stats = await require('../services/statistics/reportCoreV2Statistics').loadV2Statistics(db.pool, { schoolId:'1', termId:'1' });
  assert.equal(stats.storyByStudent['3'].LISTEN.value, 1);
  assert.equal(stats.storyByStudent['3'].LISTEN.rank, 1);
  await assert.rejects(beat(0, true, 0, s.sessionId, db.actors.other), { statusCode: 404 });
  await assert.rejects(start(db.actors.teacher), { statusCode: 403 });
  await db.pool.query("UPDATE academic_year SET business_phase='FROZEN'");
  await assert.rejects(start(args.actor, stories[1].id), { statusCode: 423 });
});

test('fast forwarding, offline gaps and another session cannot fill missing playback', async t => {
  const db = await createV2TestDb(t), listening = require('../services/stories/reportCoreListening');
  const args = { pool:db.pool, actor:db.actors.student, termId:'1' };
  const [story] = await listening.listCatalog(args);
  const now = new Date('2026-11-01T00:00:00Z');
  const first = (await listening.startListening({ ...args, storyId:story.id, now, command:command('first') })).result;
  await listening.heartbeat({ ...args, sessionId:first.sessionId, position:0, sampleMs:0, playing:true, now, command:command('play') });
  await assert.rejects(listening.heartbeat({ ...args, sessionId:first.sessionId, position:20, sampleMs:3000, playing:true, now:new Date(+now+3000), command:command('seek') }), {statusCode:409});
  await assert.rejects(listening.heartbeat({ ...args, sessionId:first.sessionId, position:3, sampleMs:60000, playing:true, now:new Date(+now+60000), command:command('offline') }), {statusCode:409});
  const second = (await listening.startListening({ ...args, storyId:story.id, now, command:command('second') })).result;
  await assert.rejects(listening.heartbeat({ ...args, sessionId:first.sessionId, position:0, sampleMs:0, playing:true, now, command:command('stale') }), {statusCode:409});
  await assert.rejects(listening.completeListening({ ...args, sessionId:second.sessionId, command:command('partial') }), {statusCode:409});
});

test('normal network latency changes do not reject complete real-time playback', async t => {
  const db = await createV2TestDb(t), listening = require('../services/stories/reportCoreListening');
  const args = {pool:db.pool,actor:db.actors.student,termId:'1'};
  const [story] = await listening.listCatalog(args), epoch = +new Date('2026-11-01T00:00:00Z');
  const {sessionId} = (await listening.startListening({...args,storyId:story.id,now:new Date(epoch),command:command('jitter-start')})).result;
  const beat = (position,sampleMs,receivedMs,playing=true) => listening.heartbeat({...args,sessionId,position,sampleMs,playing,now:new Date(epoch+receivedMs),command:command(`jitter-${sampleMs}`)});
  await beat(0,0,500);
  await beat(3,3000,3100);
  for(let position=6;position<story.durationMs/1000;position+=3) await beat(position,position*1000,position*1000+100);
  await beat(story.durationMs/1000,story.durationMs,story.durationMs+100,false);
  assert.equal((await listening.completeListening({...args,sessionId,command:command('jitter-complete')})).result.awarded,true);
});

test('school rankings update other students, share ties and preserve each students history', async t => {
  const db = await createV2TestDb(t), listening = require('../services/stories/reportCoreListening');
  const args = {pool:db.pool,actor:db.actors.student,termId:'1'};
  const stories = await listening.listCatalog(args);
  let seq = 0;
  const finish = async (actor, story) => {
    const now = +new Date('2026-11-01T00:00:00Z');
    const {sessionId} = (await listening.startListening({...args,actor,storyId:story.id,now:new Date(now),command:command('rank-start-'+ ++seq)})).result;
    for (let position = 0; position < story.durationMs/1000; position += 3)
      await listening.heartbeat({...args,actor,sessionId,position,playing:true,sampleMs:position*1000,now:new Date(now+position*1000),command:command('rank-beat-'+ ++seq)});
    await listening.heartbeat({...args,actor,sessionId,position:story.durationMs/1000,playing:false,sampleMs:story.durationMs,now:new Date(now+story.durationMs),command:command('rank-end-'+ ++seq)});
    return (await listening.completeListening({...args,actor,sessionId,command:command('rank-complete-'+ ++seq)})).result;
  };
  await finish(args.actor,stories[0]);
  const tied = await finish(db.actors.other,stories[0]);
  assert.equal(tied.ranking.me.rank,1);
  assert.equal(tied.ranking.population,2);
  assert.deepEqual(tied.ranking.top.map(s => s.rank),[1,1]);
  await finish(db.actors.other,stories[1]);
  const ranking = await listening.getRankings(args);
  assert.equal(ranking.me.rank,2);
  assert.equal(ranking.me.value,1);
  assert.deepEqual(ranking.top.map(s => [s.rank,s.value]),[[1,2],[2,1]]);
  assert.equal((await listening.listHistory(args)).length,1);
  assert.equal((await listening.listHistory({...args,actor:db.actors.other})).length,2);
});

test('simultaneous completions by different students persist both scores in the report projection', async t => {
  const db = await createV2TestDb(t), listening = require('../services/stories/reportCoreListening');
  const args = {pool:db.pool,termId:'1'}, actors = [db.actors.student,db.actors.other];
  const [story] = await listening.listCatalog({...args,actor:actors[0]}), epoch = +new Date('2026-11-01T00:00:00Z');
  const sessions = await Promise.all(actors.map(async actor => ({actor,sessionId:(await listening.startListening({...args,actor,storyId:story.id,now:new Date(epoch),command:command('parallel-start-'+actor.id)})).result.sessionId})));
  for(let position=0;position<story.durationMs/1000;position+=3) await Promise.all(sessions.map(s => listening.heartbeat({...args,...s,position,playing:true,sampleMs:position*1000,now:new Date(epoch+position*1000),command:command(`parallel-beat-${s.actor.id}-${position}`)})));
  await Promise.all(sessions.map(s => listening.heartbeat({...args,...s,position:story.durationMs/1000,playing:false,sampleMs:story.durationMs,now:new Date(epoch+story.durationMs),command:command('parallel-end-'+s.actor.id)})));
  await Promise.all(sessions.map(s => listening.completeListening({...args,...s,command:command('parallel-complete-'+s.actor.id)})));
  const [rows] = await db.pool.query('SELECT story_summary FROM student_term_evaluation ORDER BY student_id');
  assert.deepEqual(rows.map(r => r.story_summary.LISTEN.value),[1,1]);
  assert.deepEqual(rows.map(r => r.story_summary.LISTEN.rank),[1,1]);
  assert.deepEqual(rows.map(r => r.story_summary.LISTEN.population),[2,2]);
});
