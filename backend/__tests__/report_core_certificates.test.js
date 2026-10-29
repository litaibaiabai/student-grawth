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
