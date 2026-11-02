export const navigation = {
 student:[['cards','领取积分'],['stories','云美故事'],['awards','上传奖状'],['self','自我评价'],['report','六育报告']],
 teacher:[['direct','无卡直拼'],['reviews','评审获奖'],['imports','综合成绩'],['comments','班主任寄语'],['drafts','六域综合情况'],['cards-manage','积分卡管理']],
 manager:[['roster','学籍账号管理'],['quota','卡额度管理'],['statistics','数据统计']],
};
export const pageTitles={home:'首页',stories:'云美故事',archive:'我的档案',cards:'领取积分',awards:'上传奖状',self:'自我评价',report:'六育报告',workspace:'工作台',entry:'评价录入',direct:'无卡直拼',imports:'综合成绩',reviews:'评审获奖',comments:'班主任寄语',settlements:'采集结算','cards-manage':'积分卡管理',drafts:'六域综合情况',statistics:'数据统计',roster:'学籍账号管理',quota:'卡额度管理'};
export const mainPage=(role,page)=>role==='teacher'&&page==='entry'?'direct':page;
const allowed={student:['home','stories','archive','cards','awards','self','report'],teacher:['workspace','entry','direct','imports','reviews','comments','settlements','cards-manage','drafts'],manager:['roster','quota','statistics']};
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
