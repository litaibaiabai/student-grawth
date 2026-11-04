const bcrypt=require('bcrypt');
const {fail,stableHash}=require('../core/reportCorePolicy');
const {parse,getTerm,addSource}=require('../core/reportCoreStore');
const {resolveActorContext}=require('../auth/authorizationService');
const {createV2Config,catalog}=require('../core/reportCoreV2Policy');
const {semesterState}=require('../cards/semesterCardPolicy');
const {day}=require('../core/termDates');
const {parseRegistryWorkbook,reject}=require('./registryWorkbook');
const {sealRegistryPreview,openRegistryPreview}=require('./registryPreview');
const jsonHash=value=>stableHash(JSON.parse(JSON.stringify(value)));
const clsKey=r=>`${r.grade}:${r.classNo}`;
async function manager(c,actor){const live=await resolveActorContext({userId:actor.id,schoolId:actor.schoolId,tokenVersion:actor.tokenVersion},c);if(live.role!=='manager'||actor.role!=='manager')fail(403,'仅管理员可导入或查看学籍关系');}
async function baseline(c,schoolId){
 const out=[];
 for(const sql of [
  'SELECT id,username,password,real_name,role,grade,class_no,status,token_version FROM users WHERE school_id=? ORDER BY id',
  'SELECT id,academic_year,semester,term_name,start_date,end_date,is_current,next_term_registration_date,evaluation_config,config_version,roster_revision,release_status,business_phase FROM academic_year WHERE school_id=? ORDER BY id',
  'SELECT * FROM school_class WHERE school_id=? ORDER BY id',
  'SELECT * FROM teacher_teaching_assignment WHERE school_id=? ORDER BY id',
  'SELECT id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,revision,status FROM student_term_evaluation WHERE school_id=? ORDER BY id',
 ])out.push((await c.query(sql,[schoolId]))[0]);
 return jsonHash(out);
}
async function buildPlan(c,actor,data,{prepared=false}={}){
 const errors=[],diffs=[],counts=Object.fromEntries(['teachers','classes','students','assignments'].map(k=>[k,{created:0,updated:0,skipped:0}]));
 const error=(r,field,message)=>errors.push({sheet:r.sheet,rowNo:r.rowNo,field,message});
 const [[term]]=await c.query('SELECT * FROM academic_year WHERE school_id=? AND academic_year=? AND semester=?',[actor.schoolId,data.term.academicYear,data.term.semester]);
 if(term&&parse(term.evaluation_config).schemaVersion!=='SIX_EDU_V2')fail(422,'统一导入只支持六育V2学期');
 if(data.term.termName.length>80)error({sheet:'学期',rowNo:2},'学期名称','最多80字');
 const rows=[...data.teachers.map(r=>({...r,role:'teacher'})),...data.students.map(r=>({...r,role:'student'}))];
 const document=JSON.stringify(rows.map(r=>({username:r.username})));
 const [duplicates]=await c.query("SELECT MIN(j.ord) firstRow,COUNT(*) n FROM JSON_TABLE(?, '$[*]' COLUMNS(ord FOR ORDINALITY,username VARCHAR(100) PATH '$.username')) j GROUP BY j.username COLLATE utf8mb4_0900_ai_ci HAVING COUNT(*)>1",[document]);
 for(const d of duplicates){const r=rows[Number(d.firstRow)-1];error(r,'账号','同文件账号重复（含大小写或重音等价）');}
 const accounts=[];
 for(const r of rows){
  if(r.username.length>64||r.realName.length>64)error(r,'账号/姓名','账号和姓名不能超过64字');
  const [[old]]=await c.query('SELECT id,username,role,status,real_name,grade,class_no FROM users WHERE school_id=? AND username=?',[actor.schoolId,r.username]);
  if(old&&(old.role!==r.role||old.status!==0))error(r,'账号','既有账号角色冲突或已停用');
  if(!old&&!prepared&&(typeof r.initialPassword!=='string'||r.initialPassword.length<10||Buffer.byteLength(r.initialPassword)>72))error(r,'初始密码','新账号需10位以上、72字节以内的初始密码');
  const normalized={...r,existingId:old?String(old.id):null,username:old?.username||r.username};delete normalized.initialPassword;
  if(!old&&prepared){normalized.passwordHash=r.passwordHash;normalized.developmentPasswordCipher=r.developmentPasswordCipher;}
  if(!old&&!prepared&&r.initialPassword?.length>=10&&Buffer.byteLength(r.initialPassword)<=72){normalized.passwordHash=await bcrypt.hash(r.initialPassword,10);normalized.developmentPasswordCipher=await require('../auth/developmentPasswords').previewPassword(c,actor.schoolId,r.username,r.initialPassword);}
  let evaluation=null;if(old&&term&&r.role==='student')evaluation=(await c.query('SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?',[actor.schoolId,term.id,old.id]))[0][0];
  normalized.action=!old?'created':old.real_name!==r.realName||(r.role==='student'&&(!evaluation||evaluation.student_name_snapshot!==r.realName||evaluation.grade_snapshot!==r.grade||evaluation.class_no_snapshot!==r.classNo))?'updated':'skipped';
  normalized.rosterChanged=r.role==='student'&&(!evaluation||evaluation.grade_snapshot!==r.grade||evaluation.class_no_snapshot!==r.classNo);
  normalized.oldClass=evaluation?`${evaluation.grade_snapshot}:${evaluation.class_no_snapshot}`:null;
  accounts.push(normalized);counts[r.role==='teacher'?'teachers':'students'][normalized.action]++;
  diffs.push({sheet:r.sheet,rowNo:r.rowNo,kind:r.role,username:normalized.username,name:r.realName,action:normalized.action});
 }
 const teacherCache=new Map();
 async function teacherRef(name,r){
  if(teacherCache.has(name))return teacherCache.get(name);
  const [[input]]=await c.query("SELECT j.ord FROM JSON_TABLE(?, '$[*]' COLUMNS(ord FOR ORDINALITY,username VARCHAR(100) PATH '$.username')) j WHERE j.username COLLATE utf8mb4_0900_ai_ci=CONVERT(? USING utf8mb4) COLLATE utf8mb4_0900_ai_ci LIMIT 1",[document,name]);
  let result=input?accounts[Number(input.ord)-1]:null;
  if(!result){const [[u]]=await c.query("SELECT id,username,role,status FROM users WHERE school_id=? AND username=?",[actor.schoolId,name]);if(u?.role==='teacher'&&u.status===0)result={username:u.username,existingId:String(u.id),role:'teacher'};}
  if(!result||result.role!=='teacher'){error(r,'教师账号','教师不存在、已停用或不属于本校');return null;}
  teacherCache.set(name,result);return result;
 }
 const [existingClasses]=term?await c.query('SELECT * FROM school_class WHERE school_id=? AND term_id=?',[actor.schoolId,term.id]):[[]];
 const classMap=new Map(existingClasses.map(r=>[`${r.grade}:${r.class_no}`,r]));
 const classes=[],seenClasses=new Set();
 for(const r of data.classes){
  const key=clsKey(r);if(seenClasses.has(key))error(r,'班级','班级重复');seenClasses.add(key);
  const head=await teacherRef(r.headTeacherUsername,r),old=classMap.get(key),displayName=r.displayName||`${r.grade}年级${r.classNo}班`;
  const action=!old?'created':String(old.responsible_teacher_id)!==String(head?.existingId)||old.display_name!==displayName?'updated':'skipped';
  classes.push({...r,displayName,headTeacherUsername:head?.username,action});classMap.set(key,old||{});counts.classes[action]++;
 }
 const [oldAssignments]=term?await c.query('SELECT * FROM teacher_teaching_assignment WHERE school_id=? AND term_id=? AND enabled=1',[actor.schoolId,term.id]):[[]];
 const assignments=[],seenCourses=new Set();
 for(const r of data.assignments){
  const key=clsKey(r)+':'+r.subjectCode;if(seenCourses.has(key))error(r,'学科','同一班级学科只能对应一位教师');seenCourses.add(key);
  if(!classMap.has(clsKey(r)))error(r,'班级','班级不在本文件或本校学期中');
  const teacher=await teacherRef(r.teacherUsername,r),old=oldAssignments.filter(a=>`${a.grade}:${a.class_no}:${a.subject_code}`===key);
  const action=!old.length?'created':old.length===1&&String(old[0].teacher_id)===String(teacher?.existingId)?'skipped':'updated';
  assignments.push({...r,teacherUsername:teacher?.username,action});counts.assignments[action]++;
 }
 for(const r of accounts.filter(r=>r.role==='student'))if(!classMap.has(clsKey(r)))error(r,'班级','学生班级不存在');
 const config=term?parse(term.evaluation_config):null;
 const dateChanged=term&&(day(term.start_date)!==data.term.startDate||day(term.end_date)!==data.term.endDate||day(term.next_term_registration_date)!==data.term.nextRegistrationDate||(config.collectionDeadline||day(term.end_date))!==data.term.collectionDeadline);
 if(term){
  const [[issued]]=await c.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind IN ('CARD','QUOTA')",[actor.schoolId,term.id]);
  const locked=semesterState(config).status!=='DRAFT'||Number(issued.n)>0;
  if(locked&&(dateChanged||classes.some(r=>r.action!=='skipped')||assignments.some(r=>r.action!=='skipped')||accounts.some(r=>r.rosterChanged)))fail(423,'本学期卡片已初始化，日期、学生归属和任教关系已锁定');
  if(term.release_status!=='IDLE'||['FROZEN','ARCHIVED'].includes(term.business_phase)&&(dateChanged||Object.values(counts).some(x=>x.created+x.updated)))fail(423,'历史冻结学期仅可查看，不能通过导入修改');
 }
 if(errors.length)reject(errors);
 return{termId:term?String(term.id):null,accounts,classes,assignments,counts,diffs,term:data.term,dateChanged};
}
async function previewRegistry({pool,actor,buffer,now=new Date()}){
 const data=parseRegistryWorkbook(buffer),c=await pool.getConnection();
 try{await c.beginTransaction();await manager(c,actor);const before=await baseline(c,actor.schoolId),plan=await buildPlan(c,actor,data);
 const safeData={...data,teachers:plan.accounts.filter(r=>r.role==='teacher'),students:plan.accounts.filter(r=>r.role==='student')};
 const previewToken=sealRegistryPreview({data:safeData,baseline:before,fileHash:stableHash(buffer.toString('base64'))},{actor,now});await c.commit();
 return{previewToken,expiresAt:new Date(+now+1800000).toISOString(),term:data.term,counts:plan.counts,diffs:plan.diffs,errors:[]};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
async function commitRegistry({pool,actor,previewToken,command,now=new Date()}){
 const saved=openRegistryPreview(previewToken,{actor,now});
 if(!command?.requestKey||command.requestKey.length>128||!command.payloadHash)fail(400,'缺少请求键');
 const c=await pool.getConnection();
 try{await c.beginTransaction();await c.query('SELECT id FROM academic_year WHERE school_id=? ORDER BY id FOR UPDATE',[actor.schoolId]);await manager(c,actor);
 const cmdKey=['REGISTRY_CMD',actor.schoolId,actor.id,command.requestKey],fileKey=['REGISTRY_FILE',actor.schoolId,saved.fileHash];
 const [[oldCmd]]=await c.query('SELECT payload_hash,response_json FROM evaluation_source_record WHERE school_id=? AND business_key=?',[actor.schoolId,stableHash(cmdKey)]);
 if(oldCmd){if(oldCmd.payload_hash!==command.payloadHash)fail(409,'同一请求键内容不一致');await c.commit();return{...parse(oldCmd.response_json),replayed:true};}
 const [[oldFile]]=await c.query('SELECT response_json FROM evaluation_source_record WHERE school_id=? AND business_key=?',[actor.schoolId,stableHash(fileKey)]);
 if(oldFile){await c.commit();return{...parse(oldFile.response_json),replayed:true};}
 if(saved.baseline!==await baseline(c,actor.schoolId))fail(409,'预览后学期、账号或关系已变化，请重新预览');
 const plan=await buildPlan(c,actor,saved.data,{prepared:true}),t=plan.term;
 let termId=plan.termId,term=termId?await getTerm(c,actor.schoolId,termId):null;
 if(t.makeCurrent)await c.query('UPDATE academic_year SET is_current=0 WHERE school_id=? AND is_current=1 AND id<>?',[actor.schoolId,termId||0]);
 if(!term){const config={...createV2Config(),adminClassRegistryVersion:1,reportPublicationMode:'HEAD_CONFIRM',collectionDeadline:t.collectionDeadline,semesterCards:semesterState()};const[r]=await c.query("INSERT INTO academic_year(school_id,academic_year,semester,term_name,start_date,end_date,is_current,next_term_registration_date,evaluation_config,config_version,template_version,rule_version,business_phase) VALUES(?,?,?,?,?,?,?,?,?,'1','CORE_V2','V2_1','COLLECTING')",[actor.schoolId,t.academicYear,t.semester,t.termName,t.startDate,t.endDate,t.makeCurrent?1:0,t.nextRegistrationDate,JSON.stringify(config)]);termId=String(r.insertId);term=await getTerm(c,actor.schoolId,termId);}
 else if(semesterState(term.evaluation_config).status==='DRAFT'&&!['FROZEN','ARCHIVED'].includes(term.business_phase)){
  const config={...term.evaluation_config,adminClassRegistryVersion:1,reportPublicationMode:'HEAD_CONFIRM',collectionDeadline:t.collectionDeadline,semesterCards:{...semesterState(term.evaluation_config),revision:Number(semesterState(term.evaluation_config).revision)+1}};
  await c.query('UPDATE academic_year SET term_name=?,start_date=?,end_date=?,is_current=?,next_term_registration_date=?,evaluation_config=?,config_version=CAST(CAST(config_version AS UNSIGNED)+1 AS CHAR) WHERE school_id=? AND id=?',[t.termName,t.startDate,t.endDate,t.makeCurrent?1:term.is_current,t.nextRegistrationDate,JSON.stringify(config),actor.schoolId,termId]);term=await getTerm(c,actor.schoolId,termId);
 }
 if(t.makeCurrent){await c.query('UPDATE academic_year SET is_current=1 WHERE school_id=? AND id=?',[actor.schoolId,termId]);term.is_current=1;}
 c.reportCoreSchemaVersion='SIX_EDU_V2';
 const ids=new Map(),changedTargets={},changedClasses=new Set();
 for(const r of plan.accounts){let id=r.existingId;
  if(!id){const[insert]=await c.query('INSERT INTO users(school_id,username,password,real_name,role,grade,class_no) VALUES(?,?,?,?,?,?,?)',[actor.schoolId,r.username,r.passwordHash,r.realName,r.role,r.role==='student'&&term.is_current?r.grade:null,r.role==='student'&&term.is_current?r.classNo:null]);id=String(insert.insertId);const dev=require('../auth/developmentPasswords');await dev.writePassword(c,actor.schoolId,id,dev.readPreview(actor.schoolId,r.username,r.developmentPasswordCipher));}
  else if(r.action==='updated')await c.query('UPDATE users SET real_name=?,grade=IF(?, ?,grade),class_no=IF(?, ?,class_no) WHERE school_id=? AND id=?',[r.realName,r.role==='student'&&!!term.is_current,r.grade||null,r.role==='student'&&!!term.is_current,r.classNo||null,actor.schoolId,id]);
  ids.set(r.username,id);
  if(r.role==='student'&&r.action!=='skipped'){
   await c.query("INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE student_name_snapshot=VALUES(student_name_snapshot),grade_snapshot=VALUES(grade_snapshot),class_no_snapshot=VALUES(class_no_snapshot),revision=revision+1,status='DRAFT',confirmed_revision=NULL,confirmed_by=NULL,confirmed_at=NULL,approval_fingerprint=NULL",[actor.schoolId,termId,id,r.realName,r.grade,r.classNo,term.template_version,term.rule_version]);
   if(r.rosterChanged){changedTargets[id]=[...catalog.cardCatalog.map(s=>s.targetColumn),'story_summary'];if(r.oldClass)changedClasses.add(r.oldClass);changedClasses.add(clsKey(r));}
  }
 }
 async function teacherId(username){if(ids.has(username))return ids.get(username);const[[u]]=await c.query("SELECT id FROM users WHERE school_id=? AND username=? AND role='teacher' AND status=0",[actor.schoolId,username]);if(!u)fail(409,'教师已变化，请重新预览');return String(u.id);}
 for(const r of plan.classes)if(r.action!=='skipped'){await c.query('INSERT INTO school_class(school_id,term_id,grade,class_no,display_name,responsible_teacher_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),responsible_teacher_id=VALUES(responsible_teacher_id),revision=revision+1,updated_by=VALUES(updated_by)',[actor.schoolId,termId,r.grade,r.classNo,r.displayName,await teacherId(r.headTeacherUsername),actor.id,actor.id]);changedClasses.add(clsKey(r));}
 for(const r of plan.assignments)if(r.action!=='skipped'){await c.query('UPDATE teacher_teaching_assignment SET enabled=0,is_head_teacher=0 WHERE school_id=? AND term_id=? AND grade=? AND class_no=? AND subject_code=?',[actor.schoolId,termId,r.grade,r.classNo,r.subjectCode]);await c.query('INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,enabled,is_head_teacher) VALUES(?,?,?,?,?,?,1,0) ON DUPLICATE KEY UPDATE enabled=1,is_head_teacher=0',[actor.schoolId,termId,await teacherId(r.teacherUsername),r.grade,r.classNo,r.subjectCode]);changedClasses.add(clsKey(r));}
 if(Object.values(plan.counts).some(x=>x.created+x.updated)){
  await c.query('UPDATE academic_year SET roster_revision=roster_revision+1,data_revision=data_revision+1 WHERE school_id=? AND id=?',[actor.schoolId,termId]);term=await getTerm(c,actor.schoolId,termId);
  const[evaluations]=await c.query('SELECT student_id,grade_snapshot,class_no_snapshot FROM student_term_evaluation WHERE school_id=? AND term_id=?',[actor.schoolId,termId]);for(const e of evaluations)if(changedClasses.has(`${e.grade_snapshot}:${e.class_no_snapshot}`))changedTargets[String(e.student_id)]=[...new Set([...(changedTargets[String(e.student_id)]||[]),...catalog.cardCatalog.map(s=>s.targetColumn)])];
  if(Object.keys(changedTargets).length)await require('../statistics/reportCoreV2Statistics').rebuildV2Scope(c,term,changedTargets);
 }
 if(t.makeCurrent)await c.query("UPDATE users u JOIN student_term_evaluation e ON e.school_id=u.school_id AND e.student_id=u.id SET u.grade=e.grade_snapshot,u.class_no=e.class_no_snapshot WHERE e.school_id=? AND e.term_id=? AND u.role='student'",[actor.schoolId,termId]);
 const response={result:{termId,counts:plan.counts},replayed:false};
 for(const [key,kind,payloadHash]of [[fileKey,'BATCH',saved.fileHash],[cmdKey,'AUDIT',command.payloadHash]]){const id=await addSource(c,{schoolId:actor.schoolId,termId,actorId:actor.id,sourceType:kind==='AUDIT'?null:'IMPORT',kind,status:'COMMITTED',key,payload:{action:'REGISTRY_IMPORT',fileHash:saved.fileHash,counts:plan.counts}});await c.query('UPDATE evaluation_source_record SET payload_hash=?,response_json=? WHERE school_id=? AND id=?',[payloadHash,JSON.stringify(response),actor.schoolId,id]);}
 await c.commit();return response;
 }catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')fail(409,'导入期间数据已变化，请重新预览');throw e;}finally{c.release();}
}
async function listRegistryRelations(args){
 const {pool,actor,termId,view='students',q='',grade,classNo,subjectCode}=args;await manager(pool,actor);await getTerm(pool,actor.schoolId,termId);
 if(!['students','teachers','classes'].includes(view)||String(q).length>100||[grade,classNo].some(v=>v!==undefined&&v!==''&&(!Number.isInteger(Number(v))||Number(v)<1)))fail(422,'查询条件不合法');
 const page=require('../reports/reportCoreReadModels').pagination(args,{schoolId:actor.schoolId,termId,view,q,grade,classNo,subjectCode});
 const [classes]=await pool.query('SELECT c.id,c.grade,c.class_no,c.display_name,u.username headUsername,u.real_name headName FROM school_class c LEFT JOIN users u ON u.school_id=c.school_id AND u.id=c.responsible_teacher_id WHERE c.school_id=? AND c.term_id=? ORDER BY c.grade,c.class_no',[actor.schoolId,termId]);
 const [assignments]=await pool.query('SELECT a.teacher_id,a.grade,a.class_no,a.subject_code,u.username,u.real_name FROM teacher_teaching_assignment a JOIN users u ON u.school_id=a.school_id AND u.id=a.teacher_id WHERE a.school_id=? AND a.term_id=? AND a.enabled=1 ORDER BY a.grade,a.class_no,a.subject_code',[actor.schoolId,termId]);
 const [students]=await pool.query('SELECT e.student_id,e.student_name_snapshot,e.grade_snapshot,e.class_no_snapshot,u.username FROM student_term_evaluation e JOIN users u ON u.school_id=e.school_id AND u.id=e.student_id WHERE e.school_id=? AND e.term_id=? ORDER BY e.student_id',[actor.schoolId,termId]);
 const inScope=r=>(!grade||Number(grade)===r.grade)&&(!classNo||Number(classNo)===r.classNo)&&(!subjectCode||r.courses?.some(a=>a.subjectCode===subjectCode));
 const coursesFor=(g,n)=>assignments.filter(a=>a.grade===g&&a.class_no===n).map(a=>({teacherId:String(a.teacher_id),teacherName:a.real_name,teacherUsername:a.username,subjectCode:a.subject_code}));
 let rows;
 if(view==='students')rows=students.map(s=>{const cl=classes.find(c=>c.grade===s.grade_snapshot&&c.class_no===s.class_no_snapshot);return{id:String(s.student_id),username:s.username,name:s.student_name_snapshot,grade:s.grade_snapshot,classNo:s.class_no_snapshot,headName:cl?.headName||'',headUsername:cl?.headUsername||'',courses:coursesFor(s.grade_snapshot,s.class_no_snapshot)};}).filter(inScope);
 else if(view==='classes')rows=classes.map(c=>({id:String(c.id),name:c.display_name,grade:c.grade,classNo:c.class_no,headName:c.headName,headUsername:c.headUsername,studentCount:students.filter(s=>s.grade_snapshot===c.grade&&s.class_no_snapshot===c.class_no).length,courses:coursesFor(c.grade,c.class_no)})).filter(inScope);
 else{const [teachers]=await pool.query("SELECT id,username,real_name FROM users WHERE school_id=? AND role='teacher' ORDER BY id",[actor.schoolId]);rows=teachers.map(t=>({id:String(t.id),username:t.username,name:t.real_name,courses:assignments.filter(a=>String(a.teacher_id)===String(t.id)).map(a=>({grade:a.grade,classNo:a.class_no,subjectCode:a.subject_code})),headClasses:classes.filter(c=>c.headUsername===t.username).map(c=>({grade:c.grade,classNo:c.class_no}))})).filter(t=>!grade&&!classNo&&!subjectCode||t.courses.some(c=>(!grade||c.grade===Number(grade))&&(!classNo||c.classNo===Number(classNo))&&(!subjectCode||c.subjectCode===subjectCode))||!subjectCode&&t.headClasses.some(c=>(!grade||c.grade===Number(grade))&&(!classNo||c.classNo===Number(classNo))));}
 const keyword=String(q).trim().toLowerCase();rows=rows.filter(r=>!keyword||JSON.stringify(r).toLowerCase().includes(keyword));return{rows:rows.slice(page.offset,page.offset+page.limit),total:rows.length,nextCursor:page.next(rows.length)};
}
module.exports={previewRegistry,commitRegistry,listRegistryRelations};
