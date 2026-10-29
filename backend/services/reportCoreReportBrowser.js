const {fail,fixedFields,byColumn,stableHash}=require('./reportCorePolicy');
const {getTerm,parse}=require('./reportCoreStore');
const {assignments,assertScope}=require('./authorizationService');
const {resolveTermRoster,getBlockingMaterials,evaluateCompletion,pagination}=require('./reportCoreReadModels');
const {buildReportModel,reportFingerprint,reportDocumentKey}=require('./reportCoreEvaluation');
function teacherOnly(actor){if(actor.role!=='teacher')fail(403,'仅任课教师查看班级报告');}
async function readSnapshot(pool,fn){const c=await pool.getConnection();try{await c.beginTransaction();const result=await fn(c);await c.commit();return result;}catch(error){await c.rollback();throw error;}finally{c.release();}}
async function dataset(c,actor,termId){
 teacherOnly(actor);if(!/^[1-9]\d*$/.test(String(termId)))fail(422,'学期编号不合法');const term=await getTerm(c,actor.schoolId,termId),teaching=await assignments(actor,termId,c);if(!teaching.length)fail(403,'没有有效任教职责');
 const roster=await resolveTermRoster({connection:c,schoolId:actor.schoolId,termId,teacherId:actor.id});
 const ids=new Set(roster.map(e=>String(e.student_id))),blocking=await getBlockingMaterials({connection:c,schoolId:actor.schoolId,termId,config:term.evaluation_config}),materials=new Map();
 for(const r of blocking){const key=String(r.student_id);if(!ids.has(key))continue;if(!materials.has(key))materials.set(key,[]);materials.get(key).push(r);}
 const [reports]=await c.query("SELECT student_id,version,release_version,source_revision FROM term_report WHERE school_id=? AND term_id=? AND status='PUBLISHED' AND release_version=? ORDER BY version",[actor.schoolId,termId,term.active_release_version||0]);
 const published=new Map(reports.filter(r=>ids.has(String(r.student_id))).map(r=>[String(r.student_id),r]));
 return {term,teaching,roster,materials,published};
}
function summarize(e,data){
 const sid=String(e.student_id),completion=evaluateCompletion({evaluation:e,config:data.term.evaluation_config,blockingMaterials:data.materials.get(sid)||[]});
 const head=data.teaching.some(a=>a.grade===e.grade_snapshot&&a.class_no===e.class_no_snapshot&&a.is_head_teacher===1),confirmed=e.status==='CONFIRMED'&&String(e.confirmed_revision)===String(e.revision)&&e.approval_fingerprint===reportFingerprint(e,data.term),published=data.published.get(sid);
 const stars={1:0,2:0,3:0,missing:0},grades={};
 for(const key of data.term.evaluation_config.applicableFields||fixedFields.map(f=>f.column)){const f=byColumn.get(key);if(!f)continue;const value=e[key];if(f.valueType==='star'){if([1,2,3].includes(Number(value)))stars[Number(value)]++;else stars.missing++;}if(f.valueType==='grade'&&value)grades[value]=(grades[value]||0)+1;}
 return {studentId:sid,studentNumber:e.student_number,name:e.student_name_snapshot,grade:e.grade_snapshot,classNo:e.class_no_snapshot,currentRevision:String(e.revision),publishedVersion:published?Number(published.version):null,releaseVersion:published?Number(published.release_version):null,sectionProgress:completion.sectionProgress,starCounts:stars,gradeCounts:grades,missingCount:completion.missingItems.length,hasMissing:completion.missingItems.length>0,isConfirmed:confirmed,isPublished:!!published,canViewDetail:true,canViewFull:head,canConfirm:head&&data.term.release_status==='IDLE'&&!completion.missingItems.length,canEditComment:head&&data.term.release_status==='IDLE'};
}
const countsOf=rows=>({total:rows.length,ready:rows.filter(r=>!r.hasMissing).length,missing:rows.filter(r=>r.hasMissing).length,confirmed:rows.filter(r=>r.isConfirmed).length,published:rows.filter(r=>r.isPublished).length});
async function listReportClasses({pool,actor,termId}){
 teacherOnly(actor);return readSnapshot(pool,async c=>{const data=await dataset(c,actor,termId),classes=new Map();for(const a of data.teaching){const key=`${a.grade}:${a.class_no}`;if(!classes.has(key))classes.set(key,{grade:a.grade,classNo:a.class_no,isHeadTeacher:false,studentCount:0,counts:{total:0,ready:0,missing:0,confirmed:0,published:0}});if(a.is_head_teacher===1)classes.get(key).isHeadTeacher=true;}
 const rows=data.roster.map(e=>summarize(e,data));for(const cls of classes.values()){const students=rows.filter(r=>r.grade===cls.grade&&r.classNo===cls.classNo);cls.studentCount=students.length;cls.counts=countsOf(students);}
 return {rows:[...classes.values()].sort((a,b)=>a.grade-b.grade||a.classNo-b.classNo),counts:countsOf(rows),asOf:new Date().toISOString()};});
}
async function listReportStudents(args){
 const {pool,actor,termId}=args;teacherOnly(actor);const hasClass=args.grade!==undefined||args.classNo!==undefined,grade=hasClass?Number(args.grade):null,classNo=hasClass?Number(args.classNo):null;if(hasClass&&(!Number.isInteger(grade)||grade<1||!Number.isInteger(classNo)||classNo<1))fail(422,'请选择完整班级');
 const keyword=String(args.keyword||'');if(keyword.length>100)fail(422,'搜索文字过长');const status=args.status||'all';if(!['all','missing','confirmed','published','ready','draft'].includes(status))fail(422,'报告状态不合法');
 const page=pagination(args,{actor,termId,grade,classNo,keyword,status,limit:Number(args.limit||25)});
 return readSnapshot(pool,async c=>{const data=await dataset(c,actor,termId);if(hasClass&&!data.teaching.some(a=>a.grade===grade&&a.class_no===classNo))fail(403,'不在任教班级范围');
 const all=data.roster.filter(e=>!hasClass||e.grade_snapshot===grade&&e.class_no_snapshot===classNo).map(e=>summarize(e,data));
 const rows=all.filter(r=>(!keyword||r.name.includes(keyword)||String(r.studentNumber||'').includes(keyword))&&(status==='all'||status==='missing'&&r.hasMissing||status==='confirmed'&&r.isConfirmed||status==='published'&&r.isPublished||status==='ready'&&!r.hasMissing||status==='draft'&&!r.isConfirmed));
 return {rows:rows.slice(page.offset,page.offset+page.limit),total:rows.length,counts:countsOf(all),nextCursor:page.next(rows.length),asOf:new Date().toISOString()};});
}
function validateFrozenSnapshot(snapshot,row){
 if(!snapshot.renderedDetailHtml||!snapshot.renderedDetailHash)fail(422,'此历史报告尚无安全冻结明细，请由班主任查看完整版');
 if(stableHash(snapshot.renderedDetailHtml)!==snapshot.renderedDetailHash||stableHash(snapshot)!==row.snapshot_hash)fail(409,'报告快照校验失败，请联系管理员核对');
}
function detailModel(model){return {renderVersion:model.renderVersion,schemaVersion:model.schemaVersion,student:model.student,term:model.term,values:model.values,sportsSpecialties:model.sportsSpecialties||[],artSpecialties:model.artSpecialties||[],templateVersion:model.templateVersion,ruleVersion:model.ruleVersion,configVersion:model.configVersion,fingerprint:model.fingerprint};}
async function getReportDetail({pool,actor,studentKey,version='current',scope='detail'}){
 teacherOnly(actor);if(!studentKey||!['termId','studentId'].every(key=>/^[1-9]\d*$/.test(String(studentKey[key]))))fail(422,'学生或学期编号不合法');if(!['current','published'].includes(version)||!['detail','full'].includes(scope))fail(422,'报告版本或范围不合法');
 return readSnapshot(pool,async c=>{
  const permission=await assertScope({actor,studentKey,action:scope==='full'?'report-front-read':'report-detail-read'},c),term=await getTerm(c,actor.schoolId,studentKey.termId);
  if(parse(permission.evaluation.section_meta).roster?.included===false)fail(404,'学生已明确排除本学期名单');
  let model,html,revision,fingerprint,templateVersion,ruleVersion,configVersion,releaseVersion=null,publishedVersion=null,missingItems=[];
  if(version==='published'){
   const [[row]]=await c.query("SELECT * FROM term_report WHERE school_id=? AND term_id=? AND student_id=? AND status='PUBLISHED' AND release_version=? ORDER BY version DESC LIMIT 1",[actor.schoolId,studentKey.termId,studentKey.studentId,term.active_release_version||0]);if(!row)fail(404,'学校尚未发布该学生报告');
   const snapshot=parse(row.snapshot_json);
   if(scope==='detail'){if(snapshot.schemaVersion!=='CORE_V1')fail(422,'此历史格式不支持安全明细查看，请由班主任查看完整版');validateFrozenSnapshot(snapshot,row);html=snapshot.renderedDetailHtml;model=detailModel(snapshot);}
   else {if(snapshot.renderedDetailHtml)validateFrozenSnapshot(snapshot,row);html=require('./reportRenderService').renderPrintableA4({reportData:snapshot});model={...snapshot};delete model.renderedHtml;delete model.renderedDetailHtml;delete model.renderedDetailHash;}
   revision=String(row.source_revision);fingerprint=row.approval_fingerprint;templateVersion=row.template_version;ruleVersion=row.rule_version;configVersion=snapshot.configVersion??null;releaseVersion=Number(row.release_version);publishedVersion=Number(row.version);
  }else {
   const e=permission.evaluation;fingerprint=reportFingerprint(e,term);model=buildReportModel({evaluation:e,config:term.evaluation_config});
   const date=term.next_term_registration_date;model.term={id:String(term.id),name:term.term_name,academicYear:term.academic_year,semester:term.semester,nextRegistrationDate:date instanceof Date?date.toISOString().slice(0,10):date};
   templateVersion=term.template_version;ruleVersion=term.rule_version;configVersion=term.config_version;revision=String(e.revision);
   Object.assign(model,{templateVersion,ruleVersion,configVersion,fingerprint});
   const blockingMaterials=await getBlockingMaterials({connection:c,schoolId:actor.schoolId,termId:studentKey.termId,studentId:studentKey.studentId,config:term.evaluation_config});missingItems=evaluateCompletion({evaluation:e,config:term.evaluation_config,blockingMaterials}).missingItems;
   if(scope==='detail')model=detailModel(model);
   html=require('./reportRenderService').renderPrintableA4({reportData:model,renderScope:scope==='full'?'FULL':'DETAIL_ONLY',draftLabel:'当前草稿'});
  }
  return {model,html,documentKey:reportDocumentKey({studentKey,viewVersion:version,scope,revision,fingerprint,templateVersion,ruleVersion,configVersion,releaseVersion}),viewVersion:version,scope,revision,fingerprint,templateVersion,ruleVersion,configVersion:configVersion===null?null:String(configVersion),releaseVersion,publishedVersion,missingItems,permissions:{canPrint:true,canReadFull:permission.head,canConfirm:version==='current'&&permission.head&&term.release_status==='IDLE'&&!missingItems.length,canEditComment:version==='current'&&permission.head&&term.release_status==='IDLE'}};
 });
}
module.exports={listReportClasses,listReportStudents,getReportDetail,validateFrozenSnapshot};
