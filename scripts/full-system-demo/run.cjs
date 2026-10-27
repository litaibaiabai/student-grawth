#!/usr/bin/env node
const fs=require('fs'),path=require('path'),os=require('os'),{spawn,execFileSync}=require('child_process');
// The normal macOS terminal can still use Node18; restart just this process, never change the system Node.
if(require.main===module&&Number(process.versions.node.split('.')[0])<20){if(process.env.DEMO_NODE_BOOTSTRAPPED){console.error('DEMO_NODE需要指向Node20以上版本。');process.exit(1)}const newer=process.env.DEMO_NODE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node');if(!fs.existsSync(newer)){console.error('请安装Node20以上或设置DEMO_NODE。');process.exit(1)}const child=spawn(newer,[__filename,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,DEMO_NODE_BOOTSTRAPPED:'1'}});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('error',e=>{console.error(e.message);process.exit(1)});child.on('exit',code=>process.exit(code??1));return;}
const {root,parseOptions,preflight,playwright}=require('./environment.cjs');const {initialize}=require('./initialize.cjs');const {createSteps}=require('./steps.cjs');const {pace}=require('./pacing.cjs');
async function waitReady(url,child,fetcher=fetch){for(let n=0;n<90;n++){if(child.exitCode!==null)throw Error('演示服务启动失败，请查看service.log');try{const r=await fetcher(url,{signal:AbortSignal.timeout(2500)});if(r.ok){await r.body?.cancel();return;}if(n===1)console.log('服务响应状态 '+r.status);}catch(e){if(n===1)console.log('健康检查重试：'+e.message+' '+(e.cause?.code||''));}await new Promise(r=>setTimeout(r,500));}throw Error('等待演示服务超时');}
function saveReport(m,steps,error){const report={runId:m.runId,baseUrl:m.baseUrl,status:error?'FAIL':'PASS',completedAt:new Date().toISOString(),menuCount:steps.menus.size,menus:[...steps.menus],chapters:steps.results,error:error?String(error.message):null};fs.writeFileSync(path.join(m.out,'report.json'),JSON.stringify(report,null,2));const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));fs.writeFileSync(path.join(m.out,'report.html'),`<!doctype html><meta charset="utf-8"><title>完整自动演示结果</title><style>body{font:17px system-ui;max-width:1000px;margin:50px auto;line-height:1.8}td,th{border-bottom:1px solid #ddd;padding:12px}a{color:#23664e}</style><h1>全系统自动演示：${report.status}</h1><p>运行 ${esc(m.runId)} · <a href="${m.baseUrl}">打开系统</a> · 覆盖${report.menuCount}个角色菜单</p><p>${esc(report.error||'全部章节完成，结果和下载已核对。')}</p><table><tr><th>章节</th><th>结果</th><th>证据</th></tr>${report.chapters.map(s=>`<tr><td>${esc(s.title)}</td><td>${s.status}</td><td><a href="screenshots/${s.id}-${s.status}.png">截图</a></td></tr>`).join('')}</table><p><a href="downloads/期末报告.pdf">真实期末报告PDF</a> · <a href="downloads/期末报告.html">真实HTML</a> · <a href="downloads/月度评价卡.pdf">真实卡片PDF</a></p><p>视频、trace、下载文件包含本机虚构演示凭证，仅供本机核验，勿公开发布。</p>`);return report;}
function createLifecycle(m){
 const resources={steps:{menus:new Set(),results:[]}};let completed=false,error,finalization;
 async function finish(failure){
  if(finalization)return finalization;
  error=failure;completed=!failure;
  finalization=(async()=>{
   if(resources.context)await resources.context.tracing.stop({path:path.join(m.out,'trace.zip')}).catch(()=>{});
   const report=saveReport(m,resources.steps,error);
   console.log('运行报告：'+path.join(m.out,'report.html'));console.log('演示结果：'+report.status+'，角色菜单 '+report.menuCount+'。');
   return report;
  })();return finalization;
 }
 async function stop(interrupted){
  if(interrupted&&!completed&&!finalization)await finish(Error('演示被中断，尚未完成全部章节'));
  else if(finalization)await finalization;
  if(resources.context)await resources.context.close().catch(()=>{});
  if(resources.browser)await resources.browser.close().catch(()=>{});
  if(resources.service&&resources.service.exitCode===null)resources.service.kill('SIGTERM');
  return completed&&!error?0:1;
 }
 return {resources,finish,stop};
}
async function main(){
 const o=parseOptions(process.argv.slice(2));console.log('预检：运行时、依赖、MySQL、浏览器、PDF工具与空闲端口…');
 const rt=await preflight();if(o.check){console.log('预检通过；未初始化数据库。',JSON.stringify({node:process.version,python:rt.python,backendPort:rt.backendPort,frontendPort:rt.frontendPort}));return;}
 const m=await initialize(rt);console.log('新独立实例 '+m.runId+' '+m.baseUrl);
 const life=createLifecycle(m),r=life.resources;let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;process.exit(await life.stop(true));};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 let error;
 try{
  fs.mkdirSync(path.join(m.out,'downloads'));fs.mkdirSync(path.join(m.out,'video'));fs.chmodSync(m.out,0o700);
  execFileSync(rt.python,[path.join(__dirname,'materials.py'),m.out],{stdio:'inherit'});
  const logs=fs.openSync(path.join(m.out,'service.log'),'a');
  try{r.service=spawn(process.execPath,[path.join(__dirname,'service.cjs'),path.join(m.out,'manifest.json')],{cwd:root,stdio:['ignore',logs,logs]});}finally{fs.closeSync(logs);}
  await waitReady(m.baseUrl,r.service);
  r.browser=await playwright().chromium.launch({...rt.browserOptions,headless:o.headless,slowMo:0,args:['--no-first-run']});
  r.context=await r.browser.newContext({baseURL:m.baseUrl,viewport:{width:1440,height:1000},acceptDownloads:true,recordVideo:{dir:path.join(m.out,'video'),size:{width:1440,height:1000}},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  await r.context.tracing.start({screenshots:true,snapshots:true,sources:false});
  const page=pace(await r.context.newPage(),o.speed);page.on('pageerror',e=>console.error('页面异常：'+e.message));page.setDefaultTimeout(20000);await page.goto(m.baseUrl);
  r.steps=createSteps(page,m.out,o.speed);await require('./browser-demo.cjs').browserDemo({page,context:pace(r.context,o.speed),m,rt,s:r.steps});
 }catch(e){error=e;console.error('演示未完成：'+e.message);}
 finally{await life.finish(error);}
 if(o.exit){process.exitCode=await life.stop(false);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 else if(error&&!r.browser){process.exitCode=await life.stop(false);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 else{console.log('浏览器和本次服务保留。结束请回到本终端按Ctrl+C；不会关闭其他服务。');if(error)process.exitCode=1;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={saveReport,waitReady,createLifecycle};
