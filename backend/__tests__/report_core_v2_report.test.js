const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createV2Config,catalog}=require('../services/reportCoreV2Policy');
const {buildReportModel,reportFingerprint}=require('../services/reportCoreEvaluation');
const {renderPrintableA4}=require('../services/reportRenderService');

function fixture(){
 const config=createV2Config();
 const evaluation={student_id:3,student_name_snapshot:'林小禾',grade_snapshot:4,class_no_snapshot:1,revision:1,
  teacher_comment:'认真学习 <script>alert(1)</script>',story_summary:JSON.stringify({WRITE:{rank:1,value:2},LISTEN:{rank:2,value:1},TELL:{rank:null,value:null}}),
  honor_summary:JSON.stringify({items:[{name:'阅读小达人',region:'区级',level:'一等奖',points:2}]}),field_sources:JSON.stringify({fitness_self_star:{notApplicable:true,reason:'免测'}})};
 for(const f of catalog.fields.filter(f=>!f.jsonPath))evaluation[f.column]=f.valueType==='star'?2:f.valueType==='grade'?'A':f.valueType==='number'?12:'5.0';
 evaluation.jump_rope_1min=0;
 evaluation.gender='女';
 evaluation.height_cm='142.0';evaluation.weight_kg='34.5';
 return {config,evaluation};
}
test('V2 DTO contains the current 94 positions, story summaries and zero without obsolete V1 text',()=>{
 const {config,evaluation}=fixture(),m=buildReportModel({evaluation,config});
 assert.equal(m.schemaVersion,'CORE_V2');assert.equal(m.displayFieldCount,94);
 assert.equal(m.values.math_regular_grade,'A');assert.equal(m.values.jump_rope_1min,0);
 assert.equal(m.values.story_summary.WRITE.value,2);assert.equal(m.values.bmi,17.11);
 assert.equal(m.values.bmi_label,'正常');
 assert.equal(m.values.bmi_standard,'WS_T_2018');
 assert.equal(m.honors[0].name,'阅读小达人');assert.equal(m.honors[0].region,'区级');assert.ok(!Object.hasOwn(m.narratives,'self_conduct_text'));
 const term={evaluation_config:config,template_version:'CORE_V2',rule_version:'V2_1',config_version:1};
 assert.notEqual(reportFingerprint(evaluation,term),reportFingerprint({...evaluation,math_regular_grade:'B'},term));
});
test('V2 printable detail renders each catalog position exactly once and protects private narratives',()=>{
 const {config,evaluation}=fixture(),m=buildReportModel({evaluation,config});m.term={academicYear:'2026-2027',semester:1};
 const html=renderPrintableA4({reportData:m,renderScope:'DETAIL_ONLY'});
 assert.match(html,/data-report-schema="CORE_V2"/);assert.match(html,/size:A3 landscape/);
 assert.equal((html.match(/data-view=/g)||[]).length,94);
 for(const f of catalog.fields)assert.equal(html.split(`data-view="${f.viewCode}"`).length-1,1,f.viewCode);
 assert.match(html,/data-view="JUMP_ROPE_1MIN"[^>]*>0/);
 assert.match(html,/不适用/);assert.ok(!html.includes('alert(1)'));assert.ok(!html.includes('阅读小达人'));
});
test('V2 full report escapes text and continues long comments and honor lists without losing text',()=>{
 const {config,evaluation}=fixture();evaluation.teacher_comment='成长记录🌱'.repeat(1800)+'结尾标记';
 evaluation.honor_summary={items:Array.from({length:100},(_,i)=>({name:`第${i+1}项荣誉`,level:'校级',points:1}))};
 const m=buildReportModel({evaluation,config});m.term={academicYear:'2026-2027',semester:1};
 const html=renderPrintableA4({reportData:m});
 assert.match(html,/report-continuation/);assert.match(html,/结尾标记/);assert.match(html,/第100项荣誉/);
 assert.ok((html.match(/data-print-page/g)||[]).length>2);assert.match(html,/林小禾/);
 evaluation.teacher_comment='<script>alert(1)</script>';const escaped=renderPrintableA4({reportData:buildReportModel({evaluation,config})});
 assert.ok(!escaped.includes('<script>'));assert.match(escaped,/&lt;script&gt;/);
});

