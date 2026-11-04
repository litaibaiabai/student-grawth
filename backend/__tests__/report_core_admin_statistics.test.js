const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createV2TestDb } = require('./helpers/reportCoreV2Db');
const { addSource } = require('../services/core/reportCoreStore');

async function fixture(t, config) {
  const db = await createV2TestDb(t, config);
  let serial = 0;
  const source = values => addSource(db.pool, { schoolId:'1', termId:'1', studentId:'3', schemaVersion:'SIX_EDU_V2',
    sourceType:'STORY', kind:'ITEM', status:'CONFIRMED', key:['statistics-fixture',++serial], ...values });
  return { ...db, source, args:{ pool:db.pool, actor:db.actors.manager, termId:'1' } };
}

test('student reward statistics use redeemed cards, remove reversals and retain zero-record students', async t => {
  const { args, source, pool } = await fixture(t);
  const { getAdminStatistics, getStudentRewardRecords } = require('../services/statistics/reportCoreAdminStatistics');
  await source({ sourceType:'CARD',kind:'DIRECT',delta:1,target:'chinese_process_star',actorId:'2' });
  const reversed = await source({ sourceType:'CARD',kind:'DIRECT',delta:1,target:'math_process_star',subjectCode:'MATH' });
  await source({ sourceType:'CARD',kind:'REVERSAL',delta:-1,originalId:reversed,target:'math_process_star' });
  const quota = await source({ sourceType:'CARD',kind:'QUOTA',studentId:null });
  await source({ sourceType:'CARD',kind:'CARD',status:'USED',delta:1,parentId:quota,ordinal:1,subjectCode:'CHINESE',target:'chinese_process_star',tokenHash:'a'.repeat(64),tokenCipher:'private-token',validFrom:new Date('2026-09-01'),validUntil:new Date('2027-01-01') });
  await source({ sourceType:'CARD',kind:'CARD',status:'UNUSED',delta:1,parentId:quota,ordinal:2,studentId:null,tokenHash:'b'.repeat(64),tokenCipher:'private-token',validFrom:new Date('2026-09-01'),validUntil:new Date('2027-01-01') });
  const result = await getAdminStatistics({...args,tab:'cards'});
  assert.equal(result.scope.students,2);
  assert.deepEqual(result.summary,{participants:1,cardCount:1,directCount:1,totalCount:2});
  assert.equal(result.rows.find(r => r.studentId==='4').totalCount,0);
  assert.equal(result.charts.subjects.find(r => r.subjectCode==='CHINESE').totalCount,2);
  assert.equal(result.charts.subjects.find(r => r.subjectCode==='MATH').totalCount,0);
  assert.equal((await getAdminStatistics({...args,tab:'cards',subjectCode:'MATH'})).summary.participants,0);
  const records = await getStudentRewardRecords({...args,studentId:'3',pageSize:1});
  assert.equal(records.pagination.total,2);
  assert.equal(records.rows.length,1);
  assert.doesNotMatch(JSON.stringify(records),/private-token|token_hash|payload_json/);
  await pool.query("UPDATE student_term_evaluation SET section_meta=JSON_OBJECT('enrollment',JSON_OBJECT('status','TRANSFERRED_OUT')) WHERE student_id=3");
  const excluded = await getAdminStatistics({...args,tab:'cards'});
  assert.equal(excluded.scope.students,1);
  assert.equal(excluded.summary.totalCount,0);
  await assert.rejects(getStudentRewardRecords({...args,studentId:'3'}),{statusCode:404});
});

test('self statistics use applicable student star items and keep completion and rating denominators independent', async t => {
  const fields=['conduct_politeness_self_star','conduct_integrity_self_star','conduct_kindness_self_star'];
  const {args,pool} = await fixture(t,{applicableFields:fields});
  const {getAdminStatistics}=require('../services/statistics/reportCoreAdminStatistics');
  await pool.query('UPDATE student_term_evaluation SET conduct_politeness_self_star=3,conduct_integrity_self_star=2,conduct_politeness_other_star=1 WHERE student_id=3');
  await pool.query('UPDATE student_term_evaluation SET conduct_politeness_self_star=1,conduct_integrity_self_star=3,conduct_kindness_self_star=2 WHERE student_id=4');
  const result=await getAdminStatistics({...args,tab:'self',state:'COMPLETE',keyword:'学生4'});
  assert.deepEqual(result.summary,{completed:1,inProgress:1,notStarted:0,notApplicable:0,eligible:2,completionRate:50,rated:5,stars:{1:1,2:2,3:2}});
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].studentId,'4');
  assert.equal(result.rows[0].total,3);
  await pool.query("UPDATE academic_year SET evaluation_config=JSON_SET(evaluation_config,'$.applicableFields',JSON_ARRAY()) WHERE id=1");
  const empty=await getAdminStatistics({...args,tab:'self'});
  assert.equal(empty.summary.notApplicable,2);
  assert.equal(empty.summary.completed,0);
  assert.equal(empty.summary.completionRate,null);
  assert.equal(empty.summary.rated,0);
});

test('reward subject metadata is grouped independently even when target keys match', async t => {
  const {args,source}=await fixture(t);
  const {getAdminStatistics}=require('../services/statistics/reportCoreAdminStatistics');
  await source({sourceType:'CARD',kind:'DIRECT',delta:1,target:'chinese_process_star',payload:{subjectCode:'CHINESE'}});
  await source({sourceType:'CARD',kind:'DIRECT',delta:1,target:'chinese_process_star',payload:{subjectCode:'MATH'}});
  await source({sourceType:'CARD',kind:'DIRECT',delta:1,target:'conduct_politeness_other_star'});
  await source({sourceType:'CARD',kind:'DIRECT',delta:1,target:'unknown_target'});
  const result=await getAdminStatistics({...args,tab:'cards'});
  for(const code of ['CHINESE','MATH','CONDUCT','UNASSIGNED']) assert.equal(result.charts.subjects.find(s=>s.subjectCode===code).directCount,1);
});

