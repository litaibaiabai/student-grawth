const crypto = require("node:crypto");
const catalog = require("../config/reportCorePolicy.json");
const { AppError } = require("../middleware/errorHandler");
const fail = (status, message) => {
  throw new AppError(status, message, status);
};
function stableHash(value) {
  const stable = (v) =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter((k) => v[k] !== undefined)
              .map((k) => [k, stable(v[k])]),
          )
        : v;
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
const subjectFor = (column) => {
  const prefix = column.split("_")[0];
  return (
    {
      conduct: "CONDUCT",
      moral: "MORAL",
      chinese: "CHINESE",
      math: "MATH",
      science: "SCIENCE",
      english: "ENGLISH",
      pe: "PE",
      fitness: "PE",
      height: "PE",
      weight: "PE",
      vision: "PE",
      jump: "PE",
      music: "MUSIC",
      fine: "FINE_ART",
      information: "INFORMATION_TECHNOLOGY",
      labor: "LABOR",
      integrated: "INTEGRATED_PRACTICE",
      local: "LOCAL_COURSE",
      story: "STORY",
      sports: "PE",
      art: "ART",
    }[prefix] || "NARRATIVE"
  );
};
const fixedFields = catalog.fields.filter((f) => !f.jsonPath);
const byColumn = new Map(fixedFields.map((f) => [f.column, f]));
const narratives = [
  "self_conduct_text",
  "self_wisdom_text",
  "self_health_text",
  "self_art_text",
  "self_labor_text",
  "semester_highlights",
  "next_term_goals",
  "teacher_comment",
  "family_message",
];
module.exports = {
  fail,
  stableHash,
  catalog,
  fixedFields,
  byColumn,
  narratives,
  subjectFor,
};
function cardStars({ points, target = 10, settled }) {
  if (
    !Number.isInteger(points) ||
    points < 0 ||
    !Number.isInteger(target) ||
    target < 2
  )
    fail(422, "积分/阈值不合法");
  if (!settled) return null;
  return points >= target ? 3 : points >= Math.ceil(target / 2) ? 2 : 1;
}
function storyStars(score) {
  if (!Number.isFinite(score) || score < 0 || score > 100)
    fail(422, "故事分数不合法");
  return score >= 85 ? 3 : score >= 60 ? 2 : 1;
}
function storyMean(months) {
  if (!months.length || months.some((a) => !a.length))
    fail(422, "故事月份未完成");
  return (
    months.reduce((n, a) => n + a.reduce((x, y) => x + y, 0) / a.length, 0) /
    months.length
  );
}
function validateValue(column, value, config = {}) {
  const f = byColumn.get(column);
  if (!f && !narratives.includes(column)) fail(422, "未知评价字段");
  if (value === null) return null;
  if (f?.valueType === "star") {
    if (typeof value === "string" && /^★{1,3}$/.test(value))
      value = value.length;
    if (![1, 2, 3].includes(value)) fail(422, "星级应为1至3");
  } else if (f?.valueType === "grade") {
    if (!(config.allowedGrades || ["A", "B", "C", "D"]).includes(value))
      fail(422, "等级值不合法");
  } else if (["height_cm", "weight_kg"].includes(column)) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value >= 10000 ||
      Math.abs(value * 10 - Math.round(value * 10)) > 1e-8
    )
      fail(422, "测量值应为正数且最多一位小数");
  } else if (column === "jump_rope_1min") {
    if (!Number.isInteger(value) || value < 0 || value > 10000)
      fail(422, "跳绳次数不合法");
  } else {
    const max = column.startsWith("vision_")
      ? 16
      : column.endsWith("comment") || column === "family_message"
        ? 1000
        : 2000;
    if (typeof value !== "string" || [...value].length > max)
      fail(422, `文字上限${max}字`);
    if (column.startsWith("vision_") && !value.trim())
      fail(422, "视力不能为空");
  }
  return value;
}
function validateConfig(config) {
  if (
    !config ||
    !Array.isArray(config.requiredMonths) ||
    config.requiredMonths.some((m) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m))
  )
    fail(422, "应交故事月份不合法");
  cardStars({ points: 0, target: config.cardTarget ?? 10, settled: true });
  if (config.applicableFields?.some((c) => !byColumn.has(c)))
    fail(422, "适用字段不合法");
  return config;
}
Object.assign(module.exports, {
  cardStars,
  storyStars,
  storyMean,
  validateValue,
  validateConfig,
});
