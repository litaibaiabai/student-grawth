const crypto=require('node:crypto');const catalog=require('../config/reportCorePolicy.json');const {AppError}=require('../middleware/errorHandler');
const fail=(status,message)=>{throw new AppError(status,message,status)};
function stableHash(value){const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
const subjectFor=column=>{const prefix=column.split('_')[0];return ({conduct:'CONDUCT',moral:'MORAL',chinese:'CHINESE',math:'MATH',science:'SCIENCE',english:'ENGLISH',pe:'PE',fitness:'PE',height:'PE',weight:'PE',vision:'PE',jump:'PE',music:'MUSIC',fine:'FINE_ART',information:'INFORMATION_TECHNOLOGY',labor:'LABOR',integrated:'INTEGRATED_PRACTICE',local:'LOCAL_COURSE',story:'STORY',sports:'PE',art:'ART'})[prefix]||'NARRATIVE'};
const fixedFields=catalog.fields.filter(f=>!f.jsonPath);const byColumn=new Map(fixedFields.map(f=>[f.column,f]));
const narratives=['self_conduct_text','self_wisdom_text','self_health_text','self_art_text','self_labor_text','semester_highlights','next_term_goals','teacher_comment','family_message'];
module.exports={fail,stableHash,catalog,fixedFields,byColumn,narratives,subjectFor};
