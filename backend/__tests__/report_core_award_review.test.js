const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createV2TestDb } = require('./helpers/reportCoreV2Db');
const { addSource } = require('../services/core/reportCoreStore');
const { listSources } = require('../services/core/reportCoreSources');

test('award review filters by the complete class before pagination', async t => {
  const { pool, actors } = await createV2TestDb(t);
  await pool.query("UPDATE student_term_evaluation SET class_no_snapshot=2 WHERE student_id=4");
  await pool.query("INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher) VALUES(1,1,2,4,2,'MORAL',1)");
  const first = await addSource(pool, { schoolId:'1', termId:'1', studentId:'3', actorId:'3', sourceType:'CERTIFICATE', kind:'ITEM', status:'SUBMITTED', schemaVersion:'SIX_EDU_V2', key:['class-one-award'], payload:{facts:{}} });
  await addSource(pool, { schoolId:'1', termId:'1', studentId:'4', actorId:'4', sourceType:'CERTIFICATE', kind:'ITEM', status:'SUBMITTED', schemaVersion:'SIX_EDU_V2', key:['class-two-award'], payload:{facts:{}} });
  const page = await listSources({ pool, actor:actors.teacher, termId:'1', grade:'4', classNo:'1', sourceType:'CERTIFICATE', recordKind:'ITEM', limit:1 });
  assert.deepEqual(page.rows.map(r => String(r.id)), [String(first)]);
  await assert.rejects(listSources({ pool, actor:actors.teacher, termId:'1', grade:'4' }), { statusCode:422 });
});

test('V2 subject teachers can review awards in their own subject only', async t => {
  const { pool, actors } = await createV2TestDb(t);
  await pool.query("UPDATE teacher_teaching_assignment SET enabled=0 WHERE subject_code<>'MATH'");
  for (const subjectCode of ['MATH', 'MUSIC']) {
    await addSource(pool, { schoolId:'1', termId:'1', studentId:'3', actorId:'3', sourceType:'CERTIFICATE', kind:'ITEM', status:'SUBMITTED', schemaVersion:'SIX_EDU_V2', key:['subject-award',subjectCode], payload:{facts:{subjectCode}} });
  }
  const page = await listSources({ pool, actor:actors.teacher, termId:'1', sourceType:'CERTIFICATE', recordKind:'ITEM' });
  assert.equal(page.rows.find(r => r.payload.facts.subjectCode === 'MATH').canRecognize, true);
  assert.equal(page.rows.find(r => r.payload.facts.subjectCode === 'MUSIC').canRecognize, false);
});
