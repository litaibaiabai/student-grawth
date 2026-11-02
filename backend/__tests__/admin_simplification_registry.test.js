const {test}=require('node:test'),assert=require('node:assert/strict'),bcrypt=require('bcrypt');
const {withFormalRollback,storedHashes}=require('./helpers/formalRollback');
const {registryFixture,manager,command}=require('./helpers/registryFixture');
const svc=require('../services/reportCoreRegistry');
const {openRegistryPreview}=require('../services/registryPreview');
test('one workbook initializes all relations atomically and duplicate files do not reset passwords',async()=>withFormalRollback(async({pool,connection:c})=>{
 const actor=await manager(c),f=registryFixture(),before=await storedHashes(c);
 const preview=await svc.previewRegistry({pool,actor,buffer:f.buffer()});assert.deepEqual(await storedHashes(c),before);assert.equal(preview.counts.assignments.created,18);assert.ok(!JSON.stringify(preview).includes(f.password));
 const cmd=command(),result=await svc.commitRegistry({pool,actor,previewToken:preview.previewToken,command:cmd});
 const termId=result.result.termId;assert.equal(result.result.counts.assignments.created,18);
 const [[u]]=await c.query('SELECT * FROM users WHERE school_id=1 AND username=?',[f.student]);assert.ok(await bcrypt.compare(f.password,u.password));assert.equal(u.password_plain,f.password);
 assert.equal((await c.query('SELECT * FROM teacher_teaching_assignment WHERE term_id=?',[termId]))[0].length,18);
 assert.equal((await c.query('SELECT * FROM school_class WHERE term_id=?',[termId]))[0].length,3);
 const replay=await svc.commitRegistry({pool,actor,previewToken:preview.previewToken,command:cmd});assert.equal(replay.replayed,true);
 const next=await svc.previewRegistry({pool,actor,buffer:f.buffer()});await svc.commitRegistry({pool,actor,previewToken:next.previewToken,command:command()});
 assert.equal((await c.query('SELECT password FROM users WHERE id=?',[u.id]))[0][0].password,u.password);
 const relations=await svc.listRegistryRelations({pool,actor,termId,view:'teachers'});assert.ok(relations.rows.some(r=>r.username===f.teacher));assert.ok(relations.rows.some(r=>r.username===f.other));assert.ok(!JSON.stringify(relations).includes('password'));
}));
test('invalid references, duplicate collated identities and stale previews never partly import',async()=>withFormalRollback(async({pool,connection:c})=>{
 const actor=await manager(c),f=registryFixture();f.rows.教师.push([f.teacher.toUpperCase(),'重复账号',f.password]);
 await assert.rejects(svc.previewRegistry({pool,actor,buffer:f.buffer()}),e=>e.statusCode===422&&e.details.errors.some(x=>x.sheet==='教师'));
 f.rows.教师.pop();f.rows.任教关系[1][3]='outside_school_or_missing';await assert.rejects(svc.previewRegistry({pool,actor,buffer:f.buffer()}),{statusCode:422});
 f.rows.任教关系[1][3]=f.teacher;
 const p=await svc.previewRegistry({pool,actor,buffer:f.buffer()});
 await c.query("UPDATE users SET real_name=CONCAT(real_name,'改') WHERE id=?",[actor.id]);
 await assert.rejects(svc.commitRegistry({pool,actor,previewToken:p.previewToken,command:command()}),{statusCode:409});
 assert.equal((await c.query('SELECT id FROM academic_year WHERE academic_year=?',['2028-2029']))[0].length,0);
}));
test('preview tickets reject tampering, expiry and a different actor',async()=>withFormalRollback(async({pool,connection:c})=>{
 const actor=await manager(c),now=new Date('2026-11-02T00:00:00Z'),p=await svc.previewRegistry({pool,actor,buffer:registryFixture().buffer(),now});
 assert.throws(()=>openRegistryPreview(p.previewToken,{actor:{...actor,schoolId:'99'},now}),{statusCode:403});
 assert.throws(()=>openRegistryPreview(p.previewToken,{actor,now:new Date('2026-11-02T00:31:00Z')}),{statusCode:409});
 assert.throws(()=>openRegistryPreview(p.previewToken.slice(0,-8)+'invalid!',{actor,now}),{statusCode:422});
}));
test('initialized relations cannot change and existing passwords/evaluations survive a corrected workbook',async()=>withFormalRollback(async({pool,connection:c})=>{
 const actor=await manager(c),f=registryFixture();let p=await svc.previewRegistry({pool,actor,buffer:f.buffer()});const r=await svc.commitRegistry({pool,actor,previewToken:p.previewToken,command:command()}),termId=r.result.termId;
 const[[u]]=await c.query('SELECT id,password FROM users WHERE school_id=1 AND username=?',[f.student]);
 await c.query('UPDATE student_term_evaluation SET conduct_politeness_self_star=2 WHERE term_id=? AND student_id=?',[termId,u.id]);
 f.rows.学生[1][4]='Different-pass-2026';p=await svc.previewRegistry({pool,actor,buffer:f.buffer()});await svc.commitRegistry({pool,actor,previewToken:p.previewToken,command:command()});
 assert.equal((await c.query('SELECT password FROM users WHERE id=?',[u.id]))[0][0].password,u.password);
 assert.equal((await c.query('SELECT conduct_politeness_self_star s FROM student_term_evaluation WHERE term_id=? AND student_id=?',[termId,u.id]))[0][0].s,2);
 await c.query("UPDATE academic_year SET evaluation_config=JSON_SET(evaluation_config,'$.semesterCards.status','INITIALIZED') WHERE id=?",[termId]);f.rows.学生[1][3]=2;
 await assert.rejects(svc.previewRegistry({pool,actor,buffer:f.buffer()}),{statusCode:423});
}));
test('an exception after account creation rolls back the entire logical import',async()=>withFormalRollback(async({pool,connection:c})=>{
 const actor=await manager(c),p=await svc.previewRegistry({pool,actor,buffer:registryFixture().buffer()}),before=await storedHashes(c);
 const failing={query:pool.query,getConnection:async()=>{const cc=await pool.getConnection();return{...cc,query:async(sql,args)=>{if(sql.startsWith('INSERT INTO teacher_teaching_assignment'))throw Error('injected assignment failure');return cc.query(sql,args);}};}};
 await assert.rejects(svc.commitRegistry({pool:failing,actor,previewToken:p.previewToken,command:command()}),/injected assignment failure/);
 assert.deepEqual(await storedHashes(c),before);
}));
test('registry HTTP surface rejects students and teachers',async()=>withFormalRollback(async({pool,connection:c})=>{
 const app=require('../app').createApp({pool,schoolId:'1'}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{for(const role of ['student','teacher']){const[[u]]=await c.query('SELECT * FROM users WHERE school_id=1 AND role=? LIMIT 1',[role]);const token=require('../middleware/auth').signToken(u);const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/admin/report-core/registry/relations?termId=1',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,403);}}
 finally{await new Promise(r=>server.close(r));}
}));
test('selecting an already initialized term never clears the sole current term',async()=>withFormalRollback(async({pool,connection:c})=>{
 const actor=await manager(c),f=registryFixture();let p=await svc.previewRegistry({pool,actor,buffer:f.buffer()});const r=await svc.commitRegistry({pool,actor,previewToken:p.previewToken,command:command()});
 await c.query("UPDATE academic_year SET evaluation_config=JSON_SET(evaluation_config,'$.semesterCards.status','INITIALIZED') WHERE id=?",[r.result.termId]);
 f.rows.学期[1][5]='是';p=await svc.previewRegistry({pool,actor,buffer:f.buffer()});await svc.commitRegistry({pool,actor,previewToken:p.previewToken,command:command()});
 const [current]=await c.query('SELECT id FROM academic_year WHERE school_id=1 AND is_current=1');assert.equal(current.length,1);assert.equal(String(current[0].id),r.result.termId);
}));
test('moving an evaluated student rebuilds both old and new class process rankings',async()=>withFormalRollback(async({pool,connection:c})=>{
 const actor=await manager(c),f=registryFixture();const remaining=f.student+'_stay',destination=f.student+'_dest';f.rows.学生.push([remaining,'原班同学',4,1,f.password],[destination,'新班同学',4,2,f.password]);
 const p=await svc.previewRegistry({pool,actor,buffer:f.buffer()}),termId=(await svc.commitRegistry({pool,actor,previewToken:p.previewToken,command:command()})).result.termId;
 const load=async username=>{const[[u]]=await c.query('SELECT * FROM users WHERE school_id=1 AND username=?',[username]);return{id:String(u.id),schoolId:'1',role:u.role,tokenVersion:u.token_version};},head=await load(f.teacher),moving=await load(f.student),stay=await load(remaining),dest=await load(destination),evaluation=require('../services/reportCoreEvaluation');
 const direct=ids=>require('../services/reportCoreCards').directScore({pool,actor:head,termId,studentIds:ids,categoryCode:'CHINESE_PROCESS',reason:'调班排名回归',now:new Date('2028-09-15T00:00:00Z'),command:command()});
 await direct([moving.id,stay.id,dest.id]);await direct([moving.id]);
 for(const classNo of [1,2]){const[rows]=await c.query('SELECT student_id,revision FROM student_term_evaluation WHERE term_id=? AND class_no_snapshot=?',[termId,classNo]);await evaluation.settleSources({pool,actor:head,termId,grade:4,classNo,targetKeys:['chinese_process_star'],settlement:'CARD_CLOSED',expectedRevisions:Object.fromEntries(rows.map(r=>[r.student_id,String(r.revision)])),command:command()});}
 const read=async id=>(await c.query('SELECT * FROM student_term_evaluation WHERE term_id=? AND student_id=?',[termId,id]))[0][0];
 assert.equal((await read(stay.id)).chinese_process_star,2);
 const beforeStay=await read(stay.id),beforeRevision=Number(beforeStay.revision);f.rows.学生[1][3]=2;
 const next=await svc.previewRegistry({pool,actor,buffer:f.buffer()});await svc.commitRegistry({pool,actor,previewToken:next.previewToken,command:command()});
 const after=await read(stay.id),parse=require('../services/reportCoreStore').parse;assert.equal(after.chinese_process_star,3);assert.equal(parse(after.process_summary).chinese_process_star.population,1);assert.ok(Number(after.revision)>beforeRevision);assert.equal(after.status,'DRAFT');assert.notEqual(parse(after.story_summary).versions.LISTEN,parse(beforeStay.story_summary).versions.LISTEN);
 assert.equal(parse((await read(dest.id)).process_summary).chinese_process_star.population,2);
}));
