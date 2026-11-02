const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createDbPool}=require('../db');
const {seedAdminClosureDemo}=require('./seedAdminClosureDemo');

async function runAdminClosureDemo({manifestFile,apiPort=19980,webPort=19981}={}) {
 for(const port of [apiPort,webPort])if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use valid local ports');
 if(apiPort===webPort)throw Error('API and web ports must differ');
 const manifest=manifestFile?JSON.parse(await fs.readFile(manifestFile,'utf8')):await seedAdminClosureDemo({database:`liuyu_report_test_admin_demo_${Date.now()}`});
 if(manifest.database!=='liuyu_report_pilot_admin_demo_v3'&&!/^liuyu_report_test_admin_demo_[a-z0-9_]+$/.test(manifest.database||''))throw Error('Only isolated admin demo databases are allowed');
 const directory=manifestFile?path.dirname(path.resolve(manifestFile)):manifest.outputDir;
 const pool=createDbPool({database:manifest.database});let server,vite;
 const close=async()=>{vite?.kill('SIGTERM');if(server)await new Promise(resolve=>server.close(resolve));await pool.end();};
 try{
  await require('./runCoreMigrations').runCoreMigrations({connection:pool,targetDb:manifest.database});
  process.env.PUBLIC_WEB_URL=`http://localhost:${webPort}`;
  // This explicit fixture is only part of the isolated demonstration runtime.
  // The generated text labels itself; no model or OCR requests are made.
  const provider={generateTermComment:async()=>({model:'DEMO_FIXED_TEXT_NO_MODEL',comment:'【演示固定文案，未经AI生成】请教师结合林小禾本学期的真实学习、合作和阅读记录，核对并改写学期寄语。'})};
  const app=require('../app').createApp({pool,schoolId:manifest.schoolId,provider});
  server=app.listen(apiPort,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const root=path.resolve(__dirname,'../..');
  vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(webPort),'--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_TARGET:`http://127.0.0.1:${apiPort}`},stdio:['ignore','ignore','pipe']});
  let viteError='';vite.stderr.on('data',bytes=>{viteError+=bytes.toString();});
  let ready=false;
  for(let i=0;i<100;i++){
   if(vite.exitCode!==null)throw Error('Demo frontend failed to start: '+viteError);
   try{if((await fetch(`http://127.0.0.1:${webPort}`)).ok){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw Error('Demo frontend did not become ready');
  const session={database:manifest.database,manifest:path.join(directory,'manifest.json'),apiUrl:`http://127.0.0.1:${apiPort}`,url:`http://localhost:${webPort}`,modelMode:'寄语使用明确标注的固定演示响应；奖状由教师人工核对；未调用付费模型或OCR',createdAt:new Date().toISOString()};
  await fs.writeFile(path.join(directory,'session.json'),JSON.stringify(session,null,2),{mode:0o600});
  return {session,close};
 }catch(error){await close();throw error;}
}
if(require.main===module)runAdminClosureDemo({manifestFile:process.env.ADMIN_DEMO_MANIFEST,apiPort:Number(process.env.ADMIN_DEMO_API_PORT||19980),webPort:Number(process.env.ADMIN_DEMO_WEB_PORT||19981)})
 .then(({session,close})=>{console.log(JSON.stringify(session));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>close().then(()=>process.exit(0)));})
 .catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={runAdminClosureDemo};
