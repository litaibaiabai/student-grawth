const {withMutation,parse,addSource}=require('./reportCoreStore');
const {fail,stableHash}=require('./reportCorePolicy');
const {honorLevel}=require('./reportCoreV2Policy');
const {assertScope}=require('./authorizationService');
const {normalizeAwardFacts,validateAwardFacts}=require('./reportCoreAwardFacts');
async function recognizeCertificate({pool,actor,source,expectedRevision,facts,reason,command,reject=false,revoke=false}) {
  if(!['teacher','student'].includes(actor.role))fail(403,'无奖状审核职责');
  if(reason!==undefined && typeof reason!=='string')fail(422,'评审备注格式不合法');
  reason=(reason||'').trim();
  if(reason.length>1000)fail(422,'评审备注最多1000字');
  if((reject||revoke)&&!reason)fail(422,'不予认定或撤回原因必需');
  return withMutation({pool,actor,termId:source.term_id,studentIds:[source.student_id],command,action:revoke?'award-revoke':'award-decision'},async(c)=>{
    const [[row]]=await c.query('SELECT * FROM evaluation_source_record WHERE school_id=? AND id=? FOR UPDATE',[actor.schoolId,source.id]);
    const p=parse(row.payload_json),scope=await assertScope({actor,studentKey:{schoolId:actor.schoolId,termId:row.term_id,studentId:row.student_id},action:actor.role==='student'?'material':'award'},c);
    if(expectedRevision!==undefined && String(row.revision)!==String(expectedRevision))fail(409,'奖状版本已变化');
    if(actor.role==='student') {
      if(!revoke)fail(403,'学生不能审核');
      if(row.status==='APPROVED') {
        await c.query('UPDATE evaluation_source_record SET payload_json=?,revision=revision+1 WHERE id=?',[JSON.stringify({...p,withdrawalRequested:true,withdrawalReason:reason}),row.id]);
        return {result:{requested:true},changedTargetsByStudent:{[row.student_id]:[]}};
      }
    } else if(!scope.head) {
      const allowed=subject=>scope.assignments.some(a=>a.subject_code===subject);
      if(!allowed(normalizeAwardFacts(p.facts).subjectCode) || (!reject&&!revoke&&!allowed(normalizeAwardFacts(facts).subjectCode)))fail(403,'不在获奖学科审核范围');
    }
    if(reject || revoke) {
      if(['REVOKED','REJECTED'].includes(row.status))fail(409,'已处理');
      await c.query('UPDATE evaluation_source_record SET status=?,numeric_value=NULL,effect_key=NULL,revision=revision+1,lease_token=NULL,locked_until=NULL,payload_json=? WHERE id=?',[revoke?'REVOKED':'REJECTED',JSON.stringify({...p,reviewReason:reason,withdrawalRequested:false}),row.id]);
    } else {
      if(actor.role!=='teacher')fail(403,'仅教师认定');
      if(!['QUEUED','PROCESSING','SUBMITTED','FAILED'].includes(row.status))fail(409,'奖状已处理，请刷新后查看');
      const f=validateAwardFacts(facts);
      const level=honorLevel(f.awardRegion);
      const identity=p.fileHash || ['SOURCE',String(row.id)];
      const effect=stableHash(['CERTIFICATE',actor.schoolId,String(row.term_id),String(row.student_id),identity]);
      const [[duplicate]]=await c.query('SELECT id FROM evaluation_source_record WHERE school_id=? AND effect_key=? AND id<>?',[actor.schoolId,effect,row.id]);
      if(duplicate)fail(409,'同一证书已存在，请在原记录上复核');
      await c.query("UPDATE evaluation_source_record SET status='APPROVED',numeric_value=?,effective_at=UTC_TIMESTAMP(6),effect_key=?,payload_json=?,revision=revision+1,lease_token=NULL,locked_until=NULL WHERE id=?",[level.points,effect,JSON.stringify({...p,facts:f,honor:{name:f.title,region:f.awardRegion,level:f.awardLevel,subjectCode:f.subjectCode,points:level.points},reviewerId:actor.id,reviewReason:reason,withdrawalRequested:false}),row.id]);
    }
    await addSource(c,{schoolId:actor.schoolId,termId:row.term_id,studentId:row.student_id,actorId:actor.id,kind:'AUDIT',status:'COMMITTED',parentId:row.id,key:['V2_AWARD_REVIEW',row.id,command.requestKey],payload:{action:revoke?'REVOKE':reject?'REJECT':'APPROVE',reason,previousStatus:row.status,previousFacts:p.facts}});
    return {result:{sourceId:String(row.id),revoked:revoke,rejected:reject},changedTargetsByStudent:{[row.student_id]:['honor_summary']}};
  });
}
module.exports={recognizeCertificate};
