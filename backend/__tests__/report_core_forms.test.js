const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("self and other columns stay independent, stale forms conflict, settlement distinguishes zero from missing", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const {
    submitForm,
    settleSources,
    getEvaluationView,
  } = require("../services/reportCoreEvaluation");
  const actor = { id: "3", schoolId: "1", role: "student", tokenVersion: 1 },
    teacher = { ...actor, id: "2", role: "teacher" };
  const studentKey = { schoolId: "1", termId: "1", studentId: "3" };
  let n = 0;
  const cmd = () => ({
    requestKey: "form-" + ++n,
    payloadHash: String(n).padStart(64, "0"),
  });
  await assert.rejects(
    submitForm({
      pool: db.pool,
      actor,
      studentKey,
      expectedRevision: "1",
      values: { music_learning_teacher_star: 3 },
      command: cmd(),
    }),
    { statusCode: 403 },
  );
  await submitForm({
    pool: db.pool,
    actor,
    studentKey,
    expectedRevision: "1",
    values: { conduct_politeness_self_star: 2 },
    command: cmd(),
  });
  await assert.rejects(
    submitForm({
      pool: db.pool,
      actor,
      studentKey,
      expectedRevision: "1",
      values: { conduct_politeness_self_star: 3 },
      command: cmd(),
    }),
    { statusCode: 409 },
  );
  await settleSources({
    pool: db.pool,
    actor: teacher,
    termId: "1",
    grade: 4,
    classNo: 1,
    targetKeys: ["conduct_politeness_other_star"],
    settlement: "CARD_CLOSED",
    expectedRevisions: { 3: "2", 4: "1" },
    command: cmd(),
  });
  const [[row]] = await db.pool.query(
    "SELECT * FROM student_term_evaluation WHERE student_id=3",
  );
  assert.equal(row.conduct_politeness_self_star, 2);
  assert.equal(row.conduct_politeness_other_star, 1);
  const view = await getEvaluationView({ pool: db.pool, actor, studentKey });
  assert.ok(!Object.hasOwn(view.values, "teacher_comment"));
});
test('late_score_after_settlement_invalidates_confirmation and award_after_no_award_requires_resolution',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const service=require('../services/reportCoreEvaluation'),cards=require('../services/reportCoreCards'),{addSource}=require('../services/reportCoreStore');
 const teacher={id:'2',schoolId:'1',role:'teacher',tokenVersion:1};let n=0;const command=()=>({requestKey:'late-'+ ++n,payloadHash:String(n).padStart(64,'0')});
 const revisions=async()=>Object.fromEntries((await db.pool.query('SELECT student_id,revision FROM student_term_evaluation'))[0].map(e=>[e.student_id,String(e.revision)]));
 await service.settleSources({pool:db.pool,actor:teacher,termId:'1',grade:4,classNo:1,targetKeys:['conduct_politeness_other_star'],settlement:'CARD_CLOSED',expectedRevisions:await revisions(),command:command()});
 await db.pool.query("UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=2,confirmed_at=UTC_TIMESTAMP(6),approval_fingerprint=? WHERE student_id=3",['a'.repeat(64)]);
 await cards.directScore({pool:db.pool,actor:teacher,termId:'1',studentIds:['3','4'],categoryCode:'CONDUCT_POLITENESS_OTHER_STAR',command:command(),now:new Date('2026-10-29T00:00:00Z')});
 const [[row]]=await db.pool.query('SELECT status,field_sources FROM student_term_evaluation WHERE student_id=3');assert.equal(row.status,'DRAFT');assert.equal(row.field_sources.conduct_politeness_other_star.raw,1);
 await service.settleSources({pool:db.pool,actor:teacher,termId:'1',grade:4,classNo:1,targetKeys:['labor_outcome_grade'],settlement:'NO_AWARD',expectedRevisions:await revisions(),command:command()});
 const sourceId=await addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',sourceType:'CERTIFICATE',kind:'ITEM',actorId:'3',status:'SUBMITTED',key:['late-award'],payload:{facts:{}}});
 let [[e]]=await db.pool.query('SELECT * FROM student_term_evaluation WHERE student_id=3');const [[term]]=await db.pool.query('SELECT * FROM academic_year WHERE id=1');term.evaluation_config=typeof term.evaluation_config==='string'?JSON.parse(term.evaluation_config):term.evaluation_config;
 assert.ok((await service.missingItems(db.pool,e,term)).some(i=>i.field==='materials'));
 await require('../services/reportCoreMaterials').decideCertificate({pool:db.pool,actor:teacher,sourceId,expectedRevision:'1',facts:{},targets:['labor_outcome_grade'],manualOutputs:{labor_outcome_grade:'A'},reason:'核对奖状',command:command()});
 [[e]]=await db.pool.query('SELECT * FROM student_term_evaluation WHERE student_id=3');assert.equal(e.labor_outcome_grade,'A');assert.equal(e.field_sources.labor_outcome_grade.noAward,false);
 await require('../services/reportCoreMaterials').revokeCertificate({pool:db.pool,actor:{...teacher,id:'3',role:'student'},sourceId,reason:'上传错误',command:command()});
 [[e]]=await db.pool.query('SELECT * FROM student_term_evaluation WHERE student_id=3');assert.ok((await service.missingItems(db.pool,e,term)).some(i=>i.field==='labor_outcome_grade'));
 await service.settleSources({pool:db.pool,actor:teacher,termId:'1',grade:4,classNo:1,targetKeys:['labor_outcome_grade'],settlement:'NO_AWARD',expectedRevisions:await revisions(),command:command()});
 [[e]]=await db.pool.query('SELECT * FROM student_term_evaluation WHERE student_id=3');assert.ok(!(await service.missingItems(db.pool,e,term)).some(i=>i.field==='labor_outcome_grade'));
});