test('V2 publication freezes the current DTO and safe detail with the V2 schema',async t=>{
 const {createV2TestDb,command}=require('./helpers/reportCoreV2Db'),db=await createV2TestDb(t);
 // Focused renderer integration fixture, not the business-flow acceptance seed.
 const {evaluation}=fixture(),keys=catalog.fields.filter(f=>!f.jsonPath).map(f=>f.column);
 const sources=Object.fromEntries(catalog.fields.filter(f=>f.sourceType==='CARD').map(f=>[f.column,{settled:true}]));
 await db.pool.query(`UPDATE student_term_evaluation SET ${keys.map(k=>'`'+k+'`=?').join(',')},teacher_comment=?,story_summary=?,field_sources=?`,[...keys.map(k=>evaluation[k]),'PRIVATE_COMMENT',evaluation.story_summary,JSON.stringify(sources)]);
 const browser=require('../services/reportCoreReportBrowser'),review=require('../services/reportCoreEvaluation'),publish=require('../services/reportCorePublish');
 for(const studentId of ['3','4']){
  const studentKey={schoolId:'1',termId:'1',studentId};
  const report=await browser.getReportDetail({pool:db.pool,actor:db.actors.teacher,studentKey,scope:'full'});
  assert.deepEqual(report.missingItems,[]);
  await review.confirmReport({pool:db.pool,actor:db.actors.teacher,studentKey,expectedRevision:report.revision,expectedFingerprint:report.fingerprint,
   layoutReview:{documentKey:report.documentKey,renderScope:'FULL',overflow:false,fingerprint:report.fingerprint,templateVersion:report.templateVersion},command:command('v2-confirm-'+studentId)});
 }
 await assert.rejects(publish.beginRelease({pool:db.pool,actor:db.actors.manager,termId:'1',command:command('v2-still-collecting')}),{statusCode:422});
 await db.pool.query("UPDATE academic_year SET business_phase='RECONCILING'");
 const args={pool:db.pool,actor:db.actors.manager,termId:'1'},batch=await publish.beginRelease({...args,command:command('v2-release')});
 await publish.prepareReleaseChunk({...args,...batch});await publish.activateRelease({...args,...batch,command:command('v2-activate')});
 assert.equal((await db.pool.query('SELECT business_phase FROM academic_year'))[0][0].business_phase,'FROZEN');
 const [[row]]=await db.pool.query('SELECT schema_version FROM term_report LIMIT 1');assert.equal(row.schema_version,'CORE_V2');
 const first=await publish.getPublishedReport({pool:db.pool,actor:db.actors.student,termId:'1'});
 assert.equal(first.snapshot.releaseVersion,1);assert.match(first.html,/发布版本 1/);
 assert.equal(first.snapshot.schemaVersion,'CORE_V2');assert.equal(first.snapshot.values.math_regular_grade,'A');
 assert.equal((first.html.match(/data-view=/g)||[]).length,94);
 await db.pool.query("UPDATE student_term_evaluation SET math_regular_grade='B',teacher_comment='CURRENT_ONLY'");
 const frozen=await publish.getPublishedReport({pool:db.pool,actor:db.actors.student,termId:'1'});assert.equal(frozen.html,first.html);
 const detail=await browser.getReportDetail({pool:db.pool,actor:db.actors.teacher,studentKey:{schoolId:'1',termId:'1',studentId:'3'},version:'published',scope:'detail'});
 assert.equal(detail.model.schemaVersion,'CORE_V2');assert.equal(detail.model.values.math_regular_grade,'A');assert.ok(!JSON.stringify(detail).includes('PRIVATE_COMMENT'));
});
