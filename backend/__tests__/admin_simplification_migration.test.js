const {test}=require('node:test');
const assert=require('node:assert/strict');
const policy=require('../services/semesterCardPolicy');
const {rollbackOnlyPool,withFormalRollback}=require('./helpers/formalRollback');
const {migrateAdminSimplification}=require('../scripts/migrateAdminSimplification');
test('semester quota defaults preserve zero and resolve blank overrides',()=>{
 const q=policy.resolveSemesterQuotas({semesterCards:{defaultTotal:100,quotas:{CHINESE:60,MATH:0}}});
 assert.equal(q.subjects.find(s=>s.subjectCode==='CHINESE').effectiveTotal,60);
 assert.equal(q.subjects.find(s=>s.subjectCode==='MATH').effectiveTotal,0);
 assert.equal(q.subjects.find(s=>s.subjectCode==='ENGLISH').effectiveTotal,100);
});
test('rollback pool is poisoned after a database error and forbids implicit commits',async()=>{
 let calls=0;const p=rollbackOnlyPool({query:async()=>{calls++;throw Object.assign(Error('deadlock'),{code:'ER_LOCK_DEADLOCK'});}});
 await assert.rejects(p.query('SELECT 1'),{code:'ER_LOCK_DEADLOCK'});
 await assert.rejects(p.getConnection(),/aborted/);await assert.rejects(p.query('INSERT INTO users'),/aborted/);assert.equal(calls,1);
 const clean=rollbackOnlyPool({query:async()=>{throw Error('must not reach SQL');}});
 await assert.rejects(clean.query('TRUNCATE users'),/forbidden/i);
});
test('legacy migration locks issued batches without touching cards or reports',async()=>{
 await withFormalRollback(async({pool,connection:c})=>{
  const [before]=await c.query('SELECT id,status,payload_hash FROM evaluation_source_record WHERE record_kind IN (\'CARD\',\'QUOTA\') ORDER BY id');
  const [reports]=await c.query('SELECT * FROM term_report ORDER BY id');
  await migrateAdminSimplification({connection:pool,targetDb:'student_growth',mode:'apply',backupDir:null});
  const [terms]=await c.query('SELECT id,evaluation_config FROM academic_year ORDER BY id');
  const parse=v=>typeof v==='string'?JSON.parse(v):v;
  assert.equal(parse(terms.find(t=>String(t.id)==='1').evaluation_config).semesterCards.status,'LEGACY_LOCKED');
  assert.equal(parse(terms.find(t=>String(t.id)==='2').evaluation_config).semesterCards.status,'DRAFT');
  assert.equal((await migrateAdminSimplification({connection:pool,targetDb:'student_growth',mode:'apply'})).changedTerms,0);
  assert.deepEqual((await c.query('SELECT id,status,payload_hash FROM evaluation_source_record WHERE record_kind IN (\'CARD\',\'QUOTA\') ORDER BY id'))[0],before);
  assert.deepEqual((await c.query('SELECT * FROM term_report ORDER BY id'))[0],reports);
 });
});
