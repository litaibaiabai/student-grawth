const {fail,collectionCutoff}=require('./reportCorePolicy');
const {isV2}=require('./reportCoreV2Policy');
const phases=['COLLECTING','RECONCILING','FROZEN','ARCHIVED'];
function assertV2Phase(term,{action,actor,submittedAt,now=new Date()}) {
  if(!isV2(term.evaluation_config))return;
  if(action==='v2-phase-change' && actor.role==='manager')return;
  // Account security and term administration do not alter frozen evaluations.
  if(actor.role==='manager' && ['admin-account-status','admin-account-password','admin-term-create','admin-term-current'].includes(action))return;
  if(!['COLLECTING','RECONCILING'].includes(term.business_phase))fail(423,'学期已冻结，仅可走受控更正');
  const correction=/decision|revoke|reverse|settle|confirm|import|comment|work-result|worker|review|library|classic/.test(action);
  if(term.business_phase==='RECONCILING' && (actor.role==='student' || !correction))fail(423,'采集已截止，当前仅可核对与更正');
  if(now>=collectionCutoff(term) && (actor.role==='student' || ['direct-score','redeem-card','generate-cards'].includes(action)))fail(423,'采集已截止');
  if(submittedAt && new Date(submittedAt)>=collectionCutoff(term))fail(423,'该材料不在有效提交期限内');
}
async function changePhase({pool,actor,termId,phase,reason,expectedDataRevision,command}) {
  if(actor.role!=='manager')fail(403,'仅管理员变更学期阶段');
  if(!phases.includes(phase) || typeof reason!=='string' || !reason.trim())fail(422,'阶段与原因必需');
  return require('./reportCoreStore').withMutation({pool,actor,termId,command,action:'v2-phase-change',termLock:'exclusive'},async(c,term)=>{
    if(!isV2(term.evaluation_config))fail(422,'请选择V2学期');
    if(String(term.data_revision)!==String(expectedDataRevision))fail(409,'数据版本已变化');
    const allowed={COLLECTING:['RECONCILING'],RECONCILING:['FROZEN'],FROZEN:['RECONCILING','ARCHIVED'],ARCHIVED:[]};
    if(!allowed[term.business_phase]?.includes(phase))fail(422,'阶段转换不合法');
    if(phase==='FROZEN')fail(422,'冻结必须通过完整的报告发布预检');
    await c.query('UPDATE academic_year SET business_phase=?,data_revision=data_revision+1 WHERE school_id=? AND id=?',[phase,actor.schoolId,termId]);
    return {result:{phase,reason:reason.trim()}};
  });
}
module.exports={assertV2Phase,changePhase,phases};
