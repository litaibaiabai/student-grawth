const { test } = require('node:test');
const assert = require('node:assert/strict');
const v2 = require('../services/core/reportCoreV2Policy');

test('V2 report inputs have one authority per position and self assessment has eleven values', () => {
  const c = v2.catalog;
  assert.equal(c.fields.length, 94);
  assert.equal(new Set(c.fields.map(f => f.viewCode)).size, 94);
  assert.equal(c.cardCatalog.length, 14);
  assert.equal(c.fields.filter(f => f.sourceType === 'SELF').length, 11);
  assert.equal(c.fields.filter(f => f.section === 'wisdom' && f.sourceType === 'IMPORT').length, 36);
  assert.equal(c.fields.find(f => f.column === 'fitness_level_star').sourceType, 'IMPORT');
  assert.equal(c.fields.find(f => f.column === 'conduct_politeness_other_star').sourceType, 'IMPORT');
  assert.equal(c.fields.find(f => f.column === 'information_technology_regular_grade').section, 'wisdom');
  assert.ok(c.cardCatalog.some(f => f.targetColumn === 'labor_process_star'));
  for (const card of c.cardCatalog) assert.equal(c.fields.find(f => f.column === card.targetColumn).sourceType, 'CARD');
});
test('process ranks use competition ties, include zero and respect exact class boundaries', () => {
  const result = v2.rankProcess([10,9,8,7,6,5,4,3,2,1].map((points,i) => ({studentId:String(i+1),points})));
  assert.deepEqual(result.map(x => x.star), [3,3,2,2,2,2,1,1,1,1]);
  assert.deepEqual(v2.rankProcess([{studentId:'3',points:13},{studentId:'4',points:13},{studentId:'5',points:0}]).map(x => [x.rank,x.star]), [[1,3],[1,3],[3,1]]);
  assert.deepEqual(v2.rankProcess([{studentId:'1',points:0},{studentId:'2',points:0}]).map(x => x.star), [1,1]);
  assert.equal(v2.rankProcess([{studentId:'1',points:1}])[0].star, 3);
  assert.equal(v2.rankProcess([{studentId:'1',points:0}])[0].star, 1);
  assert.equal(v2.rankProcess([{studentId:'1',points:1}], {settled:false})[0].star, null);
  assert.deepEqual(v2.rankProcess([]), []);
  assert.throws(() => v2.rankProcess([{studentId:'1',points:-1}]), /积分/);
  assert.throws(() => v2.rankProcess([{studentId:'1',points:1},{studentId:'1',points:2}]), /重复/);
});
test('story stars distinguish valid zero from absent participation and never add three different units', () => {
  assert.deepEqual(v2.storySummary({listenCount:30,writeCount:3,tellScore:0}), {
    LISTEN:{value:30,star:3,participating:true}, WRITE:{value:3,star:2,participating:true}, TELL:{value:0,star:1,participating:true},
  });
  assert.deepEqual(v2.storySummary({}).TELL, {value:null,star:null,participating:false});
  assert.equal(v2.storySummary({listenCount:9,writeCount:2,tellScore:60}).TELL.star, 2);
  assert.equal(v2.storySummary({listenCount:10,writeCount:5,tellScore:85}).LISTEN.star, 2);
  assert.throws(() => v2.storySummary({listenCount:101}), /故事/);
});
test('five honor levels do not infer administrative scope from prize and self grades validate independently', () => {
  assert.deepEqual(v2.honorLevel('区级'), {level:'区/县级',points:2});
  assert.deepEqual(v2.honorLevel('国家级'), {level:'国家级',points:5});
  assert.throws(() => v2.honorLevel('一等奖'), /级别/);
  assert.throws(() => v2.honorLevel('国际级'), /级别/);
  assert.equal(v2.validateV2Value('math_regular_grade','A'), 'A');
  assert.throws(() => v2.validateV2Value('math_regular_grade',100), /等级/);
  assert.throws(() => v2.validateV2Value('fitness_self_star',0), /星/);
  assert.equal(v2.validateV2Value('jump_rope_1min',0), 0);
  assert.equal(v2.computeBMI(141,35), 17.60);
  assert.equal(v2.computeBMI(null,35), null);
});
