const crypto = require('crypto');
const {pool}=require('../db');
const {AppError}=require('../middleware/errorHandler');
const {getMonthKey}=require('../utils/monthKey');
const {DIMENSIONS,allocateCards,ratiosToBps,selectCardTerm,cardWindow,effectivePolicyMonth,schoolTimestamp,sqlTimestamp}=require('./cardRules');
const {encryptToken,credentialContext,tokenHash,printKey}=require('./cardCredentials');

function json(value,fallback={}) { if(value===null||value===undefined) return fallback; return typeof value==='string'?JSON.parse(value):value; }

async function withSchoolLock(schoolId, action) {
  const c=await pool.getConnection();
  const lock=`subject-cards:school:${schoolId}`;
  let acquired=false;
  try {
    const [[result]]=await c.query('SELECT GET_LOCK(?,10) AS acquired',[lock]);
    acquired=Number(result.acquired)===1;
    if(!acquired) throw new AppError(409,'该校发卡任务正在处理中，请稍后重试',409);
    await c.beginTransaction();
    const resultValue=await action(c);
    await c.commit();
    return resultValue;
  } catch(error) { await c.rollback();throw error; }
  finally { if(acquired) await c.query('SELECT RELEASE_LOCK(?)',[lock]).catch(()=>{});c.release(); }
}

async function saveSubjectPolicy({schoolId,subjectId,monthlyTotal,ratios,enabled=true,actorId,requestId,now=new Date()}) {
  const counts=allocateCards(monthlyTotal,ratios);
  const bps=ratiosToBps(ratios);
  if(typeof enabled!=='boolean') throw new AppError(422,'策略启用状态必须为布尔值',422);
  const month=getMonthKey(now);
  return withSchoolLock(schoolId,async c=>{
    const [[subject]]=await c.query('SELECT * FROM card_subject WHERE id=? AND school_id=? FOR UPDATE',[subjectId,schoolId]);
    if(!subject) throw new AppError(403,'该学科不属于本校',403);
    if(Number(subject.status)!==1)throw new AppError(422,'请先在学科字典中启用学科，再保存发卡策略',422);
    const [[allocated]]=await c.query('SELECT COUNT(*) AS n FROM card_allocation WHERE school_id=? AND subject_id=? AND month_key=?',[schoolId,subjectId,month]);
    const [[latest]]=await c.query('SELECT COALESCE(MAX(version),0) AS version FROM subject_card_policy WHERE subject_id=?',[subjectId]);
    const effectiveMonth=effectivePolicyMonth(month,Number(allocated.n)>0);
    const version=Number(latest.version)+1;
    const [result]=await c.query('INSERT INTO subject_card_policy SET ?',{school_id:schoolId,subject_id:subjectId,version,effective_month:effectiveMonth,monthly_total:monthlyTotal,ratios_bps_json:JSON.stringify(bps),enabled:enabled?1:0,created_by:actorId||null});
    if(actorId) await c.query("INSERT INTO operation_audit(school_id,actor_user_id,actor_role,target_type,target_id,action,request_id,new_summary) VALUES (?,?,'manager','CARD_POLICY',?,'SAVE_CARD_POLICY',?,?)",[schoolId,actorId,result.insertId,requestId||crypto.randomUUID(),JSON.stringify({subjectId,version,effectiveMonth,monthlyTotal,ratios,enabled})]);
    return {id:result.insertId,subjectId:Number(subjectId),version,effectiveMonth,monthlyTotal,ratios:Object.fromEntries(DIMENSIONS.map(k=>[k,bps[k]/100])),counts,enabled};
  });
}

async function setTeacherSubjects({schoolId,teacherId,subjectIds,primarySubjectId,actorId,requestId}) {
  if(!Array.isArray(subjectIds)||subjectIds.some(id=>!Number.isSafeInteger(Number(id))||Number(id)<=0)) throw new AppError(422,'请选择有效任教学科',422);
  const ids=[...new Set(subjectIds.map(Number))];
  const primary=primarySubjectId===null||primarySubjectId===undefined?null:Number(primarySubjectId);
  if(primary!==null&&!ids.includes(primary)) throw new AppError(422,'主教学科须属于任教学科',422);
  return withSchoolLock(schoolId,async c=>{
    const [[teacher]]=await c.query("SELECT id FROM users WHERE id=? AND school_id=? AND role='teacher' FOR UPDATE",[teacherId,schoolId]);
    if(!teacher) throw new AppError(403,'该教师不属于本校',403);
    if(ids.length){
      const [subjects]=await c.query('SELECT id FROM card_subject WHERE school_id=? AND status=1 AND id IN (?)',[schoolId,ids]);
      if(subjects.length!==ids.length) throw new AppError(403,'学科不存在、已停用或不属于本校',403);
    }
    await c.query('DELETE FROM teacher_subject WHERE school_id=? AND teacher_id=?',[schoolId,teacherId]);
    if(ids.length) await c.query('INSERT INTO teacher_subject(school_id,teacher_id,subject_id) VALUES ?',[ids.map(id=>[schoolId,teacherId,id])]);
    await c.query('UPDATE users SET primary_subject_id=? WHERE id=? AND school_id=?',[primary,teacherId,schoolId]);
    if(actorId) await c.query("INSERT INTO operation_audit(school_id,actor_user_id,actor_role,target_type,target_id,action,request_id,new_summary) VALUES (?,?,'manager','TEACHER',?,'SET_PRIMARY_SUBJECT',?,?)",[schoolId,actorId,teacherId,requestId||crypto.randomUUID(),JSON.stringify({subjectIds:ids,primarySubjectId:primary})]);
    return {teacherId:Number(teacherId),subjectIds:ids,primarySubjectId:primary};
  });
}

