const {pool}=require('../db');
const {success,fail}=require('../utils/response');
const {AppError}=require('../middleware/errorHandler');
const {getMonthKey}=require('../utils/monthKey');
const {DIMENSIONS,allocateCards,validateMonth,effectivePolicyMonth}=require('../services/cardRules');
const {saveSubjectPolicy,setTeacherSubjects,queueReconcile,withSchoolLock,json}=require('../services/cardAllocationService');

const wrap=action=>async(req,res,next)=>{try{const data=await action(req);success(res,data);}catch(e){if(e.code==='ER_DUP_ENTRY') return fail(res,409,'该学科代码已存在，请使用其他代码',409);next(e);}};
const monthOf=req=>validateMonth(req.query.monthKey||getMonthKey());
function id(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0) throw new AppError(422,'请选择有效记录',422);return n;}
async function audit(c,req,type,target,action,summary){
  await c.query('INSERT INTO operation_audit(school_id,actor_user_id,actor_role,target_type,target_id,action,request_id,new_summary) VALUES (?,?,?,?,?,?,?,?)',[req.user.schoolId,req.user.id,req.user.role,type,String(target),action,req.requestId||require('crypto').randomUUID(),JSON.stringify(summary)]);
}
function subjectDTO(s){return {id:Number(s.id),subjectCode:s.subject_code,subjectName:s.subject_name,status:Number(s.status)};}
function policyDTO(p){
  if(!p) return null;
  const bps=json(p.ratios_bps_json);
  const ratios=Object.fromEntries(DIMENSIONS.map(k=>[k,Number(bps[k]||0)/100]));
  return {id:Number(p.id),subjectId:Number(p.subject_id),version:Number(p.version),effectiveMonth:p.effective_month,monthlyTotal:Number(p.monthly_total),ratios,counts:allocateCards(Number(p.monthly_total),ratios),enabled:Boolean(p.enabled)};
}

const getSubjects=wrap(async req=>{const [rows]=await pool.query('SELECT * FROM card_subject WHERE school_id=? ORDER BY subject_code,id',[req.user.schoolId]);return rows.map(subjectDTO);});
const saveSubject=wrap(async req=>{
  const code=String(req.body.subjectCode||'').trim().toUpperCase(),name=String(req.body.subjectName||'').trim();
  const status=req.body.status===undefined?1:Number(req.body.status);
  if(!/^[A-Z][A-Z0-9_]{0,29}$/.test(code)||!name||name.length>60||![0,1].includes(status)) throw new AppError(422,'请填写有效学科代码（字母、数字、下划线）、名称与状态',422);
  const result=await withSchoolLock(req.user.schoolId,async c=>{
    let subjectId;
    if(req.params.id){
      subjectId=id(req.params.id);
      const [[old]]=await c.query('SELECT * FROM card_subject WHERE id=? AND school_id=?',[subjectId,req.user.schoolId]);
      if(!old) throw new AppError(403,'该学科不属于本校',403);
      if(old.subject_code!==code) throw new AppError(422,'学科代码创建后不能修改，可以更新显示名称',422);
      if(Number(old.status)!==status){
        const [[used]]=await c.query('SELECT COUNT(*) n FROM subject_card_policy WHERE subject_id=?',[subjectId]);
        if(status===0&&Number(used.n)>0)throw new AppError(422,'该学科已有发卡策略，请在策略中暂停或启用自动发卡，按生效月份执行',422);
      }
      await c.query('UPDATE card_subject SET subject_name=?,status=? WHERE id=?',[name,status,subjectId]);
    }else{
      const [created]=await c.query('INSERT INTO card_subject(school_id,subject_code,subject_name,status) VALUES (?,?,?,?)',[req.user.schoolId,code,name,status]);subjectId=created.insertId;
    }
    await audit(c,req,'CARD_SUBJECT',subjectId,'SAVE_CARD_SUBJECT',{subjectCode:code,subjectName:name,status});
    return {id:Number(subjectId),subjectCode:code,subjectName:name,status};
  });
  queueReconcile(req.user.schoolId);return result;
});

const getTeachers=wrap(async req=>{
  const [teachers]=await pool.query("SELECT u.id,u.real_name,u.username,u.status,u.classes,u.primary_subject_id,s.subject_name FROM users u LEFT JOIN card_subject s ON u.primary_subject_id=s.id AND s.school_id=u.school_id WHERE u.school_id=? AND u.role='teacher' ORDER BY u.id",[req.user.schoolId]);
  const [relations]=await pool.query('SELECT teacher_id,subject_id FROM teacher_subject WHERE school_id=?',[req.user.schoolId]);
  return teachers.map(t=>({id:Number(t.id),realName:t.real_name||t.username,status:Number(t.status),classes:json(t.classes,[]),primarySubjectId:t.primary_subject_id?Number(t.primary_subject_id):null,primarySubjectName:t.subject_name||null,subjectIds:relations.filter(r=>Number(r.teacher_id)===Number(t.id)).map(r=>Number(r.subject_id))}));
});
const saveTeacherSubjects=wrap(async req=>{
  const result=await setTeacherSubjects({schoolId:req.user.schoolId,teacherId:id(req.params.id),subjectIds:req.body.subjectIds,primarySubjectId:req.body.primarySubjectId,actorId:req.user.id,requestId:req.requestId});
  queueReconcile(req.user.schoolId);return result;
});

