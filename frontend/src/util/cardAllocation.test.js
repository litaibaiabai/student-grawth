import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewAllocation} from './cardAllocation.js';
test('按百分比预览张数，余数相同按固定六育顺序分配',()=>{
 assert.deepEqual(previewAllocation(100,{D:20,Z:70,T:0,M:0,L:10,G:0}),{D:20,Z:70,T:0,M:0,L:10,G:0});
 assert.deepEqual(previewAllocation(3,{D:20,Z:20,T:20,M:20,L:10,G:10}),{D:1,Z:1,T:1,M:0,L:0,G:0});
 assert.equal(previewAllocation(10,{D:10}),null);
});
