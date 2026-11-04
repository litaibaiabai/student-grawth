const {importRegistryFixture}=require('./registryFixture');
async function publishingFixture(pool,c){
 const args=await importRegistryFixture(pool,c),load=async username=>{const[[u]]=await c.query('SELECT * FROM users WHERE school_id=1 AND username=?',[username]);return{id:String(u.id),schoolId:'1',role:u.role,tokenVersion:u.token_version};};
 const head=await load(args.f.teacher),student=await load(args.f.student),other=await load(args.f.other),studentKey={schoolId:'1',termId:args.termId,studentId:student.id};
 const {importValues,selfValues,processTargets}=require('../../scripts/adminClosureFixtures'),{fixedFields}=require('../../services/core/reportCoreV2Policy');
 const values={...importValues,...selfValues,...Object.fromEntries(processTargets.map(k=>[k,1])),teacher_comment:'仅班主任和学生可见的私有寄语测试',field_sources:JSON.stringify(Object.fromEntries(fixedFields.filter(f=>f.sourceType==='CARD'||f.sourceType==='CERTIFICATE').map(f=>[f.column,{settled:true,noAward:true,raw:0}])))};
 const keys=Object.keys(values);await c.query('UPDATE student_term_evaluation SET '+keys.map(k=>'`'+k+'`=?').join(',')+' WHERE school_id=1 AND term_id=? AND student_id=?',[...keys.map(k=>values[k]),args.termId,student.id]);
 return{...args,head,student,other,studentKey};
}
async function confirmationArgs(args){const draft=await require('../../services/evaluation/reportCoreEvaluation').buildReportDraft({pool:args.pool,actor:args.head,studentKey:args.studentKey});return{pool:args.pool,actor:args.head,studentKey:args.studentKey,expectedRevision:draft.revision,expectedFingerprint:draft.fingerprint,layoutReview:{overflow:false,fingerprint:draft.fingerprint,templateVersion:draft.model.templateVersion,renderScope:'FULL',documentKey:draft.documentKey}};}
module.exports={publishingFixture,confirmationArgs};
