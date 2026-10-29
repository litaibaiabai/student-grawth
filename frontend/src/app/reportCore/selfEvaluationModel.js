export const selfTexts = [
 ['self_conduct_text','品行美自述'],['self_wisdom_text','智慧美自述'],['self_health_text','健康美自述'],['self_art_text','艺术美自述'],['self_labor_text','劳动美自述'],['semester_highlights','本学期最大收获与活动'],['next_term_goals','下学期努力目标'],
];
export function buildSelfGroups(view,catalog) {
 const applicable=new Set(view.applicableSelfFields||[]);
 return [
  ...[['conduct','友善的小星星','日常行为'],['health','活力小达人','健康与体育特长'],['art','创意小画家','艺术与艺术特长']].map(([key,title,description])=>({key,title,description,fields:catalog.fields.filter(f=>!f.jsonPath&&applicable.has(f.column)&&f.section===key)})),
  {key:'narrative',title:'写下我的成长',description:'七段小记录，留下这个学期的自己',fields:selfTexts.map(([column,label])=>({column,label,valueType:'text'}))},
 ];
}
export function getSelfProgress(view,catalog) {
 const values=view.values||{}, fields=buildSelfGroups(view,catalog).flatMap(g=>g.fields);
 let total=fields.length,complete=fields.filter(f=>f.valueType==='text'?String(values[f.column]||'').trim():[1,2,3].includes(Number(values[f.column]))).length;
 for(const array of [view.sportsSpecialties,view.artSpecialties])for(const item of array||[]){total++;if([1,2,3].includes(Number(item.self_star)))complete++;}
 return {total,complete};
}
export function mergeSelfDraft({base,local,remote,specialtyChanges=[]}) {
 const merged={},conflicts=[],removedSpecialtyIds=[],changes=[];
 for(const [field,value] of Object.entries(local)) {
  if((remote.values?.[field]??null)!==(base.values?.[field]??null)&&(remote.values?.[field]??null)!==(value??null))conflicts.push({field,local:value,remote:remote.values?.[field]??null});
  merged[field]=value;
 }
 for(const change of specialtyChanges){
  const key=change.collection==='sports'?'sportsSpecialties':'artSpecialties', old=(base[key]||[]).find(x=>x.id===change.id),fresh=(remote[key]||[]).find(x=>x.id===change.id);
  if(!fresh){removedSpecialtyIds.push(change.id);continue;}
  const localValue=change.changes.self_star;
  if((old?.self_star??null)!==(fresh.self_star??null)&&(fresh.self_star??null)!==(localValue??null))conflicts.push({field:`${change.collection}:${change.id}`,local:localValue,remote:fresh.self_star??null,specialty:change});
  changes.push(change);
 }
 return {merged,conflicts,removedSpecialtyIds,specialtyChanges:changes};
}