test('honor uploads reconcile every processing state and expose no private material content', async t => {
  const {args,source}=await fixture(t);
  const {getAdminStatistics}=require('../services/statistics/reportCoreAdminStatistics');
  for (const status of ['APPROVED','QUEUED','REJECTED','REVOKED','FAILED']) await source({sourceType:'CERTIFICATE',status,payload:{fileRef:'private/certificate.jpg',text:'private original text',facts:{awardRegion:'市级'},honor:{region:'市级'}}});
  const result=await getAdminStatistics({...args,tab:'honors'});
  assert.deepEqual(result.summary,{participants:1,totalCount:5,approved:1,pending:1,rejected:1,revoked:1,failed:1});
  assert.equal(result.charts.levels.find(r=>r.label==='市级').count,1);
  assert.equal(result.rows.find(r=>r.studentId==='4').totalCount,0);
  assert.doesNotMatch(JSON.stringify(result),/private\/certificate|private original text/);
});

test('story participation counts current recordings and root works once, independently of scoring', async t => {
  const {args,source,pool}=await fixture(t);
  const {getAdminStatistics}=require('../services/statistics/reportCoreAdminStatistics');
  await source({eventType:'TELL_RECORDING'});
  await source({eventType:'TELL_RECORDING',status:'REVOKED'});
  await source({eventType:'LISTEN_COMPLETE',studentId:'4'});
  await source({eventType:'LISTEN_SESSION',studentId:'4',status:'OPEN'});
  const root=await source({eventType:'WRITE_WORK',kind:'BATCH',status:'SUBMITTED'});
  await source({eventType:'WRITE_SUBMISSION',parentId:root,status:'SUPERSEDED',version:1,payload:{text:'private story old'}});
  const version=await source({eventType:'WRITE_SUBMISSION',parentId:root,status:'APPROVED',version:2,payload:{text:'private story new'}});
  await pool.query('UPDATE evaluation_source_record SET current_version_id=? WHERE id=?',[version,root]);
  const tellRoot=await source({eventType:'TELL_WORK',kind:'BATCH',studentId:'4',status:'SUBMITTED'});
  const tellVersion=await source({eventType:'TELL_SUBMISSION',parentId:tellRoot,studentId:'4',status:'SUBMITTED'});
  await pool.query('UPDATE evaluation_source_record SET current_version_id=? WHERE id=?',[tellVersion,tellRoot]);
  await source({eventType:'WRITE_WORK',kind:'BATCH',status:'SUBMITTED'}); // no current version: not a submitted work
  const result=await getAdminStatistics({...args,tab:'stories'});
  assert.deepEqual(result.summary,{participants:2,tellParticipants:2,listenParticipants:1,writeParticipants:1,tellCount:2,listenCount:1,writeCount:1});
  assert.doesNotMatch(JSON.stringify(result),/private story/);
});

test('statistics scope, detail search and pagination do not alter summary denominators; roles and inputs are enforced', async t => {
  const {args,pool,actors}=await fixture(t);
  const {getAdminStatistics}=require('../services/statistics/reportCoreAdminStatistics');
  await pool.query('UPDATE student_term_evaluation SET grade_snapshot=5,class_no_snapshot=2 WHERE student_id=4');
  const page=await getAdminStatistics({...args,tab:'cards',pageSize:1,page:2});
  assert.equal(page.rows[0].studentId,'4');
  assert.equal(page.pagination.total,2);
  const filtered=await getAdminStatistics({...args,tab:'self',grade:5,classNo:2,keyword:'missing'});
  assert.equal(filtered.scope.students,1);
  assert.equal(filtered.summary.notStarted,1);
  assert.equal(filtered.rows.length,0);
  assert.equal(filtered.filters.grades.length,2);
  for(const role of ['student','teacher']) await assert.rejects(getAdminStatistics({...args,actor:actors[role]}),{statusCode:403});
  await assert.rejects(getAdminStatistics({...args,actor:{...actors.manager,schoolId:'999'}}),{statusCode:404});
  for(const invalid of [{tab:'unknown'},{page:0},{pageSize:101},{grade:'4 OR 1=1'},{classNo:1},{subjectCode:'BAD'},{tab:'self',state:'BAD'}]) await assert.rejects(getAdminStatistics({...args,...invalid}),{statusCode:422});
  const zero=await getAdminStatistics({...args,tab:'stories',grade:6});
  assert.equal(zero.scope.students,0);
  assert.deepEqual(zero.rows,[]);
});

test('statistics HTTP endpoints require manager role and return private no-store responses', async t => {
  const {pool}=await fixture(t);
  const {createApp}=require('../app'),{signToken}=require('../middleware/auth');
  const server=createApp({pool,schoolId:'1'}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}));
  const request=async (id,path='statistics?termId=1&tab=self')=>{
    const [[user]]=await pool.query('SELECT * FROM users WHERE id=?',[id]);
    return fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/report-core/${path}`,{headers:{Authorization:`Bearer ${signToken(user)}`}});
  };
  assert.equal((await request('2')).status,403);
  const response=await request('1');
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal((await response.json()).data.scope.students,2);
  assert.equal((await request('1','statistics/rewards/3?termId=1')).status,200);
});
