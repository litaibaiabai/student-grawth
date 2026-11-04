const path = require('node:path');
const { getTerm, withMutation, addSource, parse } = require('../core/reportCoreStore');
const { fail, stableHash } = require('../core/reportCorePolicy');
const { isV2 } = require('../core/reportCoreV2Policy');
const { loadV2Statistics, enrolled } = require('../statistics/reportCoreV2Statistics');
const builtin = require('../../assets/stories/catalog.json');
const studentOnly = actor => { if (actor.role !== 'student') fail(403, '仅学生可使用听故事活动'); };
const catalogLoads = new WeakMap();

async function ensureCatalog(pool, schoolId) {
  let schools = catalogLoads.get(pool);
  if (!schools) catalogLoads.set(pool, schools = new Map());
  if (!schools.has(schoolId)) {
    const task = pool.query(`INSERT INTO story_content
      (school_id,kind,stable_code,version,title,text_content,audio_ref,audio_duration_ms,asset_hashes,status,published_at)
      VALUES ? ON DUPLICATE KEY UPDATE id=id`, [builtin.map(s => [schoolId,'BUILTIN',s.code,1,s.title,s.text,s.audio,s.durationMs,JSON.stringify({audio:s.audioHash,text:stableHash(s.text)}),'PUBLISHED',new Date()])]);
    schools.set(schoolId, task);
    task.catch(() => schools.delete(schoolId));
  }
  await schools.get(schoolId);
}
async function checkStudent(connection, actor, termId) {
  studentOnly(actor);
  const term = await getTerm(connection, actor.schoolId, termId);
  if (!isV2(term.evaluation_config)) fail(422, '请选择六育 V2 学期');
  const [[row]] = await connection.query('SELECT section_meta FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?', [actor.schoolId,termId,actor.id]);
  if (!row || !enrolled(row)) fail(403, '不在当前学期学生名单中');
  return term;
}
async function listHistory({ pool, actor, termId }) {
  await checkStudent(pool, actor, termId);
  const [rows] = await pool.query(`SELECT s.id,s.title,s.audio_duration_ms durationMs,r.effective_at completedAt
    FROM evaluation_source_record r JOIN story_content s ON s.school_id=r.school_id AND s.id=r.story_content_id
    WHERE r.school_id=? AND r.term_id=? AND r.student_id=? AND r.schema_version='SIX_EDU_V2'
    AND r.event_type='LISTEN_COMPLETE' AND r.status='CONFIRMED' ORDER BY r.effective_at DESC,r.id DESC`, [actor.schoolId,termId,actor.id]);
  return rows.map(r => ({ ...r, id:String(r.id) }));
}
async function listCatalog(args) {
  const { pool, actor, termId } = args;
  await checkStudent(pool, actor, termId);
  await ensureCatalog(pool, actor.schoolId);
  const [rows] = await pool.query("SELECT id,stable_code code,title,audio_duration_ms durationMs FROM story_content WHERE school_id=? AND kind='BUILTIN' AND version=1 AND status='PUBLISHED' AND stable_code IN (?) ORDER BY stable_code", [actor.schoolId,builtin.map(s=>s.code)]);
  const history = new Set((await listHistory(args)).map(s => s.id));
  return rows.map(r => ({ ...r, id:String(r.id), completed:history.has(String(r.id)) }));
}
async function storyAudio({ pool, actor, storyId }) {
  studentOnly(actor);
  const [[story]] = await pool.query("SELECT stable_code,audio_ref FROM story_content WHERE school_id=? AND id=? AND kind='BUILTIN' AND version=1 AND status='PUBLISHED'", [actor.schoolId,storyId]);
  const asset = builtin.find(s => s.code === story?.stable_code && s.audio === story.audio_ref);
  if (!asset) fail(404, '故事音频不存在');
  return path.resolve(__dirname, '../../assets/stories', asset.audio);
}
async function getRankings({ pool, actor, termId, type = 'LISTEN' }) {
  await checkStudent(pool, actor, termId);
  if (!['LISTEN','WRITE','TELL'].includes(type)) fail(422, '故事类型不合法');
  const stats = await loadV2Statistics(pool, { schoolId:actor.schoolId, termId });
  const top = stats.roster.map(e => ({ ...stats.storyByStudent[e.student_id][type], displayName:String(e.student_name_snapshot).slice(0,1) + '同学', id:String(e.student_id) }))
    .filter(r => r.participating).sort((a,b) => a.rank-b.rank || a.id.localeCompare(b.id,undefined,{numeric:true})).slice(0,20)
    .map(({ id, ...r }) => ({ ...r, isMe:id === String(actor.id) }));
  const me = stats.storyByStudent[actor.id][type];
  return { me, population:me.population, top };
}
async function startListening({ pool, actor, termId, storyId, command, now = new Date() }) {
  await checkStudent(pool, actor, termId);
  return withMutation({ pool,actor,termId,command,studentIds:[actor.id],action:'listen-start' }, async c => {
    const [[story]] = await c.query("SELECT * FROM story_content WHERE school_id=? AND id=? AND kind='BUILTIN' AND version=1 AND status='PUBLISHED'", [actor.schoolId,storyId]);
    if (!story || !builtin.some(s => s.code === story.stable_code)) fail(404, '故事不存在');
    const effectKey = stableHash(['LISTEN_COMPLETE',actor.schoolId,String(termId),String(actor.id),story.stable_code]);
    const [[completed]] = await c.query('SELECT id FROM evaluation_source_record WHERE school_id=? AND effect_key=? FOR UPDATE', [actor.schoolId,effectKey]);
    // Starting a different player invalidates the old timeline, including other tabs.
    await c.query("UPDATE evaluation_source_record SET status='CANCELLED' WHERE school_id=? AND term_id=? AND student_id=? AND event_type='LISTEN_SESSION' AND status='OPEN'", [actor.schoolId,termId,actor.id]);
    if (completed) return { result:{ sessionId:null, alreadyCompleted:true } };
    const sessionId = await addSource(c, { schoolId:actor.schoolId,termId,studentId:actor.id,actorId:actor.id,sourceType:'STORY',kind:'ITEM',eventType:'LISTEN_SESSION',storyContentId:story.id,status:'OPEN',key:['LISTEN_SESSION',actor.id,command.requestKey],payload:{ storyCode:story.stable_code,durationMs:story.audio_duration_ms,positionMs:0,playedMs:0,sampleMs:null,startedAt:+now,playing:false,lastAt:+now,effectKey } });
    return { result:{ sessionId, alreadyCompleted:false } };
  });
}
async function ownSession(pool, actor, sessionId, lock = false) {
  studentOnly(actor);
  const [[session]] = await pool.query("SELECT * FROM evaluation_source_record WHERE school_id=? AND id=? AND student_id=? AND event_type='LISTEN_SESSION'" + (lock ? ' FOR UPDATE' : ''), [actor.schoolId,sessionId,actor.id]);
  if (!session) fail(404, '收听会话不存在');
  return session;
}
async function heartbeat({ pool, actor, sessionId, position, sampleMs, playing, command, now = new Date() }) {
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || typeof playing !== 'boolean' || typeof sampleMs !== 'number' || !Number.isFinite(sampleMs) || sampleMs < 0) fail(422, '播放进度不合法');
  const session = await ownSession(pool,actor,sessionId);
  return withMutation({ pool,actor,termId:session.term_id,command,studentIds:[actor.id],action:'listen-heartbeat' }, async c => {
    const current = await ownSession(c,actor,sessionId,true);
    if (current.status !== 'OPEN') fail(409, '收听会话已结束，请重新播放');
    const p = parse(current.payload_json), elapsed = +now-p.lastAt;
    const sampleElapsed = p.sampleMs === null ? 0 : sampleMs-p.sampleMs;
    const next = Math.round(position * 1000), delta = next-p.positionMs;
    // Compare media positions with monotonic capture times, not network arrival
    // times. Bound the entire capture clock by server time to reject sped-up data.
    if (elapsed < 0 || sampleElapsed < 0 || sampleMs > +now-p.startedAt+100 || next > p.durationMs+100 || delta < -50 ||
        (p.playing && (elapsed > 10000 || sampleElapsed > 10000 || delta > sampleElapsed+50)) ||
        (!p.playing && delta > 50)) fail(409, '收听进度不连续，请从头完整播放故事');
    const payload = { ...p, positionMs:Math.max(p.positionMs,Math.min(next,p.durationMs)), playedMs:p.playedMs+(p.playing?sampleElapsed:0), sampleMs, playing, lastAt:+now };
    await c.query('UPDATE evaluation_source_record SET payload_json=? WHERE school_id=? AND id=?', [JSON.stringify(payload),actor.schoolId,sessionId]);
    return { result:{ position:payload.positionMs/1000 } };
  });
}
async function completeListening({ pool, actor, sessionId, command, now = new Date() }) {
  const session = await ownSession(pool,actor,sessionId);
  const response = await withMutation({ pool,actor,termId:session.term_id,command,studentIds:[actor.id],action:'listen-complete',readCommitted:true }, async c => {
    const current = await ownSession(c,actor,sessionId,true), p = parse(current.payload_json);
    // Current reads are necessary after waiting for the term lock: a plain
    // SELECT may still see the transaction snapshot from before another finish.
    const [[existing]] = await c.query('SELECT id FROM evaluation_source_record WHERE school_id=? AND effect_key=? FOR UPDATE', [actor.schoolId,p.effectKey]);
    if (existing) return { result:{ awarded:false } };
    // 50ms accommodates media decoder rounding, never a percentage of the story.
    if (current.status !== 'OPEN' || p.playing || p.positionMs < p.durationMs-50 || p.playedMs < p.durationMs-100) fail(409, '请完整听完故事后再计分');
    await checkStudent(c,actor,current.term_id);
    await addSource(c, { schoolId:actor.schoolId,termId:current.term_id,studentId:actor.id,actorId:actor.id,sourceType:'STORY',kind:'ITEM',eventType:'LISTEN_COMPLETE',status:'CONFIRMED',storyContentId:current.story_content_id,effectKey:p.effectKey,key:['LISTEN_COMPLETE',p.effectKey],effectiveAt:now,numericValue:1,payload:{ sessionId,storyCode:p.storyCode } });
    await c.query("UPDATE evaluation_source_record SET status='COMPLETED' WHERE school_id=? AND id=?", [actor.schoolId,sessionId]);
    return { result:{ awarded:true }, changedTargetsByStudent:{ [actor.id]:['story_summary','story_listen_star'] } };
  });
  const [ranking, history] = await Promise.all([
    getRankings({pool,actor,termId:session.term_id}),
    listHistory({pool,actor,termId:session.term_id}),
  ]);
  return { ...response, result:{ ...response.result, ranking, history } };
}
module.exports = { listCatalog, listHistory, storyAudio, getRankings, startListening, heartbeat, completeListening };
