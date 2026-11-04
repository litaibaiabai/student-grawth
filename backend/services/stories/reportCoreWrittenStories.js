const { assertScope } = require('../auth/authorizationService');
const { withMutation, addSource, parse, getTerm } = require('../core/reportCoreStore');
const { fail, collectionCutoff } = require('../core/reportCorePolicy');
const { isV2 } = require('../core/reportCoreV2Policy');
const { loadV2Statistics, enrolled } = require('../statistics/reportCoreV2Statistics');
const { extractStoryFile } = require('./reportCoreStoryDocument');

function studentOnly(actor, termId) {
  if (actor.role !== 'student') fail(403, '仅学生本人可查看和提交故事');
  if (!/^[1-9]\d*$/.test(String(termId))) fail(422, '请选择有效学期');
}
function normalizeText(value) {
  if (typeof value !== 'string') fail(422, '请填写故事正文或上传故事文档');
  const text = value.replace(/\r\n?/g, '\n').replaceAll('\0', '').trim();
  if (!text) fail(422, '故事没有可读取的正文，请粘贴文字或上传含文字的PDF、Word文档');
  if ([...text].length > 20000) fail(422, '故事正文最多20000字，请精简后提交');
  return text;
}
function originalNameOf(file) {
  if (!file) return null;
  let name = file.originalname || '我的故事';
  // Multipart filenames arrive as Latin-1 in multer, while browsers send UTF-8.
  if ([...name].every(char => char.codePointAt(0) <= 255)) {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD')) name = decoded;
  }
  return [...name.split(/[\\/]/).pop()].slice(0, 160).join('');
}
const workQuery = `SELECT w.id,w.created_at,v.payload_json FROM evaluation_source_record w
  JOIN evaluation_source_record v ON v.school_id=w.school_id AND v.id=w.current_version_id
    AND v.parent_id=w.id AND v.student_id=w.student_id AND v.term_id=w.term_id
  WHERE w.school_id=? AND w.term_id=? AND w.student_id=? AND w.schema_version='SIX_EDU_V2'
    AND w.event_type='WRITE_WORK' AND w.record_kind='BATCH' AND w.status='SUBMITTED'
    AND v.event_type='WRITE_SUBMISSION'`;
function storyDto(row, full = false) {
  const payload = parse(row.payload_json), text = payload.text || '';
  return { id: String(row.id), title: payload.title || '我的故事', originalName: payload.originalName || null,
    createdAt: row.created_at, wordCount: [...text].length, excerpt: [...text].slice(0, 80).join(''),
    ...(full ? { text } : {}) };
}
async function withStudentRead({ pool, actor, termId }, read) {
  studentOnly(actor, termId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await assertScope({ actor, studentKey: { schoolId: actor.schoolId, termId, studentId: actor.id }, action: 'material' }, connection);
    const term = await getTerm(connection, actor.schoolId, termId);
    if (!isV2(term.evaluation_config)) fail(422, '请选择六育V2学期');
    const result = await read(connection, term);
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function listWrittenStories({ pool, actor, termId, before, limit = 8 }) {
  const pageSize = Number(limit);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || before !== undefined && !/^[1-9]\d*$/.test(String(before))) fail(422, '故事列表分页参数不合法');
  return withStudentRead({ pool, actor, termId }, async (connection, term) => {
    const [rows] = await connection.query(`${workQuery}${before ? ' AND w.id<?' : ''} ORDER BY w.id DESC LIMIT ?`,
      [actor.schoolId, termId, actor.id, ...(before ? [before] : []), pageSize + 1]);
    const statistics = await loadV2Statistics(connection, { schoolId: actor.schoolId, termId });
    const me = statistics.storyByStudent[actor.id]?.WRITE;
    const cutoff = collectionCutoff(term);
    return {
      rows: rows.slice(0, pageSize).map(row => storyDto(row)),
      nextCursor: rows.length > pageSize ? String(rows[pageSize - 1].id) : null,
      ranking: { me: { rank: me?.rank ?? null, value: me?.value ?? 0 }, population: me?.population ?? 0 },
      collection: { open: term.business_phase === 'COLLECTING' && term.release_status === 'IDLE' && Date.now() < +cutoff,
        phase: term.business_phase, cutoff: cutoff.toISOString() },
    };
  });
}
async function getWrittenStory({ pool, actor, termId, storyId }) {
  if (!/^[1-9]\d*$/.test(String(storyId))) fail(404, '故事不存在');
  return withStudentRead({ pool, actor, termId }, async connection => {
    const [[row]] = await connection.query(`${workQuery} AND w.id=?`, [actor.schoolId, termId, actor.id, storyId]);
    if (!row) fail(404, '故事不存在');
    return storyDto(row, true);
  });
}
async function submitWrittenStory({ pool, actor, termId, text, file, command }) {
  studentOnly(actor, termId);
  // Check access before parsing. withMutation checks replay before the collection
  // window, so a lost response remains recoverable after collection has closed.
  await withStudentRead({ pool, actor, termId }, async () => {});
  if (file && typeof text === 'string' && text.trim()) fail(422, '每次请选择输入正文或上传文档其中一种方式');
  const content = normalizeText(file ? await extractStoryFile(file) : text);
  const originalName = originalNameOf(file);
  const title = [...(originalName ? originalName.replace(/\.(pdf|docx?)$/i, '') : content.split('\n')[0])].slice(0, 48).join('');
  return withMutation({ pool, actor, termId, studentIds: [actor.id], command, action: 'story-write' }, async (connection, term) => {
    if (!isV2(term.evaluation_config)) fail(422, '请选择六育V2学期');
    const scope = await assertScope({ actor, studentKey: { schoolId: actor.schoolId, termId, studentId: actor.id }, action: 'material' }, connection);
    if (!enrolled(scope.evaluation)) fail(403, '当前学籍状态不能提交故事');
    const common = { schoolId: actor.schoolId, termId, studentId: actor.id, actorId: actor.id, sourceType: 'STORY', schemaVersion: 'SIX_EDU_V2' };
    const id = await addSource(connection, { ...common, kind: 'BATCH', status: 'SUBMITTED', eventType: 'WRITE_WORK',
      key: ['WRITE_WORK', actor.id, command.requestKey], payload: { title } });
    const submissionId = await addSource(connection, { ...common, kind: 'ITEM', parentId: id, status: 'APPROVED',
      eventType: 'WRITE_SUBMISSION', numericValue: 1, submittedAt: new Date(),
      key: ['WRITE_SUBMISSION', id], payload: { title, text: content, originalName, inputMethod: file ? 'DOCUMENT' : 'TEXT' } });
    await connection.query('UPDATE evaluation_source_record SET current_version_id=? WHERE school_id=? AND id=?', [submissionId, actor.schoolId, id]);
    return { result: { id }, changedTargetsByStudent: { [actor.id]: ['story_write_star'] } };
  });
}
module.exports = { listWrittenStories, getWrittenStory, submitWrittenStory };