async function issue(schoolId,month,teacherId,code,message,now) {
  await pool.query('INSERT INTO card_generation_issue(school_id,month_key,teacher_id,reason_code,reason_message,last_attempt_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE resolved=0,reason_message=VALUES(reason_message),last_attempt_at=VALUES(last_attempt_at)',[schoolId,month,teacherId||0,code,String(message).slice(0,500),schoolTimestamp(now)]);
}

async function reserveAllocation(schoolId,teacherId,month,now) {
  return withSchoolLock(schoolId,async c=>{
    const [[existing]]=await c.query('SELECT * FROM card_allocation WHERE school_id=? AND teacher_id=? AND month_key=?',[schoolId,teacherId,month]);
    if(existing) return {allocation:existing};
    const [terms]=await c.query('SELECT * FROM academic_year WHERE school_id=? OR school_id IS NULL',[schoolId]);
    let term;
    try{term=selectCardTerm(terms,schoolId,month);}catch(e){return {code:'TERM_CONFLICT',message:e.message};}
    if(!term)return {code:'NO_TERM',message:'该月份无有效学期覆盖，暂停自动发卡'};
    const [[t]]=await c.query("SELECT u.*,s.subject_name,s.status AS subject_status FROM users u LEFT JOIN card_subject s ON s.id=u.primary_subject_id AND s.school_id=u.school_id WHERE u.id=? AND u.school_id=? AND u.role='teacher' FOR UPDATE",[teacherId,schoolId]);
    if(!t||Number(t.status)!==0) return {skip:true};
    if(!t.primary_subject_id||!t.subject_name||Number(t.subject_status)!==1) return {code:'NO_SUBJECT',message:'教师未配置有效主教学科'};
    const [[membership]]=await c.query('SELECT subject_id FROM teacher_subject WHERE school_id=? AND teacher_id=? AND subject_id=?',[schoolId,teacherId,t.primary_subject_id]);
    if(!membership) return {code:'NO_SUBJECT',message:'主教学科不在教师任教学科记录内'};
    const [[policy]]=await c.query('SELECT * FROM subject_card_policy WHERE school_id=? AND subject_id=? AND effective_month<=? ORDER BY effective_month DESC,version DESC LIMIT 1',[schoolId,t.primary_subject_id,month]);
    if(!policy||!Number(policy.enabled)) return {code:'NO_POLICY',message:'主教学科尚无当月生效的启用策略'};
    if(Number(policy.monthly_total)===0) return {code:'ZERO_TOTAL',message:'主教学科当月策略为0张，不生成卡片'};
    const window=cardWindow(term,month);
    if(schoolTimestamp(now)>window.validUntil||schoolTimestamp(now)>window.reviewDeadline) return {code:'MONTH_CLOSED',message:'当月申领或审核已截止，不再补生成卡片'};
    const bps=json(policy.ratios_bps_json);
    const counts=allocateCards(Number(policy.monthly_total),Object.fromEntries(DIMENSIONS.map(k=>[k,bps[k]/100])));
    const data={school_id:schoolId,teacher_id:teacherId,month_key:month,term_id:term.id,subject_id:t.primary_subject_id,policy_version_id:policy.id,teacher_name:t.real_name||t.username,subject_name:t.subject_name,monthly_total:policy.monthly_total,counts_json:JSON.stringify(counts),category_version:'V1',valid_from:window.validFrom,valid_until:window.validUntil,review_deadline_at:window.reviewDeadline};
    const [result]=await c.query('INSERT INTO card_allocation SET ?',data);
    return {allocation:{...data,id:result.insertId}};
  });
}

