export function currentSchoolMonth(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).formatToParts(date);
 return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
}
export function storyMonths(term){
 const start=String(term?.startDate||'').slice(0,7),end=String(term?.endDate||'').slice(0,7);if(!/^\d{4}-\d{2}$/.test(start)||!/^\d{4}-\d{2}$/.test(end)||start>end)return [];
 let [y,m]=start.split('-').map(Number);const result=[];
 while(result.length<24){const key=`${y}-${String(m).padStart(2,'0')}`;if(key>end)break;result.push({key,label:`${m} 月`});if(++m===13){m=1;y++;}}
 return result;
}
export function defaultStoryMonth(term, date=new Date()) {
 const month=currentSchoolMonth(date), first=String(term?.start_date||'').slice(0,7),last=String(term?.end_date||'').slice(0,7);
 return /^\d{4}-\d{2}$/.test(first)&&month<first?first:/^\d{4}-\d{2}$/.test(last)&&month>last?last:month;
}
