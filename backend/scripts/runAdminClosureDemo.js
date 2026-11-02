const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const net=require('node:net');
const {createDbPool}=require('../db');

async function assertPortAvailable(port){
 await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(Error(`本次演示端口${port}已被占用或不可用，请更换端口`)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
}
function waitForOwnedVite(vite,webPort){
 return new Promise((resolve,reject)=>{
  let stdout='',stderr='';const timer=setTimeout(()=>finish(Error('Demo frontend did not become ready')),10000);
  const clean=()=>{clearTimeout(timer);vite.stdout.off('data',output);vite.stderr.off('data',errors);vite.off('error',failed);vite.off('exit',exited);};
  const finish=error=>{clean();error?reject(error):resolve();};
  const output=bytes=>{stdout=(stdout+bytes.toString()).slice(-16384);const plain=stdout.replace(/\u001b\[[0-9;]*m/g,'');if(plain.includes(`http://127.0.0.1:${webPort}/`))finish();};
  const errors=bytes=>{stderr=(stderr+bytes.toString()).slice(-16384);};
  const failed=error=>finish(error),exited=()=>finish(Error('Demo frontend failed to start: '+stderr));
  vite.stdout.on('data',output);vite.stderr.on('data',errors);vite.once('error',failed);vite.once('exit',exited);
 });
}
async function runAdminClosureDemo({manifestFile,apiPort=19980,webPort=19981,demoNow=process.env.ADMIN_DEMO_NOW}={}) {
 for(const port of [apiPort,webPort])if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use valid local ports');
 if(apiPort===webPort)throw Error('API and web ports must differ');
 await Promise.all([assertPortAvailable(apiPort),assertPortAvailable(webPort)]);
 const manifest=manifestFile?JSON.parse(await fs.readFile(manifestFile,'utf8')):{database:'student_growth',schoolId:'1'};
 if(manifest.database!=='student_growth')throw Error('Development runtime must use the existing student_growth database');
 if(!/^[1-9]\d*$/.test(String(manifest.schoolId||'')))throw Error('Valid schoolId required');
 const directory=manifestFile?path.dirname(path.resolve(manifestFile)):path.resolve(__dirname,'../../output/report-core/development');
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 if(!manifestFile)await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 const clock=require('./localDemoClock').localDemoClock(demoNow);
 const pool=createDbPool({database:manifest.database});let server,vite;
 const close=async()=>{vite?.kill('SIGTERM');if(server)await new Promise(resolve=>server.close(resolve));await pool.end();};
 try{
  await require('./runCoreMigrations').runCoreMigrations({connection:pool,targetDb:manifest.database});
  process.env.PUBLIC_WEB_URL=`http://localhost:${webPort}`;
  // This explicit fixture is only part of the local development runtime.
  // The generated text labels itself; no model or OCR requests are made.
  const provider={generateTermComment:async()=>({model:'DEMO_FIXED_TEXT_NO_MODEL',comment:'【演示固定文案，未经AI生成】请教师结合林小禾本学期的真实学习、合作和阅读记录，核对并改写学期寄语。'})};
  const app=require('../app').createApp({pool,schoolId:manifest.schoolId,provider,...(clock?{clock}:{})});
  server=app.listen(apiPort,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const root=path.resolve(__dirname,'../..');
  vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(webPort),'--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_TARGET:`http://127.0.0.1:${apiPort}`,VITE_DEMO_DATE:demoNow||''},stdio:['ignore','pipe','pipe']});
  await waitForOwnedVite(vite,webPort);
  let ready=false;
  for(let i=0;i<100;i++){
   if(vite.exitCode!==null)throw Error('Demo frontend exited before readiness');
   try{if((await fetch(`http://127.0.0.1:${webPort}`)).ok){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw Error('Demo frontend did not become ready');
  const session={demoDate:demoNow||null,database:manifest.database,manifest:path.join(directory,'manifest.json'),apiUrl:`http://127.0.0.1:${apiPort}`,url:`http://localhost:${webPort}`,modelMode:'寄语使用明确标注的固定演示响应；奖状由教师人工核对；未调用付费模型或OCR',createdAt:new Date().toISOString()};
  await fs.writeFile(path.join(directory,'session.json'),JSON.stringify(session,null,2),{mode:0o600});
  return {session,close};
 }catch(error){await close();throw error;}
}
if(require.main===module)runAdminClosureDemo({manifestFile:process.env.ADMIN_DEMO_MANIFEST,apiPort:Number(process.env.ADMIN_DEMO_API_PORT||19980),webPort:Number(process.env.ADMIN_DEMO_WEB_PORT||19981)})
 .then(({session,close})=>{console.log(JSON.stringify(session));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>close().then(()=>process.exit(0)));})
 .catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={runAdminClosureDemo,waitForOwnedVite};
