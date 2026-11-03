const WS_T_2018_TABLE = {
  male: {
    6.0:  { severeMax: 13.0, mildMax: 13.4, normalMax: 16.3, overMax: 17.6 },
    6.5:  { severeMax: 13.0, mildMax: 13.5, normalMax: 16.5, overMax: 18.0 },
    7.0:  { severeMax: 13.1, mildMax: 13.5, normalMax: 16.9, overMax: 18.6 },
    7.5:  { severeMax: 13.1, mildMax: 13.6, normalMax: 17.3, overMax: 19.1 },
    8.0:  { severeMax: 13.2, mildMax: 13.7, normalMax: 17.6, overMax: 19.6 },
    8.5:  { severeMax: 13.3, mildMax: 13.8, normalMax: 18.0, overMax: 20.2 },
    9.0:  { severeMax: 13.4, mildMax: 13.9, normalMax: 18.4, overMax: 20.7 },
    9.5:  { severeMax: 13.5, mildMax: 14.1, normalMax: 18.8, overMax: 21.3 },
    10.0: { severeMax: 13.6, mildMax: 14.3, normalMax: 19.1, overMax: 21.8 },
    10.5: { severeMax: 13.8, mildMax: 14.4, normalMax: 19.5, overMax: 22.4 },
    11.0: { severeMax: 14.0, mildMax: 14.6, normalMax: 19.8, overMax: 22.9 },
    11.5: { severeMax: 14.2, mildMax: 14.9, normalMax: 20.2, overMax: 23.5 },
    12.0: { severeMax: 14.4, mildMax: 15.1, normalMax: 20.6, overMax: 24.0 },
  },
  female: {
    6.0:  { severeMax: 12.6, mildMax: 13.1, normalMax: 16.1, overMax: 17.4 },
    6.5:  { severeMax: 12.6, mildMax: 13.1, normalMax: 16.4, overMax: 17.9 },
    7.0:  { severeMax: 12.6, mildMax: 13.1, normalMax: 16.7, overMax: 18.4 },
    7.5:  { severeMax: 12.7, mildMax: 13.2, normalMax: 17.1, overMax: 18.9 },
    8.0:  { severeMax: 12.8, mildMax: 13.3, normalMax: 17.5, overMax: 19.3 },
    8.5:  { severeMax: 12.9, mildMax: 13.5, normalMax: 17.8, overMax: 19.8 },
    9.0:  { severeMax: 13.0, mildMax: 13.6, normalMax: 18.2, overMax: 20.3 },
    9.5:  { severeMax: 13.2, mildMax: 13.8, normalMax: 18.6, overMax: 20.9 },
    10.0: { severeMax: 13.3, mildMax: 14.0, normalMax: 19.1, overMax: 21.4 },
    10.5: { severeMax: 13.5, mildMax: 14.2, normalMax: 19.6, overMax: 22.0 },
    11.0: { severeMax: 13.8, mildMax: 14.5, normalMax: 20.1, overMax: 22.6 },
    11.5: { severeMax: 14.1, mildMax: 14.9, normalMax: 20.6, overMax: 23.2 },
    12.0: { severeMax: 14.4, mildMax: 15.2, normalMax: 21.1, overMax: 23.8 },
  },
};

const MOE_2014_TABLE = {
  male: {
    1: { lowMax: 13.4, normalMax: 18.1, overMax: 20.3 },
    2: { lowMax: 13.6, normalMax: 18.4, overMax: 20.4 },
    3: { lowMax: 13.8, normalMax: 19.4, overMax: 22.1 },
    4: { lowMax: 14.1, normalMax: 20.1, overMax: 22.6 },
    5: { lowMax: 14.3, normalMax: 21.4, overMax: 24.1 },
    6: { lowMax: 14.6, normalMax: 21.8, overMax: 24.5 },
  },
  female: {
    1: { lowMax: 13.2, normalMax: 17.3, overMax: 19.2 },
    2: { lowMax: 13.4, normalMax: 17.8, overMax: 20.2 },
    3: { lowMax: 13.5, normalMax: 18.6, overMax: 21.1 },
    4: { lowMax: 13.6, normalMax: 19.4, overMax: 22.0 },
    5: { lowMax: 13.7, normalMax: 20.5, overMax: 22.9 },
    6: { lowMax: 14.1, normalMax: 20.8, overMax: 23.6 },
  },
};

