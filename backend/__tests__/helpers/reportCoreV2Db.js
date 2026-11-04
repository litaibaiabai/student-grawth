const {createCoreTestDb}=require('./reportCoreDb');
const {createV2Config}=require('../../services/core/reportCoreV2Policy');
const {stableHash}=require('../../services/core/reportCorePolicy');
async function createV2TestDb(t,overrides={}) {
  const db=await createCoreTestDb(t);await db.seedBase();
  await db.pool.query("UPDATE teacher_teaching_assignment SET is_head_teacher=0 WHERE subject_code<>'MORAL'");
  await require('../../scripts/migrateSixEducationV2').migrateSixEducationV2({connection:db.pool,targetDb:db.name,mode:'apply'});
  await db.pool.query("UPDATE academic_year SET evaluation_config=?,template_version='CORE_V2',rule_version='V2_1'",[JSON.stringify({...createV2Config(),...overrides})]);
  await db.pool.query("UPDATE student_term_evaluation SET template_version='CORE_V2',rule_version='V2_1',section_meta=?",[JSON.stringify({enrollment:{status:'ACTIVE'}})]);
  return {...db,actors:Object.fromEntries([['manager','1'],['teacher','2'],['student','3'],['other','4']].map(([role,id])=>[role,{id,role:role==='other'?'student':role,schoolId:'1',tokenVersion:1}]))};
}
const command=(requestKey,data={})=>({requestKey,payloadHash:stableHash({requestKey,data})});
module.exports={createV2TestDb,command};
