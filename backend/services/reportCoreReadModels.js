const { fixedFields, byColumn, narratives, subjectFor, fail, stableHash } = require('./reportCorePolicy');
const { getTerm, parse } = require('./reportCoreStore');
const sections = ['conduct','wisdom','health','art','labor','story'];
function evaluateCompletion({ evaluation:e, config = {}, blockingMaterials = [] }) {
  const missingItems = [], sources = parse(e.field_sources), fields = config.applicableFields || fixedFields.map(f => f.column);
  const sectionProgress = Object.fromEntries(sections.map(s => [s,{ total:0, complete:0 }]));
  let selfTotal=0,selfComplete=0;
  for (const column of fields) {
    const f=byColumn.get(column); if (!f) continue;
    let reason=null;
    if (f.sourceType==='CARD' && !sources[column]?.settled) reason='卡项目尚未结算';
    else if (e[column] === null || e[column] === undefined || e[column] === '') {
      if (!(f.sourceType==='CERTIFICATE' && sources[column]?.noAward)) reason='尚未完成';
    }
    if(reason) missingItems.push({field:column,reason});
    const p=sectionProgress[f.section]; if(p){p.total++;if(!reason)p.complete++;}
    if(f.sourceType==='SELF'){selfTotal++;if(!reason)selfComplete++;}
  }
  const narrativeMissing=narratives.filter(n=>n!=='family_message' && !e[n]?.trim());
  for(const field of narrativeMissing) missingItems.push({field,reason:'报告文字未填写'});
  for(const [collection,array] of [['sports_specialties',parse(e.sports_specialties)],['art_specialties',parse(e.art_specialties)]]) {
    for(const item of Array.isArray(array)?array:[]) {
      selfTotal++;if(item.self_star)selfComplete++;
      if(!item.self_star || !item.teacher_star)missingItems.push({field:collection,itemId:item.id,reason:'特长自评/教师评价不完整'});
    }
  }
  if(blockingMaterials.length) missingItems.push({field:'materials',reason:'仍有材料等待评分或审核'});
  return {missingItems,sectionProgress,narrativeReady:!narrativeMissing.length,selfProgress:{total:selfTotal,complete:selfComplete}};
}
async function resolveTermRoster({connection,schoolId,termId,teacherId,studentId}) {
  let sql='SELECT e.* FROM student_term_evaluation e WHERE e.school_id=? AND e.term_id=?';const params=[schoolId,termId];
  if(teacherId){sql+=' AND EXISTS(SELECT 1 FROM teacher_teaching_assignment a WHERE a.school_id=e.school_id AND a.term_id=e.term_id AND a.grade=e.grade_snapshot AND a.class_no=e.class_no_snapshot AND a.teacher_id=? AND a.enabled=1)';params.push(teacherId);}
  if(studentId){sql+=' AND e.student_id=?';params.push(studentId);}
  const [rows]=await connection.query(sql+' ORDER BY e.student_id',params);
  return rows.filter(e=>parse(e.section_meta).roster?.included!==false);
}
async function getBlockingMaterials({connection,schoolId,termId,config,studentId}) {
  const [rows]=await connection.query(`SELECT i.id,i.student_id,i.source_type,i.status,i.month_key,i.target_key,i.parent_id FROM evaluation_source_record i
    LEFT JOIN evaluation_source_record b ON b.school_id=i.school_id AND b.id=i.parent_id
    WHERE i.school_id=? AND i.term_id=? AND i.record_kind='ITEM' AND i.status IN ('QUEUED','PROCESSING','SUBMITTED','FAILED')
    AND (i.source_type='CERTIFICATE' OR (i.source_type='STORY' AND b.record_kind='BATCH' AND b.status IN ('SUBMITTED','SCORED')
    AND NOT EXISTS(SELECT 1 FROM evaluation_source_record newer WHERE newer.school_id=b.school_id AND newer.term_id=b.term_id AND newer.student_id=b.student_id AND newer.source_type='STORY' AND newer.record_kind='BATCH' AND newer.month_key=b.month_key AND newer.status IN ('SUBMITTED','SCORED') AND newer.version>b.version)))${studentId?' AND i.student_id=?':''}`,[schoolId,termId,...(studentId?[studentId]:[])]);
  return rows.filter(r=>r.source_type!=='STORY'||(config.requiredMonths||[]).includes(r.month_key));
}
function pagination(args, scope) {
  const limit=Number(args.limit||25);if(![25,50,100].includes(limit))fail(422,'分页大小需为25/50/100');
  const hash=stableHash(scope);let offset=0;
  if(args.cursor)try{const p=JSON.parse(Buffer.from(args.cursor,'base64url'));if(p.hash!==hash||!Number.isSafeInteger(p.offset)||p.offset<0)throw Error();offset=p.offset;}catch{fail(422,'分页条件已变化');}
  return {offset,limit,next:total=>total>offset+limit?Buffer.from(JSON.stringify({hash,offset:offset+limit})).toString('base64url'):null};
}
async function getWorkspace(args) {
  const {pool,actor,termId}=args;
  if(!['student','teacher','manager'].includes(actor.role))fail(403,'无工作台权限');
  if(!/^[1-9]\d*$/.test(String(termId)))fail(422,'请选择学期');
  for(const k of ['grade','classNo'])if(args[k]!==undefined&&(!Number.isInteger(Number(args[k]))||Number(args[k])<1))fail(422,'班级不合法');
  const page=pagination(args,{actor,termId,grade:args.grade,classNo:args.classNo,subjectCode:args.subjectCode});
  const c=await pool.getConnection();
  try {
    await c.beginTransaction();const term=await getTerm(c,actor.schoolId,termId);
    const [assignments]=await c.query('SELECT a.*,u.real_name FROM teacher_teaching_assignment a LEFT JOIN users u ON u.school_id=a.school_id AND u.id=a.teacher_id WHERE a.school_id=? AND a.term_id=? AND a.enabled=1',[actor.schoolId,termId]);
    const mine=assignments.filter(a=>String(a.teacher_id)===actor.id);
    let roster=await resolveTermRoster({connection:c,schoolId:actor.schoolId,termId,...(actor.role==='teacher'?{teacherId:actor.id}:actor.role==='student'?{studentId:actor.id}:{})});
    roster=roster.filter(e=>(actor.role==='manager'||actor.role==='student'&&String(e.student_id)===actor.id||actor.role==='teacher'&&mine.some(a=>a.grade===e.grade_snapshot&&a.class_no===e.class_no_snapshot&&(!args.subjectCode||a.subject_code===args.subjectCode)))&&(!args.grade||e.grade_snapshot===Number(args.grade))&&(!args.classNo||e.class_no_snapshot===Number(args.classNo)));
    const ids=new Set(roster.map(e=>String(e.student_id)));
    const blocking=(await getBlockingMaterials({connection:c,schoolId:actor.schoolId,termId,config:term.evaluation_config})).filter(r=>ids.has(String(r.student_id)));
    const byStudent=new Map();for(const r of blocking){const id=String(r.student_id);if(!byStudent.has(id))byStudent.set(id,[]);byStudent.get(id).push(r);}
    const [published]=await c.query("SELECT student_id FROM term_report WHERE school_id=? AND term_id=? AND release_version=? AND status='PUBLISHED'",[actor.schoolId,termId,term.active_release_version||0]);
    const publishedIds=new Set(published.map(r=>String(r.student_id))), tasks=[], classes=new Map();
    const counts={academicExpected:0,academicComplete:0,total:roster.length,missingStudents:0,confirmed:0,published:0,pendingMaterials:blocking.length,failedStories:blocking.filter(r=>r.source_type==='STORY'&&r.status==='FAILED').length};
    const fingerprint=require('./reportCoreEvaluation').reportFingerprint;
    for(const e of roster){
      const sid=String(e.student_id), related=assignments.filter(a=>a.grade===e.grade_snapshot&&a.class_no===e.class_no_snapshot), own=related.filter(a=>String(a.teacher_id)===actor.id);
      for(const field of fixedFields.filter(f=>f.sourceType==='IMPORT'&&(!args.subjectCode||subjectFor(f.column)===args.subjectCode)&&(term.evaluation_config.applicableFields||fixedFields.map(f=>f.column)).includes(f.column))) {
        if(actor.role==='teacher'&&!own.some(a=>a.subject_code===subjectFor(field.column)))continue;
        counts.academicExpected++;if(e[field.column]!==null&&e[field.column]!==undefined&&e[field.column]!=='')counts.academicComplete++;
      }
      const completion=evaluateCompletion({evaluation:e,config:term.evaluation_config,blockingMaterials:byStudent.get(sid)||[]});
      if(completion.missingItems.length)counts.missingStudents++;
      const confirmed=e.status==='CONFIRMED'&&String(e.confirmed_revision)===String(e.revision)&&e.approval_fingerprint===fingerprint(e,term);
      if(confirmed)counts.confirmed++;if(publishedIds.has(sid))counts.published++;
      const key=`${e.grade_snapshot}:${e.class_no_snapshot}`;
      if(!classes.has(key))classes.set(key,{grade:e.grade_snapshot,classNo:e.class_no_snapshot,isHeadTeacher:own.some(a=>a.is_head_teacher===1),studentCount:0});
      classes.get(key).studentCount++;
      for(const m of completion.missingItems){
        if(m.field==='materials')continue;
        const subject=subjectFor(m.field), self=byColumn.get(m.field)?.sourceType==='SELF'||narratives.includes(m.field)&&m.field!=='teacher_comment';
        const responsible=self?[{teacher_id:sid,real_name:e.student_name_snapshot}]:related.filter(a=>m.field==='teacher_comment'||narratives.includes(m.field)?a.is_head_teacher===1:a.subject_code===subject||subject==='CONDUCT'&&a.is_head_teacher===1);
        const canHandle=actor.role==='student'?self:actor.role==='teacher'&&!self&&responsible.some(a=>String(a.teacher_id)===actor.id);
        if(actor.role==='student'&&!self || actor.role==='teacher'&&!canHandle)continue;
        tasks.push({taskId:`student:${sid}:${m.field}${m.itemId?':'+m.itemId:''}`,type:'MISSING_FIELD',studentId:sid,fieldKey:m.field,reason:m.reason,canHandle,responsible:responsible.length?responsible.map(a=>({id:String(a.teacher_id),name:a.real_name})).filter((r,i,a)=>a.findIndex(v=>v.id===r.id)===i):[],responsibilityStatus:responsible.length?'ASSIGNED':'UNCONFIGURED',route:{page:self?'self':'drafts',studentId:sid,termId:String(termId)}});
      }
      for(const material of byStudent.get(sid)||[]){
        const canHandle=actor.role==='teacher'&&(material.source_type==='STORY'?own.some(a=>a.is_head_teacher===1||a.subject_code==='STORY'):require('./authorizationService').canManageCertificate({head:own.some(a=>a.is_head_teacher===1),assignments:own}));
        if(actor.role==='teacher'&&!canHandle)continue;
        tasks.push({taskId:`source:${material.id}`,type:material.source_type,studentId:sid,sourceId:String(material.id),monthKey:material.month_key,reason:material.status==='FAILED'?'自动处理失败':'材料待处理',canHandle,route:{page:actor.role==='student'?(material.source_type==='STORY'?'stories':'awards'):'reviews',termId:String(termId)}});
      }
    }
    const out={counts,tasks:tasks.slice(page.offset,page.offset+page.limit),taskCount:tasks.length,classRows:[...classes.values()],nextCursor:page.next(tasks.length),asOf:new Date().toISOString()};
    await c.commit();return out;
  }catch(e){await c.rollback();throw e;}finally{c.release();}
}
async function listTeachers(args) {
  const {pool,actor}=args;if(actor.role!=='manager')fail(403,'仅管理员查询教师');
  const q=String(args.q||'');if(q.length>100)fail(422,'查询文字过长');
  const page=pagination(args,{actor,q});
  const [rows]=await pool.query("SELECT id,real_name realName,username FROM users WHERE school_id=? AND role='teacher' AND status=0 AND (LOCATE(?,real_name)>0 OR LOCATE(?,username)>0) ORDER BY id LIMIT ? OFFSET ?",[actor.schoolId,q,q,page.limit+1,page.offset]);
  return {rows:rows.slice(0,page.limit).map(r=>({...r,id:String(r.id)})),nextCursor:rows.length>page.limit?page.next(page.offset+rows.length):null};
}
module.exports={pagination,evaluateCompletion,resolveTermRoster,getBlockingMaterials,getWorkspace,listTeachers};
