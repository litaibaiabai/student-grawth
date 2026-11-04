const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createV2TestDb,command}=require('./helpers/reportCoreV2Db');
test('V2 self forms expose exactly eleven stars, cannot edit imported teacher values and freeze across old endpoints',async t=>{
  const {pool,actors}=await createV2TestDb(t);
  const api=require('../services/evaluation/reportCoreEvaluation');
  const key={schoolId:'1',termId:'1',studentId:'3'};
  const view=await api.getEvaluationView({pool,actor:actors.student,studentKey:key});
  assert.equal(view.allowedFields.length,11);
  assert.equal(view.applicableSelfFields.length,11);
  await api.submitForm({pool,actor:actors.student,studentKey:key,expectedRevision:view.revision,values:{fitness_self_star:2},command:command('self')});
  assert.equal((await pool.query('SELECT fitness_self_star FROM student_term_evaluation WHERE student_id=3'))[0][0].fitness_self_star,2);
  assert.equal(String((await pool.query('SELECT data_revision FROM academic_year'))[0][0].data_revision),'2');
  await assert.rejects(api.submitForm({pool,actor:actors.student,studentKey:key,expectedRevision:'2',values:{music_learning_teacher_star:3},command:command('forged')}),{statusCode:403});
  await pool.query("UPDATE academic_year SET business_phase='FROZEN'");
  await assert.rejects(api.submitForm({pool,actor:actors.student,studentKey:key,expectedRevision:'2',values:{fitness_self_star:3},command:command('frozen')}),{statusCode:423});
  assert.equal((await api.submitForm({pool,actor:actors.student,studentKey:key,expectedRevision:view.revision,values:{fitness_self_star:2},command:command('self')})).replayed,true);
});
test('V2 class head can import whole class but other teachers and managers cannot read private reports',async t=>{
  const {pool,actors}=await createV2TestDb(t);
  const {assertScope}=require('../services/auth/authorizationService');
  const key={schoolId:'1',termId:'1',studentId:'3'};
  await pool.query("UPDATE teacher_teaching_assignment SET enabled=0 WHERE subject_code='MUSIC'");
  assert.equal((await assertScope({actor:actors.teacher,studentKey:key,action:'import',fields:['music_overall_grade']},pool)).head,true);
  await assert.rejects(assertScope({actor:actors.manager,studentKey:key,action:'report'},pool),{statusCode:403});
  await assert.rejects(assertScope({actor:actors.other,studentKey:key,action:'read'},pool),{statusCode:403});
  await assert.rejects(assertScope({actor:actors.teacher,studentKey:{...key,schoolId:'2'},action:'import',fields:['music_overall_grade']},pool),{statusCode:403});
});
