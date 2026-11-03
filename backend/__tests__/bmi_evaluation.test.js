const test = require('node:test');
const assert = require('node:assert/strict');
const { computeBMI, evaluateBMI, inferAgeFromGrade, alignHalfYearAge, calculateAge } = require('../services/bmiEvaluationService');

test('computeBMI calculates weight/(height/100)^2 rounded to 2 decimal places', () => {
  assert.equal(computeBMI(125.0, 18.0), 11.52);
  assert.equal(computeBMI(null, 18.0), null);
  assert.equal(computeBMI(120.0, 0), null);
});

test('inferAgeFromGrade infers 6.5 for grade 1 to 11.5 for grade 6', () => {
  assert.equal(inferAgeFromGrade(1), 6.5);
  assert.equal(inferAgeFromGrade(6), 11.5);
  assert.equal(inferAgeFromGrade(7), 12.0);
});

test('alignHalfYearAge clamps between 6.0 and 12.0 and rounds to nearest 0.5', () => {
  assert.equal(alignHalfYearAge(5.5), 6.0);
  assert.equal(alignHalfYearAge(6.2), 6.0);
  assert.equal(alignHalfYearAge(6.3), 6.5);
  assert.equal(alignHalfYearAge(12.8), 12.0);
});

test('calculateAge calculates years accurately between birthDate and measurementDate', () => {
  assert.equal(Math.round(calculateAge('2018-09-01', '2025-03-01') * 10) / 10, 6.5);
});

test('evaluateBMI with WS_T_2018 accurately classifies boys and girls across boundary gaps', () => {
  // 6.0 岁男生: <=13.0 中重度消瘦, 13.1~13.4 轻度消瘦, 13.5~16.3 正常, 16.4~17.6 超重, >=17.7 肥胖
  const res1 = evaluateBMI({ height: 125, weight: 18, gender: '男', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(res1.bmi, 11.52);
  assert.equal(res1.bmi_label, '中重度消瘦');
  assert.equal(res1.bmi_standard, 'WS_T_2018');

  // Gap test: 13.04 (in gap between 13.0 and 13.1) -> 中重度消瘦 (< 13.05)
  const resGap = evaluateBMI({ height: 100, weight: 13.04, gender: '男', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(resGap.bmi_label, '中重度消瘦');

  // Normal: 15.0
  const resNorm = evaluateBMI({ height: 100, weight: 15.0, gender: '男', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(resNorm.bmi_label, '正常');

  // Overweight: 17.0
  const resOver = evaluateBMI({ height: 100, weight: 17.0, gender: '男', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(resOver.bmi_label, '超重');

  // Obese: 18.0
  const resObese = evaluateBMI({ height: 100, weight: 18.0, gender: '男', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(resObese.bmi_label, '肥胖');

  // Girls 6.0 岁: <=12.6, 12.7~13.1, 13.2~16.1, 16.2~17.4, >=17.5
  const resGirl = evaluateBMI({ height: 100, weight: 14.0, gender: '女', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(resGirl.bmi_label, '正常');
});

test('evaluateBMI with MOE_2014 classifies by grade with score mapping', () => {
  // 一年级男生: <=13.4 低体重(80), 13.5~18.1 正常(100), 18.2~20.3 超重(80), >=20.4 肥胖(60)
  const res = evaluateBMI({ height: 100, weight: 15.0, gender: '男', grade: 1, standard: 'MOE_2014' });
  assert.equal(res.bmi, 15.0);
  assert.equal(res.bmi_label, '正常');
  assert.equal(res.bmi_score, 100);
  assert.equal(res.bmi_standard, 'MOE_2014');

  const resLow = evaluateBMI({ height: 100, weight: 13.0, gender: '男', grade: 1, standard: 'MOE_2014' });
  assert.equal(resLow.bmi_label, '低体重');
  assert.equal(resLow.bmi_score, 80);

  const resHeavy = evaluateBMI({ height: 100, weight: 19.0, gender: '男', grade: 1, standard: 'MOE_2014' });
  assert.equal(resHeavy.bmi_label, '超重');
  assert.equal(resHeavy.bmi_score, 80);

  const resObese = evaluateBMI({ height: 100, weight: 21.0, gender: '男', grade: 1, standard: 'MOE_2014' });
  assert.equal(resObese.bmi_label, '肥胖');
  assert.equal(resObese.bmi_score, 60);
});

test('evaluateBMI handles missing fields gracefully without throwing', () => {
  assert.deepEqual(evaluateBMI({ height: null, weight: 18 }), {
    bmi: null,
    bmi_label: null,
    bmi_score: null,
    bmi_standard: 'WS_T_2018',
  });
  const noGender = evaluateBMI({ height: 100, weight: 15.0 });
  assert.equal(noGender.bmi, 15.0);
  assert.equal(noGender.bmi_label, null);
});

