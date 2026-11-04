const {test}=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {createV2TestDb,command}=require('./helpers/reportCoreV2Db');
function workbook(rows,edit) {
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);if(edit)edit(ws);
  XLSX.utils.book_append_sheet(wb,ws,'成绩');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
test('server parses the actual V2 workbook, keeps zero and blocks unknown columns, formulas and oversized rows',()=>{
  const parse=require('../services/imports/reportCoreV2Imports').parseV2Workbook;
  const headers=['学期标识','模板版本','账号','姓名','math_interest_star','math_regular_grade','jump_rope_1min','测量日期','视力制式'];
  const row=['1','SIX_EDU_V2','student','学生3',3,'A',0,'2026-10-20','5_POINT'];
  const args={termId:'1'};
  const rows=parse(workbook([headers,row]),args);
  assert.equal(rows[0].values.jump_rope_1min,0);
  assert.equal(rows[0].values.math_interest_star,3);
  assert.equal(rows[0].values.math_regular_grade,'A');
  assert.equal(rows[0].measurement.date,'2026-10-20');
  assert.throws(()=>parse(workbook([['账号','外星字段'],['student',1]]),args),/表头/);
  assert.throws(()=>parse(workbook([headers,row],ws=>{ws.E2={t:'n',f:'1+2',v:3};}),args),/公式/);
  assert.throws(()=>parse(workbook([headers,...Array.from({length:501},()=>row)]),args),/500/);
  const measurement=require('../services/imports/reportCoreV2Imports').normalizeMeasurement;
  assert.throws(()=>measurement({date:'2026-02-31'},{height_cm:141}),/日期/);
  assert.throws(()=>measurement({date:'2026-10-20'},{vision_left:'5.0'}),/制式/);
});
test('V2 class head imports comprehensive fields atomically, blanks keep prior values and a stale config rejects commit',async t=>{
  const {pool,actors}=await createV2TestDb(t);
  const service=require('../services/imports/reportCoreImports');
  const preview=await service.previewImport({pool,actor:actors.teacher,termId:'1',kind:'ACADEMIC',rows:[{username:'student',real_name:'学生3',values:{conduct_cooperation_other_star:3,math_regular_grade:'A',music_overall_grade:'B',jump_rope_1min:0},measurement:{date:'2026-10-20',visionStandard:'5_POINT'}}],command:command('preview')});
  assert.equal(preview.result.validCount,1);
  await service.commitImport({pool,actor:actors.teacher,batchId:preview.result.batchId,expectedRevision:'1',command:command('commit')});
  const [[e]]=await pool.query('SELECT * FROM student_term_evaluation WHERE student_id=3');
  assert.equal(e.conduct_cooperation_other_star,3);assert.equal(e.math_regular_grade,'A');assert.equal(e.jump_rope_1min,0);
  const next=await service.previewImport({pool,actor:actors.teacher,termId:'1',kind:'ACADEMIC',rows:[{username:'student',values:{math_regular_grade:'  ',music_overall_grade:'A'}}],command:command('preview2')});
  await pool.query("UPDATE academic_year SET config_version='2'");
  await assert.rejects(service.commitImport({pool,actor:actors.teacher,batchId:next.result.batchId,expectedRevision:'1',command:command('stale')}),{statusCode:409});
  assert.equal((await pool.query('SELECT music_overall_grade FROM student_term_evaluation WHERE student_id=3'))[0][0].music_overall_grade,'B');
  const bad=await service.previewImport({pool,actor:actors.teacher,termId:'1',kind:'ACADEMIC',rows:[{username:'student',real_name:'错误姓名',values:{math_overall_grade:'A'}}],command:command('bad-name')});
  assert.equal(bad.result.batchId,null);assert.ok(bad.result.errors.length>0);
});
