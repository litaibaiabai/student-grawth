const sections={德美:['conduct','德美少年'],道德与法治:['wisdom','智美少年'],语文:['wisdom','智美少年'],数学:['wisdom','智美少年'],科学:['wisdom','智美少年'],英语:['wisdom','智美少年'],体育与健康:['health','健美少年'],体质健康测试:['health','健美少年'],音乐:['art','艺美少年'],美术:['art','艺美少年']};
export const cardSubject=column=>({conduct:'CONDUCT',moral:'MORAL',chinese:'CHINESE',math:'MATH',science:'SCIENCE',english:'ENGLISH',pe:'PE',fitness:'PE',music:'MUSIC',fine:'FINE_ART'})[column.split('_')[0]];
export function eligibleCardCodes({catalog,assignments,studentRows,selectedStudentIds}) {
 const ids=[...new Set(selectedStudentIds.map(String))];if(!ids.length)return [];
 const students=ids.map(id=>studentRows.find(s=>String(s.student_id)===id));if(students.some(s=>!s))return [];
 return catalog.cardCatalog.filter(c=>students.every(s=>assignments.some(a=>a.enabled!==0&&Number(a.grade)===Number(s.grade_snapshot)&&Number(a.class_no)===Number(s.class_no_snapshot)&&(cardSubject(c.targetColumn)==='CONDUCT'||a.subject_code===cardSubject(c.targetColumn))))).map(c=>c.code);
}
export function buildCardTree(catalog,allowedCodes) {
 const allowed=new Set(allowedCodes),tree=[];
 for(const c of catalog.cardCatalog){
  if(!allowed.has(c.code)||!sections[c.group])continue;const [id,label]=sections[c.group],primary=c.group==='德美'?'日常行为':c.group;
  let section=tree.find(s=>s.id===id);if(!section){section={id,label,children:[]};tree.push(section);}
  let group=section.children.find(p=>p.id===primary);if(!group){group={id:primary,label:primary,children:[]};section.children.push(group);}
  group.children.push({id:c.code,label:c.item,targetColumn:c.targetColumn});
 }
 return tree;
}
export function updateCardPath(path,key,value) {
 if(key==='studentIds'){
  const signature=ids=>[...ids].map(String).sort().join(',');if(signature(path.studentIds||[])===signature(value))return path;
  return {studentIds:value,section:'',primary:'',categoryCode:''};
 }
 if(path[key]===value)return path;
 return {...path,[key]:value,...(key==='section'?{primary:'',categoryCode:''}:key==='primary'?{categoryCode:''}:{})};
}
