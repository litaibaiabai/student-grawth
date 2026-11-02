const crypto = require('node:crypto');
const {parse, getTerm, withMutation, addSource} = require('../services/reportCoreStore');
const {stableHash} = require('../services/reportCorePolicy');
const {isV2} = require('../services/reportCoreV2Policy');
const cards = require('../services/reportCoreCourseCards');
const fixture = 'course-card-ui-v1';
const command = () => { const requestKey=`${fixture}-${crypto.randomUUID()}`; return {requestKey,payloadHash:stableHash(requestKey)}; };

async function seedCourseCardFixtures({pool,schoolId,termId,teacherId,grade=4,baseClassNo=1,classNo=99,mode='check',now=new Date()}) {
  if (!['check','apply'].includes(mode) || ![schoolId,termId,teacherId,grade,baseClassNo,classNo].every(v=>/^[1-9]\d*$/.test(String(v))) || baseClassNo===classNo) throw Error('请指定有效学校、学期、演示教师及两个不同班级');
  const [[teacher]]=await pool.query("SELECT id,username,real_name,token_version FROM users WHERE school_id=? AND id=? AND role='teacher' AND status=0",[schoolId,teacherId]);
  if (!teacher || teacher.username!=='teacher' || !/^(演示|测试|teacher$)/.test(teacher.real_name)) throw Error('只允许调整明确标记的演示教师');
  const term=await getTerm(pool,schoolId,termId);
  if (!isV2(term.evaluation_config) || term.release_status!=='IDLE' || Number(term.active_release_version) || term.business_phase!=='COLLECTING') throw Error('仅可为未发布、采集期的 V2 演示学期添加模拟数据');
  const [students]=await pool.query('SELECT e.student_id,e.class_no_snapshot,e.section_meta,u.username FROM student_term_evaluation e JOIN users u ON u.school_id=e.school_id AND u.id=e.student_id WHERE e.school_id=? AND e.term_id=? AND e.grade_snapshot=? AND e.class_no_snapshot IN (?,?) ORDER BY e.student_id',[schoolId,termId,grade,baseClassNo,classNo]);
  if ([baseClassNo,classNo].some(n=>!students.some(s=>s.class_no_snapshot===n)) || students.some(s=>!['student','student2'].includes(s.username) && parse(s.section_meta).uiFixture?.synthetic!==true)) throw Error('两个班级必须已有演示学生，不可混入正式学生');
  const plan=[
    {grade,classNo:baseClassNo,subjectCode:'CHINESE',monthlyTotal:100,used:18},
    {grade,classNo:baseClassNo,subjectCode:'MATH',monthlyTotal:120,used:27},
    {grade,classNo,subjectCode:'MATH',monthlyTotal:120,used:36},
    {grade,classNo,subjectCode:'FINE_ART',monthlyTotal:80,used:12},
  ];
  if (mode==='check') return {mode,fixture,courses:plan};
  require('../services/cardCredentials').printKey();
  const [[manager]]=await pool.query("SELECT id,token_version FROM users WHERE school_id=? AND role='manager' AND status=0 ORDER BY id LIMIT 1",[schoolId]);
  if (!manager) throw Error('缺少可用管理员账号');
  const actor={id:String(teacher.id),schoolId:String(schoolId),role:'teacher',tokenVersion:teacher.token_version};
  const admin={id:String(manager.id),schoolId:String(schoolId),role:'manager',tokenVersion:manager.token_version};
  await withMutation({pool,actor:admin,termId,command:command(),action:'course-card-fixture-settings',termLock:'exclusive'},async(c,current)=>{
    if (Number(current.active_release_version)) throw Error('学期已发布，停止添加演示数据');
    const [assignments]=await c.query('SELECT id,grade,class_no,subject_code,enabled,is_head_teacher FROM teacher_teaching_assignment WHERE school_id=? AND term_id=? AND teacher_id=? FOR UPDATE',[schoolId,termId,teacherId]);
    if (plan.some(p=>!assignments.some(a=>a.grade===p.grade && a.class_no===p.classNo && a.subject_code===p.subjectCode))) throw Error('演示教师缺少目标课程关系');
    const backupKey=[fixture,schoolId,termId,teacherId];
    const [[backup]]=await c.query('SELECT id FROM evaluation_source_record WHERE school_id=? AND business_key=? FOR UPDATE',[schoolId,stableHash(backupKey)]);
    if (!backup) await addSource(c,{schoolId,termId,actorId:manager.id,kind:'AUDIT',status:'COMMITTED',key:backupKey,payload:{action:'COURSE_CARD_UI_FIXTURE_SETUP',fixture,teacherId,assignments,previousQuotas:current.evaluation_config.courseCardQuotas||{},courses:plan}});
    for (const a of assignments) {
      const enabled=plan.some(p=>p.grade===a.grade && p.classNo===a.class_no && p.subjectCode===a.subject_code)?1:0;
      const wasHead=assignments.some(h=>h.grade===a.grade && h.class_no===a.class_no && h.enabled && h.is_head_teacher);
      const first=plan.find(p=>p.grade===a.grade && p.classNo===a.class_no);
      const head=enabled && wasHead && first?.subjectCode===a.subject_code ? 1:0;
      if (a.enabled!==enabled || a.is_head_teacher!==head) await c.query('UPDATE teacher_teaching_assignment SET enabled=?,is_head_teacher=? WHERE school_id=? AND id=?',[enabled,head,schoolId,a.id]);
    }
    const quotas={...current.evaluation_config.courseCardQuotas};
    for (const p of plan) quotas[p.subjectCode]=p.monthlyTotal;
    if (stableHash(quotas)!==stableHash(current.evaluation_config.courseCardQuotas||{})) await c.query('UPDATE academic_year SET evaluation_config=?,config_version=CAST(CAST(config_version AS UNSIGNED)+1 AS CHAR) WHERE school_id=? AND id=?',[JSON.stringify({...current.evaluation_config,courseCardQuotas:quotas}),schoolId,termId]);
    return {result:{fixture,courses:plan}};
  });
  const sync=await cards.syncCourseCards({pool,actor,termId,now,command:command()});
  const monthKey=sync.result.monthKey;
  await withMutation({pool,actor,termId,studentIds:students.map(s=>String(s.student_id)),command:command(),action:'course-card-fixture-claims'},async c=>{
    const changed={};let claimed=0;
    for (const p of plan) {
      const [rows]=await c.query("SELECT * FROM evaluation_source_record WHERE school_id=? AND term_id=? AND owner_teacher_id=? AND month_key=? AND record_kind='CARD' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.mode'))='COURSE_SUBJECT' AND JSON_EXTRACT(payload_json,'$.grade')=? AND JSON_EXTRACT(payload_json,'$.classNo')=? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.subjectCode'))=? ORDER BY record_ordinal FOR UPDATE",[schoolId,termId,teacherId,monthKey,p.grade,p.classNo,p.subjectCode]);
      const pending=Math.max(0,Math.min(p.used,rows.length)-rows.filter(r=>r.status==='USED').length);
      const roster=students.filter(s=>s.class_no_snapshot===p.classNo);
      for (const [index,row] of rows.filter(r=>r.status==='UNUSED' && +r.valid_from<=+now && +now<+r.valid_until).slice(0,pending).entries()) {
        const studentId=String(roster[index%roster.length].student_id);
        const payload={...parse(row.payload_json),usedAt:new Date(Math.max(+row.valid_from,+now-(index+1)*3600000)).toISOString(),uiFixture:{key:fixture,synthetic:true}};
        await c.query("UPDATE evaluation_source_record SET status='USED',student_id=?,payload_json=?,revision=revision+1 WHERE school_id=? AND id=? AND owner_teacher_id=? AND status='UNUSED'",[studentId,JSON.stringify(payload),schoolId,row.id,teacherId]);
        changed[studentId]=[...new Set([...(changed[studentId]||[]),row.target_key])];claimed++;
      }
    }
    return {result:{fixture,claimed},changedTargetsByStudent:changed};
  });
  const result=await cards.listCourseCards({pool,actor,termId,monthKey,now});
  return {mode,fixture,monthKey,courses:result.courses.map(c=>({grade:c.grade,classNo:c.classNo,subjectCode:c.subjectCode,total:c.total,available:c.available,used:c.used}))};
}
if(require.main===module) {
  const pool=require('../db').createDbPool();
  seedCourseCardFixtures({pool,schoolId:process.env.SCHOOL_ID,termId:process.env.TERM_ID,teacherId:process.env.TEACHER_ID,mode:process.argv.includes('--apply')?'apply':'check'})
    .then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
}
module.exports={seedCourseCardFixtures};
