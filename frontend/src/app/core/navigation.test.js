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
  assert.equal(routeForRole({ role: 'manager', page: 'config' }, 'student').page, 'cards');
  assert.equal(routeForRole({ role: 'student', page: 'config' }, 'student').page, 'cards');
});
test('role menus expose the five student and six teacher workflows directly',async()=>{
 const {navigation}=await import('./navigation.js');assert.deepEqual(navigation.student.map(x=>x[1]),['领取积分','云美故事','上传奖状','自我评价','六育报告']);assert.deepEqual(navigation.teacher.map(x=>x[1]),['无卡直拼','评审获奖','综合成绩','班主任寄语','六域综合情况','积分卡管理']);assert.deepEqual(navigation.manager.map(x=>x[1]),['学籍账号管理','卡额度管理','数据统计']);
 assert.equal(routeForRole({role:'student',page:'self'},'student').page,'self');assert.equal(routeForRole({role:'teacher',page:'imports'},'teacher').page,'imports');
});

test('each required workflow has its own selected menu and comments are routable',async()=>{const {mainPage}=await import('./navigation.js');for(const page of ['direct','imports','reviews','comments','cards-manage','drafts'])assert.equal(mainPage('teacher',page),page);for(const page of ['self','awards','cards','stories'])assert.equal(mainPage('student',page),page);assert.equal(routeForRole({role:'teacher',page:'comments'},'teacher').page,'comments');});


test('retired manager routes fall back to unified registry',()=>{for(const page of ['releases','classes','config','audit','health'])assert.equal(routeForRole({role:'manager',page},'manager').page,'roster');});
