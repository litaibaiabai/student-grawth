/**
 * monthKey.js — 自然月 month_key 计算工具
 * 严格按照学校配置的时区（默认 Asia/Shanghai）计算自然月 YYYY-MM
 */

/**
 * 计算指定日期的 month_key
 * @param {Date|string|number} [date=new Date()]
 * @param {string} [timeZone='Asia/Shanghai']
 * @returns {string} 例如 "2026-10"
 */
function getMonthKey(date = new Date(), timeZone = "Asia/Shanghai") {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error("Invalid date passed to getMonthKey");
  }

  // 使用 Intl.DateTimeFormat 获取指定时区下的年月日
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit"
  });

  const parts = formatter.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;

  return `${year}-${month}`;
}

module.exports = { getMonthKey };
