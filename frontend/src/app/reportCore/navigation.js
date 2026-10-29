export const navigation = {
  student: [['home','我的成长首页'],['archive','成长档案'],['cards','扫码领取'],['stories','月度故事'],['awards','上传奖状'],['self','自我评价'],['report','我的期末报告']],
  teacher: [['direct','无卡直评'],['cards-manage','卡片管理'],['imports','学业导入'],['reviews','材料认定'],['settlements','采集结算'],['drafts','班级报告确认']],
  manager: [['config','学期配置'],['roster','学籍与账号'],['health','体测原始值'],['quota','月度卡额度'],['releases','全校发布']],
};
export const roleNames = { student:'学生',teacher:'教师',manager:'管理员' };
export function parseCoreLocation(hash = '') {
  const [path, query = ''] = hash.replace(/^#/, '').split('?'), parts = path.split('/').filter(Boolean), p = new URLSearchParams(query);
  const out = { role: parts[0], page: parts[1] === 'materials' ? 'cards' : parts[1] };
  for (const key of ['termId','classKey','studentId']) if (p.get(key)) out[key] = p.get(key);
  if (p.get('card')) out.cardToken = p.get('card');
  return out;
}
export function routeForRole(route, role) {
  const pages = navigation[role] || [];
  return { ...route, role, page: route.role === role && pages.some(([id]) => id === route.page) ? route.page : pages[0]?.[0] };
}
export function formatCoreLocation(route) {
  const p = new URLSearchParams();
  for (const key of ['termId','classKey','studentId']) if (route[key]) p.set(key, route[key]);
  return `#/${route.role}/${route.page}${p.size ? '?' + p : ''}`;
}
