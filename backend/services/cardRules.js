const { AppError } = require('../middleware/errorHandler');

const DIMENSIONS = ['D', 'Z', 'T', 'M', 'L', 'G'];
const DIMENSION_NAMES = { D: '德育', Z: '智育', T: '体育', M: '美育', L: '劳育', G: '故事' };
const invalid = (message) => new AppError(422, message, 422);

function validateMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw invalid('月份格式应为 YYYY-MM');
  return month;
}

function ratiosToBps(ratios) {
  if (!ratios || typeof ratios !== 'object' || Array.isArray(ratios) || Object.keys(ratios).some(k => !DIMENSIONS.includes(k))) throw invalid('请填写六育比例');
  const result = {};
  for (const key of DIMENSIONS) {
    const value = ratios[key] === undefined ? 0 : ratios[key];
    if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw invalid('比例须为非负数，最多两位小数');
    const [whole, fraction = ''] = String(value).split('.');
    result[key] = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(result[key]) || result[key] > 10000) throw invalid('单个方向比例不能超过100%');
  }
  if (Object.values(result).reduce((a, b) => a + b, 0) !== 10000) throw invalid('六育比例合计必须为100%');
  return result;
}

function allocateCards(total, ratios) {
  if (!Number.isSafeInteger(total) || total < 0 || total > 100000) throw invalid('每月总张数须为0至100000的整数');
  const bps = ratiosToBps(ratios);
  const result = Object.fromEntries(DIMENSIONS.map(k => [k, Math.floor(total * bps[k] / 10000)]));
  const order = DIMENSIONS.filter(k => bps[k] > 0).sort((a, b) => (total * bps[b] % 10000) - (total * bps[a] % 10000));
  const left = total - Object.values(result).reduce((a, b) => a + b, 0);
  for (const k of order.slice(0, left)) result[k]++;
  return result;
}

function sqlDate(value) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  return String(value || '').slice(0,10);
}

function sqlTimestamp(value) {
  if (value instanceof Date) return `${sqlDate(value)} ${[value.getHours(),value.getMinutes(),value.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':')}`;
  return String(value || '').replace('T',' ').slice(0,19);
}

function schoolTimestamp(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function effectivePolicyMonth(month, hasAllocation) {
  validateMonth(month);
  if (!hasAllocation) return month;
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth()+1);
  return d.toISOString().slice(0,7);
}

function monthEnd(month) {
  validateMonth(month);
  const [y,m] = month.split('-').map(Number);
  return `${month}-${new Date(Date.UTC(y,m,0)).getUTCDate()}`;
}

function selectCardTerm(terms, schoolId, month) {
  validateMonth(month);
  const own = terms.filter(t=>Number(t.school_id)===Number(schoolId) && t.school_id!==null);
  const source = own.length ? own : terms.filter(t=>t.school_id===null);
  const matches = source.filter(t=>Number(t.active)===1 && sqlDate(t.start_date)<=monthEnd(month) && sqlDate(t.end_date)>=`${month}-01`);
  if (matches.length>1) throw new AppError(409,'该月份覆盖多个有效学期，请先调整学期与校历',409);
  return matches[0] || null;
}

function cardWindow(term, month) {
  validateMonth(month);
  const termDeadline = term.review_deadline_at ? sqlTimestamp(term.review_deadline_at) : `${sqlDate(term.end_date)} 23:59:59`;
  const nextMonth = effectivePolicyMonth(month,true);
  return {
    validFrom: [`${month}-01 00:00:00`,`${sqlDate(term.start_date)} 00:00:00`].sort().at(-1),
    validUntil: [`${monthEnd(month)} 23:59:59`,termDeadline].sort()[0],
    reviewDeadline: [`${nextMonth}-03 23:59:59`,termDeadline].sort()[0]
  };
}

module.exports = { DIMENSIONS, DIMENSION_NAMES, allocateCards, ratiosToBps, validateMonth, selectCardTerm, cardWindow, effectivePolicyMonth, schoolTimestamp, sqlDate, sqlTimestamp };
