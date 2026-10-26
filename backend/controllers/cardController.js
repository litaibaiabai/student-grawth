/** Direction-only physical cards; classification is selected when approving. */
const crypto=require('crypto');
const {pool}=require('../db');
const {success,fail}=require('../utils/response');
const {AppError}=require('../middleware/errorHandler');
const {ErrorCodes}=require('../constants/errorCodes');
const {DIMENSION_NAMES,schoolTimestamp,validateMonth}=require('../services/cardRules');
const {tokenHash}=require('../services/cardCredentials');
const {json}=require('../services/cardAllocationService');
const {retiredCardEndpoint}=require('./cardPolicyController');

function requestKey(value){
  if(value===undefined||value===null||value==='') return crypto.randomUUID();
  if(typeof value!=='string'||value.length>64) throw new AppError(422,'请求标识无效',422);
  return value;
}
function usable(card,req){
  if(!card) throw new AppError(404,'未找到该实体卡',404);
  if(Number(card.school_id)!==Number(req.user.schoolId)) throw new AppError(403,'该卡片不属于本校',403);
  if(Number(card.is_legacy_test)!==0||!card.allocation_id) throw new AppError(410,'该卡片为旧测试卡，不能用于正式申领',410);
}
function canClaim(card){
  if(card.status==='USED') throw new AppError(ErrorCodes.CARD_USED,'该卡已审核入账，不能再次申领',409);
  if(card.status==='PENDING') throw new AppError(ErrorCodes.CARD_PENDING,'该卡正在审核中，请勿重复申领',409);
  if(card.status==='VOID') throw new AppError(ErrorCodes.CARD_VOID,'该卡已作废',409);
  const now=schoolTimestamp();
  if(card.status==='EXPIRED'||now>card.effective_valid_until) throw new AppError(ErrorCodes.CARD_EXPIRED,'该卡已超过申领截止时间',400);
  if(card.status!=='UNUSED'||now<card.valid_from_local) throw new AppError(ErrorCodes.TERM_CLOSED,'该卡尚未到可申领时间',400);
}
const cardProjection=`c.*,u.real_name AS teacher_name,
 DATE_FORMAT(c.valid_from,'%Y-%m-%d %H:%i:%s') AS valid_from_local,
 DATE_FORMAT(LEAST(c.valid_until,COALESCE(t.review_deadline_at,c.valid_until)),'%Y-%m-%d %H:%i:%s') AS effective_valid_until,
 DATE_FORMAT(LEAST(COALESCE(c.review_deadline_at,c.valid_until),COALESCE(t.review_deadline_at,c.review_deadline_at,c.valid_until)),'%Y-%m-%d %H:%i:%s') AS effective_review_deadline`;
