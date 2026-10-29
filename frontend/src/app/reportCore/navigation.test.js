import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCoreLocation, formatCoreLocation, routeForRole } from './navigation.js';
test('legacy QR links restore a credential while ordinary routes never propagate it', () => {
  const incoming = parseCoreLocation('#/student/materials?card=abc%2Bdef');
  assert.equal(incoming.cardToken, 'abc+def');
  assert.equal(incoming.page, 'cards');
  assert.ok(!formatCoreLocation({ ...incoming, page: 'stories' }).includes('card='));
});
test('report details and role-safe defaults roundtrip', () => {
  const route = { role: 'teacher', page: 'drafts', termId: '12', classKey: '4:2', studentId: '300' };
  assert.deepEqual(parseCoreLocation(formatCoreLocation(route)), route);
  assert.equal(routeForRole({ role: 'manager', page: 'config' }, 'student').page, 'home');
  assert.equal(routeForRole({ role: 'student', page: 'config' }, 'student').page, 'home');
});
test('approved role navigation has three student, four teacher and five administrator entries',async()=>{
 const {navigation}=await import('./navigation.js');assert.deepEqual(navigation.student.map(x=>x[1]),['首页','月度故事','我的档案']);assert.deepEqual(navigation.teacher.map(x=>x[1]),['工作台','评价录入','卡片管理','班级报告']);assert.deepEqual(navigation.manager.map(x=>x[1]),['发布中心','学籍与账号','体测原始值','月度卡额度','学期配置']);
 assert.equal(routeForRole({role:'student',page:'self'},'student').page,'self');assert.equal(routeForRole({role:'teacher',page:'imports'},'teacher').page,'imports');
});
