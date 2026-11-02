export const navigation = {
 student:[['cards','领取积分'],['stories','云美故事'],['awards','上传奖状'],['self','自我评价'],['report','六育报告']],
 teacher:[['direct','无卡直评'],['imports','综合成绩'],['reviews','评审获奖'],['comments','班主任寄语'],['cards-manage','打印积分卡'],['drafts','六育综合情况']],
 manager:[['releases','发布中心'],['roster','学籍与账号'],['classes','班级管理'],['quota','月度卡额度'],['statistics','数据统计'],['config','学期配置'],['audit','操作记录']],
};
export const pageTitles={home:'首页',stories:'云美故事',archive:'我的档案',cards:'领取积分',awards:'上传奖状',self:'自我评价',report:'六育报告',workspace:'工作台',entry:'评价录入',direct:'无卡直评',imports:'综合成绩',reviews:'评审获奖',comments:'班主任寄语',settlements:'采集结算','cards-manage':'打印积分卡',drafts:'六育综合情况',releases:'发布中心',statistics:'数据统计',roster:'学籍与账号',classes:'班级管理',audit:'操作记录',quota:'月度卡额度',config:'学期配置'};
export const mainPage=(role,page)=>role==='teacher'&&page==='entry'?'direct':page;
const allowed={student:['home','stories','archive','cards','awards','self','report'],teacher:['workspace','entry','direct','imports','reviews','comments','settlements','cards-manage','drafts'],manager:['releases','roster','classes','quota','statistics','config','audit']};
export const roleNames = { student:'学生',teacher:'教师',manager:'管理员' };
export function parseCoreLocation(hash = '') {
  const [path, query = ''] = hash.replace(/^#/, '').split('?'), parts = path.split('/').filter(Boolean), p = new URLSearchParams(query);
  const out = { role: parts[0], page: parts[1] === 'materials' ? 'cards' : parts[1] };
  for (const key of ['termId','classKey','studentId','reportKeyword','reportStatus','reportCursor','reportVersion','reportScope','reportLimit','reportSection']) if (p.get(key)) out[key] = p.get(key);
  if (p.get('card')) out.cardToken = p.get('card');
  return out;
}
export function routeForRole(route, role) {
  const pages = navigation[role] || [];
  return { ...route, role, page: route.role === role && (allowed[role]||[]).includes(route.page) ? route.page : pages[0]?.[0] };
}
export function formatCoreLocation(route) {
  const p = new URLSearchParams();
  for (const key of ['termId','classKey','studentId','reportKeyword','reportStatus','reportCursor','reportVersion','reportScope','reportLimit','reportSection']) if (route[key]) p.set(key, route[key]);
  return `#/${route.role}/${route.page}${p.size ? '?' + p : ''}`;
}
