const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createV2TestDb,command}=require('./helpers/reportCoreV2Db');
test('V2 certificates require human recognition, store the simplified facts once and revocation rebuilds honor summary',async t=>{
  const {pool,actors}=await createV2TestDb(t);
  const {addSource}=require('../services/core/reportCoreStore');
  const materials=require('../services/materials/reportCoreMaterials');
  const sourceId=await addSource(pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',schemaVersion:'SIX_EDU_V2',status:'SUBMITTED',payload:{facts:{},fileHash:'same-certificate',fileRef:'private-proof.png'},key:['certificate']});
  const facts={title:'少年讲故事比赛',awardRegion:'市级',awardLevel:'一等奖',subjectCode:'STORY'};
  await materials.decideCertificate({pool,actor:actors.teacher,sourceId,expectedRevision:'1',facts,reason:'已核验证书原件',command:command('decide')});
  const [[e]]=await pool.query('SELECT honor_summary FROM student_term_evaluation WHERE student_id=3');
  assert.equal(e.honor_summary.points,3);assert.equal(e.honor_summary.items[0].name,'少年讲故事比赛');
  const duplicate=await addSource(pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',schemaVersion:'SIX_EDU_V2',status:'SUBMITTED',payload:{facts:{},fileHash:'same-certificate',fileRef:'other-picture.png'},key:['duplicate-certificate']});
  await assert.rejects(materials.decideCertificate({pool,actor:actors.teacher,sourceId:duplicate,expectedRevision:'1',facts,reason:'同证不同照片',command:command('duplicate')}),{statusCode:409});
  await materials.revokeCertificate({pool,actor:actors.teacher,sourceId,reason:'原认定有误',command:command('revoke')});
  const [[after]]=await pool.query('SELECT honor_summary FROM student_term_evaluation WHERE student_id=3');
  assert.equal(after.honor_summary.points,0);assert.deepEqual(after.honor_summary.items,[]);
});
