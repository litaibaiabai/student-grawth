import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadCardPrintPack} from './cardPrintRecovery.js';
for(const status of ['PENDING','FAILED','READY'])test(`下载失败后同步服务端${status}状态，供页面轮询或重试`,async()=>{
 const updates=[];let downloaded=0;const failure=new Error('文件正在恢复');
 await assert.rejects(downloadCardPrintPack({id:12,download:async()=>{downloaded++;throw failure;},getPack:async id=>({id,status,errorMessage:status==='FAILED'?'生成失败':null}),onPack:v=>updates.push(v)}),e=>e===failure);
 assert.equal(downloaded,1);assert.equal(updates[0].status,status);assert.equal(updates[0].id,12);
});
test('成功下载不额外查询状态，状态查询失败保留下载错误',async()=>{
 let queried=false;await downloadCardPrintPack({id:1,download:async()=>{},getPack:async()=>{queried=true;},onPack(){}});assert.equal(queried,false);
 const failure=new Error('下载失败');await assert.rejects(downloadCardPrintPack({id:1,download:async()=>{throw failure;},getPack:async()=>{throw new Error('网络断开');},onPack(){}}),e=>e===failure);
});
