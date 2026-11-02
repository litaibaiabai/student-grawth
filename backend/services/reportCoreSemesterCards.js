const crypto=require('node:crypto');
const {getTerm,withMutation,addSource,parse}=require('./reportCoreStore');
const {fail,stableHash,schoolDayStart,collectionCutoff}=require('./reportCorePolicy');
const {subjects,semesterState,resolveSemesterQuotas}=require('./semesterCardPolicy');
const {encryptToken,tokenHash}=require('./cardCredentials');
const manager=actor=>{if(actor.role!=='manager')fail(403,'仅管理员可配置学期卡');};
async function teaching(c,actor,termId){return(await c.query("SELECT a.*,u.status teacher_status,u.role teacher_role,c.id class_id FROM teacher_teaching_assignment a JOIN users u ON u.school_id=a.school_id AND u.id=a.teacher_id LEFT JOIN school_class c ON c.school_id=a.school_id AND c.term_id=a.term_id AND c.grade=a.grade AND c.class_no=a.class_no WHERE a.school_id=? AND a.term_id=? AND a.enabled=1 ORDER BY a.grade,a.class_no,a.subject_code",[actor.schoolId,termId]))[0].filter(a=>subjects.some(s=>s.subjectCode===a.subject_code));}
async function cardCounts(c,actor,termId){const[[s]]=await c.query("SELECT COUNT(*) generatedTotal,COALESCE(SUM(status='USED'),0) usedTotal,COALESCE(SUM(status='UNUSED'),0) unusedTotal FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind='CARD'",[actor.schoolId,termId]);return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,Number(v)]));}
async function assertDraft(c,actor,term,expectedRevision){
 if(term.evaluation_config.schemaVersion!=='SIX_EDU_V2')fail(422,'请选择六育V2学期');
 const state=semesterState(term.evaluation_config);
 const [[issued]]=await c.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind IN ('CARD','QUOTA')",[actor.schoolId,term.id]);
 if(state.status!=='DRAFT'||Number(issued.n))fail(423,'本学期卡片已初始化，不能再次初始化或修改额度');
 if(String(expectedRevision)!==String(state.revision))fail(409,'卡额度版本已变化，请重新读取');return state;
}
async function getSemesterCardSettings({pool,actor,termId}){
 manager(actor);const c=await pool.getConnection();
 try{await c.beginTransaction();const term=await getTerm(c,actor.schoolId,termId),state=semesterState(term.evaluation_config),courses=await teaching(c,actor,termId),counts=await cardCounts(c,actor,termId);
 const [[batches]]=await c.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind='QUOTA'",[actor.schoolId,termId]);
 const status=state.status==='DRAFT'&&(counts.generatedTotal||Number(batches.n))?'LEGACY_LOCKED':state.status;
 const resolved=resolveSemesterQuotas(term.evaluation_config);
 const details=resolved.subjects.map(s=>{const scope=courses.filter(a=>a.subject_code===s.subjectCode);return{subjectCode:s.subjectCode,subjectName:s.subjectName,total:s.total,effectiveTotal:s.effectiveTotal,usesDefault:s.usesDefault,courseCount:scope.length,teacherCount:new Set(scope.map(a=>String(a.teacher_id))).size};});
 const data={status,revision:state.revision,defaultTotal:resolved.defaultTotal,subjects:details,teacherCount:new Set(courses.map(a=>String(a.teacher_id))).size,courseCount:courses.length,plannedTotal:details.reduce((n,s)=>n+s.effectiveTotal*s.courseCount,0),...counts,canEdit:status==='DRAFT'&&term.release_status==='IDLE'&&term.business_phase==='COLLECTING'};
 await c.commit();return data;
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
async function saveSemesterCardSettings({pool,actor,termId,expectedRevision,defaultTotal,quotas={},command}){
 manager(actor);if(!quotas||Array.isArray(quotas)||typeof quotas!=='object'||Object.keys(quotas).some(k=>!subjects.some(s=>s.subjectCode===k)))fail(422,'学科额度不合法');
 const cleaned=Object.fromEntries(Object.entries(quotas).filter(([,v])=>v!==null&&v!==''));resolveSemesterQuotas({semesterCards:{defaultTotal,quotas:cleaned}});
 return withMutation({pool,actor,termId,command,action:'semester-card-settings',termLock:'exclusive'},async(c,term)=>{
 const state=await assertDraft(c,actor,term,expectedRevision),next={...state,defaultTotal,quotas:cleaned,revision:Number(state.revision)+1};
 await c.query('UPDATE academic_year SET evaluation_config=? WHERE school_id=? AND id=?',[JSON.stringify({...term.evaluation_config,semesterCards:next}),actor.schoolId,termId]);return{result:{revision:next.revision}};
 });
}
async function initializeSemesterCards({pool,actor,termId,expectedRevision,command,now=new Date()}){
 manager(actor);
 return withMutation({pool,actor,termId,command,action:'semester-card-initialize',termLock:'exclusive',readCommitted:true},async(c,term)=>{
 const state=await assertDraft(c,actor,term,expectedRevision),courses=await teaching(c,actor,termId);
 if(!courses.length)fail(422,'请先导入班级及学科教师关系');
 if(courses.some(a=>a.teacher_status!==0||a.teacher_role!=='teacher'||!a.class_id))fail(422,'存在停用教师或无效班级，请先修正导入关系');
 const keys=courses.map(a=>`${a.grade}:${a.class_no}:${a.subject_code}`);if(new Set(keys).size!==keys.length)fail(422,'同班同科存在多个教师，请先修正');
 const start=schoolDayStart(term.start_date),end=collectionCutoff(term);if(+start>=+end||+now>=+end)fail(423,'学期采集已结束或日期无效');
 const resolved=resolveSemesterQuotas(term.evaluation_config);let generated=0;
 for(const a of courses){const subject=resolved.subjects.find(s=>s.subjectCode===a.subject_code),total=subject.effectiveTotal;if(!total)continue;
 const payload={mode:'COURSE_SEMESTER',grade:a.grade,classNo:a.class_no,subjectCode:subject.subjectCode,subjectName:subject.subjectName,categoryCode:subject.categoryCode,quotaTotal:total};
 const quotaId=await addSource(c,{schoolId:actor.schoolId,termId,ownerId:a.teacher_id,actorId:actor.id,sourceType:'CARD',kind:'QUOTA',subjectCode:subject.subjectCode,status:'CONFIRMED',key:['SEMESTER_COURSE_QUOTA',actor.schoolId,String(termId),a.grade,a.class_no,a.subject_code],payload});
 let batch=[];
 for(let ordinal=1;ordinal<=total;ordinal++){
  const token=crypto.randomBytes(32).toString('base64url'),p={...payload,schemaVersion:'SIX_EDU_V2',quotaId,serial:ordinal};
  batch.push([actor.schoolId,termId,'CARD','CARD',quotaId,a.teacher_id,actor.id,subject.targetColumn,subject.subjectCode,ordinal,stableHash(['SEMESTER_COURSE_CARD',quotaId,ordinal]),stableHash(p),'UNUSED',1,JSON.stringify(p),tokenHash(token),encryptToken(token,`CORE_V1:${actor.schoolId}:${quotaId}:${ordinal}`),start,end,'SIX_EDU_V2','CARD_CARD']);
  if(batch.length===200||ordinal===total){await c.query('INSERT INTO evaluation_source_record(school_id,term_id,source_type,record_kind,parent_id,owner_teacher_id,actor_id,target_key,subject_code,record_ordinal,business_key,payload_hash,status,delta,payload_json,token_hash,token_ciphertext,valid_from,valid_until,schema_version,event_type) VALUES ?',[batch]);batch=[];}
 }
 generated+=total;
 }
 const next={...state,status:'INITIALIZED',revision:Number(state.revision)+1,initializedAt:now.toISOString(),initializedBy:String(actor.id),generatedTotal:generated};
 await c.query('UPDATE academic_year SET evaluation_config=? WHERE school_id=? AND id=?',[JSON.stringify({...term.evaluation_config,semesterCards:next}),actor.schoolId,termId]);
 return{result:{status:'INITIALIZED',generatedTotal:generated,teacherCount:new Set(courses.map(a=>String(a.teacher_id))).size,courseCount:courses.length}};
 });
}
module.exports={getSemesterCardSettings,saveSemesterCardSettings,initializeSemesterCards};
