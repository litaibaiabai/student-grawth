export const navigation = {
 student:[['home','首页'],['stories','月度故事'],['archive','我的档案']],
 teacher:[['workspace','工作台'],['entry','评价录入'],['cards-manage','卡片管理'],['drafts','班级报告']],
 manager:[['releases','发布中心'],['roster','学籍与账号'],['health','体测原始值'],['quota','月度卡额度'],['config','学期配置']],
};
export const pageTitles={home:'首页',stories:'月度故事',archive:'我的档案',cards:'领取积分卡',awards:'上传奖状',self:'给自己点星星',report:'我的期末报告',workspace:'工作台',entry:'评价录入',direct:'评价录入',imports:'评价录入',reviews:'评价录入',settlements:'评价录入','cards-manage':'卡片管理',drafts:'班级报告',releases:'发布中心',roster:'学籍与账号',health:'体测原始值',quota:'月度卡额度',config:'学期配置'};
export const mainPage=(role,page)=>role==='student'?['stories','archive'].includes(page)?page:['self','report'].includes(page)?'archive':'home':role==='teacher'&&['direct','imports','reviews','settlements'].includes(page)?'entry':page;
const allowed={student:['home','stories','archive','cards','awards','self','report'],teacher:['workspace','entry','direct','imports','reviews','settlements','cards-manage','drafts'],manager:['releases','roster','health','quota','config']};
export const roleNames = { student:'学生',teacher:'教师',manager:'管理员' };
export function parseCoreLocation(hash = '') {
  const [path, query = ''] = hash.replace(/^#/, '').split('?'), parts = path.split('/').filter(Boolean), p = new URLSearchParams(query);
  const out = { role: parts[0], page: parts[1] === 'materials' ? 'cards' : parts[1] };
  for (const key of ['termId','classKey','studentId','reportKeyword','reportStatus','reportCursor','reportVersion','reportScope']) if (p.get(key)) out[key] = p.get(key);
  if (p.get('card')) out.cardToken = p.get('card');
  return out;
}
export function routeForRole(route, role) {
  const pages = navigation[role] || [];
  return { ...route, role, page: route.role === role && (allowed[role]||[]).includes(route.page) ? route.page : pages[0]?.[0] };
}
export function formatCoreLocation(route) {
  const p = new URLSearchParams();
  for (const key of ['termId','classKey','studentId','reportKeyword','reportStatus','reportCursor','reportVersion','reportScope']) if (route[key]) p.set(key, route[key]);
  return `#/${route.role}/${route.page}${p.size ? '?' + p : ''}`;
}