async function generateAllocation(allocationId) {
  const [[a]]=await pool.query('SELECT * FROM card_allocation WHERE id=?',[allocationId]);
  if(!a) return;
  return withSchoolLock(a.school_id,async c=>{
    const [[allocation]]=await c.query('SELECT * FROM card_allocation WHERE id=? FOR UPDATE',[allocationId]);
    const [existing]=await c.query('SELECT serial_no FROM reward_card WHERE allocation_id=?',[allocationId]);
    const present=new Set(existing.map(card=>Number(card.serial_no)));
    const counts=json(allocation.counts_json);
    const values=[];
    let serial=0;
    if(present.size<Number(allocation.monthly_total)) printKey();
    for(const direction of DIMENSIONS) for(let i=0;i<Number(counts[direction]||0);i++){
      serial++;
      if(present.has(serial)) continue;
      const token=crypto.randomBytes(32).toString('hex');
      const card={school_id:allocation.school_id,allocation_id:allocation.id,serial_no:serial};
      values.push([allocation.school_id,allocation.term_id,allocation.teacher_id,allocation.month_key,serial,allocation.id,direction,null,tokenHash(token),encryptToken(token,credentialContext(card)),sqlTimestamp(allocation.valid_from),sqlTimestamp(allocation.valid_until),sqlTimestamp(allocation.review_deadline_at),0,'UNUSED']);
    }
    for(let start=0;start<values.length;start+=500) await c.query('INSERT INTO reward_card(school_id,term_id,teacher_id,month_key,serial_no,allocation_id,dimension_code,category_id,token_hash,token_ciphertext,valid_from,valid_until,review_deadline_at,is_legacy_test,status) VALUES ?',[values.slice(start,start+500)]);
    await c.query("UPDATE card_allocation SET status='READY',error_message=NULL WHERE id=?",[allocationId]);
    return {id:Number(allocationId),created:values.length};
  });
}

async function reconcileMonth({schoolId,now=new Date()}={}) {
  const month=getMonthKey(now);
  if(!schoolId){
    const [schools]=await pool.query("SELECT DISTINCT school_id FROM users WHERE role='teacher'");
    const results=[];
    for(const s of schools) results.push(await reconcileMonth({schoolId:s.school_id,now}));
    return results;
  }
  const [terms]=await pool.query('SELECT * FROM academic_year WHERE school_id=? OR school_id IS NULL',[schoolId]);
  let term;
  try{term=selectCardTerm(terms,schoolId,month);}catch(e){await issue(schoolId,month,0,'TERM_CONFLICT',e.message,now);return {monthKey:month,created:0,blocked:true};}
  if(!term){await issue(schoolId,month,0,'NO_TERM','该月份无有效学期覆盖，暂停自动发卡',now);return {monthKey:month,created:0,blocked:true};}
  await pool.query('UPDATE card_generation_issue SET resolved=1 WHERE school_id=? AND month_key=? AND teacher_id=0',[schoolId,month]);
  const [teachers]=await pool.query("SELECT id FROM users WHERE school_id=? AND role='teacher' AND status=0 ORDER BY id",[schoolId]);
  let created=0;
  for(const teacher of teachers){
    let allocation;
    try{
      const reserved=await reserveAllocation(schoolId,teacher.id,month,now);
      if(reserved.code){await pool.query('UPDATE card_generation_issue SET resolved=1 WHERE school_id=? AND month_key=? AND teacher_id=?',[schoolId,month,teacher.id]);await issue(schoolId,month,teacher.id,reserved.code,reserved.message,now);continue;}
      if(reserved.skip) continue;
      allocation=reserved.allocation;
      const result=await generateAllocation(allocation.id);
      created+=result?.created||0;
      await pool.query('UPDATE card_generation_issue SET resolved=1 WHERE school_id=? AND month_key=? AND teacher_id=?',[schoolId,month,teacher.id]);
    }catch(e){
      const message=e instanceof AppError?e.message:'卡片生成失败，系统稍后自动重试';
      if(allocation) await pool.query("UPDATE card_allocation SET status='FAILED',error_message=? WHERE id=?",[message,allocation.id]);
      await issue(schoolId,month,teacher.id,'GENERATION_FAILED',message,now);
    }
  }
  return {monthKey:month,created};
}

const queued=new Set();
let draining=false;
function queueReconcile(schoolId){
  queued.add(Number(schoolId));
  if(draining) return;
  draining=true;
  setImmediate(async()=>{
    try{while(queued.size){const id=queued.values().next().value;queued.delete(id);await reconcileMonth({schoolId:id}).catch(e=>console.error('自动配卡检查失败:', e.message || e.code || e.name));}}
    finally{draining=false;}
  });
}

module.exports={saveSubjectPolicy,setTeacherSubjects,reconcileMonth,generateAllocation,queueReconcile,withSchoolLock,json};
