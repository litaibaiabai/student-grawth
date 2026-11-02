const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {withFormalRollback}=require('../__tests__/helpers/formalRollback');
const {manager,command}=require('../__tests__/helpers/registryFixture');
const {buildAdminSimplificationFixtures}=require('./adminSimplificationFixtures');
const svc=name=>require('../services/'+name);
async function verifyAdminSimplification(){
 let result;const directory=await fs.mkdtemp(path.join(os.tmpdir(),'six-education-verify-')),previous=process.env.REPORT_FILES_DIR;process.env.REPORT_FILES_DIR=directory;
 try{await withFormalRollback(async({pool,connection:c})=>{
  const tag=crypto.randomBytes(5).toString('hex'),accounts={head:'closure_lin_'+tag,other:'closure_xu_'+tag,student:'00closure_'+tag},credentials=Object.fromEntries(Object.values(accounts).map(n=>[n,'Verify-pass-'+tag]));
  const input={academicYear:'2029-2030',semester:2,dates:{start:'2030-02-01',end:'2030-06-30'},accounts,credentials};
  const actor=await manager(c),registry=svc('reportCoreRegistry'),fixture=buildAdminSimplificationFixtures(input);
  const XLSX=require('xlsx'),bad=XLSX.read(fixture.workbook,{type:'buffer'});delete bad.Sheets['教师'];bad.SheetNames=bad.SheetNames.filter(n=>n!=='教师');
  const before=(await c.query('SELECT COUNT(*) n FROM academic_year'))[0][0].n;
  await assert.rejects(registry.previewRegistry({pool,actor,buffer:XLSX.write(bad,{type:'buffer',bookType:'xlsx'})}),{statusCode:422});assert.equal((await c.query('SELECT COUNT(*) n FROM academic_year'))[0][0].n,before);
  const preview=await registry.previewRegistry({pool,actor,buffer:fixture.workbook});assert.ok(preview.previewToken);
  const imported=await registry.commitRegistry({pool,actor,previewToken:preview.previewToken,command:command()}),termId=imported.result.termId;
  const load=async username=>{const[[u]]=await c.query('SELECT * FROM users WHERE school_id=1 AND username=?',[username]);return{id:String(u.id),schoolId:'1',role:u.role,tokenVersion:u.token_version};};
  const head=await load(accounts.head),other=await load(accounts.other),student=await load(accounts.student),args={pool,actor,termId},studentKey={schoolId:'1',termId,studentId:student.id};
  assert.equal((await c.query('SELECT COUNT(*) n FROM school_class WHERE term_id=?',[termId]))[0][0].n,'3');assert.equal((await c.query('SELECT COUNT(*) n FROM teacher_teaching_assignment WHERE term_id=?',[termId]))[0][0].n,'18');
  const semester=svc('reportCoreSemesterCards'),saved=await semester.saveSemesterCardSettings({...args,expectedRevision:1,defaultTotal:100,quotas:{CHINESE:60,MATH:70,ENGLISH:75},command:command()});
  const initialized=await semester.initializeSemesterCards({...args,expectedRevision:saved.result.revision,command:command()});assert.equal(initialized.result.generatedTotal,1515);
  const now=new Date('2030-02-15T00:00:00Z'),course=svc('reportCoreCourseCards');for(const[a,total]of [[head,1080],[other,435]])assert.equal((await course.listCourseCards({...args,actor:a,now})).courses.reduce((n,r)=>n+r.total,0),total);
  const page=await course.getCourseCardPage({...args,actor:head,grade:4,classNo:1,subjectCode:'CHINESE',now}),token=decodeURIComponent(new URL(page.rows[0].claimUrl).hash.split('card=')[1]);
  await svc('reportCoreCards').redeemCard({pool,actor:student,token,now,command:command()});await svc('reportCoreCards').directScore({...args,actor:head,studentIds:[student.id],categoryCode:'CHINESE_PROCESS',reason:'完整闭环验证',now,command:command()});
  const evaluation=svc('reportCoreEvaluation'),revision=async()=>String((await c.query('SELECT revision FROM student_term_evaluation WHERE term_id=? AND student_id=?',[termId,student.id]))[0][0].revision);
  await evaluation.submitForm({pool,actor:student,studentKey,expectedRevision:await revision(),values:require('./adminClosureFixtures').selfValues,command:command()});
  await svc('reportCoreWrittenStories').submitWrittenStory({...args,actor:student,text:'今天我和同学合作种下了一棵小树。我们轮流浇水，观察叶子，学会关爱生命，也懂得合作能让大家共同进步。',command:command()});
  const listening=svc('reportCoreListening'),catalog=await listening.listCatalog({...args,actor:student}),story=(catalog.stories||catalog.rows||catalog)[0];
  const started=await listening.startListening({...args,actor:student,storyId:story.id,now,command:command()}),sessionId=started.result.sessionId;
  const [[session]]=await c.query('SELECT payload_json FROM evaluation_source_record WHERE id=?',[sessionId]);const duration=svc('reportCoreStore').parse(session.payload_json).durationMs;
  await listening.heartbeat({pool,actor:student,sessionId,position:0,sampleMs:0,playing:true,now,command:command()});for(let elapsed=3000;elapsed<duration+3000;elapsed+=3000){const ms=Math.min(elapsed,duration);await listening.heartbeat({pool,actor:student,sessionId,position:ms/1000,sampleMs:ms,playing:ms<duration,now:new Date(+now+ms),command:command()});if(ms===duration)break;}
  assert.equal((await listening.completeListening({pool,actor:student,sessionId,now:new Date(+now+duration),command:command()})).result.awarded,true);
  const material=svc('reportCoreMaterials'),uploaded=await material.submitCertificate({...args,actor:student,file:{buffer:await fs.readFile(path.resolve(__dirname,'../../docs/test-file/admin-closure-award.png')),mimetype:'image/png'},command:command()});
  const [[certificate]]=await c.query("SELECT id,revision FROM evaluation_source_record WHERE term_id=? AND student_id=? AND source_type='CERTIFICATE' AND record_kind='ITEM' ORDER BY id DESC LIMIT 1",[termId,student.id]);
  assert.ok(uploaded);await material.decideCertificate({...args,actor:head,sourceId:String(certificate.id),expectedRevision:String(certificate.revision),facts:{title:'虚构闭环数学奖',awardRegion:'市级',awardLevel:'一等奖',subjectCode:'MATH'},reason:'人工核对演示材料',command:command()});
  const scores=buildAdminSimplificationFixtures({...input,termId}).teacherScoreWorkbook;
  for(const [teacher,name]of [[head,accounts.head],[other,accounts.other]]){const reviewed=await svc('reportCoreV2ImportReview').reviewV2Workbook({...args,actor:teacher,buffer:scores[name],command:command()});assert.deepEqual(reviewed.result.errors,[]);await svc('reportCoreImports').commitImport({...args,actor:teacher,batchId:reviewed.result.batchId,expectedRevision:reviewed.result.revision,command:command()});}
  for(const teacher of [head,other]){const targets=require('./adminClosureFixtures').processTargets.filter(k=>/^(math|english)_/.test(k)===(teacher===other));await evaluation.settleSources({...args,actor:teacher,grade:4,classNo:1,targetKeys:targets,settlement:'CARD_CLOSED',expectedRevisions:{[student.id]:await revision()},command:command()});}
  const awards=svc('reportCoreV2Policy').fixedFields.filter(f=>f.sourceType==='CERTIFICATE').map(f=>f.column);
  if(awards.length)await evaluation.settleSources({...args,actor:head,grade:4,classNo:1,targetKeys:awards,settlement:'NO_AWARD',expectedRevisions:{[student.id]:await revision()},command:command()});
  const [[collected]]=await c.query('SELECT * FROM student_term_evaluation WHERE term_id=? AND student_id=?',[termId,student.id]);
  assert.equal(svc('reportCoreStore').parse(collected.field_sources).chinese_process_star.raw,2);
  for(const [key,value]of Object.entries(require('./adminClosureFixtures').importValues)){if(typeof value==='number')assert.equal(Number(collected[key]),value,key);else assert.equal(collected[key],value,key);}
  const comment='仅班主任和学生可见的私有寄语：坚持阅读，乐于合作，祝你继续成长。';const comments=svc('reportCoreComments'),draftComment=await comments.saveComment({...args,actor:head,studentId:student.id,comment,expectedRevision:await revision(),expectedCommentId:null,command:command()});
  await comments.approveComments({...args,actor:head,entries:[{studentId:student.id,comment,expectedRevision:await revision(),expectedCommentId:draftComment.result.commentId}],command:command()});
  const draft=await evaluation.buildReportDraft({pool,actor:head,studentKey});assert.deepEqual(draft.missingItems,[]);
  const confirmed=await evaluation.confirmReport({pool,actor:head,studentKey,expectedRevision:draft.revision,expectedFingerprint:draft.fingerprint,layoutReview:{overflow:false,fingerprint:draft.fingerprint,templateVersion:draft.model.templateVersion,renderScope:'FULL',documentKey:draft.documentKey},command:command()});
  const published=await svc('reportCorePublishedReports').getPublishedReport({...args,actor:student});assert.equal(published.id,confirmed.result.reportId);assert.equal(published.studentId,student.id);
  const detail=await svc('reportCoreReportBrowser').getReportDetail({pool,actor:other,studentKey,version:'published',scope:'detail'});assert.ok(!JSON.stringify(detail).includes(comment));
  const stats=svc('reportCoreAdminStatistics'),cards=await stats.getAdminStatistics({...args,tab:'cards'});assert.equal(cards.summary.cardCount,1);assert.equal(cards.summary.directCount,1);
  assert.equal((await stats.getAdminStatistics({...args,tab:'self'})).summary.rated,11);assert.equal((await stats.getAdminStatistics({...args,tab:'honors'})).summary.approved,1);const stories=(await stats.getAdminStatistics({...args,tab:'stories'})).summary;assert.equal(stories.listenCount,1);assert.equal(stories.writeCount,1);
  result={checks:['atomic-invalid-workbook','three-class-mapping','one-time-semester-cards','daily-facts','teacher-excel-and-physical','head-confirms-publishes','private-comment-scope','four-statistics-tabs'],generatedTotal:initialized.result.generatedTotal,reportCellCount:(published.html.match(/data-view=/g)||[]).length,reportPageCount:(published.html.match(/data-print-page\b/g)||[]).length};
 });return{...result,unchangedStoredRows:true};}finally{if(previous===undefined)delete process.env.REPORT_FILES_DIR;else process.env.REPORT_FILES_DIR=previous;await fs.rm(directory,{recursive:true,force:true});}
}
if(require.main===module)verifyAdminSimplification().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={verifyAdminSimplification};
