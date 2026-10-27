const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {createLifecycle}=require('./run.cjs');
function fixture(t){const out=fs.mkdtempSync(path.join(os.tmpdir(),'demo-lifecycle-'));t.after(()=>fs.rmSync(out,{recursive:true,force:true}));return {out,runId:'test',baseUrl:'http://127.0.0.1:0'};}
test('尚未完成时中断必须FAIL、保存trace并返回非零',async t=>{const m=fixture(t),calls=[],life=createLifecycle(m);life.resources.context={tracing:{stop:async()=>calls.push('trace')},close:async()=>calls.push('close')};assert.equal(await life.stop(true),1);assert.equal(JSON.parse(fs.readFileSync(path.join(m.out,'report.json'))).status,'FAIL');assert.deepEqual(calls,['trace','close']);});
test('已完成演示后正常停止保留PASS并返回0',async t=>{const m=fixture(t),life=createLifecycle(m);await life.finish();assert.equal(await life.stop(true),0);assert.equal(JSON.parse(fs.readFileSync(path.join(m.out,'report.json'))).status,'PASS');});
test('生成素材阶段失败也留下失败报告，无服务可清理仍安全',async t=>{const m=fixture(t),life=createLifecycle(m);await life.finish(Error('模拟字体读取失败'));assert.equal(await life.stop(false),1);const report=JSON.parse(fs.readFileSync(path.join(m.out,'report.json')));assert.equal(report.status,'FAIL');assert.match(report.error,/字体读取失败/);});