const getPolicies=wrap(async req=>{
  const month=monthOf(req),nextMonth=effectivePolicyMonth(month,true);
  const [subjects]=await pool.query('SELECT * FROM card_subject WHERE school_id=? ORDER BY id',[req.user.schoolId]);
  const [policies]=await pool.query('SELECT * FROM subject_card_policy WHERE school_id=? ORDER BY effective_month DESC,version DESC',[req.user.schoolId]);
  return subjects.map(s=>{
    const versions=policies.filter(p=>Number(p.subject_id)===Number(s.id));
    const current=policyDTO(versions.find(p=>p.effective_month<=month)),scheduled=policyDTO(versions.find(p=>p.effective_month>month&&p.effective_month<=nextMonth)),latest=policyDTO(versions[0]);
    return {...subjectDTO(s),subjectId:Number(s.id),...latest,currentPolicy:current,scheduledPolicy:scheduled,latestPolicy:latest};
  });
});
const savePolicy=wrap(async req=>{
  const result=await saveSubjectPolicy({schoolId:req.user.schoolId,subjectId:id(req.params.subjectId),monthlyTotal:req.body.monthlyTotal,ratios:req.body.ratios,enabled:req.body.enabled===undefined?true:req.body.enabled,actorId:req.user.id,requestId:req.requestId});
  queueReconcile(req.user.schoolId);return {...result,generationQueued:true};
});

const getAllocations=wrap(async req=>{
  const month=monthOf(req),schoolId=req.user.schoolId;
  let teacherId=req.query.teacherId?id(req.query.teacherId):null;
  if(req.user.role==='teacher'){
    if(teacherId&&teacherId!==Number(req.user.id)) throw new AppError(403,'只能查看本人评价卡',403);
    teacherId=Number(req.user.id);
  }
  const params=[schoolId,month];
  const [rows]=await pool.query(`SELECT a.*,u.primary_subject_id current_subject_id,s.subject_name current_subject_name,COUNT(c.id) generated_count,SUM(c.status='UNUSED') unused_count,SUM(c.status='PENDING') pending_count,SUM(c.status='USED') used_count FROM card_allocation a JOIN users u ON u.id=a.teacher_id AND u.school_id=a.school_id LEFT JOIN card_subject s ON s.id=u.primary_subject_id AND s.school_id=a.school_id LEFT JOIN reward_card c ON c.allocation_id=a.id AND c.is_legacy_test=0 WHERE a.school_id=? AND a.month_key=? ${teacherId?'AND a.teacher_id=?':''} GROUP BY a.id ORDER BY a.teacher_id`,teacherId?[...params,teacherId]:params);
  return rows.map(a=>({id:Number(a.id),teacherId:Number(a.teacher_id),teacherName:a.teacher_name,monthKey:a.month_key,termId:Number(a.term_id),subjectId:Number(a.subject_id),subjectName:a.subject_name,currentSubjectId:a.current_subject_id?Number(a.current_subject_id):null,currentSubjectName:a.current_subject_name||null,subjectChanged:Number(a.subject_id)!==Number(a.current_subject_id),subjectChangeNotice:Number(a.subject_id)!==Number(a.current_subject_id)?(a.current_subject_name?'当月卡片保持原学科分配，下月采用新的主教学科：'+a.current_subject_name:'当月卡片保持原学科分配，请在下月发卡前补齐主教学科'):null,monthlyTotal:Number(a.monthly_total),counts:json(a.counts_json),status:a.status,errorMessage:a.error_message,generatedCount:Number(a.generated_count),unusedCount:Number(a.unused_count||0),pendingCount:Number(a.pending_count||0),usedCount:Number(a.used_count||0),policyVersionId:Number(a.policy_version_id)}));
});
const getGenerationIssues=wrap(async req=>{
  const [rows]=await pool.query('SELECT i.*,u.real_name teacher_name FROM card_generation_issue i LEFT JOIN users u ON u.id=i.teacher_id AND u.school_id=i.school_id WHERE i.school_id=? AND i.month_key=? AND i.resolved=0 ORDER BY i.teacher_id,i.id',[req.user.schoolId,monthOf(req)]);
  return rows.map(i=>({id:Number(i.id),teacherId:Number(i.teacher_id),teacherName:i.teacher_name||'全校',reasonCode:i.reason_code,message:i.reason_message,lastAttemptAt:i.last_attempt_at}));
});
function retiredCardEndpoint(req,res){return fail(res,410,'旧教师配额与手动制卡已停用，请维护学科发卡策略；系统将自动生成月度卡片',410);}

module.exports={getSubjects,saveSubject,getTeachers,saveTeacherSubjects,getPolicies,savePolicy,getAllocations,getGenerationIssues,retiredCardEndpoint};
