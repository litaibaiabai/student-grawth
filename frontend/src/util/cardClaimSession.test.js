import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCardClaimSession} from './cardClaimSession.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('预览乱序只接受最新卡，提交凭证与展示预览绑定',async()=>{
 const a=deferred(),b=deferred(),seen=[];
 const session=createCardClaimSession({fetchPreview:token=>token==='A'?a.promise:b.promise,onPreview:value=>seen.push(value)});
 const first=session.read('A'),second=session.read('B');
 b.resolve({serialNo:2});await second;a.resolve({serialNo:1});await first;
 assert.deepEqual(seen,[{token:'B',data:{serialNo:2}}]);assert.equal(session.confirmedToken(),'B');
});
test('取消或编辑输入后，旧成功和失败响应都不能恢复卡片或清除新凭证',async()=>{
 const a=deferred(),b=deferred(),previews=[],errors=[];
 const session=createCardClaimSession({fetchPreview:token=>token==='A'?a.promise:b.promise,onPreview:v=>previews.push(v),onError:e=>errors.push(e)});
 const first=session.read('A');session.invalidate();a.resolve({serialNo:1});await first;
 assert.equal(session.confirmedToken(),null);assert.deepEqual(previews,[]);
 const second=session.read('B');session.invalidate();b.reject(new Error('旧请求失败'));await second;
 assert.deepEqual(errors,[]);assert.equal(session.confirmedToken(),null);
});
test('新卡读取中不能确认旧卡，较早的失败响应不影响新卡',async()=>{
 const a=deferred(),b=deferred(),errors=[];
 const session=createCardClaimSession({fetchPreview:t=>t==='A'?a.promise:b.promise,onError:e=>errors.push(e)});
 const first=session.read('A'),second=session.read('B');assert.equal(session.confirmedToken(),null);
 b.resolve({serialNo:2});await second;a.reject(new Error('A失效'));await first;
 assert.equal(session.confirmedToken(),'B');assert.deepEqual(errors,[]);
});
