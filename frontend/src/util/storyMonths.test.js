import {test}from 'node:test';import assert from 'node:assert/strict';import{storyMonths,currentSchoolMonth}from './storyMonths.js';
test('故事月份跟随有效学期跨年且不固定2026',()=>{assert.deepEqual(storyMonths({startDate:'2027-09-01',endDate:'2028-01-31'}).map(x=>x.key),['2027-09','2027-10','2027-11','2027-12','2028-01']);assert.equal(storyMonths({startDate:'2028-02-01',endDate:'2028-07-15'})[0].label,'2 月');});
test('北京时间跨日月份正确',()=>assert.equal(currentSchoolMonth(new Date('2027-01-31T18:00:00Z')),'2027-02'));
