const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCoreTestDb}=require('./helpers/reportCoreDb');
const imports=require('../services/reportCoreImports');
const actor={id:'1',schoolId:'1',role:'manager',tokenVersion:1};let seq=0;
const command=()=>({requestKey:'admin-menu-'+ ++seq,payloadHash:String(seq).padStart(64,'0')});
test('teacher roster needs no class, preserves passwords and rejects role switching with all row errors',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();
 const before=(await db.pool.query('SELECT password FROM users WHERE id=2'))[0][0].password;
 const preview=await imports.previewImport({pool:db.pool,actor,termId:'1',kind:'ROSTER',rows:[{username:'teacher',real_name:'新教师姓名',role:'teacher',password:'Ignored-secret-2026'}],command:command()});
 assert.ok(preview.result.batchId);assert.ok(!JSON.stringify(preview).includes('password'));assert.ok(!JSON.stringify(preview).includes(before));
 await imports.commitImport({pool:db.pool,actor,batchId:preview.result.batchId,expectedRevision:'1',command:command()});
 assert.equal((await db.pool.query('SELECT password FROM users WHERE id=2'))[0][0].password,before);
 assert.equal(Number((await db.pool.query('SELECT COUNT(*) n FROM student_term_evaluation WHERE student_id=2'))[0][0].n),0);
 await assert.rejects(imports.previewImport({pool:db.pool,actor,termId:'1',kind:'ROSTER',rows:[{username:'teacher',real_name:'教师改学生',role:'student',grade:4,classNo:1},{username:'new',real_name:'',role:'student',grade:0,classNo:0}],command:command()}),e=>e.statusCode===422&&e.details.errors.length>=2&&!JSON.stringify(e.details).includes('Ignored-secret'));
});
test('health aggregates errors, preserves blank, accepts zero and commits safe before-after diffs atomically',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();await db.pool.query('UPDATE student_term_evaluation SET height_cm=141 WHERE student_id=3');
 await assert.rejects(imports.previewImport({pool:db.pool,actor,termId:'1',kind:'HEALTH',rows:[{studentId:'3',values:{height_cm:-1,weight_kg:-2}},{studentId:'9999',values:{jump_rope_1min:-1}}],command:command()}),e=>e.statusCode===422&&e.details.errors.length>=3);
 const p=await imports.previewImport({pool:db.pool,actor,termId:'1',kind:'HEALTH',rows:[{studentId:'3',values:{height_cm:'',jump_rope_1min:0}}],command:command()});
 assert.equal(p.result.diffs[0].after.jump_rope_1min,0);assert.ok(!Object.hasOwn(p.result.diffs[0].after,'height_cm'));
 await imports.commitImport({pool:db.pool,actor,batchId:p.result.batchId,expectedRevision:'1',command:command()});
 const [[e]]=await db.pool.query('SELECT height_cm,jump_rope_1min FROM student_term_evaluation WHERE student_id=3');assert.equal(Number(e.height_cm),141);assert.equal(e.jump_rope_1min,0);
 const [[b]]=await db.pool.query('SELECT payload_json FROM evaluation_source_record WHERE id=?',[p.result.batchId]);const payload=typeof b.payload_json==='string'?JSON.parse(b.payload_json):b.payload_json;assert.ok(payload.commitDiffs);
});
test('admin lists are paginated, health-only and include teachers without assignments or quota',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const read=require('../services/reportCoreAdminData');
 await db.pool.query("UPDATE student_term_evaluation SET self_conduct_text='PRIVATE_NARRATIVE',height_cm=141 WHERE student_id=3");
 const accounts=await read.listAccounts({pool:db.pool,actor,termId:'1',role:'teacher'});assert.equal(accounts.rows[0].username,'teacher');assert.ok(!JSON.stringify(accounts).includes('password'));
 const health=await read.listHealth({pool:db.pool,actor,termId:'1'});assert.equal(health.rows.length,2);assert.ok(!JSON.stringify(health).includes('PRIVATE_NARRATIVE'));assert.ok(!Object.hasOwn(health.rows[0],'pe_academic_grade'));
 await db.pool.query('DELETE FROM teacher_teaching_assignment WHERE teacher_id=2');const quotas=await read.listTeacherQuotas({pool:db.pool,actor,termId:'1',monthKey:'2026-10'});assert.equal(quotas.rows[0].teacherId,'2');assert.equal(quotas.rows[0].total,null);assert.equal(quotas.summary.teachers,1);assert.equal(quotas.summary.generated,0);
 for(const fn of [read.listAccounts,read.listHealth,read.listTeacherQuotas,read.listImportHistory])await assert.rejects(fn({pool:db.pool,actor:{...actor,role:'teacher',id:'2'},termId:'1'}),{statusCode:403});
});
test('historical roster edits stay in that term and concurrent roster changes reject the whole preview',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();await db.pool.query("INSERT INTO academic_year(id,school_id,academic_year,semester,term_name,start_date,end_date,is_current,evaluation_config,config_version,template_version,rule_version) SELECT 2,school_id,'2025-2026',1,'历史学期','2025-09-01','2026-01-31',0,evaluation_config,'1',template_version,rule_version FROM academic_year WHERE id=1");
 const p=await imports.previewImport({pool:db.pool,actor,termId:'2',kind:'ROSTER',rows:[{username:'student',real_name:'旧学期名字',role:'student',grade:3,classNo:2}],command:command()});await imports.commitImport({pool:db.pool,actor,batchId:p.result.batchId,expectedRevision:'1',command:command()});
 const [[u]]=await db.pool.query('SELECT real_name,grade,class_no FROM users WHERE id=3');assert.equal(u.real_name,'student');assert.equal(u.grade,4);assert.equal(u.class_no,1);const [[old]]=await db.pool.query('SELECT grade_snapshot,class_no_snapshot FROM student_term_evaluation WHERE term_id=2 AND student_id=3');assert.equal(old.grade_snapshot,3);assert.equal(old.class_no_snapshot,2);
 const next=await imports.previewImport({pool:db.pool,actor,termId:'1',kind:'ROSTER',rows:[{username:'student',real_name:'修改名字',role:'student',grade:4,classNo:2},{username:'student2',real_name:'学生4',role:'student',grade:4,classNo:2}],command:command()});await db.pool.query('UPDATE student_term_evaluation SET revision=revision+1 WHERE term_id=1 AND student_id=3');await assert.rejects(imports.commitImport({pool:db.pool,actor,batchId:next.result.batchId,expectedRevision:'1',command:command()}),{statusCode:409});assert.equal((await db.pool.query('SELECT class_no_snapshot FROM student_term_evaluation WHERE term_id=1 AND student_id=4'))[0][0].class_no_snapshot,1);
});
test('zero jump count is complete and HTTP validation exposes only safe full error locations',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();await db.pool.query("UPDATE student_term_evaluation SET height_cm=141,weight_kg=35,vision_left='5.0',vision_right='5.0',jump_rope_1min=0 WHERE student_id=3");const read=require('../services/reportCoreAdminData');const missing=await read.listHealth({pool:db.pool,actor,termId:'1',completeness:'missing'});assert.equal(missing.rows.length,1);assert.equal(missing.rows[0].studentId,'4');
 const server=require('../app').createApp({pool:db.pool,schoolId:'1'}).listen(0);t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Test-pass-2026'})});const token=(await login.json()).data.token;
 const response=await fetch(base+'/api/v1/report-core/imports/preview',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({termId:'1',kind:'HEALTH',requestKey:'http-errors',rows:[{studentId:'3',values:{height_cm:-1,weight_kg:-1}}]})});assert.equal(response.status,422);const body=await response.json();assert.equal(body.details.errors.length,2);assert.ok(!JSON.stringify(body).includes('batchId'));
 const health=await fetch(base+'/api/v1/admin/report-core/health?termId=1',{headers:{Authorization:'Bearer '+token}});assert.equal(health.headers.get('cache-control'),'private, no-store');assert.ok(!JSON.stringify(await health.json()).includes('password'));
});
