const {catalog}=require('./reportCoreV2Policy');
const {fail}=require('./reportCorePolicy');
const subjects=[['MORAL','道德与法治'],['CHINESE','语文'],['MATH','数学'],['SCIENCE','科学'],['ENGLISH','英语'],['PE','体育与健康'],['MUSIC','音乐'],['FINE_ART','美术'],['INFORMATION_TECHNOLOGY','信息科技'],['LABOR','劳动'],['INTEGRATED_PRACTICE','综合实践活动'],['LOCAL_COURSE','地方课程']].map(([subjectCode,subjectName])=>{const category=catalog.cardCatalog.find(c=>c.code===(subjectCode==='MORAL'?'MORAL_SUBJECT_PROCESS':subjectCode+'_PROCESS'));return{subjectCode,subjectName,category,categoryCode:category.code,targetColumn:category.targetColumn};});
function resolveSemesterQuotas(config={}){
 const state=config.semesterCards||{};
 const defaultTotal=state.defaultTotal??config.courseCardDefaultQuota??100;
 const overrides=state.quotas??config.courseCardQuotas??{};
 const valid=v=>Number.isInteger(v)&&v>=0&&v<=10000;
 if(!valid(defaultTotal)||Object.keys(overrides).some(k=>!subjects.some(s=>s.subjectCode===k)))fail(422,'学科额度不合法');
 return{defaultTotal,subjects:subjects.map(s=>{const total=overrides[s.subjectCode]??null;if(total!==null&&!valid(total))fail(422,'额度须为0至10000的整数');return{...s,total,effectiveTotal:total??defaultTotal,usesDefault:total===null};})};
}
function semesterState(config={}){return config.semesterCards||{version:1,status:'DRAFT',revision:1,defaultTotal:config.courseCardDefaultQuota??100,quotas:config.courseCardQuotas||{},initializedAt:null,initializedBy:null,generatedTotal:0};}
module.exports={subjects,resolveSemesterQuotas,semesterState};
