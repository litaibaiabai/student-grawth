const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allocateCards, selectCardTerm, cardWindow, effectivePolicyMonth, schoolTimestamp } = require('../services/cardRules');

test('按最大余数分配101张，零比例方向不分卡', () => {
  assert.deepEqual(allocateCards(101, { D: 20, Z: 70, L: 10 }), { D: 20, Z: 71, T: 0, M: 0, L: 10, G: 0 });
  assert.deepEqual(allocateCards(1, { D: 25, Z: 25, T: 25, M: 25 }), { D: 1, Z: 0, T: 0, M: 0, L: 0, G: 0 });
  assert.deepEqual(allocateCards(0, { M: 100 }), { D: 0, Z: 0, T: 0, M: 0, L: 0, G: 0 });
});

test('拒绝非法总量、负比例、浮点尾数和非100%的分配', () => {
  for (const [n, ratios] of [[-1,{Z:100}],[1.5,{Z:100}],[100,{Z:99}],[100,{Z:101,D:-1}],[100,{Z:99.999,D:0.001}],[100,{Z:100,X:1}]]) {
    assert.throws(() => allocateCards(n,ratios));
  }
  assert.deepEqual(allocateCards(3,{D:33.33,Z:33.33,M:33.34}),{D:1,Z:1,T:0,M:1,L:0,G:0});
});

test('私有校历存在时，假期月份不回退全局基线', () => {
  const terms=[{id:1,school_id:null,active:1,start_date:'2026-01-01',end_date:'2026-12-31'}, {id:2,school_id:1,active:1,start_date:'2026-09-01',end_date:'2027-01-31'}];
  assert.equal(selectCardTerm(terms,1,'2026-07'),null);
  assert.equal(selectCardTerm(terms,1,'2026-10').id,2);
  assert.equal(selectCardTerm(terms,2,'2026-07').id,1);
  assert.equal(selectCardTerm([{...terms[1],active:0},terms[0]],1,'2026-10'),null);
});

test('同月学期归属冲突必须拒绝而不是随机取首条', () => {
  assert.throws(()=>selectCardTerm([{id:1,school_id:1,active:1,start_date:'2026-09-01',end_date:'2026-10-10'},{id:2,school_id:1,active:1,start_date:'2026-10-11',end_date:'2027-01-31'}],1,'2026-10'));
});

test('跨年审核宽限期与更早的学期截止采用学校本地时间', () => {
  const term={start_date:'2026-09-01',end_date:'2027-01-31',review_deadline_at:'2027-02-02 23:59:59'};
  assert.deepEqual(cardWindow(term,'2026-12'),{validFrom:'2026-12-01 00:00:00',validUntil:'2026-12-31 23:59:59',reviewDeadline:'2027-01-03 23:59:59'});
  assert.equal(cardWindow(term,'2027-01').reviewDeadline,'2027-02-02 23:59:59');
  assert.equal(schoolTimestamp(new Date('2026-10-31T16:00:00Z')),'2026-11-01 00:00:00');
});

test('有批次修改策略下月生效，无批次含零张策略可在当月生效', () => {
  assert.equal(effectivePolicyMonth('2026-12',true),'2027-01');
  assert.equal(effectivePolicyMonth('2026-10',false),'2026-10');
});
