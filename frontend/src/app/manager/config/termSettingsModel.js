export function getCardStarPreview(points,target,settled){if(!Number.isInteger(points)||points<0||!Number.isInteger(target)||target<2||target>10000)throw Error('试算积分需为非负整数，达标分需为2–10000整数');if(!settled)return null;return points>=target?3:points>=Math.ceil(target/2)?2:1;}
export function buildTermSettingChanges(section,draft,current){
 if(!draft)return {};
 if(section==='registration'){if(draft.clearDate)return current.registrationDate?{clearDate:true}:{};if(!draft.date&&current.registrationDate)throw Error('请选择日期，或明确勾选清空报到日期');return (draft.date||null)===current.registrationDate?{}:{date:draft.date||''};}
 if(section==='rules'){const cardTarget=Number(draft.cardTarget),requiredMonths=[...new Set(draft.requiredMonths||[])].sort();if(String(draft.cardTarget).trim()===''||!Number.isInteger(cardTarget)||cardTarget<2||cardTarget>10000)throw Error('达标分需为2–10000整数');if(!requiredMonths.length||requiredMonths.some(m=>current.availableMonths&&!current.availableMonths.includes(m)))throw Error('请选择至少一个学期内的故事月份');const remove=!!draft.removeLegacyTargets;if(cardTarget===current.rules.cardTarget&&JSON.stringify(requiredMonths)===JSON.stringify([...current.rules.requiredMonths].sort())&&!remove)return {};return {cardTarget,requiredMonths,...(remove?{removeLegacyTargets:true}:{})};}
 if(section==='assignments')return {assignments:(draft.assignments||[]).map(({teacherId,grade,classNo,subjectCode,enabled})=>({teacherId,grade,classNo,subjectCode,enabled})),heads:(draft.heads||[]).map(({grade,classNo,teacherId})=>({grade,classNo,teacherId}))};
 throw Error('配置页签不合法');
}
