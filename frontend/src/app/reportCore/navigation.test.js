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
