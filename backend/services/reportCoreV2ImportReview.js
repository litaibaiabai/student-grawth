const {parseV2Workbook,normalizeMeasurement}=require('./reportCoreV2Imports');
const {computeBMI,isV2,policyFor}=require('./reportCoreV2Policy');
const {getTerm,parse}=require('./reportCoreStore');
const {resolveTermRoster}=require('./reportCoreReadModels');
const {assertScope}=require('./authorizationService');
const {fail}=require('./reportCorePolicy');

async function reviewV2Workbook({pool,actor,termId,buffer,command}) {
  if(actor.role!=='teacher')fail(403,'仅教师核对综合成绩');
  const term=await getTerm(pool,actor.schoolId,termId);
  const v2=isV2(term.evaluation_config),fixedFields=policyFor(term.evaluation_config).fields.filter(f=>!f.jsonPath);
  const rows=parseV2Workbook(buffer,{termId,review:true,config:term.evaluation_config});
  const roster=await resolveTermRoster({connection:pool,schoolId:actor.schoolId,termId,teacherId:actor.id});
  const byAccount=new Map(roster.map(e=>[e.student_number,e])),byId=new Map(roster.map(e=>[String(e.student_id),e])),seen=new Map();
  const applicable=new Set(term.evaluation_config.applicableFields||fixedFields.map(f=>f.column));
  const students=[];
  for(const input of rows){
    const e=input.studentId?byId.get(input.studentId):byAccount.get(input.username),meta=e?parse(e.section_meta):{};
    const record={rowNo:input.rowNo,sheetName:input.sheetName,
      student:{id:e?String(e.student_id):null,name:e?.student_name_snapshot||input.real_name||'未识别学生',studentNumber:e?.student_number||input.username||input.studentId||'',grade:e?.grade_snapshot??input.grade,classNo:e?.class_no_snapshot??input.classNo},
      values:{...(e?Object.fromEntries(fixedFields.map(f=>[f.column,e[f.column]??null])):{}),...input.values},
      uploadedFields:Object.keys(input.values),errors:[],
      sportsSpecialties:e?parse(e.sports_specialties)||[]:[],artSpecialties:e?parse(e.art_specialties)||[]:[],
      measurement:{date:input.measurementDate||'',visionStandard:input.visionStandard||''}};
    const error=(field,reason)=>{
      if(!record.errors.some(err=>err.field===field&&err.reason===reason))record.errors.push({field,reason,rowNo:input.rowNo,sheetName:input.sheetName});
    };
    for(const err of input.inputErrors)error(err.field,err.reason);
    const identity=e?String(e.student_id):input.username||input.studentId,previous=seen.get(identity);
    if(identity&&previous){
      error('username','同一学生在工作簿中重复');
      previous.errors.push({field:'username',reason:'同一学生在工作簿中重复',rowNo:previous.rowNo,sheetName:previous.sheetName});
    }else if(identity)seen.set(identity,record);
    if(!e)error('username','学生不存在或不在任教范围');
    else{
      if(input.real_name&&input.real_name!==e.student_name_snapshot)error('real_name','姓名与学籍不一致');
      if(input.grade!=null&&input.grade!==e.grade_snapshot||input.classNo!=null&&input.classNo!==e.class_no_snapshot)error('classNo','班级与学籍不一致');
      try{await assertScope({actor,studentKey:{schoolId:actor.schoolId,termId,studentId:String(e.student_id)},action:'import',fields:Object.keys(input.values)},pool);}catch(err){if(!err.statusCode)throw err;error('permissions',err.message);}
      for(const column of input.columns){
        const value=record.values[column];
        if(applicable.has(column)&&!meta.exemptions?.[column]&&(value===null||value===undefined||value===''))error(column,'必填成绩为空');
      }
      if(v2)try{normalizeMeasurement(input.measurement,input.values);}catch(err){if(!err.statusCode)throw err;error(/制式/.test(err.message)?'visionStandard':'measurementDate',err.message);}
    }
    const h=Number(record.values.height_cm),w=Number(record.values.weight_kg);
    record.values.bmi=h>0&&w>0&&Number.isFinite(h)&&Number.isFinite(w)?computeBMI(h,w):null;
    record.values.sports_specialties=record.sportsSpecialties;record.values.art_specialties=record.artSpecialties;
    students.push(record);
  }
  let errors=students.flatMap(s=>s.errors),preview={batchId:null,revision:null,validCount:0,diffs:[]};
  if(!errors.length){
    const response=await require('./reportCoreImports').previewImport({pool,actor,termId,kind:'ACADEMIC',rows,command});
    preview=response.result;
    for(const err of preview.errors||[]){
      const record=students[err.rowNo-1];
      if(record)record.errors.push({...err,rowNo:record.rowNo,sheetName:record.sheetName});
    }
    errors=students.flatMap(s=>s.errors);
  }
  return {result:{...preview,students,totalCount:students.length,errors}};
}
module.exports={reviewV2Workbook};
