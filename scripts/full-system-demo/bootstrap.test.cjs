const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');
const newer=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node');
test('Node18转用新运行时后，终止信号交由子进程收尾并保留其退出码',{skip:Number(process.versions.node.split('.')[0])>=20||!fs.existsSync(newer),timeout:10000},async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'demo-bootstrap-'));let childPid;
 t.after(()=>{if(childPid)try{process.kill(childPid,'SIGTERM')}catch{}fs.rmSync(tmp,{recursive:true,force:true});});
 const script=path.join(tmp,'child.cjs'),runtime=path.join(tmp,'runtime');
 fs.writeFileSync(script,"process.on('SIGTERM',()=>process.exit(0));console.log('READY '+process.pid);setInterval(()=>{},1000);");
 fs.writeFileSync(runtime,`#!/bin/sh\nexec '${newer}' '${script}'\n`,{mode:0o700});
 const child=spawn(process.execPath,[path.join(__dirname,'run.cjs'),'--check'],{env:{...process.env,DEMO_NODE:runtime,DEMO_NODE_BOOTSTRAPPED:''},stdio:['ignore','pipe','pipe']});
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 await new Promise((resolve,reject)=>{let output='';child.stdout.on('data',data=>{output+=data;const m=output.match(/READY (\d+)/);if(m){childPid=Number(m[1]);resolve()}});child.once('error',reject)});
 child.kill('SIGTERM');assert.deepEqual(await exited,{code:0,signal:null});
});
