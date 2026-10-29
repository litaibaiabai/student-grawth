const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("award review generates labor outcomes and revocation recalculates; students cannot review", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  process.env.REPORT_FILES_DIR = await fs.mkdtemp(
    path.join(os.tmpdir(), "report-awards-"),
  );
  t.after(() =>
    fs.rm(process.env.REPORT_FILES_DIR, { recursive: true, force: true }),
  );
  const m = require("../services/reportCoreMaterials");
  const student = { id: "3", schoolId: "1", role: "student", tokenVersion: 1 },
    teacher = { ...student, id: "2", role: "teacher" };
  let n = 0;
  const cmd = () => ({
    requestKey: "award-" + ++n,
    payloadHash: String(n).padStart(64, "0"),
  });
  const award = await m.submitCertificate({
    pool: db.pool,
    actor: student,
    termId: "1",
    file: {
      buffer: Buffer.from("89504e470d0a1a0a00000000", "hex"),
      mimetype: "image/png",
    },
    command: cmd(),
  });
  const id = award.result.sourceId;
  await assert.rejects(
    m.decideCertificate({
      pool: db.pool,
      actor: student,
      sourceId: id,
      expectedRevision: "1",
      facts: {},
      targets: ["labor_outcome_grade"],
      manualOutputs: { labor_outcome_grade: "A" },
      reason: "实物核对",
      command: cmd(),
    }),
    { statusCode: 403 },
  );
  await m.decideCertificate({
    pool: db.pool,
    actor: teacher,
    sourceId: id,
    expectedRevision: "1",
    facts: { title: "劳动奖", issuer: "学校" },
    targets: ["labor_outcome_grade"],
    manualOutputs: { labor_outcome_grade: "A" },
    reason: "实物核对",
    command: cmd(),
  });
  assert.equal(
    (
      await db.pool.query(
        "SELECT labor_outcome_grade g FROM student_term_evaluation WHERE student_id=3",
      )
    )[0][0].g,
    "A",
  );
  await m.revokeCertificate({
    pool: db.pool,
    actor: student,
    sourceId: id,
    reason: "上传错误",
    command: cmd(),
  });
  assert.equal(
    (
      await db.pool.query(
        "SELECT labor_outcome_grade g FROM student_term_evaluation WHERE student_id=3",
      )
    )[0][0].g,
    null,
  );
});
test('upload_response_lost_replays_once without retaining an orphan private file',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const folder=await fs.mkdtemp(path.join(os.tmpdir(),'award-replay-'));process.env.REPORT_FILES_DIR=folder;t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const args={pool:db.pool,actor:{id:'3',schoolId:'1',role:'student',tokenVersion:1},termId:'1',file:{buffer:Buffer.from('89504e470d0a1a0a00000000','hex'),mimetype:'image/png'},command:{requestKey:'upload-lost',payloadHash:'a'.repeat(64)}};
 const first=await require('../services/reportCoreMaterials').submitCertificate(args);
 const retry=await require('../services/reportCoreMaterials').submitCertificate(args);
 assert.equal(retry.result.sourceId,first.result.sourceId);assert.equal(retry.replayed,true);
 const [[count]]=await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE source_type='CERTIFICATE' AND record_kind='ITEM'");assert.equal(Number(count.n),1);
 assert.equal((await fs.readdir(folder)).length,1);
});
test('retry_after_concurrent_recognition_is_rejected under the student lock',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const {addSource}=require('../services/reportCoreStore');
 const id=await addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',sourceType:'CERTIFICATE',kind:'ITEM',actorId:'3',status:'FAILED',key:['retry-race'],payload:{}});
 const lock=await db.pool.getConnection();await lock.beginTransaction();await lock.query('SELECT id FROM student_term_evaluation WHERE student_id=3 FOR UPDATE');
 let observed;const read=new Promise(resolve=>{observed=resolve;});
 const wrapped={query:async(...args)=>{const r=await db.pool.query(...args);if(args[0].includes("source_type IN ('STORY','CERTIFICATE')"))observed();return r;},getConnection:()=>db.pool.getConnection()};
 const pending=require('../services/reportCoreStories').retryStoryItem({pool:wrapped,actor:{id:'2',schoolId:'1',role:'teacher',tokenVersion:1},itemId:id,command:{requestKey:'retry-race',payloadHash:'a'.repeat(64)}});
 try {await read;await lock.query("UPDATE evaluation_source_record SET status='APPROVED',revision=revision+1 WHERE id=?",[id]);await lock.commit();}finally{lock.release();}
 await assert.rejects(pending,{statusCode:409});
 const [[row]]=await db.pool.query('SELECT status FROM evaluation_source_record WHERE id=?',[id]);assert.equal(row.status,'APPROVED');
});
test('reject and revoke racing never restore a withdrawn certificate',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const {addSource}=require('../services/reportCoreStore'),service=require('../services/reportCoreMaterials');
 const id=await addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',sourceType:'CERTIFICATE',kind:'ITEM',actorId:'3',status:'SUBMITTED',key:['reject-revoke'],payload:{}});
 const cmd=n=>({requestKey:'reject-revoke-'+n,payloadHash:String(n).padStart(64,'0')});
 const results=await Promise.allSettled([service.decideCertificate({pool:db.pool,actor:{id:'2',schoolId:'1',role:'teacher',tokenVersion:1},sourceId:id,expectedRevision:'1',reject:true,reason:'不符合材料',command:cmd(1)}),service.revokeCertificate({pool:db.pool,actor:{id:'3',schoolId:'1',role:'student',tokenVersion:1},sourceId:id,reason:'本人撤回',command:cmd(2)})]);
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.statusCode===409));
 const [[row]]=await db.pool.query('SELECT status FROM evaluation_source_record WHERE id=?',[id]);assert.equal(row.status,'REVOKED');
});
test('unrelated subject teacher cannot reject revoke or retry a certificate through direct URLs',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();await db.pool.query("DELETE FROM teacher_teaching_assignment WHERE subject_code<>'MATH'");await db.pool.query('UPDATE teacher_teaching_assignment SET is_head_teacher=0');
 const sourceId=await require('../services/reportCoreStore').addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',sourceType:'CERTIFICATE',kind:'ITEM',actorId:'3',status:'FAILED',key:['unrelated'],payload:{}});
 const actor={id:'2',schoolId:'1',role:'teacher',tokenVersion:1};let n=0;const command=()=>({requestKey:'unrelated-'+ ++n,payloadHash:String(n).padStart(64,'0')});
 const common={pool:db.pool,actor,sourceId,reason:'核对材料',expectedRevision:'1'};
 await assert.rejects(require('../services/reportCoreMaterials').decideCertificate({...common,reject:true,command:command()}),{statusCode:403});
 await assert.rejects(require('../services/reportCoreMaterials').revokeCertificate({...common,command:command()}),{statusCode:403});
 await assert.rejects(require('../services/reportCoreStories').retryStoryItem({...common,itemId:sourceId,command:command()}),{statusCode:403});
});
