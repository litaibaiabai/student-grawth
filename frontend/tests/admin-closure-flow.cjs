const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {seedAdminClosureDemo}=require('../../backend/scripts/seedAdminClosureDemo');
const fixture=require('../../backend/scripts/adminClosureFixtures');
const {createDbPool}=require('../../backend/db');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function run(){
 const manifest=await seedAdminClosureDemo({database:`liuyu_report_test_admin_flow_${Date.now()}`}),pool=createDbPool({database:manifest.database});
 const app=require('../../backend/app').createApp({pool,schoolId:manifest.schoolId}),server=app.listen(0);
 await new Promise(resolve=>server.once('listening',resolve));
 const origin=`http://127.0.0.1:${server.address().port}/api/v1`,evidence=[];let serial=0;
 const record=(step,expected,actual)=>{evidence.push({step,expected,actual,at:new Date().toISOString()});console.log('PASS',step);};
 const call=async(token,url,body,method,expected=200)=>{
  let data=body;if(body instanceof FormData)body.set('requestKey',`closure-${++serial}`);else if(body)data={...body,requestKey:`closure-${++serial}`};
  const response=await fetch(origin+url,{method:method||(body?'POST':'GET'),headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body?body instanceof FormData?body:JSON.stringify(data):undefined});
  const result=await response.json();assert.equal(response.status,expected,`${method||'GET'} ${url}: ${result.message}`);return result.data?.result??result.data;
 };
 const login=async username=>call(null,'/auth/login',{username,password:'Demo-pass-2026'});
 const expectedError=async(message,fn)=>{const original=console.error;let count=0;console.error=(...args)=>{if(args[0]==='[Error] AppError: '+message)count++;else original(...args);};try{await fn();assert.equal(count,1);}finally{console.error=original;}};
 const importRows=async(token,rows)=>{const p=await call(token,'/report-core/imports/preview',{termId:'1',kind:'ROSTER',rows:rows.map(r=>({...r,password:'Demo-pass-2026'}))});assert.deepEqual(p.errors,[]);return call(token,`/report-core/imports/${p.batchId}/commit`,{termId:'1',expectedRevision:p.revision});};
 const multipart=async(file,extra={})=>{const data=new FormData();for(const [k,v]of Object.entries({termId:'1',...extra}))data.set(k,String(v));data.set('file',new Blob([await fs.readFile(file)]),path.basename(file));return data;};
 try{
  const admin=await login('admin'),manager=admin.token;
  for(const table of ['school_class','teacher_teaching_assignment','student_term_evaluation','evaluation_source_record','term_report'])assert.equal(Number((await pool.query(`SELECT COUNT(*) n FROM ${table}`))[0][0].n),0);
  await importRows(manager,fixture.teacherRows);
  const classPreview=await call(manager,'/admin/report-core/classes/imports/preview',{termId:'1',rows:fixture.classRows});
  assert.equal((await call(manager,'/admin/report-core/classes?termId=1')).total,0);
  await call(manager,`/admin/report-core/classes/imports/${classPreview.previewId}/commit`,{termId:'1',expectedRevision:classPreview.revision});
  await importRows(manager,fixture.studentRows);
  const teachers=(await call(manager,'/admin/report-core/accounts?termId=1&role=teacher')).rows,lin=teachers.find(r=>r.username==='teacher_lin'),xu=teachers.find(r=>r.username==='teacher_xu');
  const classList=await call(manager,'/admin/report-core/classes?termId=1');assert.equal(classList.rows.length,3);
  const subjects=['MORAL','CHINESE','MATH','SCIENCE','ENGLISH','PE','MUSIC','FINE_ART','INFORMATION_TECHNOLOGY','LABOR','INTEGRATED_PRACTICE','LOCAL_COURSE'];
  for(const cls of classList.rows){
   const assignments=(cls.classNo===1?subjects:['CHINESE','MATH','ENGLISH']).map(subjectCode=>({subjectCode,teacherId:['MATH','ENGLISH'].includes(subjectCode)?xu.id:lin.id}));
   const p=await call(manager,`/admin/report-core/classes/${cls.id}/teachers/preview`,{termId:'1',expectedRevision:cls.revision,responsibleTeacherId:lin.id,assignments});
   await call(manager,`/admin/report-core/classes/${cls.id}/teachers/previews/${p.previewId}/commit`,{termId:'1',expectedRevision:p.revision});
  }
  record('管理员实际导入教师、班级、学生并配置教师','3班/2教师/1学生；预览不入库','符合');
  const settings=await call(manager,'/report-core/course-card-settings?termId=1');
  assert.equal(settings.defaultMonthlyTotal,100);
  await call(manager,'/report-core/course-card-settings',{termId:'1',expectedRevision:settings.revision,defaultMonthlyTotal:100,quotas:{CHINESE:60,MATH:70,ENGLISH:75}},'PUT');
  const teacher=(await login('teacher_lin')).token,teacherXu=(await login('teacher_xu')).token,studentLogin=await login('20260401'),student=studentLogin.token,studentId=studentLogin.user.id;
  await call(teacher,'/report-core/course-cards/sync',{termId:'1'});await call(teacherXu,'/report-core/course-cards/sync',{termId:'1'});
  const monthKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date()).replace('/','-');
  const cards=await call(teacher,`/report-core/course-cards?termId=1&monthKey=${monthKey}`);
  assert.deepEqual(cards.courses.filter(c=>c.subjectCode==='CHINESE').map(c=>c.total),[60,60,60]);
  assert.equal(cards.courses.find(c=>c.subjectCode==='MORAL').total,100);
  const credentials=await call(teacher,`/report-core/course-cards/preview?termId=1&monthKey=${monthKey}&grade=4&classNo=1&subjectCode=CHINESE`);
  const nowSettings=await call(manager,'/report-core/course-card-settings?termId=1');
  await call(manager,'/report-core/course-card-settings',{termId:'1',expectedRevision:nowSettings.revision,defaultMonthlyTotal:80,quotas:{CHINESE:60,MATH:70,ENGLISH:75}},'PUT');
  const sameCredentials=await call(teacher,`/report-core/course-cards/preview?termId=1&monthKey=${monthKey}&grade=4&classNo=1&subjectCode=CHINESE`);
  assert.deepEqual(sameCredentials,credentials);
  const claimToken=decodeURIComponent(credentials.rows[0].claimUrl.match(/[?&]card=([^&]+)/)[1]);
  const credited=await call(student,'/report-core/cards/redeem',{token:claimToken});assert.equal(credited.pointsCredited,1);
  assert.equal((await call(teacher,`/report-core/course-cards?termId=1&monthKey=${monthKey}`)).courses.find(c=>c.subjectCode==='CHINESE'&&c.classNo===1).used,1);
  record('课程卡按班科自动生成并保留既有凭证','语文60×3=180；道法继承100；改默认不改变旧卡','符合');
  await call(teacher,'/report-core/direct-scores',{termId:'1',studentIds:[studentId],categoryCode:'CHINESE_PROCESS',reason:'主动分享阅读收获'});
  let evaluation=await call(student,`/report-core/evaluations/${studentId}?termId=1`);
  await call(student,`/report-core/forms/${studentId}`,{termId:'1',expectedRevision:evaluation.revision,values:fixture.selfValues},'PATCH');
  await call(student,'/report-core/v2/written-stories',{termId:'1',text:'放学后，我和同学照顾校园里的小树。我们轮流浇水，清理树下的纸屑，也记录叶子的变化。这次经历让我学会合作与坚持。'});
  const catalog=await call(student,'/report-core/v2/catalog?termId=1'),shortest=catalog.slice().sort((a,b)=>a.durationMs-b.durationMs)[0];
  const listening=await call(student,'/report-core/v2/listening',{termId:'1',storyId:shortest.id}),epoch=Date.now();
  await call(student,`/report-core/v2/listening/${listening.sessionId}/heartbeat`,{termId:'1',position:0,sampleMs:0,playing:true});
  while(Date.now()-epoch<shortest.durationMs){await sleep(Math.min(3000,shortest.durationMs-(Date.now()-epoch)));const elapsed=Math.min(Date.now()-epoch,shortest.durationMs);await call(student,`/report-core/v2/listening/${listening.sessionId}/heartbeat`,{termId:'1',position:elapsed/1000,sampleMs:elapsed,playing:elapsed<shortest.durationMs});}
  const completed=await call(student,`/report-core/v2/listening/${listening.sessionId}/complete`,{termId:'1'});assert.equal(completed.awarded,true);
  record('师生日常操作','直评+1、学生11自评、写1篇、实时听1篇；API时间线测试单独标记','符合');
  const certificate=new FormData();certificate.set('termId','1');certificate.set('file',new Blob([await fs.readFile(manifest.files.certificate)],{type:'image/png'}),'虚构奖状.png');
  const award=await call(student,'/report-core/certificates',certificate);
  const pendingAward=await call(manager,'/admin/report-core/readiness?termId=1');assert.ok(pendingAward.missing.some(r=>r.field==='materials'));
  await call(teacher,`/report-core/certificates/${award.sourceId}/decision`,{termId:'1',expectedRevision:'1',facts:{title:'阅读表达活动',awardRegion:'区级',awardLevel:'一等奖',subjectCode:'CHINESE'},reason:'人工核对虚构测试奖状'});
  record('学生上传奖状、教师人工核验','待处理材料阻断发布，人工认定后进入荣誉汇总；不调用OCR模型','符合');
  const bad=await call(manager,'/admin/report-core/readiness?termId=1');assert.equal(bad.complete,false);
  const upload=await multipart(manifest.files.scores,{kind:'ACADEMIC'}),scorePreview=await call(teacher,'/report-core/imports/file-preview',upload);
  assert.deepEqual(scorePreview.errors,[]);assert.equal(scorePreview.students[0].values.jump_rope_1min,0);
  await call(teacher,`/report-core/imports/${scorePreview.batchId}/commit`,{termId:'1',expectedRevision:scorePreview.revision});
  for(const [token,targets]of [[teacher,fixture.processTargets.filter(k=>!['math_process_star','english_process_star'].includes(k))],[teacherXu,['math_process_star','english_process_star']]]){
   evaluation=await call(teacher,`/report-core/evaluations/${studentId}?termId=1`);
   await call(token,'/report-core/settlements',{termId:'1',grade:4,classNo:1,targetKeys:targets,settlement:'CARD_CLOSED',expectedRevisions:{[studentId]:evaluation.revision}});
  }
  let comment=await call(teacher,`/report-core/v2/comments/${studentId}?termId=1`);
  comment=await call(teacher,'/report-core/v2/comments/save',{termId:'1',studentId,comment:'林小禾认真完成学习任务，在阅读分享中表现主动，也在照顾小树的过程中学会合作。期待你继续保持好奇心。',expectedRevision:comment.revision,expectedCommentId:comment.commentId});
  await call(teacher,'/report-core/v2/comments/approve',{termId:'1',entries:[{studentId,comment:comment.comment,expectedRevision:comment.revision,expectedCommentId:comment.commentId}]});
  const report=()=>call(teacher,`/report-core/report-detail/${studentId}?termId=1&scope=full&version=current`);
  const confirm=async r=>call(teacher,'/report-core/reports/confirm',{termId:'1',studentId,expectedRevision:r.revision,expectedFingerprint:r.fingerprint,layoutReview:{documentKey:r.documentKey,renderScope:'FULL',overflow:false,fingerprint:r.fingerprint,templateVersion:r.templateVersion}});
  let draft=await report();assert.deepEqual(draft.missingItems,[]);const expected=fixture.expectedValues({listenCount:1,writeCount:1,chinesePoints:2});
  assert.equal(draft.model.sourceSummary.chinese_process_star.raw,2);
  assert.equal(draft.model.honors[0].name,'阅读表达活动');
  for(const [key,value]of Object.entries(expected))if(key!=='story_summary')assert.equal(typeof value==='number'?Number(draft.model.values[key]):draft.model.values[key],value,key);
  for(const type of ['WRITE','LISTEN','TELL'])for(const key of ['value','rank'])assert.equal(draft.model.values.story_summary[type][key],expected.story_summary[type][key],`${type}.${key}`);
  await confirm(draft);assert.equal((await call(manager,'/admin/report-core/readiness?termId=1')).complete,true);
  const correction=await call(teacher,'/report-core/imports/preview',{termId:'1',kind:'ACADEMIC',rows:[{username:'20260401',values:{math_regular_grade:'A'}}]});
  await call(teacher,`/report-core/imports/${correction.batchId}/commit`,{termId:'1',expectedRevision:correction.revision});
  assert.equal((await call(manager,'/admin/report-core/readiness?termId=1')).complete,false);
  draft=await report();await confirm(draft);
  record('教师完整成绩/体测、结算、寄语与班主任报告审核','88个固定值+6故事格逐一对账；零值正确；更正撤销确认后重审','符合');
  const state=await call(manager,'/report-core/term-state?termId=1');
  await call(manager,'/admin/report-core/phase',{termId:'1',phase:'RECONCILING',reason:'期末核对完成',expectedDataRevision:state.dataRevision});
  const release=await call(manager,'/admin/report-core/releases',{termId:'1'});
  await call(manager,`/admin/report-core/releases/${release.releaseKey}/prepare`,{termId:'1',fence:release.fence});
  assert.equal(await call(student,'/report-core/reports/current?termId=1'),null);
  await call(manager,`/admin/report-core/releases/${release.releaseKey}/activate`,{termId:'1',fence:release.fence});
  const published=await call(student,'/report-core/reports/current?termId=1');assert.equal(published.snapshot.schemaVersion,'CORE_V2');assert.equal(published.snapshot.values.math_regular_grade,'A');assert.equal(published.releaseVersion,1);
  assert.equal((await call(manager,'/report-core/term-state?termId=1')).phase,'FROZEN');
  assert.equal((published.html.match(/data-view=/g)||[]).length,94);
  const detail=await call(teacherXu,`/report-core/report-detail/${studentId}?termId=1&scope=detail&version=published`);
  assert.ok(!JSON.stringify(detail).includes(comment.comment));
  await expectedError('仅班主任可查看完整报告',()=>call(teacherXu,`/report-core/report-detail/${studentId}?termId=1&scope=full&version=published`,null,null,403));
  await fs.writeFile(path.join(manifest.outputDir,'published-report.html'),published.html);
  await fs.writeFile(path.join(manifest.outputDir,'expected-values.json'),JSON.stringify({...expected,math_regular_grade:'A'},null,2));
  record('管理员原子发布与三角色权限','准备不可见；统一发布后本人可读；任课教师只读冻结明细；94位置','符合');
  const progress=await call(manager,'/admin/report-core/progress?termId=1');assert.equal(progress.counts.students,1);assert.equal(progress.counts.ready,1);assert.equal(progress.counts.published,1);assert.equal(progress.classes.length,3);
  const statistics=async tab=>call(manager,`/admin/report-core/statistics?termId=1&tab=${tab}`);
  const rewardStats=await statistics('cards');assert.equal(rewardStats.summary.cardCount,1);assert.equal(rewardStats.summary.directCount,1);assert.equal(rewardStats.summary.totalCount,2);
  const selfStats=await statistics('self');assert.equal(selfStats.summary.completed,1);assert.equal(selfStats.summary.rated,11);
  const honorStats=await statistics('honors');assert.equal(honorStats.summary.approved,1);assert.equal(honorStats.charts.levels.find(r=>r.label==='区/县级').count,1);
  const storyStats=await statistics('stories');assert.equal(storyStats.summary.listenCount,1);assert.equal(storyStats.summary.writeCount,1);assert.equal(storyStats.summary.tellCount,0);assert.equal(storyStats.summary.participants,1);
  record('沿用重构后的四类统计口径','扫码1+直评1；自评完成11项；已认定荣誉1；听1/写1/讲0，参与人数去重1','符合');
  const disabled=await call(manager,`/admin/report-core/accounts/${xu.id}/status`,{termId:'1',status:1,expectedTokenVersion:xu.tokenVersion,reason:'测试停用与登录撤销'});
  await expectedError('账号或登录已失效',()=>call(teacherXu,'/me',null,null,401));
  const enabled=await call(manager,`/admin/report-core/accounts/${xu.id}/status`,{termId:'1',status:0,expectedTokenVersion:disabled.tokenVersion,reason:'完成停用验证，恢复测试教师'});
  const reset=await call(manager,`/admin/report-core/accounts/${xu.id}/password`,{termId:'1',password:'Updated-test-2026',expectedTokenVersion:enabled.tokenVersion,reason:'验证密码重置撤销旧令牌'});assert.equal(reset.passwordChanged,true);
  assert.ok((await call(null,'/auth/login',{username:'teacher_xu',password:'Updated-test-2026'})).token);
  const audits=await call(manager,'/admin/report-core/audits?termId=1');assert.ok(audits.total>0);assert.ok(!JSON.stringify(audits).includes('Updated-test-2026'));assert.ok(!JSON.stringify(audits).includes('passwordHash'));
  for(const name of ['audits','progress']){const response=await fetch(origin+`/admin/report-core/${name}/export?termId=1`,{headers:{Authorization:'Bearer '+manager}});assert.equal(response.status,200);const csv=await response.text();assert.ok(!csv.includes('Updated-test-2026'));await fs.writeFile(path.join(manifest.outputDir,name+'.csv'),csv);}
  const next=await call(manager,'/admin/report-core/terms/create',{sourceTermId:'1',academicYear:'2026-2027',semester:2,termName:'2026-2027学年第二学期',startDate:'2027-02-01',endDate:'2027-06-30',collectionDeadline:'2027-06-29',makeCurrent:false});
  assert.equal((await call(manager,`/admin/report-core/classes?termId=${next.term.id}`)).total,0);
  assert.equal((await call(manager,`/admin/report-core/progress?termId=${next.term.id}`)).counts.students,0);
  await call(manager,`/admin/report-core/terms/${next.term.id}/current`,{});assert.equal((await call(manager,'/report-core/terms')).find(t=>t.is_current===1).id,next.term.id);
  await call(manager,'/admin/report-core/terms/1/current',{});
  record('管理服务闭环','统计同口径、账号停启/密码重置撤销令牌、安全审计导出、新学期空数据及切换','符合');
  await fs.writeFile(path.join(manifest.outputDir,'api-flow-evidence.json'),JSON.stringify({status:'PASS',kind:'真实HTTP自动化，非MCP界面演示',manifest,evidence},null,2));
  console.log('ADMIN_CLOSURE_API_PASS',manifest.outputDir);
 }catch(error){await fs.writeFile(path.join(manifest.outputDir,'api-flow-evidence.json'),JSON.stringify({status:'FAIL',error:error.message,evidence},null,2));throw error;}
 finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
