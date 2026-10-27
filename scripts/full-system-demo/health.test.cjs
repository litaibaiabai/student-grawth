const {test}=require('node:test'),assert=require('node:assert/strict');const {waitReady}=require('./run.cjs');
test('Fetch的ok布尔属性为true时立即就绪，不把它调用成函数',async()=>{let calls=0;await waitReady('http://127.0.0.1:0',{exitCode:null},async()=>{calls++;return {ok:true,body:{cancel:async()=>{}}}});assert.equal(calls,1)});
test('服务已退出时立即失败',async()=>{await assert.rejects(waitReady('http://127.0.0.1:0',{exitCode:1}),/启动失败/)});
