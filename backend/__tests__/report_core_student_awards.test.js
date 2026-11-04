const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createV2TestDb,command}=require('./helpers/reportCoreV2Db');
const {parse}=require('../services/core/reportCoreStore');
const materials=require('../services/materials/reportCoreMaterials');
const facts={title:'数学思维挑战赛',awardRegion:'市级',awardLevel:'一等奖',subjectCode:'MATH'};
async function setup(t) {
  const db=await createV2TestDb(t);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'student-awards-'));
  process.env.REPORT_FILES_DIR=directory;
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const file={buffer:await fs.readFile(path.join(__dirname,'../../docs/test-file/award01.jpeg')),mimetype:'image/jpeg'};
  return {...db,file};
}
test('a withdrawn image can be uploaded again, while an active duplicate remains one record',async t=>{
  const {pool,actors,file}=await setup(t);
  const upload=key=>materials.submitCertificate({pool,actor:actors.student,termId:'1',file,command:command(key)});
  const first=await upload('first-upload');
  const duplicate=await upload('duplicate-upload');
  assert.equal(duplicate.result.sourceId,first.result.sourceId);
  assert.equal(duplicate.result.duplicate,true);
  await materials.revokeCertificate({pool,actor:actors.student,sourceId:first.result.sourceId,expectedRevision:'1',reason:'重新选择奖状图片',command:command('withdraw')});
  const next=await upload('upload-after-withdrawal');
  assert.notEqual(next.result.sourceId,first.result.sourceId);
  const [rows]=await pool.query("SELECT status,payload_json FROM evaluation_source_record WHERE source_type='CERTIFICATE' ORDER BY id");
  assert.deepEqual(rows.map(r=>r.status),['REVOKED','QUEUED']);
  assert.deepEqual(parse(rows[1].payload_json).facts,{});
});
test('withdrawing a stale record cannot silently turn a just-approved award into a withdrawal request',async t=>{
  const {pool,actors,file}=await setup(t);
  const uploaded=await materials.submitCertificate({pool,actor:actors.student,termId:'1',file,command:command('upload')});
  await materials.decideCertificate({pool,actor:actors.teacher,sourceId:uploaded.result.sourceId,expectedRevision:'1',facts,command:command('approve')});
  await assert.rejects(materials.revokeCertificate({pool,actor:actors.student,sourceId:uploaded.result.sourceId,expectedRevision:'1',reason:'本人撤回',command:command('stale-withdraw')}),{statusCode:409});
  const [[row]]=await pool.query('SELECT status,payload_json FROM evaluation_source_record WHERE id=?',[uploaded.result.sourceId]);
  assert.equal(row.status,'APPROVED');
  assert.notEqual(parse(row.payload_json).withdrawalRequested,true);
});
test('retired award records stay retired and a reuploaded original can be approved once',async t=>{
  const {pool,actors,file}=await setup(t);
  const upload=key=>materials.submitCertificate({pool,actor:actors.student,termId:'1',file,command:command(key)});
  const first=await upload('first-original');
  await materials.decideCertificate({pool,actor:actors.teacher,sourceId:first.result.sourceId,expectedRevision:'1',facts,command:command('approve-original')});
  await materials.revokeCertificate({pool,actor:actors.teacher,sourceId:first.result.sourceId,reason:'原认定有误，重新提交',command:command('teacher-revoke')});
  await assert.rejects(materials.decideCertificate({pool,actor:actors.teacher,sourceId:first.result.sourceId,facts,command:command('restore-retired')}),{statusCode:409});
  const second=await upload('reupload-original');
  assert.notEqual(second.result.sourceId,first.result.sourceId);
  await materials.decideCertificate({pool,actor:actors.teacher,sourceId:second.result.sourceId,expectedRevision:'1',facts,command:command('approve-reupload')});
  const [[evaluation]]=await pool.query('SELECT honor_summary FROM student_term_evaluation WHERE student_id=3');
  assert.equal(parse(evaluation.honor_summary).items.length,1);
  assert.equal(parse(evaluation.honor_summary).points,3);
});
