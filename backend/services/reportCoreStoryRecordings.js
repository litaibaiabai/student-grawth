const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fail, collectionCutoff } = require('./reportCorePolicy');
const { assertScope } = require('./authorizationService');
const { getTerm, parse, withMutation, addSource } = require('./reportCoreStore');
const { isV2 } = require('./reportCoreV2Policy');
const { enrolled } = require('./reportCoreV2Statistics');
const { filePath, removePrivateFile } = require('../utils/privateFiles');

const MAX_BYTES = 20 * 1024 * 1024;
const recordingFilter = "schema_version='SIX_EDU_V2' AND source_type='STORY' AND record_kind='ITEM' AND event_type='TELL_RECORDING' AND status='CONFIRMED'";
const validId = value => /^[1-9]\d{0,19}$/.test(String(value));

function studentOnly(actor, termId) {
  if (actor.role !== 'student') fail(403, '仅学生本人可查看和保存录音');
  if (termId !== undefined && !validId(termId)) fail(422, '请选择有效学期');
}
async function scope(connection, actor, termId) {
  studentOnly(actor, termId);
  const term = await getTerm(connection, actor.schoolId, termId);
  if (!isV2(term.evaluation_config)) fail(422, '请选择六育V2学期');
  const access = await assertScope({ actor, studentKey: { schoolId: actor.schoolId, termId, studentId: actor.id }, action: 'material' }, connection);
  return { term, evaluation: access.evaluation };
}

// Identify actual audio containers, rather than accepting a browser-supplied
// extension or MIME alone. No speech recognition or transcoding is involved.
function audioType(file) {
  if (!Buffer.isBuffer(file?.buffer) || !file.buffer.length) fail(422, '录音没有声音数据，请重新录音');
  const bytes = file.buffer;
  if (bytes.length > MAX_BYTES) fail(413, '录音文件最大20MiB');
  const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  if (mime === 'audio/webm' && bytes.length > 128 && bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) && bytes.includes(Buffer.from('webm')) && bytes.includes(Buffer.from('A_OPUS')) && bytes.includes(Buffer.from('1f43b675', 'hex')))
    return { mime: 'audio/webm', ext: 'webm' };
  if (mime === 'audio/ogg' && bytes.length > 64 && bytes.subarray(0, 4).toString() === 'OggS' && (bytes.includes(Buffer.from('OpusHead')) || bytes.includes(Buffer.from('\x01vorbis'))))
    return { mime: 'audio/ogg', ext: 'ogg' };
  if (['audio/mp4', 'audio/x-m4a'].includes(mime) && bytes.length > 128 && bytes.subarray(4, 8).toString() === 'ftyp' && bytes.includes(Buffer.from('moov')) && bytes.includes(Buffer.from('mdat')) && (bytes.includes(Buffer.from('mp4a')) || bytes.includes(Buffer.from('Opus'))))
    return { mime: 'audio/mp4', ext: 'm4a' };
  if (['audio/wav', 'audio/wave', 'audio/x-wav'].includes(mime) && bytes.length > 44 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') {
    let position = 12, format = false, data = false;
    while (position + 8 <= bytes.length) {
      const size = bytes.readUInt32LE(position + 4), kind = bytes.subarray(position, position + 4).toString();
      if (position + 8 + size > bytes.length) break;
      if (kind === 'fmt ' && size >= 16) format = true;
      if (kind === 'data' && size > 0) data = true;
      position += 8 + size + size % 2;
    }
    if (format && data) return { mime: 'audio/wav', ext: 'wav' };
  }
  fail(415, '录音格式无法读取，请使用浏览器重新录音');
}

