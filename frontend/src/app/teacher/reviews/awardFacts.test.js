import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missingAwardFacts} from './awardFacts.js';
test('a complete award needs only name, region, prize and subject',()=>{
  assert.deepEqual(missingAwardFacts({title:'数学思维展示',awardRegion:'市级',awardLevel:'一等奖',subjectCode:'MATH'}),[]);
});
test('region and prize cannot be interchanged, and a subject is required',()=>{
  assert.deepEqual(missingAwardFacts({title:'数学思维展示',awardRegion:'一等奖',awardLevel:'省级',subjectCode:''}),['荣誉地域','荣誉级别','所属学科']);
  assert.deepEqual(missingAwardFacts({title:'  ',awardRegion:'区级',awardLevel:'其他',subjectCode:'SCIENCE'}),['荣誉名称']);
});
