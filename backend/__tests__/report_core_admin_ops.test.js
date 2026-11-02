const {test}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcrypt');
const {createAdminTestDb,command}=require('./helpers/reportCoreAdminDb');
const ops=()=>require('../services/reportCoreAdminOps');
const progress=()=>require('../services/reportCoreAdminProgress');
const ctx=db=>({pool:db.pool,actor:db.actors.manager,termId:'1'});
const rejects=(call,status)=>assert.rejects(call,e=>e.statusCode===status);
const nextTerm={academicYear:'2026-2027',semester:2,termName:'2026下学期',startDate:'2027-02-15',endDate:'2027-07-15',collectionDeadline:'2027-07-01',makeCurrent:false};
test('account CAS revokes existing tokens, hashes password and supports only school student/teacher accounts',async t=>{
 const db=await createAdminTestDb(t),a=ctx(db),auth=require('../services/authorizationService');
 assert.equal((await require('../services/reportCoreAdminData').listAccounts(a)).rows[0].tokenVersion,1);
 const input={...a,accountId:'3',status:1,expectedTokenVersion:1,reason:'离校停用',command:command('disable')};
 const changed=await ops().setAccountStatus(input);assert.equal(changed.result.tokenVersion,2);
 await rejects(auth.resolveActorContext({userId:'3',schoolId:'1',tokenVersion:1},db.pool),401);
 assert.equal((await ops().setAccountStatus(input)).replayed,true);
 await rejects(ops().setAccountStatus({...input,status:0,command:command('stale')}),409);
 await ops().setAccountStatus({...input,status:0,expectedTokenVersion:2,command:command('enable')});
 const password='Changed-pass-2027';const reset=await ops().resetAccountPassword({...a,accountId:'3',password,expectedTokenVersion:3,reason:'本人申请',command:command('reset')});
 assert.equal(reset.result.tokenVersion,4);assert.ok(!JSON.stringify(reset).includes(password));
 const [[user]]=await db.pool.query('SELECT password FROM users WHERE id=3');assert.ok(await bcrypt.compare(password,user.password));
 await rejects(auth.resolveActorContext({userId:'3',schoolId:'1',tokenVersion:3},db.pool),401);
 for(const id of ['1','999'])await rejects(ops().setAccountStatus({...input,accountId:id,command:command('denied'+id)}),id==='1'?422:404);
 await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) SELECT 9,2,'foreign',password,'foreign','student' FROM users WHERE id=3");
 await rejects(ops().setAccountStatus({...input,accountId:'9',command:command('cross')}),404);
 await rejects(ops().resetAccountPassword({...a,accountId:'2',password:'short',expectedTokenVersion:1,reason:'原因',command:command('weak')}),422);
 await rejects(ops().setAccountStatus({...input,accountId:'2',reason:'',command:command('reason')}),422);
 const [audit]=await db.pool.query("SELECT payload_json,response_json FROM evaluation_source_record WHERE record_kind='AUDIT'");
 assert.ok(!JSON.stringify(audit).includes(password));assert.ok(!JSON.stringify(audit).includes(user.password));
});
test('account CAS sees committed predecessor after waiting for the term lock',async t=>{
 const db=await createAdminTestDb(t),a=ctx(db),lock=await db.pool.getConnection();t.after(()=>lock.release());
 await lock.beginTransaction();await lock.query('SELECT id FROM academic_year WHERE id=1 FOR UPDATE');
 const pending=ops().setAccountStatus({...a,accountId:'2',status:1,expectedTokenVersion:1,reason:'停用',command:command('concurrent-account')});
 await new Promise(r=>setTimeout(r,100));await lock.query('UPDATE users SET token_version=2 WHERE id=2');await lock.commit();
 await rejects(pending,409);assert.equal((await db.pool.query('SELECT status FROM users WHERE id=2'))[0][0].status,0);
});
test('progress and workspace share V2 applicable fields, active enrollment, zero values and confirmation fingerprints',async t=>{
 const db=await createAdminTestDb(t,{applicableFields:['math_regular_grade','jump_rope_1min','conduct_politeness_self_star']}),a=ctx(db);
 await db.pool.query("UPDATE student_term_evaluation SET teacher_comment='继续努力',math_regular_grade='A',jump_rope_1min=0,conduct_politeness_self_star=3 WHERE student_id=3");
 await db.pool.query('UPDATE student_term_evaluation SET section_meta=? WHERE student_id=4',[JSON.stringify({enrollment:{status:'TRANSFERRED_OUT'}})]);
 const m=require('../services/reportCoreReadModels'),p=await progress().getProgress(a),w=await m.getWorkspace(a);
 assert.equal(p.counts.students,1);assert.equal((await require('../services/reportCorePublish').getReadiness(a)).counts.total,1);assert.equal((await require('../services/reportCoreTermSettings').getTermSettings(a)).classes[0].studentCount,1);assert.equal(p.counts.complete,1);assert.equal(p.counts.confirmed,0);assert.equal(p.sections.health.complete,1);
 assert.equal(w.counts.total,1);assert.equal(w.counts.academicExpected,2);assert.equal(w.counts.academicComplete,2);
 assert.equal(p.classes.reduce((n,c)=>n+c.counts.students,0),p.counts.students);
 const [[term]]=await db.pool.query('SELECT * FROM academic_year WHERE id=1'),[[e]]=await db.pool.query('SELECT * FROM student_term_evaluation WHERE student_id=3');term.evaluation_config=require('../services/reportCoreStore').parse(term.evaluation_config);
 await db.pool.query("UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=2,confirmed_at=UTC_TIMESTAMP(6),approval_fingerprint=? WHERE student_id=3",[require('../services/reportCoreEvaluation').reportFingerprint(e,term)]);
 assert.equal((await progress().getProgress(a)).counts.confirmed,1);
 await db.pool.query("UPDATE student_term_evaluation SET math_regular_grade=NULL,field_sources=? WHERE student_id=3",[JSON.stringify({math_regular_grade:{notApplicable:true,reason:'不适用'}})]);
 const partial=await progress().getProgress(a);assert.equal(partial.sections.wisdom.total,0);assert.equal(partial.counts.complete,1);assert.equal(partial.counts.confirmed,0);
 await db.pool.query('UPDATE student_term_evaluation SET section_meta=? WHERE student_id=3',[JSON.stringify({enrollment:{status:'NOT_APPLICABLE'}})]);
 const empty=await progress().getProgress(a);assert.equal(empty.counts.students,0);assert.deepEqual(empty.missing,[]);assert.equal(empty.sections.health.total,0);
});
test('progress missing rows and CSV use same filtered model with formula-safe student names',async t=>{
 const db=await createAdminTestDb(t,{applicableFields:['math_regular_grade']}),a=ctx(db);
 await db.pool.query("UPDATE student_term_evaluation SET student_name_snapshot='=HYPERLINK(1)',teacher_comment='已填' WHERE student_id=3");
 await db.pool.query("UPDATE student_term_evaluation SET teacher_comment='已填',math_regular_grade='A' WHERE student_id=4");
 const p=await progress().getProgress({...a,grade:4,classNo:1});assert.equal(p.counts.incomplete,1);assert.deepEqual(p.missing[0].fields.map(r=>r.field),['math_regular_grade']);
 const csv=await progress().exportProgress({...a,grade:4,classNo:1});assert.ok(csv.includes("'=HYPERLINK(1)"));assert.ok(csv.includes('math_regular_grade'));
 await rejects(progress().getProgress({...a,actor:db.actors.teacher}),403);
});
test('audit queries whitelist public metadata, paginate/filter consistently and escape CSV formulas',async t=>{
 const db=await createAdminTestDb(t),a=ctx(db),{addSource}=require('../services/reportCoreStore');
 await db.pool.query("UPDATE users SET real_name='=SUM(1)' WHERE id=1");
 for(let i=0;i<27;i++)await addSource(db.pool,{schoolId:'1',termId:'1',actorId:'1',kind:'AUDIT',status:'COMMITTED',key:['audit-safe',i],payload:{action:'ACCOUNT_STATUS',accountId:'3',reason:'例行维护',diffs:[{field:'status',before:0,after:1},{field:'teacher_comment',before:'PRIVATE_BODY',after:'PRIVATE_BODY'}],password:'PASSWORD_SECRET',token:'TOKEN_SECRET',filePath:'/private/SECRET',privateBody:'PRIVATE_BODY'}});
 const first=await ops().listAudits({...a,type:'ACCOUNT_STATUS',limit:25});assert.equal(first.total,27);assert.equal(first.rows.length,25);assert.ok(first.nextCursor);
 const second=await ops().listAudits({...a,type:'ACCOUNT_STATUS',limit:25,cursor:first.nextCursor});assert.equal(second.rows.length,2);assert.notEqual(first.rows[0].id,second.rows[0].id);
 const encoded=JSON.stringify(first);for(const value of ['PRIVATE_BODY','PASSWORD_SECRET','TOKEN_SECRET','/private/SECRET'])assert.ok(!encoded.includes(value));
 const csv=await ops().exportAudits({...a,type:'ACCOUNT_STATUS'});assert.ok(csv.includes("'=SUM(1)"));assert.equal(csv.split('\r\n').length,29);
 assert.equal((await ops().listAudits({...a,q:'does-not-exist'})).total,0);
 await rejects(ops().listAudits({...a,type:'ACCOUNT_STATUS',q:'changed',cursor:first.nextCursor}),422);
 await rejects(ops().listAudits({...a,from:'not-a-date'}),422);
 await rejects(ops().listAudits({...a,actor:db.actors.teacher}),403);
});
test('new term is V2 with quota 100 and empty classes/assignments/evaluations/reports; replay and unique identity',async t=>{
 const db=await createAdminTestDb(t),a=ctx(db),input={...a,sourceTermId:'1',...nextTerm,command:command('create-term')};
 await db.pool.query("UPDATE academic_year SET business_phase='ARCHIVED',evaluation_config=JSON_SET(evaluation_config,'$.courseCardDefaultQuota',6)");
 const created=await ops().createTerm(input),id=created.result.term.id;
 assert.notEqual(id,'1');assert.equal(created.result.term.isCurrent,false);assert.equal((await ops().createTerm(input)).replayed,true);
 const term=await require('../services/reportCoreStore').getTerm(db.pool,'1',id);assert.equal(term.evaluation_config.schemaVersion,'SIX_EDU_V2');assert.equal(term.evaluation_config.courseCardDefaultQuota,100);assert.equal(term.evaluation_config.adminClassRegistryVersion,1);assert.equal(term.rule_version,'V2_1');
 for(const table of ['school_class','teacher_teaching_assignment','student_term_evaluation','term_report'])assert.equal(Number((await db.pool.query(`SELECT COUNT(*) n FROM ${table} WHERE term_id=?`,[id]))[0][0].n),0);
 await rejects(ops().createTerm({...input,command:command('duplicate-term')}),409);
 await ops().makeTermCurrent({...a,termId:id,command:command('current')});assert.equal(String((await db.pool.query('SELECT id FROM academic_year WHERE is_current=1'))[0][0].id),id);
});
test('new term validates successor dates, school scope and school-wide publish lock',async t=>{
 const db=await createAdminTestDb(t),a=ctx(db),input={...a,sourceTermId:'1',...nextTerm,command:command('bad-term')};
 for(const patch of [{startDate:'2027-01-01'},{endDate:'2027-02-01'},{collectionDeadline:'2027-08-01'},{semester:1},{academicYear:'2028-2029'},{startDate:'2027-02-30'}])await rejects(ops().createTerm({...input,...patch}),422);
 await rejects(ops().createTerm({...input,actor:{...a.actor,schoolId:'2'}}),404);
 await db.pool.query("UPDATE academic_year SET release_status='FAILED'");await rejects(ops().createTerm(input),423);
 await db.pool.query("UPDATE academic_year SET release_status='IDLE'");
 const made=await ops().createTerm({...input,makeCurrent:true,command:command('current-create')});assert.equal(made.result.term.isCurrent,true);
 await db.pool.query("UPDATE academic_year SET release_status='FAILED' WHERE id=1");await rejects(ops().makeTermCurrent({...a,termId:made.result.term.id,command:command('current-locked')}),423);
});
test('V2 settings disclose current policy instead of V1 mutable rules and workspace routes self tasks correctly',async t=>{
 const db=await createAdminTestDb(t,{applicableFields:['conduct_politeness_self_star','math_regular_grade'],courseCardDefaultQuota:88}),a=ctx(db),settings=require('../services/reportCoreTermSettings');
 const read=await settings.getTermSettings(a);assert.equal(read.rules.schemaVersion,'SIX_EDU_V2');assert.equal(read.rules.defaultMonthlyQuota,88);assert.equal(read.rules.readOnly,true);assert.ok(!('cardTarget' in read.rules));assert.ok(!('legacyCardTargets' in read));
 await rejects(settings.previewTermSettings({...a,section:'rules',changes:{cardTarget:20,requiredMonths:['2026-10']},expectedConfigVersion:read.versions.config,expectedRuleVersion:read.versions.rule,command:command('old-rules')}),422);
 const workspace=await require('../services/reportCoreReadModels').getWorkspace({...a,actor:db.actors.student});assert.equal(workspace.tasks.length,1);assert.equal(workspace.tasks[0].fieldKey,'conduct_politeness_self_star');assert.equal(workspace.tasks[0].route.page,'self');
});
test('HTTP routes revoke JWTs, isolate role scope, return envelopes and safe CSV headers',async t=>{
 const db=await createAdminTestDb(t,{applicableFields:['math_regular_grade']}),{signToken}=require('../middleware/auth');
 process.env.JWT_SECRET='admin-ops-http-test-secret-long-enough';
 const server=require('../app').createApp({pool:db.pool,schoolId:'1'}).listen(0);t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/api/v1',managerToken=signToken(db.actors.manager),teacherToken=signToken(db.actors.teacher),studentToken=signToken(db.actors.student);
 const request=(path,token=managerToken,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const expectedDenial=async(message,call)=>{
  const observed=[],unexpected=[],original=console.error;
  const capture=t.mock.method(console,'error',(...args)=>{if(args.length===1&&args[0]===message)observed.push(args[0]);else {unexpected.push(args);original(...args);}});
  try {const response=await call();assert.deepEqual(observed,[message]);assert.deepEqual(unexpected,[]);return response;}finally{capture.mock.restore();}
 };
 assert.equal((await expectedDenial('[Error] AppError: 无此操作权限',()=>request('/admin/report-core/progress?termId=1',studentToken))).status,403);
 const p=await request('/admin/report-core/progress?termId=1');assert.equal(p.status,200);assert.equal(p.headers.get('cache-control'),'private, no-store');assert.equal((await p.json()).code,200);
 const reset=await request('/admin/report-core/accounts/2/password',managerToken,{termId:'1',password:'New-teacher-pass',expectedTokenVersion:1,reason:'本人申请',requestKey:'http-reset'});assert.equal(reset.status,200);assert.equal((await reset.json()).data.result.tokenVersion,2);
 assert.equal((await expectedDenial('[Error] AppError: 账号或登录已失效',()=>request('/me',teacherToken))).status,401);
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'teacher',password:'New-teacher-pass'})});assert.equal(login.status,200);
 const audits=await request('/admin/report-core/audits/export?termId=1');assert.equal(audits.status,200);assert.match(audits.headers.get('content-type'),/text\/csv/);assert.match(audits.headers.get('content-disposition'),/attachment/);assert.ok(!(await audits.text()).includes('New-teacher-pass'));
 assert.equal((await request('/admin/report-core/progress/export?termId=1')).status,200);
 const created=await request('/admin/report-core/terms/create',managerToken,{sourceTermId:'1',...nextTerm,requestKey:'http-term'});assert.equal(created.status,200);const id=(await created.json()).data.result.term.id;
 const current=await request('/admin/report-core/terms/'+id+'/current',managerToken,{requestKey:'http-current'});assert.equal(current.status,200);assert.equal((await current.json()).data.result.term.isCurrent,true);
 await db.pool.query('UPDATE student_term_evaluation SET section_meta=? WHERE student_id=4',[JSON.stringify({enrollment:{status:'NOT_APPLICABLE'}})]);
 const teacher=(await login.json()).data.token;const list=await request('/report-core/students?termId=1',teacher);assert.equal(list.status,200);assert.deepEqual((await list.json()).data.map(r=>String(r.student_id)),['3']);
});
test('progress retains registered empty classes with zero denominators and legacy enrollment compatibility',async t=>{
 const db=await createAdminTestDb(t,{applicableFields:['math_regular_grade']}),a=ctx(db);
 await db.pool.query('INSERT INTO school_class(school_id,term_id,grade,class_no) VALUES(1,1,5,2)');
 const model=await progress().getProgress(a),empty=model.classes.find(c=>c.grade===5&&c.classNo===2);assert.ok(empty);assert.equal(empty.counts.students,0);assert.equal(empty.sections.wisdom.total,0);
 assert.equal((await progress().getProgress({...a,grade:5})).classes.length,1);
 await db.pool.query('UPDATE student_term_evaluation SET section_meta=? WHERE student_id=3',[JSON.stringify({roster:{included:false}})]);
 assert.equal((await progress().getProgress(a)).counts.students,1);
 const legacy=require('../services/reportCoreReadModels');await db.pool.query('UPDATE student_term_evaluation SET section_meta=? WHERE student_id=4',[JSON.stringify({})]);assert.equal((await legacy.resolveTermRoster({connection:db.pool,schoolId:'1',termId:'1'})).length,1);
});
test('real class operations retain safe import, teacher assignment and transfer audit changes in JSON and CSV',async t=>{
 const db=await createAdminTestDb(t),a=ctx(db),classes=require('../services/reportCoreAdminClasses');
 await db.pool.query("UPDATE users SET real_name='PRIVATE_TEACHER_NAME' WHERE id=2");
 await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) SELECT 5,1,'teacher-new',password,'PRIVATE_TEACHER_NAME','teacher' FROM users WHERE id=2");
 const imported=await classes.previewClassImport({...a,rows:[{grade:4,classNo:2,displayName:'PRIVATE_CLASS_LABEL',responsibleTeacherUsername:'teacher'}],command:command('audit-import-preview')});
 await classes.commitClassImport({...a,previewId:imported.result.previewId,expectedRevision:imported.result.revision,command:command('audit-import-commit')});
 const registered=await classes.listClasses(a),source=registered.rows.find(r=>r.classNo===1),target=registered.rows.find(r=>r.classNo===2);
 const configured=await classes.previewTeachers({...a,classId:source.id,expectedRevision:source.revision,responsibleTeacherId:'5',assignments:[{subjectCode:'MATH',teacherId:'5'}],command:command('audit-teachers-preview')});
 await classes.commitTeachers({...a,classId:source.id,previewId:configured.result.previewId,expectedRevision:configured.result.revision,command:command('audit-teachers-commit')});
 const transfer=await classes.previewTransfer({...a,studentIds:['3'],targetClassId:target.id,reason:'PRIVATE_TRANSFER_REASON',command:command('audit-transfer-preview')});
 await classes.commitTransfer({...a,previewId:transfer.result.previewId,expectedRevision:transfer.result.revision,command:command('audit-transfer-commit')});
 const importRow=(await ops().listAudits({...a,type:'CLASS_IMPORT'})).rows[0];
 assert.ok(importRow.diffs.some(d=>d.field==='classCreated'&&d.grade===4&&d.classNo===2&&d.before===null&&d.after===true));
 assert.ok(importRow.diffs.some(d=>d.field==='responsibleTeacherId'&&d.before===null&&d.after==='2'));
 assert.equal(importRow.metadata.created,1);assert.equal(importRow.metadata.skipped,0);
 const teacherRow=(await ops().listAudits({...a,type:'CLASS_TEACHERS'})).rows[0];assert.equal(teacherRow.metadata.classId,source.id);assert.equal(teacherRow.metadata.studentCount,2);assert.equal(teacherRow.metadata.permissionsChanged,true);
 assert.ok(teacherRow.diffs.some(d=>d.field==='responsibleTeacherId'&&d.classId===source.id&&d.before==='2'&&d.after==='5'));
 assert.ok(teacherRow.diffs.some(d=>d.field==='assignment'&&d.classId===source.id&&d.subjectCode==='MATH'&&d.teacherId==='2'&&d.before===true&&d.after===false));
 assert.ok(teacherRow.diffs.some(d=>d.field==='assignment'&&d.subjectCode==='MATH'&&d.teacherId==='5'&&d.before===false&&d.after===true));
 const transferRow=(await ops().listAudits({...a,type:'CLASS_TRANSFER'})).rows[0];assert.equal(transferRow.metadata.targetClassId,target.id);assert.equal(transferRow.metadata.studentCount,1);assert.equal(transferRow.metadata.confirmationsInvalidated,true);assert.equal(transferRow.metadata.rankingsRebuilt,true);
 assert.deepEqual(transferRow.diffs,[{field:'grade',studentId:'3',before:4,after:4},{field:'classNo',studentId:'3',before:1,after:2}]);
 for(const [type,row] of [['CLASS_IMPORT',importRow],['CLASS_TEACHERS',teacherRow],['CLASS_TRANSFER',transferRow]]){
  const csv=await ops().exportAudits({...a,type});assert.ok(csv.includes(JSON.stringify(row.diffs).replace(/"/g,'""')));assert.ok(csv.includes(JSON.stringify(row.metadata).replace(/"/g,'""')));
  for(const secret of ['PRIVATE_CLASS_LABEL','PRIVATE_TEACHER_NAME','PRIVATE_TRANSFER_REASON']){assert.ok(!JSON.stringify(row).includes(secret));assert.ok(!csv.includes(secret));}
 }
 // Older committed records have the same nested diffs without a context id.
 // They must keep their safe teacher/subject changes without inventing an id.
 const [old]=await db.pool.query("SELECT id FROM evaluation_source_record WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.action'))='CLASS_TEACHERS'");
 await db.pool.query("UPDATE evaluation_source_record SET payload_json=JSON_REMOVE(payload_json,'$.classId') WHERE id=?",[old[0].id]);
 const historical=(await ops().listAudits({...a,type:'CLASS_TEACHERS'})).rows[0];assert.ok(historical.diffs.some(d=>d.subjectCode==='MATH'&&d.teacherId==='5'));assert.ok(!('classId' in historical.metadata));
});
