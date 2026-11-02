const {test}=require('node:test'),assert=require('node:assert/strict');
const {withFormalRollback}=require('./helpers/formalRollback');
const {publishingFixture,confirmationArgs}=require('./helpers/publishingFixture');
const {command}=require('./helpers/registryFixture');
const evaluation=require('../services/reportCoreEvaluation'),pub=require('../services/reportCorePublishedReports');
test('head confirmation publishes this student atomically and corrections retain the old snapshot',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await publishingFixture(pool,c);await c.query("INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(1,?,4,'另一个尚未完成的学生',4,1,'CORE_V2','V2_1')",[args.termId]);const input=await confirmationArgs(args),cmd=command();
 assert.deepEqual((await evaluation.buildReportDraft(input)).missingItems,[]);
 const result=await evaluation.confirmReport({...input,command:cmd});assert.ok(result.result.reportId);
 let published=await pub.getPublishedReport({...args,actor:args.student,studentId:args.student.id});assert.equal(published.id,result.result.reportId);assert.equal(published.snapshot.fingerprint,result.result.fingerprint);assert.equal((await c.query('SELECT business_phase FROM academic_year WHERE id=?',[args.termId]))[0][0].business_phase,'COLLECTING');
 assert.equal((published.html.match(/data-view=/g)||[]).length,94);assert.equal((published.html.match(/data-print-page\b/g)||[]).length,2);
 const before=published;
 assert.equal((await evaluation.confirmReport({...input,command:cmd})).result.reportId,before.id);
 assert.equal((await evaluation.confirmReport({...input,command:command()})).result.reportId,before.id);
 const detail=await require('../services/reportCoreReportBrowser').getReportDetail({pool,actor:args.other,studentKey:args.studentKey,version:'published',scope:'detail'});assert.ok(!JSON.stringify(detail).includes('仅班主任和学生可见的私有寄语测试'));
 const list=await require('../services/reportCoreReportBrowser').listReportStudents({pool,actor:args.head,termId:args.termId});assert.equal(list.rows.find(r=>r.studentId===args.student.id).isPublished,true);assert.equal(list.counts.published,1);assert.equal(list.counts.total,2);
 await evaluation.submitForm({pool,actor:args.student,studentKey:args.studentKey,expectedRevision:input.expectedRevision,values:{conduct_politeness_self_star:1},command:command()});
 assert.equal((await pub.getPublishedReport({...args,actor:args.student,studentId:args.student.id})).id,before.id);
 const nextInput=await confirmationArgs(args);const next=await evaluation.confirmReport({...nextInput,command:command()});assert.equal(next.result.version,before.version+1);
 assert.equal((await pub.getPublishedReport({...args,actor:args.student,studentId:args.student.id,reportId:before.id})).snapshot.fingerprint,before.snapshot.fingerprint);
}));
test('prepared or global release versions cannot replace the latest confirmed student report',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await publishingFixture(pool,c),r=await evaluation.confirmReport({...await confirmationArgs(args),command:command()});
 await c.query('UPDATE academic_year SET active_release_version=999 WHERE id=?',[args.termId]);
 await c.query("INSERT INTO term_report(school_id,term_id,student_id,version,release_version,release_key,schema_version,template_version,rule_version,source_revision,approval_fingerprint,snapshot_json,snapshot_hash,status) SELECT school_id,term_id,student_id,99,999,?,schema_version,template_version,rule_version,source_revision,approval_fingerprint,snapshot_json,snapshot_hash,'PREPARED' FROM term_report WHERE id=?",[require('../services/reportCorePolicy').stableHash(['prepared',args.termId]),r.result.reportId]);
 assert.equal((await pub.getPublishedReport({...args,actor:args.student,studentId:args.student.id})).id,r.result.reportId);
 await assert.rejects(pub.getPublishedReport({...args,actor:{...args.student,id:'4'},studentId:args.student.id}),{statusCode:403});
}));
test('wrong teacher, stale layout and snapshot insert failure never leave a false confirmation',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await publishingFixture(pool,c),input=await confirmationArgs(args);
 await assert.rejects(evaluation.confirmReport({...input,actor:args.other,command:command()}),{statusCode:403});
 await assert.rejects(evaluation.confirmReport({...input,layoutReview:{...input.layoutReview,documentKey:'stale'},command:command()}),{statusCode:422});
 const failing={query:pool.query,getConnection:async()=>{const cc=await pool.getConnection();return{...cc,query:async(sql,p)=>{if(sql.includes('INSERT INTO term_report'))throw Error('injected snapshot error');return cc.query(sql,p);}};}};
 await assert.rejects(evaluation.confirmReport({...input,pool:failing,command:command()}),/injected snapshot error/);
 const[[e]]=await c.query('SELECT status,confirmed_by FROM student_term_evaluation WHERE term_id=? AND student_id=?',[args.termId,args.student.id]);assert.equal(e.status,'DRAFT');assert.equal(e.confirmed_by,null);
}));
test('historical frozen published reports remain readable without global-release gating',async()=>withFormalRollback(async({pool,connection:c})=>{
 const[[u]]=await c.query("SELECT * FROM users WHERE school_id=1 AND username='20260401'");
 const actor={id:String(u.id),schoolId:'1',role:'student',tokenVersion:u.token_version};const report=await pub.getPublishedReport({pool,actor,termId:'1'});assert.ok(report);assert.equal(report.studentId,actor.id);
 const[[teacher]]=await c.query("SELECT * FROM users WHERE school_id=1 AND username='teacher_lin'");const detail=await require('../services/reportCoreReportBrowser').getReportDetail({pool,actor:{id:String(teacher.id),schoolId:'1',role:'teacher',tokenVersion:teacher.token_version},studentKey:{schoolId:'1',termId:'1',studentId:actor.id},version:'current',scope:'full'});assert.equal(detail.permissions.canConfirm,false);
}));
