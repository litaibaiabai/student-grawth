const {migrateSixEducationV2}=require('./migrateSixEducationV2');
const {createV2Config,isV2}=require('../services/reportCoreV2Policy');
const {parse}=require('../services/reportCoreStore');

async function upgradeScoreInputV2({connection,targetDb,apply=false}){
 const preflight=await migrateSixEducationV2({connection,targetDb});
 if(preflight.conflicts.some(c=>c.kind!=='DUPLICATE_HEAD'))throw Error('数据库结构冲突，停止升级');
 const [heads]=await connection.query('SELECT school_id,term_id,grade,class_no,COUNT(*) n,COUNT(DISTINCT teacher_id) teachers,MIN(id) keepId FROM teacher_teaching_assignment WHERE enabled=1 AND is_head_teacher=1 GROUP BY school_id,term_id,grade,class_no HAVING COUNT(*)>1');
 if(heads.some(h=>Number(h.teachers)!==1))throw Error('班主任属于不同教师，需要先明确唯一班主任');
 const [terms]=await connection.query('SELECT * FROM academic_year');
 if(terms.some(t=>t.release_status!=='IDLE'))throw Error('报告正在发布准备中，暂停升级');
 if(!apply)return {schema:preflight,duplicateHeadGroups:heads.length,terms:terms.map(t=>({id:String(t.id),needsUpgrade:!isV2(parse(t.evaluation_config))}))};
 // Multiple subject assignments for the same teacher represent one class-head role.
 for(const h of heads)await connection.query('UPDATE teacher_teaching_assignment SET is_head_teacher=0 WHERE school_id=? AND term_id=? AND grade=? AND class_no=? AND enabled=1 AND is_head_teacher=1 AND id<>?',[h.school_id,h.term_id,h.grade,h.class_no,h.keepId]);
 const schema=await migrateSixEducationV2({connection,targetDb,mode:'apply'});
 const upgraded=[];
 await connection.beginTransaction();
 try{
  for(const t of terms){
   const old=parse(t.evaluation_config);if(isV2(old))continue;
   const config={...old,...createV2Config(),allowedGrades:old.allowedGrades||['A','B','C','D']};
   await connection.query("UPDATE academic_year SET evaluation_config=?,template_version='CORE_V2',rule_version='V2_1',config_version=CAST(config_version AS UNSIGNED)+1,data_revision=data_revision+1 WHERE id=? AND school_id=?",[JSON.stringify(config),t.id,t.school_id]);
   await connection.query("UPDATE student_term_evaluation SET template_version='CORE_V2',rule_version='V2_1',status='DRAFT',confirmed_revision=NULL,approval_fingerprint=NULL,revision=revision+1 WHERE school_id=? AND term_id=?",[t.school_id,t.id]);
   upgraded.push(String(t.id));
  }
  await connection.commit();
 }catch(e){await connection.rollback();throw e;}
 return {ready:schema.ready,applied:schema.applied.length,upgradedTerms:upgraded,normalizedHeadGroups:heads.length};
}
module.exports={upgradeScoreInputV2};
if(require.main===module){
 const {dbConfig}=require('../db');
 const targetDb=process.env.REPORT_DB_NAME;
 require('mysql2/promise').createConnection(dbConfig()).then(async connection=>{try{console.log(JSON.stringify(await upgradeScoreInputV2({connection,targetDb,apply:process.argv.includes('--apply')}),null,2));}finally{await connection.end();}}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
