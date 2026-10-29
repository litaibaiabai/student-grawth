const {test}=require('node:test');const assert=require('node:assert/strict');
const {createCoreTestDb}=require('./helpers/reportCoreDb');const service=require('../services/reportCoreEvaluation');
test('self view exposes applicable self fields and freeze reason without writable teacher fields',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const args={pool:db.pool,actor:{id:'3',schoolId:'1',role:'student',tokenVersion:1},studentKey:{schoolId:'1',termId:'1',studentId:'3'}};
 const v=await service.getEvaluationView(args);assert.equal(v.applicableSelfFields.length,13);assert.equal(v.editable,true);assert.deepEqual(v.sportsSpecialties,[]);assert.deepEqual(v.artSpecialties,[]);assert.ok(!v.allowedFields.includes('teacher_comment'));
 await db.pool.query("UPDATE academic_year SET release_status='PREPARING',release_key='test',release_target_version=1,release_manifest=JSON_OBJECT('students',JSON_ARRAY()) WHERE id=1");const locked=await service.getEvaluationView(args);assert.equal(locked.editable,false);assert.ok(locked.lockReason);
});
test('self saves Unicode limits and cannot overwrite teacher evaluations',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const actor={id:'3',schoolId:'1',role:'student',tokenVersion:1};const studentKey={schoolId:'1',termId:'1',studentId:'3'};let n=0;
 const command=()=>({requestKey:'self-limit-'+ ++n,payloadHash:String(n).padStart(64,'0')});
 await service.submitForm({pool:db.pool,actor,studentKey,expectedRevision:'1',values:{self_conduct_text:'😀'.repeat(2000)},command:command()});
 await assert.rejects(service.submitForm({pool:db.pool,actor,studentKey,expectedRevision:'2',values:{self_conduct_text:'😀'.repeat(2001)},command:command()}),{statusCode:422});
 await assert.rejects(service.submitForm({pool:db.pool,actor,studentKey,expectedRevision:'2',values:{conduct_politeness_other_star:3},command:command()}),{statusCode:403});
});
