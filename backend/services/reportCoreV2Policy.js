const { AppError } = require('../middleware/errorHandler');
const catalog = require('../config/reportCoreV2Policy.json');
const fixedFields = catalog.fields.filter(f => !f.jsonPath);
const byColumn = new Map(fixedFields.map(f => [f.column,f]));
const fail = message => { throw new AppError(422,message,422); };
const isV2 = config => config?.schemaVersion === 'SIX_EDU_V2';
const policyFor = config => isV2(config) ? catalog : require('../config/reportCorePolicy.json');
function rankProcess(rows, {settled = true} = {}) {
  const seen = new Set();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.points) || row.points < 0) fail('过程积分不合法');
    if (seen.has(String(row.studentId))) fail('重复学生');
    seen.add(String(row.studentId));
  }
  const sorted = rows.slice().sort((a,b) => b.points-a.points || String(a.studentId).localeCompare(String(b.studentId),undefined,{numeric:true}));
  let rank = 0;
  return sorted.map((row,i) => {
    if (i===0 || row.points!==sorted[i-1].points) rank=i+1;
    const q=(rank-1)/sorted.length;
    return {...row,rank,population:sorted.length,star:!settled ? null : row.points===0 ? 1 : q<.2 ? 3 : q<.6 ? 2 : 1};
  });
}
function storySummary({listenCount=0,writeCount=0,tellScore=null}={}) {
  if (!Number.isSafeInteger(listenCount) || listenCount<0 || listenCount>100 || !Number.isSafeInteger(writeCount) || writeCount<0 || (tellScore!==null && (!Number.isFinite(tellScore) || tellScore<0 || tellScore>100))) fail('故事数据不合法');
  return {
    LISTEN:{value:listenCount,star:listenCount===0 ? null : listenCount>=30 ? 3 : listenCount>=10 ? 2 : 1,participating:listenCount>0},
    WRITE:{value:writeCount,star:writeCount===0 ? null : writeCount>=5 ? 3 : writeCount>=3 ? 2 : 1,participating:writeCount>0},
    TELL:{value:tellScore,star:tellScore===null ? null : tellScore>=85 ? 3 : tellScore>=60 ? 2 : 1,participating:tellScore!==null},
  };
}
function honorLevel(value) {
  const aliases={'区级':'区/县级','县级':'区/县级','区／县级':'区/县级','区/县级':'区/县级'};
  const level=aliases[value] || value;
  const index=['校级','区/县级','市级','省级','国家级'].indexOf(level);
  if (index<0) fail('荣誉级别需教师明确认定');
  return {level,points:index+1};
}
function validateV2Value(column,value,config={}) {
  const f=byColumn.get(column);
  if (!f) fail('未知评价字段');
  if (value===null) return null;
  if (f.valueType==='star') {
    if (typeof value==='string' && /^★{1,3}$/.test(value)) value=value.length;
    if (![1,2,3].includes(value)) fail('星级应为1至3');
  } else if (f.valueType==='grade') {
    if (!(config.allowedGrades || ['A','B','C','D']).includes(value)) fail('等级值不合法');
  } else if (column==='jump_rope_1min') {
    if (!Number.isInteger(value) || value<0 || value>10000) fail('跳绳次数不合法');
  } else if (f.valueType==='number') {
    if (typeof value!=='number' || !Number.isFinite(value) || value<=0 || value>=10000 || Math.abs(value*10-Math.round(value*10))>1e-8) fail('测量值不合法');
  } else if (typeof value!=='string' || !value.trim() || [...value].length>16) fail('视力值不合法');
  return value;
}
function computeBMI(height,weight) {
  if (height===null || height===undefined || weight===null || weight===undefined) return null;
  if (!Number.isFinite(height) || height<=0 || !Number.isFinite(weight) || weight<=0) fail('BMI原始测量值不合法');
  return Math.round(weight/(height/100)**2*100)/100;
}
function createV2Config() {
  return {schemaVersion:'SIX_EDU_V2',requiredMonths:[],applicableFields:fixedFields.map(f=>f.column),allowedGrades:['A','B','C','D'],certificateMappings:[],storyScoringVersion:'SIX_EDU_V2_1'};
}
module.exports={catalog,fixedFields,byColumn,isV2,policyFor,rankProcess,storySummary,honorLevel,validateV2Value,computeBMI,createV2Config};
