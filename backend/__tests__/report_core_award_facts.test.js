const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createV2TestDb, command } = require('./helpers/reportCoreV2Db');
const { addSource, parse } = require('../services/reportCoreStore');
const materials = require('../services/reportCoreMaterials');

test('V2 approval persists only the four honor facts and accepts an empty optional review note', async t => {
  const { pool, actors } = await createV2TestDb(t);
  const id = await addSource(pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',schemaVersion:'SIX_EDU_V2',status:'SUBMITTED',key:['minimal-award'],payload:{fileHash:'minimal-award-file',facts:{}}});
  const facts={title:'数学思维挑战赛',awardRegion:'市级',awardLevel:'一等奖',subjectCode:'MATH'};
  await materials.decideCertificate({pool,actor:actors.teacher,sourceId:id,expectedRevision:'1',facts:{...facts,issuer:'不再保存的单位',date:'2026-10-15',studentName:'学生3',certificateNo:'OLD'},command:command('minimal-award-approve')});
  const [[row]]=await pool.query('SELECT status,payload_json FROM evaluation_source_record WHERE id=?',[id]);
  assert.equal(row.status,'APPROVED');
  assert.deepEqual(parse(row.payload_json).facts,facts);
  assert.equal(parse(row.payload_json).reviewReason,'');
  const [[evaluation]]=await pool.query('SELECT honor_summary FROM student_term_evaluation WHERE student_id=3');
  assert.equal(parse(evaluation.honor_summary).items[0].region,'市级');
  assert.equal(parse(evaluation.honor_summary).items[0].level,'一等奖');
});

test('V2 approval validates geographic scope, prize and subject independently', async t => {
  const {pool,actors}=await createV2TestDb(t);
  const id=await addSource(pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',schemaVersion:'SIX_EDU_V2',status:'SUBMITTED',key:['invalid-award'],payload:{facts:{}}});
  const base={title:'校园绘画比赛',awardRegion:'区级',awardLevel:'其他',subjectCode:'FINE_ART'};
  for(const patch of [{awardRegion:'国家级'},{awardLevel:'省级'},{subjectCode:''},{subjectCode:'INVALID'}]) {
    await assert.rejects(materials.decideCertificate({pool,actor:actors.teacher,sourceId:id,expectedRevision:'1',facts:{...base,...patch},command:command(JSON.stringify(patch))}),{statusCode:422});
  }
  await materials.decideCertificate({pool,actor:actors.teacher,sourceId:id,expectedRevision:'1',facts:base,reason:'已核对原件',command:command('valid-other-award')});
  const [[row]]=await pool.query('SELECT payload_json FROM evaluation_source_record WHERE id=?',[id]);
  assert.equal(parse(row.payload_json).reviewReason,'已核对原件');
});

test('V2 recognition strips legacy certificate details before saving extracted facts', async t => {
  const {pool}=await createV2TestDb(t);
  const id=await addSource(pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',schemaVersion:'SIX_EDU_V2',status:'QUEUED',key:['recognition-minimal'],payload:{facts:{}}});
  await pool.query("UPDATE evaluation_source_record SET status='PROCESSING',lease_token='fixture-lease',locked_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 90 SECOND) WHERE id=?",[id]);
  const [[job]]=await pool.query('SELECT * FROM evaluation_source_record WHERE id=?',[id]);
  await materials.applyCertificateFacts({pool,job,leaseToken:'fixture-lease',result:{title:'科技创新比赛',awardRegion:'省级',awardLevel:'二等奖',subjectCode:'SCIENCE',issuer:'旧字段',date:'2026-10-15',studentName:'学生3',certificateNo:'REMOVE',evidence:['原件文字'],confidence:0.9}});
  const [[row]]=await pool.query('SELECT payload_json FROM evaluation_source_record WHERE id=?',[id]);
  assert.deepEqual(parse(row.payload_json).facts,{title:'科技创新比赛',awardRegion:'省级',awardLevel:'二等奖',subjectCode:'SCIENCE'});
});

test('a subject teacher cannot claim another subject award by changing the submitted subject', async t => {
  const {pool,actors}=await createV2TestDb(t);
  await pool.query("UPDATE teacher_teaching_assignment SET enabled=0 WHERE subject_code<>'MATH'");
  const original={title:'合唱艺术展演',awardRegion:'市级',awardLevel:'二等奖',subjectCode:'MUSIC'};
  const id=await addSource(pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',schemaVersion:'SIX_EDU_V2',status:'SUBMITTED',key:['subject-spoofing-award'],payload:{facts:original,fileHash:'music-certificate'}});
  for(const reject of [true,false]) {
    await assert.rejects(materials.decideCertificate({pool,actor:actors.teacher,sourceId:id,expectedRevision:'1',facts:{...original,subjectCode:'MATH'},reject,reason:'已核对',command:command('spoof-subject-'+reject)}),{statusCode:403});
  }
  const [[row]]=await pool.query('SELECT status,payload_json FROM evaluation_source_record WHERE id=?',[id]);
  assert.equal(row.status,'SUBMITTED');
  assert.equal(parse(row.payload_json).facts.subjectCode,'MUSIC');
  const ownFacts={...original,title:'数学挑战赛',subjectCode:'MATH'};
  const ownId=await addSource(pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',schemaVersion:'SIX_EDU_V2',status:'SUBMITTED',key:['own-subject-award'],payload:{facts:ownFacts,fileHash:'math-certificate'}});
  await assert.rejects(materials.decideCertificate({pool,actor:actors.teacher,sourceId:ownId,expectedRevision:'1',facts:{...ownFacts,subjectCode:'MUSIC'},command:command('move-to-other-subject')}),{statusCode:403});
  await materials.decideCertificate({pool,actor:actors.teacher,sourceId:ownId,expectedRevision:'1',facts:ownFacts,command:command('approve-own-subject')});
  const [[ownRow]]=await pool.query('SELECT status FROM evaluation_source_record WHERE id=?',[ownId]);
  assert.equal(ownRow.status,'APPROVED');
});
