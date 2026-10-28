const {test,after}=require('node:test');const assert=require('node:assert/strict');const {pool}=require('../db');
const honor=require('../controllers/honorController'),story=require('../controllers/storyController'),evaluation=require('../controllers/evaluationController'),score=require('../controllers/scoreController'),report=require('../controllers/reportController');
const imports=require('../controllers/importController');
const originalQuery=pool.query,originalGet=pool.getConnection;
const user={id:3,schoolId:1,role:'teacher',classes:[{grade:4,class_no:2}]};
function res(){return {statusCode:200,status(n){this.statusCode=n;return this},json(x){this.data=x;return this}}}
async function invoke(fn,req){const r=res();let error;await fn({params:{},query:{},body:{},...req},r,e=>{error=e});return {r,error,status:error?.statusCode||error?.code||r.statusCode};}
async function fixture(fn){let writes=[];const query=async(sql,p)=>{if(/^\s*(UPDATE|INSERT)/i.test(sql))writes.push(sql);
if(sql.includes('FROM users'))return [[{id:11,role:'student',school_id:1,status:0,grade:4,class_no:1}]];
if(sql.includes('FROM honor_record'))return [[{id:1,school_id:1,student_id:11,status:'PENDING',honor_points:6}]];
if(sql.includes('FROM story_submission'))return [[{id:1,school_id:1,student_id:11,status:'SUBMITTED',current_version:2,teacher_score:null}]];
if(sql.includes('FROM score_record'))return [[{id:21,school_id:2,student_id:93,delta:1}]];
return [[]];};pool.query=query;pool.getConnection=async()=>({query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});try{await fn(writes)}finally{pool.query=originalQuery;pool.getConnection=originalGet;}}
for(const [name,fn,req] of [
 ['教师跨班Excel确认被拒绝',imports.commitBatchImport,{body:{type:'SUBJECT',validStudents:[{studentId:11,scores:[{subjectCode:'CHINESE',score:90}]}]}}],
 ['管理员跨校JSON导入被拒绝',imports.commitImport,{user:{...user,schoolId:2,role:'manager'},body:{type:'SUBJECT',items:[{studentId:11,subjectCode:'CHINESE',score:90}]}}],
 ['跨班荣誉审核被拒绝',honor.reviewHonor,{params:{id:1},body:{decision:'APPROVED'}}],
 ['跨班故事审核被拒绝',story.reviewStory,{params:{id:1},body:{teacherScore:88.5}}],
 ['跨校荣誉审核被拒绝',honor.reviewHonor,{user:{...user,schoolId:2,role:'manager'},params:{id:1},body:{decision:'APPROVED'}}],
 ['跨校故事审核被拒绝',story.reviewStory,{user:{...user,schoolId:2,role:'manager'},params:{id:1},body:{teacherScore:88.5}}],
 ['教师跨班综合分读取被拒绝',evaluation.getComprehensiveScore,{query:{studentId:11}}],
 ['教师跨班账本读取被拒绝',score.getStudentScores,{query:{studentId:11}}],
 ['教师跨班报告读取被拒绝',report.getCurrentReport,{query:{studentId:11}}],
 ['管理员不得冲销异校流水',score.reverseScore,{user:{...user,role:'manager'},body:{originalScoreId:21,reason:'invalid'}}]
])test(name,()=>fixture(async writes=>{const result=await invoke(fn,{user,...req});assert.equal(result.status,403);assert.equal(writes.length,0)}));
test('已终审故事不得被学生重新提交覆盖',()=>fixture(async()=>{pool.getConnection=async()=>({query:async(sql)=>{if(sql.includes('academic_year'))return [[{id:1}]];if(sql.includes('FROM story_submission'))return [[{id:1,current_version:2,status:'REVIEWED'}]];return [{insertId:2}]},beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});const result=await invoke(story.submitStory,{user:{id:11,schoolId:1,role:'student'},body:{content:'不能篡改已终审内容',monthKey:'2026-10'}});assert.equal(result.status,409)}));
test('六维全0仍返回均分0并携带实际规则版本',async()=>{pool.query=async sql=>sql.includes('comprehensive_score_rule')?[[{rule_version:'DEMO_V1',six_weight:.8,process_weight:.15,honor_weight:.05,process_target:20,honor_target:12}]]:sql.includes('student_dimension_score')?[[...'DZ TMLG'.replaceAll(' ','')].map(d=>({dimension_code:d,score:0}))]:sql.includes('story_submission')?[[]]:[[{total_process:0,total_honor:0}]];try{const x=await require('../services/evaluationEngine').computeStudentScore(11,1,1);assert.equal(x.sixAverage,0);assert.equal(x.comprehensiveScore,0);assert.equal(x.ruleVersion,'DEMO_V1')}finally{pool.query=originalQuery}});
test('过程与荣誉超过目标时分别封顶100',async()=>{pool.query=async sql=>sql.includes('comprehensive_score_rule')?[[{rule_version:'CAP',six_weight:.8,process_weight:.15,honor_weight:.05,process_target:20,honor_target:12}]]:sql.includes('student_dimension_score')?[[...'DZTMLG'].map(d=>({dimension_code:d,score:100}))]:sql.includes('story_submission')?[[]]:[[{total_process:40,total_honor:24}]];try{const x=await require('../services/evaluationEngine').computeStudentScore(11,1,1);assert.equal(x.process.scaledScore,100);assert.equal(x.honor.scaledScore,100);assert.equal(x.comprehensiveScore,100)}finally{pool.query=originalQuery}});
after(()=>pool.end());
