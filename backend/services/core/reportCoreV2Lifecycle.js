const {fail,collectionCutoff}=require('./reportCorePolicy');
const {isV2}=require('./reportCoreV2Policy');
function assertV2Phase(term,{action,actor,submittedAt,now=new Date()}) {
  if(!isV2(term.evaluation_config))return;
  if(['quota','card-plan','generate-cards','void-card','quota-batch-preview','quota-batch-commit','course-card-settings'].includes(action)&&term.evaluation_config.semesterCards&&term.evaluation_config.semesterCards.status!=='DRAFT')fail(423,'学期卡片已初始化，不允许增发、重置或删除');
  if(!['COLLECTING','RECONCILING'].includes(term.business_phase))fail(423,'学期已冻结，仅可走受控更正');
  const correction=/decision|revoke|reverse|settle|confirm|import|comment|work-result|worker|review|library|classic/.test(action);
  if(term.business_phase==='RECONCILING' && (actor.role==='student' || !correction))fail(423,'采集已截止，当前仅可核对与更正');
  if(now>=collectionCutoff(term) && (actor.role==='student' || ['direct-score','redeem-card','generate-cards'].includes(action)))fail(423,'采集已截止');
  if(submittedAt && new Date(submittedAt)>=collectionCutoff(term))fail(423,'该材料不在有效提交期限内');
}
module.exports={assertV2Phase};
