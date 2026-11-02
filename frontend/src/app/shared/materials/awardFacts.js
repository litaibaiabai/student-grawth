export const awardRegions = ['省级', '市级', '区级'];
export const awardLevels = ['一等奖', '二等奖', '三等奖', '其他'];
export const awardSubjects = [
  ['MORAL','道德与法治'], ['CHINESE','语文'], ['MATH','数学'], ['ENGLISH','英语'],
  ['SCIENCE','科学'], ['PE','体育'], ['MUSIC','音乐'], ['FINE_ART','美术'],
  ['LABOR','劳动'], ['INFORMATION_TECHNOLOGY','信息科技'],
  ['INTEGRATED_PRACTICE','综合实践'], ['LOCAL_COURSE','地方课程'], ['STORY','故事活动'],
];
export const subjectLabel = code => awardSubjects.find(([id]) => id === code)?.[1] || '待核对';
export function missingAwardFacts(facts) {
  const missing = [];
  if (!facts.title?.trim()) missing.push('荣誉名称');
  if (!awardRegions.includes(facts.awardRegion)) missing.push('荣誉地域');
  if (!awardLevels.includes(facts.awardLevel)) missing.push('荣誉级别');
  if (!awardSubjects.some(([code]) => code === facts.subjectCode)) missing.push('所属学科');
  return missing;
}
