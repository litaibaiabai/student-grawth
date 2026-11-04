const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCompletion } = require('../services/reports/reportCoreReadModels');

const config = fields => ({ schemaVersion: 'SIX_EDU_V2', applicableFields: fields });

test('V2 report completeness checks its current grade fields and does not require removed narrative forms', () => {
  const evaluation = { teacher_comment: '本学期认真学习，乐于合作。', math_regular_grade: null, jump_rope_1min: 0, field_sources: {} };
  const result = evaluateCompletion({ evaluation, config: config(['math_regular_grade', 'jump_rope_1min']) });
  assert.deepEqual(result.missingItems.map(item => item.field), ['math_regular_grade']);
  assert.deepEqual(result.sectionProgress.wisdom, { total: 1, complete: 0 });
  assert.deepEqual(result.sectionProgress.health, { total: 1, complete: 1 });
  assert.equal(result.narrativeReady, true);
});

test('a populated V2 process star still blocks publication until its source is settled', () => {
  const evaluation = { teacher_comment: '继续努力。', conduct_process_star: 3, field_sources: {} };
  const result = evaluateCompletion({ evaluation, config: config(['conduct_process_star']) });
  assert.equal(result.missingItems.length, 1);
  assert.equal(result.missingItems[0].field, 'conduct_process_star');
  assert.match(result.missingItems[0].reason, /结算/);
  assert.deepEqual(result.sectionProgress.conduct, { total: 1, complete: 0 });
});

test('documented not-applicable V2 items are excluded from completion denominators', () => {
  const evaluation = {
    teacher_comment: '按实际适用项目核对。', math_regular_grade: null, conduct_process_star: null,
    field_sources: { math_regular_grade: { notApplicable: true, reason: '本学期不适用' }, conduct_process_star: { notApplicable: true, reason: '入学前项目不适用' } },
  };
  const result = evaluateCompletion({ evaluation, config: config(['math_regular_grade', 'conduct_process_star']) });
  assert.deepEqual(result.missingItems, []);
  assert.deepEqual(result.sectionProgress.wisdom, { total: 0, complete: 0 });
  assert.deepEqual(result.sectionProgress.conduct, { total: 0, complete: 0 });
});

test('V2 self completion counts only applicable self stars and still requires the teacher comment', () => {
  const evaluation = { conduct_politeness_self_star: 2, teacher_comment: '', field_sources: {} };
  const result = evaluateCompletion({ evaluation, config: config(['conduct_politeness_self_star']) });
  assert.deepEqual(result.selfProgress, { total: 1, complete: 1 });
  assert.deepEqual(result.missingItems.map(item => item.field), ['teacher_comment']);
  assert.equal(result.narrativeReady, false);
});

test('V2 optional story activities may remain unrated, while a participating activity must have its projected star',()=>{
 const e={teacher_comment:'按实际参与记录。',story_write_star:null,story_listen_star:null,story_tell_star:null,story_summary:{WRITE:{participating:false},LISTEN:{participating:false},TELL:{participating:false}}};
 const c=config(['story_write_star','story_listen_star','story_tell_star']);
 assert.deepEqual(evaluateCompletion({evaluation:e,config:c}).missingItems,[]);
 e.story_summary.WRITE.participating=true;
 assert.deepEqual(evaluateCompletion({evaluation:e,config:c}).missingItems.map(r=>r.field),['story_write_star']);
 assert.equal(evaluateCompletion({evaluation:{...e,story_write_star:1},config:c,blockingMaterials:[{id:'pending'}]}).missingItems[0].field,'materials');
});

test('V2 current pending story version blocks release even without required legacy months',async t=>{
 const {createV2TestDb}=require('./helpers/reportCoreV2Db'),db=await createV2TestDb(t);
 const {addSource}=require('../services/core/reportCoreStore'),{getBlockingMaterials}=require('../services/reports/reportCoreReadModels');
 const common={schoolId:'1',termId:'1',studentId:'3',actorId:'3',schemaVersion:'SIX_EDU_V2',sourceType:'STORY'};
 const root=await addSource(db.pool,{...common,kind:'BATCH',status:'SUBMITTED',eventType:'TELL_WORK',key:['completion-work'],payload:{}});
 const pending=await addSource(db.pool,{...common,kind:'ITEM',parentId:root,status:'FAILED',eventType:'TELL_SUBMISSION',key:['completion-pending'],payload:{}});
 await db.pool.query('UPDATE evaluation_source_record SET current_version_id=? WHERE id=?',[pending,root]);
 const args={connection:db.pool,schoolId:'1',termId:'1',config:config(['story_tell_star'])};
 assert.deepEqual((await getBlockingMaterials(args)).map(r=>String(r.id)),[String(pending)]);
 await db.pool.query("UPDATE evaluation_source_record SET status='SCORED',numeric_value=0 WHERE id=?",[pending]);
 assert.deepEqual(await getBlockingMaterials(args),[]);
 const old=await addSource(db.pool,{...common,kind:'ITEM',parentId:root,status:'FAILED',eventType:'TELL_SUBMISSION',key:['completion-old-version'],payload:{}});
 assert.ok(old);assert.deepEqual(await getBlockingMaterials(args),[]);
});
