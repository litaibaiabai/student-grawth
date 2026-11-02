const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {runAdminClosureDemo}=require('../scripts/runAdminClosureDemo');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
test('demo refuses an occupied frontend before requesting or trusting its HTTP 200',async()=>{
 let requests=0,runtime;
 const foreign=http.createServer((req,res)=>{requests++;res.end('An unrelated frontend');}),probe=http.createServer();
 const webPort=await listen(foreign),apiPort=await listen(probe);await close(probe);
 try{
  await assert.rejects(async()=>{runtime=await runAdminClosureDemo({apiPort,webPort});},/占用|in use/);
  assert.equal(requests,0,'must not probe an unrelated frontend for readiness');
 }finally{await runtime?.close();await close(foreign);}
});

const {spawn}=require('node:child_process');
const {waitForOwnedVite}=require('../scripts/runAdminClosureDemo');
test('an owned frontend that exits without announcing readiness cannot be replaced by HTTP availability',async()=>{
 const child=spawn(process.execPath,['-e',"process.stdout.write('Starting...');process.stderr.write('Port is already in use');process.exitCode=1"],{stdio:['ignore','pipe','pipe']});
 await assert.rejects(waitForOwnedVite(child,20081),/in use/);
});
