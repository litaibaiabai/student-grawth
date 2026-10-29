const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("imports preview then commit exact field grades and health; stale previews cannot overwrite", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const {
    previewImport,
    commitImport,
  } = require("../services/reportCoreImports");
  const teacher = { id: "2", schoolId: "1", role: "teacher", tokenVersion: 1 },
    manager = { ...teacher, id: "1", role: "manager" };
  let n = 0;
  const cmd = () => ({
    requestKey: "import-" + ++n,
    payloadHash: String(n).padStart(64, "0"),
  });
  await assert.rejects(
    previewImport({
      pool: db.pool,
      actor: teacher,
      termId: "1",
      kind: "HEALTH",
      rows: [{ studentId: "3", values: { vision_left: "5.0" } }],
      command: cmd(),
    }),
    { statusCode: 403 },
  );
  const preview = await previewImport({
    pool: db.pool,
    actor: manager,
    termId: "1",
    kind: "HEALTH",
    rows: [
      { studentId: "3", values: { vision_left: "5.0", jump_rope_1min: 0 } },
    ],
    command: cmd(),
  });
  assert.equal(preview.result.validCount, 1);
  await commitImport({
    pool: db.pool,
    actor: manager,
    batchId: preview.result.batchId,
    expectedRevision: "1",
    command: cmd(),
  });
  const [[e]] = await db.pool.query(
    "SELECT * FROM student_term_evaluation WHERE student_id=3",
  );
  assert.equal(e.vision_left, "5.0");
  assert.equal(e.jump_rope_1min, 0);
  const p2 = await previewImport({
    pool: db.pool,
    actor: teacher,
    termId: "1",
    kind: "ACADEMIC",
    rows: [{ studentId: "3", values: { math_basic_knowledge_grade: "A" } }],
    command: cmd(),
  });
  await db.pool.query(
    "UPDATE student_term_evaluation SET revision=revision+1 WHERE student_id=3",
  );
  await assert.rejects(
    commitImport({
      pool: db.pool,
      actor: teacher,
      batchId: p2.result.batchId,
      expectedRevision: "1",
      command: cmd(),
    }),
    { statusCode: 409 },
  );
});
test('academic_import_returns_all_errors_and_keeps_blank_values',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const service=require('../services/reportCoreImports');const actor={id:'2',schoolId:'1',role:'teacher',tokenVersion:1};let n=0;const command=()=>({requestKey:'academic-all-'+ ++n,payloadHash:String(n).padStart(64,'0')});
 const bad=await service.previewImport({pool:db.pool,actor,termId:'1',kind:'ACADEMIC',rows:[{studentId:'3',values:{math_basic_knowledge_grade:'Z',math_thinking_grade:'X'}},{studentId:'4',values:{chinese_handwriting_grade:'?'}}],command:command()});
 assert.equal(bad.result.errors.length,3);assert.equal(bad.result.batchId,null);assert.deepEqual(bad.result.errors.map(e=>e.rowNo),[1,1,2]);
 const good=await service.previewImport({pool:db.pool,actor,termId:'1',kind:'ACADEMIC',rows:[{studentId:'3',values:{math_basic_knowledge_grade:'A',math_thinking_grade:'   '}}],command:command()});
 await service.commitImport({pool:db.pool,actor,batchId:good.result.batchId,expectedRevision:'1',command:command()});
 const [[row]]=await db.pool.query('SELECT math_basic_knowledge_grade,math_thinking_grade FROM student_term_evaluation WHERE student_id=3');assert.equal(row.math_basic_knowledge_grade,'A');assert.equal(row.math_thinking_grade,null);
});
test('committed redacted imports replay after a lost success response without reapplying any rows',async t=>{
 const service=require('../services/reportCoreImports'),{stableHash}=require('../services/reportCorePolicy');
 for(const kind of ['HEALTH','ACADEMIC','ROSTER'])await t.test(kind,async t=>{
  const db=await createCoreTestDb(t);await db.seedBase();const actor={id:kind==='ACADEMIC'?'2':'1',schoolId:'1',role:kind==='ACADEMIC'?'teacher':'manager',tokenVersion:1},command=n=>({requestKey:'lost-'+kind+'-'+n,payloadHash:stableHash([kind,n])});
  const rows=kind==='HEALTH'?[{studentId:'3',values:{height_cm:143}}]:kind==='ACADEMIC'?[{studentId:'3',values:{math_basic_knowledge_grade:'A'}}]:[{username:'replay_teacher',real_name:'重试教师',role:'teacher',password:'Test-pass-2026'}];
  const preview=await service.previewImport({pool:db.pool,actor,termId:'1',kind,rows,command:command('preview')}),args={pool:db.pool,actor,batchId:preview.result.batchId,expectedRevision:'1',command:command('commit')};
  const first=await service.commitImport(args),[[batch]]=await db.pool.query('SELECT payload_json FROM evaluation_source_record WHERE id=?',[args.batchId]);assert.equal(Object.hasOwn(typeof batch.payload_json==='string'?JSON.parse(batch.payload_json):batch.payload_json,'rows'),false);
  const before=(await db.pool.query('SELECT COUNT(*) n FROM evaluation_source_record'))[0][0].n;
  const replay=await service.commitImport(args);assert.equal(replay.replayed,true);assert.deepEqual(replay.result,first.result);assert.equal((await db.pool.query('SELECT COUNT(*) n FROM evaluation_source_record'))[0][0].n,before);
  await assert.rejects(service.commitImport({...args,command:command('another')}),{statusCode:409});
 });
});
