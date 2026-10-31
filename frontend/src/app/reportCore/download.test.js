import {test} from 'node:test';
import assert from 'node:assert/strict';
import {download} from './api.js';

test('template download preserves server error and does not create a fake downloaded file',async t=>{
  t.mock.method(globalThis,'fetch',async()=>({ok:false,status:503,json:async()=>({message:'模板服务暂不可用'})}));
  const original=globalThis.localStorage;
  globalThis.localStorage={getItem:()=> 'test-token'};
  t.after(()=>{globalThis.localStorage=original;});
  await assert.rejects(download('/report-core/imports/template?termId=1','模板.xlsx'),e=>e.message==='模板服务暂不可用'&&e.status===503);
});

test('template download passes cancellation and authenticates the file request',async t=>{
  const controller=new AbortController();controller.abort();
  const original=globalThis.localStorage;globalThis.localStorage={getItem:()=> 'test-token'};t.after(()=>{globalThis.localStorage=original;});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'/api/v1/report-core/imports/template?termId=17');
    assert.equal(options.signal,controller.signal);assert.equal(options.headers.Authorization,'Bearer test-token');
    throw new DOMException('已取消','AbortError');
  });
  await assert.rejects(download('/report-core/imports/template?termId=17','模板.xlsx',{signal:controller.signal}),{name:'AbortError'});
});
