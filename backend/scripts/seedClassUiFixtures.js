const {parse,addSource}=require('../services/reportCoreStore');
const {policyFor,isV2}=require('../services/reportCoreV2Policy');
const FIXTURE='class-ui-30-v1';
const names=['林知夏','陈予安','张晨','李沐','王梓涵','赵一诺','周明轩','吴雨桐','徐子墨','孙悦','胡嘉宁','朱思远','高可欣','林知夏','欧阳子衿','司马若溪','李·安娜','陈一','龙沐阳','郑书言','罗星辰','何小满','梁嘉禾','谢清越','宋与乐','唐可','许言','韩南星','<测试>林&同学','超长姓名测试'.repeat(12).slice(0,64)];
function fixtureRows(){return names.map((name,i)=>({name,gender:i===27?null:i%2?'女':'男',score:i===26?null:[100,0,59.5,60,84.9,85,99.5,72][i%8],missing:i===26,scenario:i===29?'64字姓名':i===28?'HTML符号转义':i===27?'性别未填':i===26?'成绩全部未填':i===13?'同名学生':i%8===1?'真实零值':'常规成绩'}));}
async function seedClassUiFixtures({pool,schoolId,termId,teacherId,grade=4,classNo=99,mode='check'}){
 if(!['check','apply','cleanup'].includes(mode)||![schoolId,termId,teacherId,grade,classNo].every(v=>/^[1-9]\d*$/.test(String(v))))throw Error('必须指定有效学校、学期、教师、年级和班号');
 const c=await pool.getConnection(),key=`${FIXTURE}:${schoolId}:${termId}:${grade}:${classNo}`;
 try{
  await c.beginTransaction();const [[term]]=await c.query('SELECT * FROM academic_year WHERE school_id=? AND id=? FOR UPDATE',[schoolId,termId]);
  if(!term||term.release_status!=='IDLE'||Number(term.active_release_version)||(term.business_phase&&term.business_phase!=='COLLECTING'))throw Error('仅在采集期、未发布的测试学期使用；不要向正式发布学期添加模拟学生');
  const [[teacher]]=await c.query("SELECT id FROM users WHERE school_id=? AND id=? AND role='teacher' AND status=0",[schoolId,teacherId]);if(!teacher)throw Error('教师账号不存在或已停用');
  const [existing]=await c.query('SELECT e.*,u.username FROM student_term_evaluation e JOIN users u ON u.school_id=e.school_id AND u.id=e.student_id WHERE e.school_id=? AND e.term_id=? AND e.grade_snapshot=? AND e.class_no_snapshot=?',[schoolId,termId,grade,classNo]);
  if(existing.some(r=>parse(r.section_meta).uiFixture?.key!==key||String(parse(r.section_meta).uiFixture?.teacherId)!==String(teacherId)))throw Error('该班已有非本脚本数据，请选择空班号');
  const prefix=`UI${grade}C${classNo}_`,rows=fixtureRows();
  if(mode==='check'){await c.rollback();return {mode,fixture:FIXTURE,count:30,existing:existing.length,classKey:`${grade}:${classNo}`,accounts:`${prefix}0001–${prefix}0030`,scenarios:rows.filter(r=>r.scenario!=='常规成绩').map(r=>r.scenario)};}
  if(mode==='cleanup'){
   if(!existing.length){await c.rollback();return {mode,removed:0};}
   for(const e of existing){
    const [[linked]]=await c.query('SELECT COUNT(*) n FROM term_report WHERE school_id=? AND student_id=?',[schoolId,e.student_id]);const [[other]]=await c.query('SELECT COUNT(*) n FROM student_term_evaluation WHERE school_id=? AND student_id=? AND term_id<>?',[schoolId,e.student_id,termId]);
    if(Number(linked.n)||Number(other.n))throw Error('测试学生已有报告或其他学期记录，停止清理以免误删');
    const [sources]=await c.query('SELECT id,source_type FROM evaluation_source_record WHERE school_id=? AND student_id=? ORDER BY id DESC',[schoolId,e.student_id]);
    if(sources.some(r=>['STORY','CERTIFICATE'].includes(r.source_type)))throw Error('测试学生已新增故事或证书，请先按业务流程撤回材料后再清理');
    for(const r of sources)await c.query('DELETE FROM evaluation_source_record WHERE school_id=? AND id=?',[schoolId,r.id]);
    await c.query('DELETE FROM student_term_evaluation WHERE school_id=? AND student_id=?',[schoolId,e.student_id]);await c.query('DELETE FROM users WHERE school_id=? AND id=?',[schoolId,e.student_id]);
   }
   await c.query("DELETE FROM teacher_teaching_assignment WHERE school_id=? AND term_id=? AND grade=? AND class_no=? AND teacher_id=?",[schoolId,termId,grade,classNo,teacherId]);if(isV2(parse(term.evaluation_config))){await c.query('UPDATE academic_year SET roster_revision=roster_revision+1,data_revision=data_revision+1 WHERE school_id=? AND id=?',[schoolId,termId]);await c.query("UPDATE student_term_evaluation SET revision=revision+1,status='DRAFT',confirmed_revision=NULL,confirmed_by=NULL,confirmed_at=NULL,approval_fingerprint=NULL WHERE school_id=? AND term_id=?",[schoolId,termId]);}await c.commit();return {mode,removed:existing.length};
  }
  if(existing.length){if(existing.length!==30)throw Error('测试班数据不完整，请核对后清理重建');await c.rollback();return {mode,created:0,existing:30};}
  const [[reserved]]=await c.query('SELECT COUNT(*) n FROM teacher_teaching_assignment WHERE school_id=? AND term_id=? AND grade=? AND class_no=?',[schoolId,termId,grade,classNo]);if(Number(reserved.n))throw Error('班号已有任教配置，请选择新的空班号');
  const config=parse(term.evaluation_config),v2=isV2(config),catalog=policyFor(config),password=await require('bcrypt').hash(require('node:crypto').randomBytes(32).toString('hex'),10);
  if(v2)c.reportCoreSchemaVersion='SIX_EDU_V2';
  for(const [i,row]of rows.entries()){
   const username=prefix+String(i+1).padStart(4,'0');const [[collision]]=await c.query('SELECT id FROM users WHERE school_id=? AND username=?',[schoolId,username]);if(collision)throw Error('测试学号已被其他记录占用');
   const [u]=await c.query("INSERT INTO users(school_id,username,password,real_name,role,grade,class_no) VALUES(?,?,?,?,'student',?,?)",[schoolId,username,password,row.name,grade,classNo]);
   const meta={uiFixture:{key,teacherId:String(teacherId),gender:row.gender,numericScores:{math:row.score},scenario:row.scenario,synthetic:true}};
   await c.query('INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version,section_meta) VALUES(?,?,?,?,?,?,?,?,?)',[schoolId,termId,u.insertId,row.name,grade,classNo,term.template_version,term.rule_version,JSON.stringify(meta)]);
   const values={};for(const f of catalog.fields.filter(f=>f.sourceType==='IMPORT'&&!f.jsonPath)){if(row.missing)values[f.column]=null;else if(f.valueType==='star')values[f.column]=i%3+1;else if(f.valueType==='grade')values[f.column]=f.column.startsWith('math_')?(row.score>=85?'A':row.score>=70?'B':row.score>=60?'C':'D'):['A','B','C','D'][i%4];else if(f.column==='jump_rope_1min')values[f.column]=i===1?0:100+i;else if(f.column==='height_cm')values[f.column]=i===2?75:130+i;else if(f.column==='weight_kg')values[f.column]=i===2?12:28+i;else if(f.column.startsWith('vision_'))values[f.column]=['4.8','5.0'][i%2];}
   await addSource(c,{schoolId,termId,studentId:String(u.insertId),actorId:teacherId,sourceType:'IMPORT',kind:'BATCH',status:'COMMITTED',key:[key,username],payload:{values,fixture:key,measurement:{date:'2026-10-30',visionStandard:'5_POINT',groupId:username}}});
   const next=await require('../services/reportCoreProjection').rebuildEvaluation({connection:c,studentKey:{schoolId,termId,studentId:String(u.insertId)},targets:Object.keys(values),config});
   const fields=Object.keys(next.values);if(fields.length)await c.query(`UPDATE student_term_evaluation SET ${fields.map(k=>'`'+k+'`=?').join(',')},field_sources=?,section_meta=? WHERE school_id=? AND term_id=? AND student_id=?`,[...fields.map(k=>next.values[k]),JSON.stringify(next.fieldSources),JSON.stringify(next.sectionMeta),schoolId,termId,u.insertId]);
  }
  for(const subject of ['MATH','FINE_ART'])await c.query('INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher) VALUES(?,?,?,?,?,?,?)',[schoolId,termId,teacherId,grade,classNo,subject,subject==='MATH'?1:0]);
  if(v2){await c.query('UPDATE academic_year SET roster_revision=roster_revision+1,data_revision=data_revision+1 WHERE school_id=? AND id=?',[schoolId,termId]);await c.query("UPDATE student_term_evaluation SET revision=revision+1,status='DRAFT',confirmed_revision=NULL,confirmed_by=NULL,confirmed_at=NULL,approval_fingerprint=NULL WHERE school_id=? AND term_id=?",[schoolId,termId]);}
  await c.commit();return {mode,created:30,classKey:`${grade}:${classNo}`,accounts:`${prefix}0001–${prefix}0030`,note:'学生随机密码，不开放共享登录；由指定教师查看测试班'};
 }catch(e){await c.rollback();throw e;}finally{delete c.reportCoreSchemaVersion;c.release();}
}
if(require.main===module){const pool=require('../db').createDbPool();seedClassUiFixtures({pool,schoolId:process.env.SCHOOL_ID,termId:process.env.TERM_ID,teacherId:process.env.TEACHER_ID,grade:Number(process.env.FIXTURE_GRADE||4),classNo:Number(process.env.FIXTURE_CLASS_NO||99),mode:process.argv.includes('--cleanup')?'cleanup':process.argv.includes('--apply')?'apply':'check'}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());}
module.exports={seedClassUiFixtures,fixtureRows};
