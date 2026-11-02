const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeDemoOptions,classifyDemoState,redactDemoText}=require('../scripts/threeRoleDemo/config');
test('visible demo options use explicit semester dates and reject unknown modes',()=>{
 const options=normalizeDemoOptions({academicYear:'2027-2028',semester:1});
 assert.equal(options.mode,'auto');assert.equal(options.startDate,'2027-09-01');assert.equal(options.endDate,'2028-01-31');assert.equal(options.demoNow,'2027-09-15T00:00:00.000Z');assert.equal(options.webPort,20081);
 assert.throws(()=>normalizeDemoOptions({mode:'reset'}),/mode/);assert.throws(()=>normalizeDemoOptions({academicYear:'2027-2030'}),/学年/);assert.throws(()=>normalizeDemoOptions({apiPort:20081,webPort:20081}),/端口/);
});
test('demo never reinitializes an issued or partially completed semester',()=>{
 assert.equal(classifyDemoState(null,'auto'),'full');
 assert.equal(classifyDemoState({status:'DRAFT',activityCount:0,publishedCount:0},'auto'),'full');
 assert.equal(classifyDemoState({status:'INITIALIZED',activityCount:1515,publishedCount:1},'auto'),'replay');
 assert.throws(()=>classifyDemoState({status:'INITIALIZED',activityCount:1515,publishedCount:0},'auto'),/未完成/);
 assert.throws(()=>classifyDemoState({status:'DRAFT',activityCount:1,publishedCount:0},'full'),/已有/);
 assert.throws(()=>classifyDemoState({status:'INITIALIZED',publishedCount:1},'full'),/已完成/);
 assert.throws(()=>classifyDemoState(null,'replay'),/已发布/);
});
test('failure reports redact credentials including locator call text',()=>{
 const text=redactDemoText('fill("secret-demo-password") failed: secret-demo-password',['secret-demo-password']);assert.ok(!text.includes('secret-demo-password'));assert.match(text,/REDACTED/);
});
const {createDemoSteps,executeDemoSteps}=require('../scripts/threeRoleDemo/steps');
test('full demo covers three roles and replay contains no mutation stages',()=>{
 const full=createDemoSteps({mode:'full'}),replay=createDemoSteps({mode:'replay'});
 assert.equal(full[0].role,'管理员');assert.ok(full.some(s=>s.id==='teacher-cards'));assert.ok(full.some(s=>s.id==='student-daily'));assert.ok(full.some(s=>s.id==='head-publish'));assert.ok(full.some(s=>s.id==='student-republished'));
 assert.ok(full.every(s=>s.expected&&typeof s.run==='function'));
 assert.ok(replay.every(s=>s.readOnly));assert.ok(!replay.some(s=>['admin-initialize','student-daily','head-publish'].includes(s.id)));
});
test('failed browser step stops the run and reports a redacted failure',async()=>{
 let reached=false;const records=[];
 const steps=[{id:'one',role:'管理员',title:'登录',expected:'成功',run:async()=>{throw Error('fill secret-demo-password failed');}},{id:'two',run:async()=>{reached=true;}}];
 await assert.rejects(executeDemoSteps(steps,{secrets:['secret-demo-password'],record:r=>records.push(r),capture:async()=>{}}),/REDACTED/);
 assert.equal(reached,false);assert.equal(records[0].status,'FAIL');assert.ok(!JSON.stringify(records).includes('secret-demo-password'));
});
test('CLI preserves explicit semester, timing and owned runtime ports',()=>{
 const {parseDemoArgs}=require('../scripts/runThreeRoleDemo');
 assert.deepEqual(parseDemoArgs(['--mode','replay','--academic-year','2027-2028','--semester','1','--api-port','21080','--web-port','21081','--step-delay','500','--exit-after']),{mode:'replay',academicYear:'2027-2028',semester:'1',apiPort:'21080',webPort:'21081',stepDelay:'500',exitAfter:true});
 assert.deepEqual(parseDemoArgs(['--help']),{help:true});
 assert.throws(()=>parseDemoArgs(['--mode']),/缺少值/);
 assert.throws(()=>parseDemoArgs(['--reset']),/未知参数/);
});
test('a browser verification failure produces only FAIL and stops later steps',async()=>{
 const records=[];let reached=false;
 await assert.rejects(executeDemoSteps([{id:'page',run:async()=>{}},{id:'later',run:async()=>{reached=true;}}],{capture:async id=>{if(id==='page')throw Error('页面脚本异常');},record:r=>records.push(r)}),/页面脚本异常/);
 assert.deepEqual(records.map(r=>r.status),['FAIL']);assert.equal(reached,false);
});
test('resume only continues a matching failed full run after all daily facts are committed',()=>{
 const {resumeDemoFromReport}=require('../scripts/threeRoleDemo/config');
 const options=normalizeDemoOptions({}),steps=createDemoSteps({mode:'full'}),at=steps.findIndex(s=>s.id==='head-comment');
 const report={mode:'full',status:'FAIL',academicYear:'2027-2028',semester:1,termId:'297',steps:steps.slice(0,at).map(s=>({id:s.id,status:'PASS'})).concat({id:'head-comment',status:'FAIL'})};
 const state={termId:'297',status:'INITIALIZED'};
 assert.equal(resumeDemoFromReport(report,steps,state,options),at);
 assert.throws(()=>resumeDemoFromReport(report,steps,{...state,termId:'2'},options),/学期/);
 assert.throws(()=>resumeDemoFromReport({...report,status:'PASS'},steps,state,options),/失败/);
 assert.throws(()=>resumeDemoFromReport({...report,steps:report.steps.slice(0,4)},steps,state,options),/审核/);
 const altered={...report,steps:report.steps.map((r,i)=>i===1?{...r,id:'student-self'}:r)};
 assert.throws(()=>resumeDemoFromReport(altered,steps,state,options),/顺序/);
});
