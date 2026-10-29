const {withMutation,addSource,parse}=require('./reportCoreStore');
const {fail}=require('./reportCorePolicy');
function validate(actor,entries,monthKey){if(actor.role!=='manager')fail(403,'仅管理员批量下发额度');if(!Array.isArray(entries)||!entries.length||entries.length>200||!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))fail(422,'每批1–200名教师，月份需合法');}
function invalidRows(errors){const {AppError}=require('../middleware/errorHandler');const error=new AppError(422,'请修正全部教师额度错误',422);error.safeDetails=true;error.details={errors};throw error;}
async function quotaState(c,{actor,termId,monthKey,teacherId}){
 const [[u]]=await c.query("SELECT id,real_name FROM users WHERE school_id=? AND id=? AND role='teacher' AND status=0 FOR UPDATE",[actor.schoolId,teacherId]);if(!u)fail(422,'教师不存在或已停用');
 const [[q]]=await c.query("SELECT id,revision,payload_json FROM evaluation_source_record WHERE school_id=? AND term_id=? AND month_key=? AND owner_teacher_id=? AND record_kind='QUOTA' FOR UPDATE",[actor.schoolId,termId,monthKey,teacherId]);
 const p=q?parse(q.payload_json):{},[[g]]=q?await c.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE parent_id=? AND record_kind='CARD'",[q.id]):[[{n:0}]];
 return {teacherId,name:u.real_name,quotaId:q?String(q.id):null,expectedRevision:q?String(q.revision):null,oldTotal:p.quotaTotal??null,planned:(p.plans||[]).reduce((n,p)=>n+p.classTotal,0),generated:Number(g.n)};
}
async function previewQuotaBatch({pool,actor,termId,monthKey,entries,command}){
 validate(actor,entries,monthKey);
 return withMutation({pool,actor,termId,command,action:'quota-batch-preview',termLock:'exclusive'},async c=>{
  const errors=[],rows=[],seen=new Set();
  for(let i=0;i<entries.length;i++){
   const entry=entries[i]||{},rowNo=i+1,account=typeof entry.teacherAccount==='string'?entry.teacherAccount.trim():null;
   const problem=(field,reason)=>errors.push({rowNo,teacherAccount:account||null,teacherId:entry.teacherId?String(entry.teacherId):null,field,reason});
   if(!Number.isInteger(entry.total)||entry.total<0||entry.total>10000)problem('total','需填写0–10000的整数月总额');
   let user;
   if(account){[[user]]=await c.query("SELECT id,status FROM users WHERE school_id=? AND username=? AND role='teacher'",[actor.schoolId,account]);if(entry.teacherId&&String(user?.id)!==String(entry.teacherId))problem('teacherAccount','教师账号与ID不一致');}
   else if(/^[1-9]\d*$/.test(String(entry.teacherId))){[[user]]=await c.query("SELECT id,status FROM users WHERE school_id=? AND id=? AND role='teacher'",[actor.schoolId,entry.teacherId]);}
   if(!user)problem('teacherAccount','教师账号不存在');else if(user.status!==0)problem('teacherAccount','教师账号已停用');else if(seen.has(String(user.id)))problem('teacherAccount','本批教师重复（账号与ID指向同一教师也算重复）');else{seen.add(String(user.id));rows.push({teacherId:String(user.id),total:entry.total,rowNo});}
  }
  rows.sort((a,b)=>BigInt(a.teacherId)<BigInt(b.teacherId)?-1:1);
  const diffs=[];for(const row of rows){const state=await quotaState(c,{actor,termId,monthKey,teacherId:row.teacherId});if(Number.isInteger(row.total)&&row.total>=0&&row.total<=10000&&row.total<Math.max(state.planned,state.generated))errors.push({rowNo:row.rowNo,teacherId:row.teacherId,field:'total',reason:`${state.name}的新总额少于已分配${state.planned}或已制卡${state.generated}张`});diffs.push({...state,newTotal:row.total,delta:row.total-(state.oldTotal||0)});}
  if(errors.length)invalidRows(errors.sort((a,b)=>a.rowNo-b.rowNo));
  const batchId=await addSource(c,{schoolId:actor.schoolId,termId,actorId:actor.id,kind:'AUDIT',status:'PREVIEW',monthKey,key:['QUOTA_BATCH',actor.id,command.requestKey],payload:{action:'QUOTA_BATCH',monthKey,diffs}});
  return {result:{batchId,revision:'1',diffs,errors:[],counts:{teachers:diffs.length,changed:diffs.filter(d=>d.newTotal!==d.oldTotal).length}}};
 });
}
async function commitQuotaBatch({pool,actor,batchId,expectedRevision,command}){
 if(actor.role!=='manager')fail(403,'仅管理员批量下发额度');
 const [[b]]=await pool.query("SELECT * FROM evaluation_source_record WHERE school_id=? AND id=? AND record_kind='AUDIT'",[actor.schoolId,batchId]);if(!b||parse(b.payload_json).action!=='QUOTA_BATCH')fail(404,'批量预览不存在');if(String(b.actor_id)!==actor.id)fail(403,'仅预览人可提交');
 const payload=parse(b.payload_json);
 return withMutation({pool,actor,termId:b.term_id,command,action:'quota-batch-commit',termLock:'exclusive'},async c=>{
  const [[current]]=await c.query('SELECT status,revision FROM evaluation_source_record WHERE id=? FOR UPDATE',[batchId]);if(current.status!=='PREVIEW'||String(current.revision)!==String(expectedRevision))fail(409,'批量预览已变化');
  for(const d of payload.diffs){const now=await quotaState(c,{actor,termId:b.term_id,monthKey:payload.monthKey,teacherId:d.teacherId});if(now.quotaId!==d.quotaId||now.expectedRevision!==d.expectedRevision||now.planned!==d.planned||now.generated!==d.generated)fail(409,'预览后教师额度或计划已变化，请重新预览');}
  const results=[];for(const d of payload.diffs)results.push(await require('./reportCoreCards').saveQuotaInTransaction(c,{actor,termId:b.term_id,teacherId:d.teacherId,monthKey:payload.monthKey,total:d.newTotal,command}));
  await c.query("UPDATE evaluation_source_record SET status='COMMITTED',revision=revision+1 WHERE id=?",[batchId]);return {result:{batchId,teacherCount:results.length,diffs:payload.diffs}};
 });
}
module.exports={previewQuotaBatch,commitQuotaBatch};
