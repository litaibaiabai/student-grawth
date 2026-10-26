const {test}=require('node:test');
const assert=require('node:assert/strict');
const {redactCardUrl}=require('../utils/redactUrl');
test('退役GET或编码后的卡片凭证也不会出现在URL日志中',()=>{
  const value=redactCardUrl('/api/student/cards/preview?%74oken=private-value&monthKey=2026-10&cardToken=another-secret');
  assert.ok(!value.includes('private-value'));
  assert.ok(!value.includes('another-secret'));
  assert.ok(value.includes('monthKey=2026-10'));
});
