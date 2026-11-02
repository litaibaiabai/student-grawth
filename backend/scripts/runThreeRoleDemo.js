const fs=require('node:fs/promises'),path=require('node:path');
const {normalizeDemoOptions,classifyDemoState,redactDemoText,loadDemoAccounts,inspectDemoTerm,resumeDemoFromReport}=require('./threeRoleDemo/config');
function parseDemoArgs(args){const options={};const names={'--resume':'resume','--mode':'mode','--academic-year':'academicYear','--semester':'semester','--api-port':'apiPort','--web-port':'webPort','--step-delay':'stepDelay'};for(let i=0;i<args.length;i++){if(args[i]==='--help'||args[i]==='-h')options.help=true;else if(args[i]==='--exit-after')options.exitAfter=true;else if(names[args[i]]&&args[i+1]&&!args[i+1].startsWith('--'))options[names[args[i]]]=args[++i];else throw Error('未知参数或缺少值：'+args[i]);}return options;}
const help=`三角色可见浏览器闭环演示（Chrome）\n\n项目根运行：node backend/scripts/runThreeRoleDemo.js\n\n--mode auto|full|replay   默认auto；新学期完整演示，已发布学期只回放\n--academic-year YYYY-YYYY 默认2027-2028\n--semester 1|2           默认1\n--step-delay 毫秒        每步停留，默认1200\n--api-port 20080 --web-port 20081\n--exit-after             结束后关闭浏览器和服务，完成录像\n--resume report.json     仅续跑已完成日常事实后的审核发布失败，不重做日常记录\n\n凭据从本机DEMO_PASSWORD或现有开发密码列读取，不修改、不输出密码。\n现有初始化但尚未完成的学期拒绝盲重跑；从不重置或删除卡片。\n默认结束后停在学生报告页，Ctrl+C关闭并完成录像。\n`;
async function runThreeRoleBrowserDemo(input={}){
 if(input.help)return{help};
 const options=normalizeDemoOptions(input),root=path.resolve(__dirname,'../..'),stamp=new Date().toISOString().replace(/[:.]/g,'-'),outputDir=path.join(root,'output/report-core/three-role-browser-demo',`${options.academicYear}-${options.semester}`,stamp);
 await fs.mkdir(outputDir,{recursive:true,mode:0o700});
 let runtime,browser,context,page,accounts,secrets=[],closing,stopRequested=false,settled=false,releaseHold;
 const report={status:'RUNNING',mode:null,academicYear:options.academicYear,semester:options.semester,startedAt:new Date().toISOString(),url:`http://localhost:${options.webPort}`,steps:[],outputDir};
 const save=()=>fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
 const close=()=>closing||(closing=(async()=>{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await runtime?.close().catch(()=>{});if(page?.video()){const file=await page.video().path().catch(()=>null);if(file){report.video=path.relative(outputDir,file);report.videoFinalized=true;}}report.closedAt=new Date().toISOString();await save();})());
 const stop=()=>{stopRequested=true;releaseHold?.();if(!settled)void browser?.close().catch(()=>{});};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const pool=require('../db').createDbPool({database:'student_growth'});let state;
  try{accounts=input.bootstrapAccounts||await loadDemoAccounts(pool);state=await inspectDemoTerm(pool,options);}finally{await pool.end();}
  secrets=Object.values(accounts).map(a=>a.password);
  const previous=input.resume?JSON.parse(await fs.readFile(path.resolve(input.resume),'utf8')):null;let resumeAt=0;if(previous){resumeAt=resumeDemoFromReport(previous,require('./threeRoleDemo/steps').createDemoSteps({mode:'full'}),state,options);report.mode='full';report.resumedFrom=path.resolve(input.resume);report.steps=previous.steps.filter(r=>r.status==='PASS').map(r=>({...r,sourceReport:r.sourceReport||report.resumedFrom}));}else report.mode=classifyDemoState(state,options.mode);report.termId=state?.termId||null;
  if(report.mode==='full'&&!previous)report.backup=await require('../services/formalDatabaseBackup').backupFormal(path.join(outputDir,'backups'));
  await save();if(stopRequested)throw Error('演示已中止');
  const manifestFile=path.join(outputDir,'runtime-manifest.json');await fs.writeFile(manifestFile,JSON.stringify({database:'student_growth',schoolId:'1'}),{mode:0o600});
  runtime=await require('./runAdminClosureDemo').runAdminClosureDemo({manifestFile,apiPort:options.apiPort,webPort:options.webPort,demoNow:options.demoNow});if(stopRequested)throw Error('演示已中止');
  const media=input.fresh?await require('./threeRoleDemo/media').prepareMedia(path.join(outputDir,'media')):null;const {chromium}=require('playwright');browser=await chromium.launch({channel:'chrome',headless:false,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,slowMo:100,args:['--autoplay-policy=no-user-gesture-required',...(media?.args||[])]});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(outputDir,'video'),size:{width:1440,height:1000}},acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(20000);
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(redactDemoText(error.message,secrets)));
  page.on('dialog',async dialog=>{if(/离开|放弃|尚未保存|未提交/.test(dialog.message()))await dialog.accept();else{pageErrors.push('未预期的浏览器对话框：'+redactDemoText(dialog.message(),secrets));await dialog.dismiss();}});
  const driver=require('./threeRoleDemo/driver').createDemoDriver(page,{outputDir,stepDelay:options.stepDelay});await driver.installPointer();await page.goto(report.url);
  const filesDir=path.join(outputDir,'inputs');await fs.mkdir(filesDir,{recursive:true,mode:0o700});
  const files={registry:path.join(filesDir,'学期初始化.xlsx'),invalid:path.join(filesDir,'错误-缺少教师表.xlsx'),award:path.join(root,'docs/test-file/admin-closure-award.png'),scores:{head:path.join(filesDir,'林老师成绩.xlsx'),other:path.join(filesDir,'徐老师成绩.xlsx')}};
  const ctx={driver,accounts,files,mode:report.mode,termId:state?.termId,secrets,fresh:input.fresh,media};
  const build=termId=>require('./adminSimplificationFixtures').buildAdminSimplificationFixtures({academicYear:options.academicYear,semester:options.semester,dates:{start:options.startDate,end:options.endDate,measurement:options.demoNow.slice(0,10)},termId,current:true,credentials:input.fresh?Object.fromEntries(Object.values(accounts).filter(a=>a.username!=='admin').map(a=>[a.username,a.password])):{}});
  const fixture=build(ctx.termId);await fs.writeFile(files.registry,fixture.workbook,{mode:0o600});
  const XLSX=require('xlsx'),invalid=XLSX.read(fixture.workbook,{type:'buffer'});invalid.SheetNames=invalid.SheetNames.filter(n=>n!=='教师');delete invalid.Sheets['教师'];await fs.writeFile(files.invalid,XLSX.write(invalid,{type:'buffer',bookType:'xlsx'}),{mode:0o600});
  ctx.setTerm=async termId=>{ctx.termId=termId;report.termId=termId;const f=build(termId);await fs.writeFile(files.scores.head,f.teacherScoreWorkbook[accounts.head.username],{mode:0o600});await fs.writeFile(files.scores.other,f.teacherScoreWorkbook[accounts.other.username],{mode:0o600});await save();};
  if(ctx.termId)await ctx.setTerm(ctx.termId);
  const {createDemoSteps,executeDemoSteps}=require('./threeRoleDemo/steps'),steps=createDemoSteps(ctx).slice(resumeAt);if(previous){const role=steps[0].role;await driver.signIn(accounts[role==='学生'?'student':role==='管理员'?'manager':'head']);await driver.selectTerm(ctx.termId);}
  console.log(`开始${report.mode==='full'?'完整闭环鼠标演示':'已有结果鼠标回放'}：${options.academicYear}第${options.semester}学期`);
  await executeDemoSteps(steps,{secrets,present:async step=>{if(stopRequested)throw Error('演示已中止');console.log(`[${step.role}] ${step.title}\n预期：${step.expected}`);await driver.present(step);await driver.sleep(options.stepDelay);},capture:async id=>{await driver.capture(id);if(!id.endsWith('-failed')&&pageErrors.length)throw Error(pageErrors.join('\n'));},record:async record=>{report.steps.push(record);await save();console.log(record.status+' '+record.id);}});
  report.status='PASS';report.finishedAt=new Date().toISOString();settled=true;await save();console.log('演示通过，报告：'+path.join(outputDir,'report.json'));
  if(!options.exitAfter&&!stopRequested){console.log('浏览器停在学生报告页。按Ctrl+C关闭并完成录像。');await new Promise(resolve=>{releaseHold=resolve;});}
  return report;
 }catch(error){report.status=stopRequested?'INTERRUPTED':'FAIL';report.error=redactDemoText(error.message,secrets);report.finishedAt=new Date().toISOString();await page?.screenshot({path:path.join(outputDir,'failure.png'),fullPage:false}).catch(()=>{});await save();throw Error(report.error+'\n报告：'+path.join(outputDir,'report.json'));}
 finally{await close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module){let input;try{input=parseDemoArgs(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}if(input)runThreeRoleBrowserDemo(input).then(result=>{if(result.help)console.log(result.help);}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={runThreeRoleBrowserDemo,parseDemoArgs};