async function findCard(conn,hash,lock=false){
  const [[card]]=await conn.query(`SELECT ${cardProjection} FROM reward_card c JOIN users u ON c.teacher_id=u.id JOIN academic_year t ON c.term_id=t.id WHERE c.token_hash=? ${lock?'FOR UPDATE':''}`,[hash]);
  return card;
}
function previewDTO(card){
  return {cardId:Number(card.id),monthKey:card.month_key,serialNo:Number(card.serial_no),dimensionCode:card.dimension_code,dimensionName:DIMENSION_NAMES[card.dimension_code],teacherName:card.teacher_name,categoryId:null,categoryCode:null,categoryName:null,points:1,status:card.status,validFrom:card.valid_from_local,validUntil:card.effective_valid_until,reviewDeadline:card.effective_review_deadline};
}
async function previewCard(req,res,next){
  try{
    const token=req.body?.token;
    if(typeof token!=='string'||!token.trim()||token.length>256) throw new AppError(422,'请提供卡片扫码凭证',422);
    const card=await findCard(pool,tokenHash(token.trim()));usable(card,req);canClaim(card);
    success(res,previewDTO(card));
  }catch(e){next(e);}
}
async function claimCard(req,res,next){
  let c;
  try{
    const token=req.body?.token;
    if(typeof token!=='string'||!token.trim()||token.length>256) throw new AppError(422,'请提供卡片扫码凭证',422);
    const key=requestKey(req.body.requestKey);
    c=await pool.getConnection();await c.beginTransaction();
    const card=await findCard(c,tokenHash(token.trim()),true);usable(card,req);
    const [[previous]]=await c.query('SELECT id,card_id,student_id,status FROM card_claim WHERE request_key=?',[key]);
    if(previous){
      if(Number(previous.card_id)!==Number(card.id)||Number(previous.student_id)!==Number(req.user.id)) throw new AppError(409,'该请求标识已用于其他申领',409);
      await c.commit();return success(res,{claimId:Number(previous.id),cardId:Number(card.id),status:previous.status,pointsCredited:0,replayed:true});
    }
    canClaim(card);
    const [created]=await c.query("INSERT INTO card_claim(school_id,card_id,student_id,status,request_key) VALUES (?,?,?,'PENDING',?)",[req.user.schoolId,card.id,req.user.id,key]);
    await c.query("UPDATE reward_card SET status='PENDING' WHERE id=?",[card.id]);
    await c.commit();success(res,{claimId:created.insertId,cardId:Number(card.id),status:'PENDING',cardStatus:'PENDING',dimensionCode:card.dimension_code,categoryId:null,pointsPending:1,pointsCredited:0},'申领已提交，等待教师选择奖励分类并审核');
  }catch(e){if(c) await c.rollback();if(e.code==='ER_DUP_ENTRY') return fail(res,ErrorCodes.DUPLICATE_REQUEST,'该卡已进入申领流程，请刷新查看',409);next(e);}
  finally{if(c)c.release();}
}
async function getCards(req,res,next){
  try{
    const {monthKey,status}=req.query||{};
    if(monthKey)validateMonth(monthKey);
    const params=[req.user.schoolId];let where='c.school_id=? AND c.is_legacy_test=0 AND c.allocation_id IS NOT NULL';
    const teacherId=req.user.role==='teacher'?req.user.id:req.query.teacherId;
    if(teacherId){where+=' AND c.teacher_id=?';params.push(teacherId);}
    if(monthKey){where+=' AND c.month_key=?';params.push(monthKey);}
    if(status){where+=' AND c.status=?';params.push(status);}
    const [rows]=await pool.query(`SELECT c.id,c.teacher_id,c.month_key,c.serial_no,c.status,c.created_at,c.dimension_code,u.real_name teacher_name,s.real_name used_student_name FROM reward_card c JOIN users u ON c.teacher_id=u.id LEFT JOIN users s ON s.id=c.used_student_id WHERE ${where} ORDER BY c.id DESC LIMIT 500`,params);
    success(res,rows.map(r=>({...r,dimension_name:DIMENSION_NAMES[r.dimension_code]})));
  }catch(e){next(e);}
}
async function getTeacherClaims(req,res,next){
  try{
    const {status='PENDING'}=req.query||{};
    const params=[req.user.schoolId];let where='c.school_id=? AND cl.school_id=c.school_id AND c.is_legacy_test=0';
    if(req.user.role==='teacher'){where+=' AND c.teacher_id=?';params.push(req.user.id);}
    if(status){where+=' AND cl.status=?';params.push(status);}
    const [rows]=await pool.query(`SELECT cl.id claim_id,cl.status claim_status,cl.claimed_at,cl.claimed_at claim_time,cl.category_id,cl.category_path_json,cl.review_remark,c.id card_id,c.teacher_id,c.month_key,c.serial_no,c.dimension_code,a.category_version,cat.category_name,cat.category_code,u.id student_id,u.real_name student_name,u.grade,u.class_no FROM card_claim cl JOIN reward_card c ON cl.card_id=c.id JOIN card_allocation a ON c.allocation_id=a.id LEFT JOIN edu_evaluation_category cat ON cl.category_id=cat.id JOIN users u ON cl.student_id=u.id WHERE ${where} ORDER BY cl.id DESC LIMIT 500`,params);
    success(res,rows.map(r=>({...r,dimension_name:DIMENSION_NAMES[r.dimension_code],categoryPath:json(r.category_path_json,null)})));
  }catch(e){next(e);}
}
async function validatedCategory(c,categoryId,dimension,version){
  if(!Number.isSafeInteger(Number(categoryId))||Number(categoryId)<=0) throw new AppError(422,'审核通过前请选择完整的一级子类和二级子类',422);
  const [[row]]=await c.query(`SELECT leaf.id,leaf.category_code,leaf.category_name,leaf.category_level,leaf.score,leaf.status,leaf.version,
    p.id parent_id,p.category_code parent_code,p.category_name parent_name,p.category_level parent_level,p.status parent_status,p.version parent_version,
    root.id root_id,root.category_code root_code,root.category_name root_name,root.category_level root_level,root.status root_status,root.version root_version
    FROM edu_evaluation_category leaf JOIN edu_evaluation_category p ON leaf.parent_id=p.id JOIN edu_evaluation_category root ON p.parent_id=root.id WHERE leaf.id=?`,[Number(categoryId)]);
  if(!row||Number(row.category_level)!==3||Number(row.parent_level)!==2||Number(row.root_level)!==1||Number(row.score)!==1||Number(row.status)!==1||Number(row.parent_status)!==1||Number(row.root_status)!==1||row.root_code!==dimension||row.version!==version||row.parent_version!==version||row.root_version!==version) throw new AppError(422,'所选分类已失效、层级不完整或不属于本卡方向与版本，请重新选择',422);
  return [{id:Number(row.root_id),code:row.root_code,name:row.root_name},{id:Number(row.parent_id),code:row.parent_code,name:row.parent_name},{id:Number(row.id),code:row.category_code,name:row.category_name}];
}
async function decideClaim(req,res,next){
  let c;
  try{
    let decision=String(req.body?.decision||'').toUpperCase();
    if(['APPROVED','PASS','通过'].includes(decision))decision='APPROVE';
    if(['REJECTED','REFUSE','驳回'].includes(decision))decision='REJECT';
    if(!['APPROVE','REJECT'].includes(decision))throw new AppError(422,'请选择通过或驳回',422);
    const key=requestKey(req.body.requestKey);
    c=await pool.getConnection();await c.beginTransaction();
    const [[claim]]=await c.query(`SELECT cl.*,c.status card_status,c.teacher_id,c.term_id,c.dimension_code,c.school_id card_school_id,c.is_legacy_test,c.allocation_id,
      a.category_version allocation_category_version,u.grade,u.class_no,
      DATE_FORMAT(LEAST(COALESCE(c.review_deadline_at,c.valid_until),COALESCE(t.review_deadline_at,c.review_deadline_at,c.valid_until)),'%Y-%m-%d %H:%i:%s') effective_review_deadline
      FROM card_claim cl JOIN reward_card c ON cl.card_id=c.id JOIN card_allocation a ON c.allocation_id=a.id JOIN academic_year t ON c.term_id=t.id JOIN users u ON cl.student_id=u.id
      WHERE cl.id=? FOR UPDATE`,[req.params.id]);
    if(!claim)throw new AppError(404,'未找到待审核申请',404);
    if(Number(claim.card_school_id)!==Number(req.user.schoolId)||Number(claim.school_id)!==Number(req.user.schoolId)||(req.user.role!=='manager'&&Number(claim.teacher_id)!==Number(req.user.id))) throw new AppError(403,'只能审核本校本人名下卡片，或由本校管理员接管',403);
    if(Number(claim.is_legacy_test)!==0)throw new AppError(410,'旧测试申请不进入正式审核',410);
    if(claim.status!=='PENDING'){
      const [[score]]=await c.query('SELECT id,request_key,category_id FROM score_record WHERE card_claim_id=?',[claim.id]);
      if(claim.status==='APPROVED'&&decision==='APPROVE'&&score?.request_key===key&&Number(score.category_id)===Number(req.body.categoryId)){
        await c.commit();return success(res,{claimId:Number(claim.id),decision,claimStatus:'APPROVED',status:'APPROVED',cardStatus:'USED',scoreRecordId:Number(score.id),delta:1,replayed:true});
      }
      throw new AppError(ErrorCodes.CLAIM_NOT_PENDING,'该申请已处理，请刷新查看结果',400);
    }
    if(claim.card_status!=='PENDING')throw new AppError(409,'卡片当前状态不允许审核',409);
    const now=schoolTimestamp();
    if(now>claim.effective_review_deadline)throw new AppError(ErrorCodes.REVIEW_TIMEOUT,'已超过该申请的最终审核截止时间',400);
    let scoreRecordId=null,path=null;
    if(decision==='APPROVE'){
      path=await validatedCategory(c,req.body.categoryId,claim.dimension_code,claim.allocation_category_version);
      await c.query("UPDATE card_claim SET status='APPROVED',reviewer_id=?,reviewed_at=?,category_id=?,category_version=?,category_path_json=?,review_remark=? WHERE id=?",[req.user.id,now,Number(req.body.categoryId),claim.allocation_category_version,JSON.stringify(path),String(req.body.remark||'').slice(0,500)||null,claim.id]);
      await c.query("UPDATE reward_card SET status='USED',used_student_id=?,used_at=? WHERE id=?",[claim.student_id,now,claim.card_id]);
      const [score]=await c.query("INSERT INTO score_record(school_id,term_id,student_id,class_snapshot,dimension_code,category_id,source,delta,card_claim_id,operator_id,request_key) VALUES (?,?,?,?,?,?,'B_CARD',1,?,?,?)",[req.user.schoolId,claim.term_id,claim.student_id,JSON.stringify({grade:claim.grade,class_no:claim.class_no}),claim.dimension_code,Number(req.body.categoryId),claim.id,req.user.id,key]);scoreRecordId=score.insertId;
    }else{
      await c.query("UPDATE card_claim SET status='REJECTED',reviewer_id=?,reviewed_at=?,reject_reason=? WHERE id=?",[req.user.id,now,String(req.body.rejectReason||'未通过教师审核').slice(0,500),claim.id]);
      await c.query("UPDATE reward_card SET status='VOID' WHERE id=?",[claim.card_id]);
    }
    await c.query('INSERT INTO operation_audit(school_id,actor_user_id,actor_role,target_type,target_id,action,request_id,new_summary) VALUES (?,?,?,?,?,?,?,?)',[req.user.schoolId,req.user.id,req.user.role,'CARD_CLAIM',claim.id,decision==='APPROVE'?'CLAIM_APPROVE':'CLAIM_REJECT',key,JSON.stringify({scoreRecordId,delta:decision==='APPROVE'?1:0,categoryPath:path,remark:String(req.body.remark||'').slice(0,500)})]);
    await c.commit();success(res,{claimId:Number(claim.id),decision,claimStatus:decision==='APPROVE'?'APPROVED':'REJECTED',status:decision==='APPROVE'?'APPROVED':'REJECTED',cardStatus:decision==='APPROVE'?'USED':'VOID',scoreRecordId,delta:decision==='APPROVE'?1:0,creditedAt:now},decision==='APPROVE'?'审核通过，已按所选分类加1分':'申请已驳回，卡片已作废');
  }catch(e){if(c)await c.rollback();if(e.code==='ER_DUP_ENTRY')return fail(res,409,'该审核请求已处理，请刷新结果',409);next(e);}
  finally{if(c)c.release();}
}
function retiredPreview(req,res){return fail(res,410,'扫码预览已改为POST，请重新打开最新版领取页面',410);}
module.exports={setCardQuota:retiredCardEndpoint,getCardQuotas:retiredCardEndpoint,generateMonthCards:retiredCardEndpoint,getCards,previewCard,claimCard,getTeacherClaims,decideClaim,retiredPreview};