function normalizeGender(gender) {
  if (!gender) return null;
  const g = String(gender).trim().toUpperCase();
  if (['M', 'MALE', '男', '1'].includes(g)) return 'male';
  if (['F', 'FEMALE', '女', '2', '0'].includes(g)) return 'female';
  return null;
}

function computeBMI(height, weight) {
  if (height === null || height === undefined || weight === null || weight === undefined) return null;
  const h = Number(height), w = Number(weight);
  if (!Number.isFinite(h) || h <= 0 || !Number.isFinite(w) || w <= 0) return null;
  return Math.round((w / ((h / 100) ** 2)) * 100) / 100;
}

function inferAgeFromGrade(grade) {
  const g = Number(grade);
  if (!Number.isFinite(g) || g < 1) return 6.5;
  if (g > 6) return 12.0;
  return 5.5 + g; // 1 -> 6.5, 2 -> 7.5, ... 6 -> 11.5
}

function calculateAge(birthDate, measurementDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const m = measurementDate ? new Date(measurementDate) : new Date();
  if (Number.isNaN(b.getTime()) || Number.isNaN(m.getTime()) || m <= b) return null;
  return (m - b) / (365.2425 * 24 * 3600 * 1000);
}

function alignHalfYearAge(age) {
  if (age === null || age === undefined || !Number.isFinite(age)) return 6.5;
  const clamped = Math.min(12.0, Math.max(6.0, age));
  return Math.round(clamped * 2) / 2;
}

function evaluateBMI({ height, weight, gender, age, birthDate, measurementDate, grade, standard }) {
  const activeStandard = standard || process.env.BMI_EVALUATION_STANDARD || 'WS_T_2018';
  const bmi = computeBMI(height, weight);
  if (bmi === null) {
    return { bmi: null, bmi_label: null, bmi_score: null, bmi_standard: activeStandard };
  }

  const normGender = normalizeGender(gender);
  if (!normGender) {
    return { bmi, bmi_label: null, bmi_score: null, bmi_standard: activeStandard };
  }

  const lookupBMI = Math.round(bmi * 10) / 10;

  if (activeStandard === 'MOE_2014') {
    const g = Math.min(6, Math.max(1, Math.round(Number(grade) || 1)));
    const thresholds = MOE_2014_TABLE[normGender]?.[g];
    if (!thresholds) {
      return { bmi, bmi_label: null, bmi_score: null, bmi_standard: activeStandard };
    }
    if (lookupBMI <= thresholds.lowMax) {
      return { bmi, bmi_label: '低体重', bmi_score: 80, bmi_standard: activeStandard };
    }
    if (lookupBMI <= thresholds.normalMax) {
      return { bmi, bmi_label: '正常', bmi_score: 100, bmi_standard: activeStandard };
    }
    if (lookupBMI <= thresholds.overMax) {
      return { bmi, bmi_label: '超重', bmi_score: 80, bmi_standard: activeStandard };
    }
    return { bmi, bmi_label: '肥胖', bmi_score: 60, bmi_standard: activeStandard };
  }

  // WS_T_2018
  let rawAge = age;
  if (rawAge === null || rawAge === undefined || !Number.isFinite(rawAge)) {
    if (birthDate) {
      rawAge = calculateAge(birthDate, measurementDate);
    }
  }
  if (rawAge === null || rawAge === undefined || !Number.isFinite(rawAge)) {
    rawAge = inferAgeFromGrade(grade);
  }

  const finalAge = alignHalfYearAge(rawAge);
  const thresholds = WS_T_2018_TABLE[normGender]?.[finalAge];
  if (!thresholds) {
    return { bmi, bmi_label: null, bmi_score: null, bmi_standard: activeStandard };
  }

  let label = '正常';
  if (lookupBMI <= thresholds.severeMax) {
    label = '中重度消瘦';
  } else if (lookupBMI <= thresholds.mildMax) {
    label = '轻度消瘦';
  } else if (lookupBMI <= thresholds.normalMax) {
    label = '正常';
  } else if (lookupBMI <= thresholds.overMax) {
    label = '超重';
  } else {
    label = '肥胖';
  }

  return { bmi, bmi_label: label, bmi_score: null, bmi_standard: activeStandard };
}

module.exports = {
  computeBMI,
  inferAgeFromGrade,
  calculateAge,
  alignHalfYearAge,
  evaluateBMI,
  WS_T_2018_TABLE,
  MOE_2014_TABLE,
};
