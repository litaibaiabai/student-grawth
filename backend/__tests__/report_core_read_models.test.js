const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCoreTestDb } = require('./helpers/reportCoreDb');
const read = require('../services/reportCoreReadModels');
const teacher = { id:'2', schoolId:'1', role:'teacher', tokenVersion:1 }, manager = { ...teacher,id:'1',role:'manager' };
const narratives = Object.fromEntries(require('../services/reportCorePolicy').narratives.filter(n => n !== 'family_message').map(n => [n,'已填写']));
test('completion distinguishes unsettled zero, no-award, dynamic self ratings and optional family text', () => {
  const e = { ...narratives, conduct_politeness_other_star:1, labor_experience:null, field_sources:{}, sports_specialties:[{id:'s',name:'游泳',teacher_star:3}], art_specialties:[] };
  const config = { applicableFields:['conduct_politeness_other_star','labor_experience'] };
  assert.ok(read.evaluateCompletion({ evaluation:e, config, blockingMaterials:[] }).missingItems.some(m => m.reason.includes('结算')));
  e.field_sources = { conduct_politeness_other_star:{settled:true,points:0},labor_experience:{noAward:true} }; e.sports_specialties[0].self_star=1;
  assert.deepEqual(read.evaluateCompletion({evaluation:e,config,blockingMaterials:[]}).missingItems, []);
  assert.ok(read.evaluateCompletion({evaluation:e,config,blockingMaterials:[{id:'1',source_type:'STORY',status:'FAILED'}]}).missingItems.some(m=>m.field==='materials'));
});
test('workspace counts all 121 students once, pages tasks and returns no report body to administrators', async t => {
  const db=await createCoreTestDb(t); await db.seedBase();
  for(let i=5;i<124;i++) { await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(?,1,?,'not-login',?,'student')",[i,`student${i}`,`学生${i}`]); await db.pool.query("INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(1,1,?,?,4,1,'CORE_V1','1')",[i,`学生${i}`]); }
  await db.pool.query("UPDATE student_term_evaluation SET teacher_comment='私密寄语',height_cm=141 WHERE student_id=3");
  const result=await read.getWorkspace({pool:db.pool,actor:teacher,termId:'1',limit:25});
  assert.equal(result.counts.total,121); assert.equal(result.classRows[0].studentCount,121); assert.equal(result.tasks.length,25); assert.ok(result.nextCursor);
  assert.ok(!result.tasks.some(task=>task.canHandle&&(/_self_star$/.test(task.fieldKey)||/^self_/.test(task.fieldKey))));
  const admin=await read.getWorkspace({pool:db.pool,actor:manager,termId:'1'});
  assert.ok(!JSON.stringify(admin).includes('私密寄语')); assert.ok(!JSON.stringify(admin).includes('141')); 
  const student=await read.getWorkspace({pool:db.pool,actor:{...teacher,id:'3',role:'student'},termId:'1'}); assert.equal(student.counts.total,1);
  await assert.rejects(read.listTeachers({pool:db.pool,actor:teacher}),{statusCode:403});
  assert.equal((await read.listTeachers({pool:db.pool,actor:manager,q:'teacher'})).rows[0].id,'2');
});
test('new_term_account_does_not_change_old_term_manifest and disabled account does not drop enrollment', async t => {
  const db=await createCoreTestDb(t); await db.seedBase();
  await db.pool.query("UPDATE users SET status=1 WHERE id=3");
  await db.pool.query("INSERT INTO users(school_id,username,password,real_name,role) VALUES(1,'newstudent','not-login','新生','student')");
  assert.equal((await read.resolveTermRoster({connection:db.pool,schoolId:'1',termId:'1'})).length,2);
  assert.equal((await require('../services/reportCorePublish').getReadiness({pool:db.pool,actor:manager,termId:'1'})).counts.total,2);
});
test('removed_month_failed_item_no_longer_blocks_readiness and a draft never replaces the effective batch', async t => {
  const db=await createCoreTestDb(t);await db.seedBase();
  const add=require('../services/reportCoreStore').addSource;
  const base={schoolId:'1',termId:'1',studentId:'3',sourceType:'STORY',actorId:'3',monthKey:'2026-09'};
  const b=await add(db.pool,{...base,kind:'BATCH',status:'SUBMITTED',key:['batch']});
  await add(db.pool,{...base,kind:'ITEM',parentId:b,status:'FAILED',key:['item']});
  assert.equal((await read.getBlockingMaterials({connection:db.pool,schoolId:'1',termId:'1',config:{requiredMonths:['2026-10']}})).length,0);
  await add(db.pool,{...base,kind:'BATCH',status:'DRAFT',version:2,key:['draft']});
  assert.equal((await read.getBlockingMaterials({connection:db.pool,schoolId:'1',termId:'1',config:{requiredMonths:['2026-09']}})).length,1);
});
test('old_month_worker_result_does_not_advance_unrelated_report_revision', async t => {
  const db=await createCoreTestDb(t);await db.seedBase();
  const story=require('../services/reportCoreStories');let n=0;
  const command=()=>({requestKey:'removed-month-'+ ++n,payloadHash:String(n).padStart(64,'0')});
  const actor={...teacher,id:'3',role:'student'};
  const b=await story.saveStoryDraft({pool:db.pool,actor,termId:'1',monthKey:'2026-10',articles:['READ','LISTEN','TELL'].map(category=>({category,text:'我读了故事并学会帮助他人。'})),command:command()});
  await story.submitStoryBatch({pool:db.pool,actor,batchId:b.result.batchId,expectedRevision:'1',command:command()});
  const [job]=await require('../services/reportCoreWorker').claimAssessmentJobs({pool:db.pool,now:new Date(),limit:1});
  await db.pool.query("UPDATE academic_year SET evaluation_config=JSON_SET(evaluation_config,'$.requiredMonths',JSON_ARRAY()) WHERE id=1");
  const [[before]]=await db.pool.query('SELECT revision FROM student_term_evaluation WHERE student_id=3');
  await story.applyStoryResult({pool:db.pool,job,leaseToken:job.lease_token,contentHash:job.payload.contentHash,ruleVersion:'1',result:{dimensions:[20,20,20,20],total:80,evidence:[],feedback:'内容完整'}});
  const [[after]]=await db.pool.query('SELECT revision FROM student_term_evaluation WHERE student_id=3');
  assert.equal(after.revision,before.revision);
});
test('workspace material filters apply before pagination and retain real academic completion counts',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();
 await db.pool.query("UPDATE academic_year SET evaluation_config=JSON_SET(evaluation_config,'$.applicableFields',JSON_ARRAY('math_basic_knowledge_grade')) WHERE id=1");
 await db.pool.query("UPDATE student_term_evaluation SET math_basic_knowledge_grade='A' WHERE student_id=3");
 const add=require('../services/reportCoreStore').addSource;
 for(let i=0;i<26;i++)await add(db.pool,{schoolId:'1',termId:'1',studentId:'3',sourceType:'CERTIFICATE',actorId:'3',kind:'ITEM',status:'SUBMITTED',key:['workspace-cert',i]});
 const result=await read.getWorkspace({pool:db.pool,actor:teacher,termId:'1',taskType:'CERTIFICATE',subjectCode:'MATH',limit:25});
 assert.equal(result.tasks.length,25);assert.ok(result.tasks.every(t=>t.type==='CERTIFICATE'));assert.ok(result.nextCursor);
 assert.equal(result.counts.academicExpected,2);assert.equal(result.counts.academicComplete,1);
 const next=await read.getWorkspace({pool:db.pool,actor:teacher,termId:'1',taskType:'CERTIFICATE',subjectCode:'MATH',limit:25,cursor:result.nextCursor});assert.equal(next.tasks.length,1);
 await assert.rejects(read.getWorkspace({pool:db.pool,actor:teacher,termId:'1',taskType:'STORY',subjectCode:'MATH',cursor:result.nextCursor}),{statusCode:422});
});
test('specialty missing tasks name each property and route student, arts teacher and head to existing authorized editors',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const {getWorkspace,evaluateCompletion}=require('../services/reportCoreReadModels');
 await db.pool.query('UPDATE student_term_evaluation SET art_specialties=?,sports_specialties=? WHERE student_id=3',[JSON.stringify([{id:'art-1',name:'绘画',self_star:null,teacher_star:null}]),JSON.stringify([{id:'sport-1',name:'跳绳',self_star:3,teacher_star:null}])]);
 const [[u]]=await db.pool.query('SELECT password FROM users WHERE id=2');await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(5,1,'arts',?,'艺术老师','teacher')",[u.password]);await db.pool.query("INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code) VALUES(1,1,5,4,1,'FINE_ART')");
 const actor=(id,role='teacher')=>({id,schoolId:'1',role,tokenVersion:1});
 const student=await getWorkspace({pool:db.pool,actor:actor('3','student'),termId:'1',limit:100}),self=student.tasks.find(t=>t.fieldKey==='art_specialties');assert.equal(self.property,'self_star');assert.equal(self.itemId,'art-1');assert.equal(self.canHandle,true);
 for(const id of ['2','5']){const work=await getWorkspace({pool:db.pool,actor:actor(id),termId:'1',limit:100}),art=work.tasks.find(t=>t.fieldKey==='art_specialties');assert.equal(art?.property,'teacher_star');assert.equal(art.itemId,'art-1');assert.equal(art.canHandle,true);assert.equal(art.responsibilityStatus,'ASSIGNED');}
 const [[row]]=await db.pool.query('SELECT * FROM student_term_evaluation WHERE student_id=3');const missing=evaluateCompletion({evaluation:row}).missingItems.filter(m=>m.field==='art_specialties');assert.deepEqual(missing.map(m=>m.property).sort(),['self_star','teacher_star']);
});
