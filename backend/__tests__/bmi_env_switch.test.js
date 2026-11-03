const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateBMI } = require('../services/bmiEvaluationService');
const { createV2Config } = require('../services/reportCoreV2Policy');
const { buildReportModel } = require('../services/reportCoreEvaluation');
const { renderV2 } = require('../services/reportRenderV2');

test('environment variable switches between WS_T_2018 and MOE_2014 seamlessly', () => {
  const originalEnv = process.env.BMI_EVALUATION_STANDARD;
  try {
    // 1. WS_T_2018
    process.env.BMI_EVALUATION_STANDARD = 'WS_T_2018';
    const wsRes = evaluateBMI({
      height: 125.0,
      weight: 18.0,
      gender: '男',
      grade: 1,
      birthDate: '2020-01-01',
      measurementDate: '2026-01-01',
    });
    assert.equal(wsRes.bmi, 11.52);
    assert.equal(wsRes.bmi_label, '中重度消瘦');
    assert.equal(wsRes.bmi_score, null);
    assert.equal(wsRes.bmi_standard, 'WS_T_2018');

    // 2. MOE_2014
    process.env.BMI_EVALUATION_STANDARD = 'MOE_2014';
    const moeRes = evaluateBMI({
      height: 125.0,
      weight: 18.0,
      gender: '男',
      grade: 1,
      birthDate: '2020-01-01',
      measurementDate: '2026-01-01',
    });
    assert.equal(moeRes.bmi, 11.52);
    assert.equal(moeRes.bmi_label, '低体重');
    assert.equal(moeRes.bmi_score, 80);
    assert.equal(moeRes.bmi_standard, 'MOE_2014');
  } finally {
    if (originalEnv === undefined) delete process.env.BMI_EVALUATION_STANDARD;
    else process.env.BMI_EVALUATION_STANDARD = originalEnv;
  }
});

test('WS_T_2018 automatically infers age from grade when birthDate is absent', () => {
  const resG1 = evaluateBMI({
    height: 125.0,
    weight: 18.0,
    gender: '男',
    grade: 1,
    standard: 'WS_T_2018',
  });
  // Grade 1 -> 6.5 yrs boy -> <= 13.0 is severe thin
  assert.equal(resG1.bmi_label, '中重度消瘦');

  const resG4 = evaluateBMI({
    height: 142.0,
    weight: 34.5,
    gender: '女',
    grade: 4,
    standard: 'WS_T_2018',
  });
  // Grade 4 -> 9.5 yrs girl -> 13.9 ~ 18.6 is normal
  assert.equal(resG4.bmi, 17.11);
  assert.equal(resG4.bmi_label, '正常');
});

test('out-of-bound age is clamped to boundary brackets (6.0 and 12.0)', () => {
  const young = evaluateBMI({
    height: 110.0,
    weight: 16.0,
    gender: '男',
    age: 4.5,
    standard: 'WS_T_2018',
  });
  assert.equal(young.bmi, 13.22);
  assert.equal(young.bmi_label, '轻度消瘦'); // 6.0 boy: 13.1~13.4 is mild

  const older = evaluateBMI({
    height: 160.0,
    weight: 45.0,
    gender: '女',
    age: 14.0,
    standard: 'WS_T_2018',
  });
  assert.equal(older.bmi, 17.58);
  assert.equal(older.bmi_label, '正常'); // 12.0 girl: 15.3~21.1 is normal
});

test('gender code 0 is treated as unknown gender rather than female', () => {
  const res = evaluateBMI({
    height: 125.0,
    weight: 18.0,
    gender: '0',
    age: 6.0,
    standard: 'WS_T_2018',
  });
  assert.equal(res.bmi, 11.52);
  assert.equal(res.bmi_label, null); // unknown gender should not classify as female
});

test('calculateAge returns null when measurementDate is missing', () => {
  const { calculateAge } = require('../services/bmiEvaluationService');
  assert.equal(calculateAge('2019-01-01', null), null);
  assert.equal(calculateAge('2019-01-01', undefined), null);
});

test('HTML and DTO rendering show dash for bmi_label when gender is missing', () => {
  const config = createV2Config();
  const evaluation = {
    student_id: 1,
    student_name_snapshot: '小红',
    grade_snapshot: 1,
    class_no_snapshot: 1,
    revision: 1,
    height_cm: '125.0',
    weight_kg: '18.0',
    // gender missing
    teacher_comment: '表现优良',
    story_summary: JSON.stringify({ WRITE: { rank: 1, value: 2 }, LISTEN: { rank: 1, value: 1 }, TELL: { rank: null, value: null } }),
    honor_summary: JSON.stringify({ items: [] }),
    field_sources: JSON.stringify({}),
  };
  for (const f of config.applicableFields) {
    if (evaluation[f] === undefined) evaluation[f] = 1;
  }
  evaluation.height_cm = '125.0';
  evaluation.weight_kg = '18.0';

  const m = buildReportModel({ evaluation, config });
  assert.equal(m.values.bmi, 11.52);
  assert.equal(m.values.bmi_label, null);

  const html = renderV2({ model: m, renderScope: 'DETAIL_ONLY' });
  assert.match(html, /<td class="bmi-cell"><div[^>]*>11\.52<\/div><div[^>]*>—<\/div><\/td>/);
});

test('buildReportModel accurately retrieves gender and birthDate from fieldSources.height_cm', () => {
  const config = createV2Config();
  const evaluation = {
    student_id: 2,
    student_name_snapshot: '张三',
    grade_snapshot: 1,
    class_no_snapshot: 1,
    revision: 1,
    height_cm: '125.0',
    weight_kg: '18.0',
    teacher_comment: '良好',
    story_summary: JSON.stringify({ WRITE: { rank: 1, value: 2 }, LISTEN: { rank: 1, value: 1 }, TELL: { rank: null, value: null } }),
    honor_summary: JSON.stringify({ items: [] }),
    // sources contain imported gender and measurement
    field_sources: JSON.stringify({
      height_cm: {
        measurement: { date: '2026-03-01' },
        gender: '男',
        birthDate: '2019-09-01',
      }
    }),
  };
  for (const f of config.applicableFields) {
    if (evaluation[f] === undefined) evaluation[f] = 1;
  }
  evaluation.height_cm = '125.0';
  evaluation.weight_kg = '18.0';

  const m = buildReportModel({ evaluation, config });
  assert.equal(m.values.bmi, 11.52);
  assert.equal(m.values.bmi_label, '中重度消瘦');
  assert.equal(m.values.bmi_standard, 'WS_T_2018');
});



