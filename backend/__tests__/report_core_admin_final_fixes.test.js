const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAdminTestDb,command}=require('./helpers/reportCoreAdminDb');
const classes=require('../services/reportCoreAdminClasses'),cards=require('../services/cards/reportCoreCourseCards'),ops=require('../services/reportCoreAdminOps'),publish=require('../services/reportCorePublish');
const {getTerm,parse}=require('../services/core/reportCoreStore');
const now=new Date('2026-10-20T04:00:00Z');
const ctx=db=>({pool:db.pool,actor:db.actors.manager,termId:'1'});
async function replacement(db,name='replace',teacherId='5'){
 const a=ctx(db),cls=(await classes.listClasses(a)).rows[0];
 const p=await classes.previewTeachers({...a,classId:cls.id,expectedRevision:cls.revision,responsibleTeacherId:'2',assignments:teacherId?[{subjectCode:'CHINESE',teacherId}]:[],command:command(name+'-preview')});
 return {...a,classId:cls.id,previewId:p.result.previewId,expectedRevision:p.result.revision,command:command(name+'-commit')};
}
async function cardFixture(t){
 const db=await createAdminTestDb(t,{courseCardDefaultQuota:3});
 process.env.CARD_PRINT_KEY=require('node:crypto').randomBytes(32).toString('hex');
 await db.pool.query("DELETE FROM teacher_teaching_assignment WHERE subject_code<>'CHINESE'");
 await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(5,1,'replacement','hash','Replacement','teacher')");
 const a={...ctx(db),actor:db.actors.teacher,now}, b={...a,actor:{...a.actor,id:'5'}};
 await cards.syncCourseCards({...a,command:command('initial-quota')});
 const scope={...a,monthKey:'2026-10',grade:4,classNo:1,subjectCode:'CHINESE'};
 return {db,a,b,scope};
}
const token=row=>new URLSearchParams(row.claimUrl.split('?')[1]).get('card');
test('replacement rotates old credentials, keeps USED facts and shared monthly budget across replay/removal/default edits',async t=>{
 const {db,a,b,scope}=await cardFixture(t),page=await cards.getCourseCardPage(scope);
 await require('../services/cards/reportCoreCards').redeemCard({pool:db.pool,actor:db.actors.student,token:token(page.rows[0]),now,command:command('used')});
 const [[before]]=await db.pool.query('SELECT * FROM evaluation_source_record WHERE id=?',[page.rows[0].id]);
 const change=await replacement(db);await classes.commitTeachers(change);await classes.commitTeachers(change);
 const settings=await cards.getCourseCardSettings(ctx(db));await cards.saveCourseCardSettings({...ctx(db),expectedRevision:settings.revision,defaultMonthlyTotal:99,quotas:{},command:command('new-default')});
 assert.equal((await cards.syncCourseCards({...b,command:command('replacement-sync')})).result.generated,0);
 const course=(await cards.listCourseCards({...b,monthKey:'2026-10'})).courses[0];
 assert.deepEqual([course.total,course.used,course.available],[3,1,2]);
 await assert.rejects(require('../services/cards/reportCoreCards').redeemCard({pool:db.pool,actor:db.actors.other,token:token(page.rows[1]),now,command:command('old-token')}),e=>[404,409].includes(e.statusCode));
 await assert.rejects(cards.getCourseCardPrint(scope),{statusCode:403});
 assert.equal((await require('../services/cards/reportCoreCards').listCards({...a,kind:'QUOTA'})).filter(r=>r.payload.mode==='COURSE_SUBJECT').length,0);
 assert.deepEqual((await db.pool.query('SELECT * FROM evaluation_source_record WHERE id=?',[page.rows[0].id]))[0][0],before);
 const print=await cards.getCourseCardPrint({...scope,actor:b.actor});assert.equal(print.rows.length,2);
 await classes.commitTeachers(await replacement(db,'remove',null));
 await assert.rejects(require('../services/cards/reportCoreCards').redeemCard({pool:db.pool,actor:db.actors.other,token:token(print.rows[0]),now,command:command('removed-token')}),e=>[404,409].includes(e.statusCode));
 await classes.commitTeachers(await replacement(db,'return','2'));
 assert.equal((await cards.syncCourseCards({...a,command:command('return-sync')})).result.generated,0);
 assert.equal((await cards.getCourseCardPrint(scope)).rows.length,2);
});
test('class reimport previews name-only update, preserves head/assignments and rejects stale registry CAS',async t=>{
 const db=await createAdminTestDb(t),a=ctx(db),old=(await classes.listClasses(a)).rows[0],before=await classes.getClass({...a,classId:old.id});
 const p=await classes.previewClassImport({...a,rows:[{grade:4,classNo:1,displayName:'更正班名',responsibleTeacherUsername:'does-not-exist'}],command:command('rename')});
 assert.equal(p.result.counts.updated,1);assert.equal(p.result.diffs[0].action,'UPDATE');assert.equal(p.result.diffs[0].before.displayName,old.displayName);
 const stale=await classes.previewClassImport({...a,rows:[{grade:4,classNo:1,displayName:'过期班名'}],command:command('rename-stale')});
 await classes.commitClassImport({...a,previewId:p.result.previewId,expectedRevision:p.result.revision,command:command('rename-commit')});
 const after=await classes.getClass({...a,classId:old.id});assert.equal(after.class.displayName,'更正班名');assert.equal(after.class.responsibleTeacherId,before.class.responsibleTeacherId);assert.deepEqual(after.assignments,before.assignments);assert.deepEqual(after.students,before.students);
 await assert.rejects(classes.commitClassImport({...a,previewId:stale.result.previewId,expectedRevision:stale.result.revision,command:command('stale-commit')}),{statusCode:409});
 const same=await classes.previewClassImport({...a,rows:[{grade:4,classNo:1,displayName:'更正班名'}],command:command('same')});assert.equal(same.result.counts.skipped,1);
});
async function confirmedFixture(t){
 const db=await createAdminTestDb(t,{applicableFields:['math_regular_grade']});
 await db.pool.query("UPDATE student_term_evaluation SET math_regular_grade='A',teacher_comment='PRIVATE_COMMENT'");
 const term=await getTerm(db.pool,'1','1');
 for(const e of (await db.pool.query('SELECT * FROM student_term_evaluation'))[0])await db.pool.query("UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=2,confirmed_at=UTC_TIMESTAMP(6),approval_fingerprint=? WHERE id=?",[require('../services/evaluation/reportCoreEvaluation').reportFingerprint(e,term),e.id]);
 await db.pool.query("UPDATE academic_year SET business_phase='RECONCILING'");return db;
}
test('disabled authoritative head blocks readiness/progress/begin; reenable restores review; unrelated disable does not invalidate',async t=>{
 const db=await confirmedFixture(t),a=ctx(db);assert.equal((await publish.getReadiness(a)).complete,true);
 await ops.setAccountStatus({...a,accountId:'2',status:1,expectedTokenVersion:1,reason:'停用',command:command('head-off')});
 const ready=await publish.getReadiness(a);assert.equal(ready.complete,false);assert.ok(ready.missing.some(r=>r.field==='responsibleTeacher'));
 assert.equal((await require('../services/reportCoreAdminProgress').getProgress(a)).counts.ready,0);
 await assert.rejects(publish.beginRelease({...a,command:command('disabled-release')}),{statusCode:422});
 await ops.setAccountStatus({...a,accountId:'2',status:0,expectedTokenVersion:2,reason:'启用',command:command('head-on')});assert.equal((await publish.getReadiness(a)).complete,true);
 await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(5,1,'unrelated','hash','Other','teacher')");
 await ops.setAccountStatus({...a,accountId:'5',status:1,expectedTokenVersion:1,reason:'停用',command:command('other-off')});assert.equal((await publish.getReadiness(a)).complete,true);
});
test('actual quota and roster producers retain allowlisted before/after and batch context in JSON and CSV',async t=>{
 const db=await createAdminTestDb(t),a=ctx(db);
 let settings=await cards.getCourseCardSettings(a);await cards.saveCourseCardSettings({...a,expectedRevision:settings.revision,quotas:{CHINESE:60},command:command('quota-before')});settings=await cards.getCourseCardSettings(a);
 await cards.saveCourseCardSettings({...a,expectedRevision:settings.revision,defaultMonthlyTotal:80,quotas:{CHINESE:70},command:command('quota-after')});
 const audit=(await ops.listAudits({...a,type:'COURSE_CARD_SETTINGS'})).rows[0];assert.ok(audit.diffs.some(d=>d.field==='defaultMonthlyTotal'&&d.before===100&&d.after===80));assert.ok(audit.diffs.some(d=>d.subjectCode==='CHINESE'&&d.before===60&&d.after===70));
 const imports=require('../services/imports/reportCoreImports'),p=await imports.previewImport({...a,kind:'ROSTER',rows:[{username:'student',real_name:'=SAFE_NAME',role:'student',grade:4,classNo:1}],command:command('roster-audit')});
 await imports.commitImport({...a,batchId:p.result.batchId,expectedRevision:p.result.revision,command:command('roster-audit-commit')});
 const row=(await ops.listAudits({...a,type:'ROSTER_IMPORT'})).rows[0];assert.equal(row.metadata.batchId,p.result.batchId);assert.equal(row.metadata.rowCount,1);assert.equal(row.metadata.updated,1);assert.ok(row.diffs.some(d=>d.field==='real_name'&&d.after==='=SAFE_NAME'));
 const typed=await ops.listAudits({...a,type:'ROSTER_IMPORT'}),keyword=await ops.listAudits({...a,q:'ROSTER_IMPORT'});
 assert.deepEqual(keyword.rows.map(r=>r.id),typed.rows.map(r=>r.id));assert.equal(keyword.total,typed.total);
 assert.deepEqual((await ops.listAudits({...a,q:'ROSTER_IMP'})).rows.map(r=>r.id),typed.rows.map(r=>r.id));
 assert.equal((await ops.listAudits({...a,q:'NO_SUCH_ACTION'})).total,0);
 const csv=await ops.exportAudits({...a,type:'ROSTER_IMPORT'});assert.equal(await ops.exportAudits({...a,q:'ROSTER_IMPORT'}),csv);assert.ok(csv.includes('=SAFE_NAME'));for(const secret of ['passwordHash','PRIVATE_COMMENT','token_hash','filePath'])assert.ok(!csv.includes(secret));
});
function gatedPool(pool,match){
 let reached,release;const waiting=new Promise(r=>reached=r),gate=new Promise(r=>release=r);
 return {waiting,release,pool:{query:pool.query.bind(pool),getConnection:async()=>{
  const c=await pool.getConnection(),query=c.query,close=c.release;let blocked=false;
  c.query=async(sql,args)=>{if(!blocked&&match(sql)){blocked=true;reached();await gate;}return query.call(c,sql,args);};
  c.release=()=>{c.query=query;c.release=close;return close.call(c);};return c;
 }}};
}
test('overlapping sync waits for replacement and observes current assignments without another budget', {timeout:20000},async t=>{
 const {db,a,b}=await cardFixture(t),change=await replacement(db,'overlap');
 const holder=await db.pool.getConnection();await holder.beginTransaction();await holder.query('SELECT id FROM academic_year WHERE id=1 FOR UPDATE');
 const replacementDone=classes.commitTeachers(change);
 const syncA=gatedPool(db.pool,sql=>sql.startsWith('SELECT * FROM academic_year')&&sql.endsWith(' FOR UPDATE'));
 const syncB=gatedPool(db.pool,sql=>sql.startsWith('SELECT * FROM academic_year')&&sql.endsWith(' FOR UPDATE'));
 const old=cards.syncCourseCards({...a,pool:syncA.pool,command:command('old-overlap-sync')});
 const next=cards.syncCourseCards({...b,pool:syncB.pool,command:command('new-overlap-sync')});
 await Promise.all([syncA.waiting,syncB.waiting]);await holder.commit();holder.release();await replacementDone;
 syncA.release();syncB.release();
 assert.deepEqual((await Promise.all([old,next])).map(r=>r.result.generated),[0,0]);
 assert.equal((await cards.listCourseCards({...a,monthKey:'2026-10'})).courses.length,0);
 assert.equal((await cards.getCourseCardPrint({...b,monthKey:'2026-10',grade:4,classNo:1,subjectCode:'CHINESE'})).rows.length,3);
});
test('redemption looked up before rotation rechecks credentials after its term/row lock wait', {timeout:20000},async t=>{
 const {db,scope}=await cardFixture(t),page=await cards.getCourseCardPage(scope);
 const gate=gatedPool(db.pool,sql=>sql.startsWith('SELECT * FROM academic_year')&&sql.endsWith(' FOR UPDATE'));
 const pending=require('../services/cards/reportCoreCards').redeemCard({pool:gate.pool,actor:db.actors.student,token:token(page.rows[0]),now,command:command('waiting-redemption')});
 await gate.waiting;await classes.commitTeachers(await replacement(db,'rotate-waiting'));gate.release();
 await assert.rejects(pending,{statusCode:409});
 assert.equal((await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE record_kind='CARD' AND status='USED'"))[0][0].n,'0');
});
test('legacy teacher-keyed batches reconcile once to original budget, preserve all USED owners and retire surplus',async t=>{
 const {db,a,b,scope}=await cardFixture(t);
 const [quotas]=await db.pool.query("SELECT * FROM evaluation_source_record WHERE record_kind='QUOTA'");
 await db.pool.query('UPDATE evaluation_source_record SET business_key=? WHERE id=?',[require('../services/core/reportCorePolicy').stableHash(['COURSE_QUOTA','1','1','2','2026-10','4:1:CHINESE']),quotas[0].id]);
 const {addSource}=require('../services/core/reportCoreStore');
 const extra=await addSource(db.pool,{schoolId:'1',termId:'1',ownerId:'5',actorId:'5',sourceType:'CARD',kind:'QUOTA',monthKey:'2026-10',status:'CONFIRMED',key:['legacy-other-teacher'],payload:{...parse(quotas[0].payload_json),quotaTotal:99}});
 await addSource(db.pool,{schoolId:'1',termId:'1',ownerId:'5',actorId:'5',sourceType:'CARD',kind:'CARD',parentId:extra,monthKey:'2026-10',ordinal:1,status:'UNUSED',delta:1,tokenHash:'f'.repeat(64),tokenCipher:'legacy-cipher',validFrom:new Date('2026-10-01'),validUntil:new Date('2026-11-01'),key:['legacy-extra-card'],payload:parse(quotas[0].payload_json)});
 await classes.commitTeachers(await replacement(db,'legacy-adopt'));
 await cards.syncCourseCards({...b,command:command('legacy-sync')});
 const course=(await cards.listCourseCards({...b,monthKey:'2026-10'})).courses[0];assert.deepEqual([course.total,course.used,course.available],[3,0,3]);
 assert.equal((await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE parent_id=? AND status='VOID'",[extra]))[0][0].n,'1');
 assert.equal((await cards.getCourseCardPrint({...scope,actor:b.actor})).rows.length,3);
 assert.equal((await cards.syncCourseCards({...a,command:command('legacy-old-sync')})).result.generated,0);
});
test('school account lock rejects cross-term maintenance during release and activation rechecks head', {timeout:30000},async t=>{
 const db=await confirmedFixture(t),a=ctx(db);
 const next=await ops.createTerm({...a,sourceTermId:'1',academicYear:'2026-2027',semester:2,termName:'下学期',startDate:'2027-02-15',endDate:'2027-07-15',collectionDeadline:'2027-07-01',makeCurrent:false,command:command('lock-next')});
 const release=await publish.beginRelease({...a,command:command('lock-release')});
 for(const kind of ['status','password'])await assert.rejects((kind==='status'?ops.setAccountStatus:ops.resetAccountPassword)({...a,termId:next.result.term.id,accountId:'2',status:1,password:'Safe-long-password',expectedTokenVersion:1,reason:'跨学期维护',command:command('cross-'+kind)}),{statusCode:423});
 await publish.prepareReleaseChunk({pool:db.pool,termId:'1',releaseKey:release.releaseKey,fence:release.fence});
 // Simulate an external administrator modifying the account outside the service.
 await db.pool.query('UPDATE users SET status=1 WHERE id=2');
 await assert.rejects(publish.activateRelease({...a,releaseKey:release.releaseKey,fence:release.fence,command:command('inactive-activate')}),{statusCode:409});
 await db.pool.query('UPDATE users SET status=0 WHERE id=2');
 await publish.activateRelease({...a,releaseKey:release.releaseKey,fence:release.fence,command:command('active-activate')});
 const row=(await ops.listAudits({...a,type:'activate-release'})).rows[0];assert.equal(row.metadata.termId,'1');assert.equal(row.metadata.releaseKey,release.releaseKey);assert.equal(row.metadata.total,2);assert.equal(row.metadata.activeVersion,1);
 const frozen=(await db.pool.query("SELECT id,snapshot_json FROM term_report WHERE status='PUBLISHED'"))[0];
 await ops.setAccountStatus({...a,termId:next.result.term.id,accountId:'2',status:1,expectedTokenVersion:1,reason:'历史报告不变',command:command('after-release-disable')});
 assert.deepEqual((await db.pool.query("SELECT id,snapshot_json FROM term_report WHERE status='PUBLISHED'"))[0],frozen);
});
test('confirmation audit preserves student/revision identifiers and omits private render review data',async t=>{
 const db=await createAdminTestDb(t,{applicableFields:['math_regular_grade']}),a=ctx(db),evaluation=require('../services/evaluation/reportCoreEvaluation');
 await db.pool.query("UPDATE student_term_evaluation SET math_regular_grade='A',teacher_comment='PRIVATE_COMMENT'");
 const studentKey={schoolId:'1',termId:'1',studentId:'3'},d=await require('../services/reports/reportCoreReportBrowser').getReportDetail({pool:db.pool,actor:db.actors.teacher,studentKey,scope:'full'});
 await evaluation.confirmReport({pool:db.pool,actor:db.actors.teacher,studentKey,expectedRevision:d.revision,expectedFingerprint:d.fingerprint,layoutReview:{overflow:false,fingerprint:d.fingerprint,templateVersion:d.templateVersion,renderScope:'FULL',documentKey:d.documentKey},command:command('audit-confirm')});
 const row=(await ops.listAudits({...a,type:'confirm-report'})).rows[0];assert.equal(row.metadata.studentId,'3');assert.equal(row.metadata.confirmedRevision,String(d.revision));
 const csv=await ops.exportAudits({...a,type:'confirm-report'});for(const secret of ['PRIVATE_COMMENT',d.fingerprint,d.documentKey])assert.ok(!csv.includes(secret));
});
test('teacher student DTO retains imported student identity number without exposing credentials',async t=>{
 const db=await createAdminTestDb(t),old=process.env.JWT_SECRET;process.env.JWT_SECRET='isolated-identity-test-secret';t.after(()=>{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old;});
 await db.pool.query("UPDATE users SET username='20260401' WHERE id=3");
 const app=require('../app').createApp({pool:db.pool,schoolId:'1'}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/report-core/students?termId=1`,{headers:{authorization:'Bearer '+require('../middleware/auth').signToken(db.actors.teacher)}});
 const json=await response.json(),row=json.data.find(s=>String(s.student_id)==='3');assert.equal(row.student_number,'20260401');assert.equal(row.password,undefined);assert.equal(row.token_version,undefined);
 const me=await (await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me?userId=2`,{headers:{authorization:'Bearer '+require('../middleware/auth').signToken(db.actors.student)}})).json();assert.equal(me.data.id,'3');assert.equal(me.data.username,'20260401');assert.equal(me.data.real_name,'student');assert.equal(me.data.password,undefined);
});
