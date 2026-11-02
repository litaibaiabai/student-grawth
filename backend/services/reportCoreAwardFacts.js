const { fail } = require('./reportCorePolicy');
const regions = ['省级', '市级', '区级'];
const levels = ['一等奖', '二等奖', '三等奖', '其他'];
const subjects = ['MORAL','CHINESE','MATH','ENGLISH','SCIENCE','PE','MUSIC','FINE_ART','LABOR','INFORMATION_TECHNOLOGY','INTEGRATED_PRACTICE','LOCAL_COURSE','STORY'];
const oldRegions = new Set(['校级','区级','区/县级','县级','区／县级','市级','省级','国家级']);
const trim = value => typeof value === 'string' ? value.trim() : '';
function normalizeAwardFacts(input) {
  const facts = input && typeof input === 'object' ? input : {};
  const legacy = !trim(facts.awardRegion) && oldRegions.has(trim(facts.awardLevel));
  const region = trim(facts.awardRegion) || (legacy ? trim(facts.awardLevel) : '');
  const oldPrize = trim(facts.prizeLevel);
  return {
    title: trim(facts.title),
    awardRegion: ({省:'省级',市:'市级',区:'区级','区/县级':'区级','区／县级':'区级',县级:'区级'})[region] || region,
    awardLevel: legacy ? (levels.includes(oldPrize) ? oldPrize : oldPrize ? '其他' : '') : trim(facts.awardLevel),
    subjectCode: trim(facts.subjectCode),
  };
}
function validateAwardFacts(input) {
  for (const key of ['title','awardRegion','awardLevel','subjectCode']) {
    if (input?.[key] !== undefined && typeof input[key] !== 'string') fail(422, '获奖信息格式不合法');
    if (typeof input?.[key] === 'string' && input[key].trim().length > 250) fail(422, '获奖信息过长');
  }
  const facts = normalizeAwardFacts(input);
  if (!facts.title) fail(422, '请填写荣誉名称');
  if (!regions.includes(facts.awardRegion)) fail(422, '荣誉地域请选择省级、市级或区级');
  if (!levels.includes(facts.awardLevel)) fail(422, '荣誉级别请选择一等奖、二等奖、三等奖或其他');
  if (!subjects.includes(facts.subjectCode)) fail(422, '请选择有效所属学科');
  return facts;
}
module.exports = { regions, levels, subjects, normalizeAwardFacts, validateAwardFacts };
