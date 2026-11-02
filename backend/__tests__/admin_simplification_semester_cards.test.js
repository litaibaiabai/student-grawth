const {test}=require('node:test'),assert=require('node:assert/strict');
const {withFormalRollback}=require('./helpers/formalRollback');
const {registryFixture,manager,command}=require('./helpers/registryFixture');
const registry=require('../services/reportCoreRegistry'),svc=require('../services/reportCoreSemesterCards');
async function setup(pool,c){const actor=await manager(c),f=registryFixture(),p=await registry.previewRegistry({pool,actor,buffer:f.buffer()});const r=await registry.commitRegistry({pool,actor,previewToken:p.previewToken,command:command()});return{pool,actor,termId:r.result.termId,f};}
test('one semester generates 180 Chinese cards for three classes with full-term validity',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await setup(pool,c);let settings=await svc.getSemesterCardSettings(args);assert.equal(settings.defaultTotal,100);assert.equal(settings.courseCount,18);
 const saved=await svc.saveSemesterCardSettings({...args,expectedRevision:settings.revision,defaultTotal:100,quotas:{CHINESE:60,MATH:70,ENGLISH:75},command:command()});
 const cmd=command(),r=await svc.initializeSemesterCards({...args,expectedRevision:saved.result.revision,command:cmd});assert.equal(r.result.generatedTotal,1515);
 const [cards]=await c.query("SELECT s.*,u.username FROM evaluation_source_record s JOIN users u ON u.id=s.owner_teacher_id WHERE s.term_id=? AND s.record_kind='CARD'",[args.termId]);assert.equal(cards.filter(s=>s.subject_code==='CHINESE'&&s.username===args.f.teacher).length,180);
 assert.ok(cards.every(s=>s.month_key===null&&s.schema_version==='SIX_EDU_V2'));
 assert.equal(cards[0].valid_from.toISOString(),'2028-08-31T16:00:00.000Z');assert.equal(cards[0].valid_until.toISOString(),'2029-01-31T16:00:00.000Z');
 assert.equal((await svc.initializeSemesterCards({...args,expectedRevision:saved.result.revision,command:cmd})).replayed,true);
 await assert.rejects(svc.initializeSemesterCards({...args,expectedRevision:saved.result.revision,command:command()}),{statusCode:423});
 await assert.rejects(svc.saveSemesterCardSettings({...args,expectedRevision:settings.revision,defaultTotal:5,quotas:{},command:command()}),{statusCode:423});
 settings=await svc.getSemesterCardSettings(args);assert.equal(settings.status,'INITIALIZED');assert.equal(settings.usedTotal,0);assert.equal(settings.unusedTotal,1515);
}));
test('quota validation accepts zero and default inheritance and rejects invalid values',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await setup(pool,c);let s=await svc.getSemesterCardSettings(args);
 for(const quotas of [{CHINESE:-1},{CHINESE:1.5},{CHINESE:NaN},{CHINESE:10001},{UNKNOWN:5}])await assert.rejects(svc.saveSemesterCardSettings({...args,expectedRevision:s.revision,defaultTotal:100,quotas,command:command()}),{statusCode:422});
 const saved=await svc.saveSemesterCardSettings({...args,expectedRevision:s.revision,defaultTotal:1,quotas:{CHINESE:0,MATH:null},command:command()});
 const r=await svc.initializeSemesterCards({...args,expectedRevision:saved.result.revision,command:command()});assert.equal(r.result.generatedTotal,15);
}));
test('concurrent logical requests have one winner and empty or disabled mappings cannot initialize',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await setup(pool,c);let s=await svc.getSemesterCardSettings(args);
 const saved=await svc.saveSemesterCardSettings({...args,expectedRevision:s.revision,defaultTotal:0,quotas:{CHINESE:1},command:command()});
 const attempts=await Promise.allSettled([1,2].map(()=>svc.initializeSemesterCards({...args,expectedRevision:saved.result.revision,command:command()})));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.find(r=>r.status==='rejected').reason.statusCode,423);
 const emptyFile=registryFixture({year:'2029-2030'});emptyFile.rows.任教关系=emptyFile.rows.任教关系.slice(0,1);const preview=await registry.previewRegistry({pool,actor:args.actor,buffer:emptyFile.buffer()});const emptyResult=await registry.commitRegistry({pool,actor:args.actor,previewToken:preview.previewToken,command:command()});await assert.rejects(svc.initializeSemesterCards({pool,actor:args.actor,termId:emptyResult.result.termId,expectedRevision:1,command:command()}),{statusCode:422});
}));
module.exports={setup};
test('disabled teachers and failures during generation leave the semester uninitialized',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await setup(pool,c),[[u]]=await c.query('SELECT id FROM users WHERE school_id=1 AND username=?',[args.f.teacher]);
 await c.query('UPDATE users SET status=1 WHERE id=?',[u.id]);await assert.rejects(svc.initializeSemesterCards({...args,expectedRevision:1,command:command()}),{statusCode:422});await c.query('UPDATE users SET status=0 WHERE id=?',[u.id]);
 const failing={query:pool.query,getConnection:async()=>{const cc=await pool.getConnection();return{...cc,query:async(sql,args)=>{if(sql.startsWith('INSERT INTO evaluation_source_record(school_id,term_id,source_type'))throw Error('injected batch failure');return cc.query(sql,args);}};}};
 await assert.rejects(svc.initializeSemesterCards({...args,pool:failing,expectedRevision:1,command:command()}),/injected batch failure/);
 const s=await svc.getSemesterCardSettings(args);assert.equal(s.status,'DRAFT');assert.equal(s.generatedTotal,0);
}));
test('real MySQL term FOR UPDATE excludes a second connection until rollback',async()=>{
 const p=require('../db').createDbPool({database:'student_growth'}),a=await p.getConnection(),b=await p.getConnection();
 try{await a.beginTransaction();await a.query('SELECT id FROM academic_year WHERE school_id=1 AND id=2 FOR UPDATE');await b.query('SET innodb_lock_wait_timeout=1');await b.beginTransaction();await assert.rejects(b.query('SELECT id FROM academic_year WHERE school_id=1 AND id=2 FOR UPDATE'),{code:'ER_LOCK_WAIT_TIMEOUT'});await a.rollback();await b.query('SELECT id FROM academic_year WHERE school_id=1 AND id=2 FOR UPDATE');}
 finally{await a.rollback();await b.rollback();a.release();b.release();await p.end();}
});
test('registry course or date changes invalidate an open initialization confirmation',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await setup(pool,c),registry=require('../services/reportCoreRegistry');
 for(const change of [()=>{args.f.rows.任教关系.find(r=>r[1]===3&&r[2]==='语文')[3]=args.f.other;},()=>{args.f.rows.学期[1][4]='2029-02-01';}]){
  const displayed=await svc.getSemesterCardSettings(args);change();const preview=await registry.previewRegistry({...args,buffer:args.f.buffer()});await registry.commitRegistry({...args,previewToken:preview.previewToken,command:command()});
  await assert.rejects(svc.initializeSemesterCards({...args,expectedRevision:displayed.revision,command:command()}),{statusCode:409});
  assert.equal((await svc.getSemesterCardSettings(args)).generatedTotal,0);
 }
 const refreshed=await svc.getSemesterCardSettings(args);assert.equal((await svc.initializeSemesterCards({...args,expectedRevision:refreshed.revision,command:command()})).result.generatedTotal,1800);
}));
