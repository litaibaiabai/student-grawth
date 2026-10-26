import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureClaimLocation,pendingClaimToken,claimReturnPath,clearClaimIntent,extractCardToken} from './claimIntent.js';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('扫码凭证在登录跳转前保存，地址清理且只恢复内部领取页',()=>{
 const s=store();let replacement;
 const w={sessionStorage:s,location:{hash:'#/student/claim?token=abc123&next=https://evil.test',pathname:'/school/',search:''},history:{state:null,replaceState:(_,__,url)=>replacement=url}};
 captureClaimLocation(w);assert.equal(pendingClaimToken(s),'abc123');assert.equal(replacement,'/school/#/student/claim');assert.equal(claimReturnPath(s),'/student/claim');
 clearClaimIntent(s);assert.equal(claimReturnPath(s),'/dashboard');
});
test('可粘贴扫码链接，不从外部地址恢复导航；取消后清理',()=>{
 const s=store();assert.equal(extractCardToken('https://school.test/#/student/claim?token=qwerty'),'qwerty');
 captureClaimLocation({sessionStorage:s,location:{hash:'#/login?token=not-a-card'},history:{}});assert.equal(pendingClaimToken(s),'');
});

test('同页连续扫码时广播新凭证，已挂载领取页可以切换卡片',()=>{
 const storage=store(),events=[];
 const win={sessionStorage:storage,location:{hash:'#/student/claim?token=first',pathname:'/',search:''},history:{replaceState(){}},dispatchEvent:e=>events.push(e),CustomEvent:class {constructor(type){this.type=type;}}};
 captureClaimLocation(win);win.location.hash='#/student/claim?token=second';captureClaimLocation(win);
 assert.equal(pendingClaimToken(storage),'second');assert.equal(events.length,2);assert.equal(events[1].type,'card-claim-intent');
});