async function listRecordings({ pool, actor, termId, beforeId, limit = 20 }) {
  studentOnly(actor, termId);
  const size = Number(limit);
  if (!Number.isInteger(size) || size < 1 || size > 50 || beforeId !== undefined && !validId(beforeId)) fail(422, '录音列表分页参数不合法');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { term } = await scope(connection, actor, termId);
    const [records] = await connection.query(`SELECT id,payload_json,created_at FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? AND ${recordingFilter}${beforeId ? ' AND id<?' : ''} ORDER BY id DESC LIMIT ?`,
      [actor.schoolId, termId, actor.id, ...(beforeId ? [beforeId] : []), size + 1]);
    const [counts] = await connection.query(`SELECT student_id,COUNT(*) total FROM evaluation_source_record WHERE school_id=? AND term_id=? AND ${recordingFilter} GROUP BY student_id`, [actor.schoolId, termId]);
    const [roster] = await connection.query('SELECT student_id,section_meta FROM student_term_evaluation WHERE school_id=? AND term_id=?', [actor.schoolId, termId]);
    const activeIds = new Set(roster.filter(enrolled).map(row => String(row.student_id)));
    const activeCounts = counts.filter(row => activeIds.has(String(row.student_id)));
    const value = Number(counts.find(row => String(row.student_id) === actor.id)?.total || 0);
    const rank = value && activeIds.has(actor.id) ? 1 + activeCounts.filter(row => Number(row.total) > value).length : null;
    const cutoff = collectionCutoff(term);
    const result = {
      rows: records.slice(0, size).map(row => {
        const payload = parse(row.payload_json);
        return { id: String(row.id), title: payload.title || '我的故事', durationMs: payload.durationMs, mime: payload.mime, createdAt: row.created_at };
      }),
      nextCursor: records.length > size ? String(records[size - 1].id) : null,
      ranking: { me: { rank, value }, population: activeCounts.length },
      collection: { open: activeIds.has(actor.id) && term.business_phase === 'COLLECTING' && term.release_status === 'IDLE' && Date.now() < +cutoff, phase: term.business_phase, cutoff: cutoff.toISOString() },
    };
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function submitRecording({ pool, actor, termId, durationMs, file, command }) {
  studentOnly(actor, termId);
  const duration = Number(durationMs);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 300000) fail(422, '录音时长需大于0且不超过5分钟');
  const type = audioType(file);
  await scope(pool, actor, termId);
  let savedRef = null;
  try {
    // Keep one candidate file across withMutation's possible deadlock retries.
    const ref = crypto.randomUUID() + '.' + type.ext, target = filePath(ref);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const handle = await fs.open(target, 'wx', 0o600);
    savedRef = ref;
    try { await handle.writeFile(file.buffer); } finally { await handle.close(); }
    const result = await withMutation({ pool, actor, termId, studentIds: [actor.id], command, action: 'story-recording-save' }, async (connection, term) => {
      const { evaluation } = await scope(connection, actor, termId);
      if (!enrolled(evaluation)) fail(403, '当前学籍状态不能保存录音');
      const [[count]] = await connection.query(`SELECT COUNT(*) total FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? AND ${recordingFilter}`, [actor.schoolId, termId, actor.id]);
      const id = await addSource(connection, {
        schoolId: actor.schoolId, termId, studentId: actor.id, actorId: actor.id, sourceType: 'STORY', schemaVersion: 'SIX_EDU_V2',
        kind: 'ITEM', eventType: 'TELL_RECORDING', status: 'CONFIRMED', submittedAt: new Date(),
        key: ['TELL_RECORDING', termId, actor.id, command.requestKey],
        payload: { title: `我的第 ${Number(count.total) + 1} 个故事`, fileRef: ref, fileHash: crypto.createHash('sha256').update(file.buffer).digest('hex'), mime: type.mime, durationMs: duration },
      });
      await connection.query('UPDATE academic_year SET data_revision=data_revision+1 WHERE school_id=? AND id=?', [actor.schoolId, term.id]);
      return { result: { id } };
    });
    if (result.replayed) await removePrivateFile(savedRef);
    return result;
  } catch (error) {
    if (savedRef) await removePrivateFile(savedRef);
    throw error;
  }
}

async function getRecordingAudio({ pool, actor, recordingId }) {
  studentOnly(actor);
  if (!validId(recordingId)) fail(404, '录音不存在');
  const [[row]] = await pool.query(`SELECT term_id,payload_json FROM evaluation_source_record WHERE school_id=? AND student_id=? AND id=? AND ${recordingFilter}`, [actor.schoolId, actor.id, recordingId]);
  if (!row) fail(404, '录音不存在');
  await scope(pool, actor, row.term_id);
  const data = parse(row.payload_json), target = filePath(data.fileRef);
  try { await fs.access(target); } catch { fail(404, '录音文件暂不可用，请稍后再试'); }
  return { path: target, mime: data.mime, filename: `story-${recordingId}.${data.fileRef.split('.').pop()}` };
}

module.exports = { listRecordings, submitRecording, getRecordingAudio };
