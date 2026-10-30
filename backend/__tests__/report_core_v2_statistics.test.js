const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createV2TestDb,command}=require('./helpers/reportCoreV2Db');
test('V2 labor direct evaluation is one point and class settlement ranks everybody, then reversal reranks everybody',async t=>{
  const {pool,actors}=await createV2TestDb(t);
  const cards=require('../services/reportCoreCards'),evaluation=require('../services/reportCoreEvaluation');
  await cards.directScore({pool,actor:actors.teacher,termId:'1',studentIds:['3'],categoryCode:'LABOR_PROCESS',reason:'完成值日',command:command('labor')});
  const get=async()=> (await pool.query('SELECT student_id,revision,labor_process_star,process_summary FROM student_term_evaluation ORDER BY student_id'))[0];
  assert.equal((await get())[0].labor_process_star,null);
  const initial=await get();
  await evaluation.settleSources({pool,actor:actors.teacher,termId:'1',grade:4,classNo:1,targetKeys:['labor_process_star'],settlement:'CARD_CLOSED',expectedRevisions:Object.fromEntries(initial.map(r=>[String(r.student_id),String(r.revision)])),command:command('settle')});
  let rows=await get();
  assert.deepEqual(rows.map(r=>r.labor_process_star),[3,1]);
  assert.deepEqual(rows.map(r=>r.process_summary.labor_process_star.points),[1,0]);
  await pool.query("UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=2,confirmed_at=UTC_TIMESTAMP(6),approval_fingerprint=?",['f'.repeat(64)]);
  await cards.directScore({pool,actor:actors.teacher,termId:'1',studentIds:['4'],categoryCode:'LABOR_PROCESS',reason:'劳动实践',command:command('other')});
  assert.deepEqual((await pool.query('SELECT status,approval_fingerprint FROM student_term_evaluation ORDER BY student_id'))[0].map(r=>[r.status,r.approval_fingerprint]),[['DRAFT',null],['DRAFT',null]]);
  rows=await get();assert.deepEqual(rows.map(r=>r.labor_process_star),[3,3]);
  assert.deepEqual(rows.map(r=>r.process_summary.labor_process_star.rank),[1,1]);
  const [[s]]=await pool.query("SELECT id FROM evaluation_source_record WHERE student_id=3 AND record_kind='DIRECT'");
  await cards.reverseSource({pool,actor:actors.teacher,sourceId:String(s.id),reason:'误选学生',command:command('reverse')});
  rows=await get();assert.deepEqual(rows.map(r=>r.labor_process_star),[1,3]);
  await assert.rejects(cards.reverseSource({pool,actor:actors.teacher,sourceId:String(s.id),reason:'重复',command:command('reverse-again')}),{statusCode:409});
  assert.equal((await get())[0].process_summary.labor_process_star.points,0);
});
test('mixed string and numeric student identifiers cannot double credit one direct evaluation',async t=>{
  const {pool,actors}=await createV2TestDb(t);
  const result=await require('../services/reportCoreCards').directScore({pool,actor:actors.teacher,termId:'1',studentIds:['3',3],categoryCode:'LABOR_PROCESS',reason:'同一操作',command:command('mixed-id')});
  assert.equal(result.result.count,1);
  assert.equal(String((await pool.query("SELECT SUM(delta) points FROM evaluation_source_record WHERE record_kind='DIRECT'"))[0][0].points),'1');
});
test('a colleague without class head responsibility cannot reverse another teachers award',async t=>{
  const {pool,actors}=await createV2TestDb(t);
  const cards=require('../services/reportCoreCards');
  await cards.directScore({pool,actor:actors.teacher,termId:'1',studentIds:['3'],categoryCode:'LABOR_PROCESS',reason:'本人评价',command:command('owned')});
  await pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) SELECT 5,1,'colleague',password,'同事','teacher' FROM users WHERE id=2");
  await pool.query("INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code) VALUES(1,1,5,4,1,'LABOR')");
  const [[source]]=await pool.query("SELECT id FROM evaluation_source_record WHERE record_kind='DIRECT'");
  await assert.rejects(cards.reverseSource({pool,actor:{...actors.teacher,id:'5'},sourceId:String(source.id),reason:'无权撤销',command:command('colleague')}),{statusCode:403});
});
test('V2 statistics excludes transferred out students and legacy text scores from the three independent school boards',async t=>{
  const {pool}=await createV2TestDb(t);
  const {addSource}=require('../services/reportCoreStore');
  await addSource(pool,{schoolId:'1',termId:'1',studentId:'3',sourceType:'STORY',kind:'ITEM',status:'SCORED',payload:{score:{total:99},category:'TELL'},key:['old-text']});
  await pool.query("UPDATE student_term_evaluation SET section_meta=? WHERE student_id=4",[JSON.stringify({enrollment:{status:'TRANSFERRED_OUT'}})]);
  const stats=await require('../services/reportCoreV2Statistics').loadV2Statistics(pool,{schoolId:'1',termId:'1'});
  assert.equal(stats.roster.length,1);
  assert.deepEqual(stats.storyByStudent['3'].TELL,{value:null,star:null,participating:false,rank:null,population:0});
});
