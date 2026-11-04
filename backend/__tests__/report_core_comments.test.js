const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createV2TestDb, command} = require('./helpers/reportCoreV2Db');

test('report-based comment drafts survive edits and only atomic approval updates reports', async t => {
  const db = await createV2TestDb(t), args = {pool:db.pool, actor:db.actors.teacher, termId:'1'};
  const comments = require('../services/reports/reportCoreComments');
  await db.pool.query("UPDATE student_term_evaluation SET math_overall_grade='A',story_summary=JSON_OBJECT('WRITE',JSON_OBJECT('value',8,'rank',2)),process_summary=JSON_OBJECT('math_process_star',JSON_OBJECT('points',12,'star',3)),honor_summary=JSON_OBJECT('items',JSON_ARRAY(JSON_OBJECT('title','数学思维展示','level','校级'))),revision=5 WHERE student_id=3");
  const provider = {generateTermComment:async ({report,fields}) => {
    assert.equal(report.schemaVersion, 'SIX_EDU_V2');
    assert.equal(report.values.math_overall_grade, 'A');
    assert.equal(report.values.story_summary.WRITE.value, 8);
    assert.equal(report.values.process_summary.math_process_star.points, 12);
    assert.equal(report.values.honor_summary.items[0].title, '数学思维展示');
    assert.ok(fields.some(f => f.column === 'honor_summary'));
    assert.ok(fields.some(f => f.column === 'math_overall_grade'));
    assert.equal(report.narratives.teacher_comment, undefined);
    return {comment:'你在本学期数学学习中取得了良好成绩，愿你保持好奇，在故事中收获成长。',model:'fixture'};
  }};
  assert.equal((await comments.getComment({...args,studentId:'3'})).status, 'EMPTY');
  const generated = (await comments.generateComment({...args,studentId:'3',provider,command:command('generate-3')})).result;
  assert.equal(generated.status,'DRAFT');
  assert.equal((await comments.getComment({...args,studentId:'3'})).comment,generated.comment);
  assert.equal((await db.pool.query('SELECT teacher_comment FROM student_term_evaluation WHERE student_id=3'))[0][0].teacher_comment,null);
  const edited = (await comments.saveComment({...args,studentId:'3',comment:'修改后的寄语，继续保持好奇心。',expectedRevision:generated.revision,expectedCommentId:generated.commentId,command:command('edit-3')})).result;
  const cached = (await comments.generateComment({...args,studentId:'3',provider:{generateTermComment:()=>{throw Error('must not regenerate saved draft');}},command:command('reuse-3')})).result;
  assert.equal(cached.comment,'修改后的寄语，继续保持好奇心。');
  assert.equal(cached.commentId,edited.commentId);
  const other = (await comments.saveComment({...args,studentId:'4',comment:'期待你继续成长。',expectedRevision:'1',expectedCommentId:null,command:command('edit-4')})).result;
  const entry = row => ({studentId:row.student.id,comment:row.comment,expectedRevision:row.revision,expectedCommentId:row.commentId});
  await assert.rejects(comments.approveComments({...args,entries:[entry(edited),{...entry(other),expectedRevision:'999'}],command:command('stale-batch')}),{statusCode:409});
  assert.equal((await db.pool.query('SELECT teacher_comment FROM student_term_evaluation WHERE student_id=3'))[0][0].teacher_comment,null);
  await comments.approveComments({...args,entries:[entry(edited),entry(other)],command:command('approve-batch')});
  const rows=(await comments.listComments({...args,grade:4,classNo:1})).rows;
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.status),['APPROVED','APPROVED']);
  assert.equal((await db.pool.query('SELECT teacher_comment FROM student_term_evaluation WHERE student_id=3'))[0][0].teacher_comment,'修改后的寄语，继续保持好奇心。');
  assert.equal((await comments.getComment({...args,studentId:'3'})).status,'APPROVED');
  await assert.rejects(comments.saveComment({...args,studentId:'3',comment:'覆盖旧版本',expectedRevision:edited.revision,expectedCommentId:edited.commentId,command:command('stale-edit')}),{statusCode:409});
});

test('comment access enforces head-teacher scope, phase, and generation-time report revisions', async t => {
  const db=await createV2TestDb(t), comments=require('../services/reports/reportCoreComments');
  const args={pool:db.pool,actor:db.actors.teacher,termId:'1',studentId:'3'};
  await assert.rejects(comments.getComment({...args,actor:db.actors.student}),{statusCode:403});
  await db.pool.query('UPDATE teacher_teaching_assignment SET is_head_teacher=0');
  await assert.rejects(comments.listComments({...args,grade:4,classNo:1}),{statusCode:403});
  await assert.rejects(comments.generateComment({...args,command:command('forbidden')}),{statusCode:403});
  await db.pool.query("UPDATE teacher_teaching_assignment SET is_head_teacher=1 WHERE subject_code='MORAL'");
  await db.pool.query("UPDATE student_term_evaluation SET section_meta=JSON_OBJECT('roster',JSON_OBJECT('included',false)) WHERE student_id=3");
  await assert.rejects(comments.getComment(args),{statusCode:404});
  await db.pool.query("UPDATE student_term_evaluation SET section_meta=JSON_OBJECT() WHERE student_id=3");
  await assert.rejects(comments.generateComment({...args,command:command('missing-provider')}),{statusCode:503});
  await assert.rejects(comments.generateComment({...args,provider:{generateTermComment:async()=>{
    await db.pool.query('UPDATE student_term_evaluation SET revision=revision+1 WHERE student_id=3');
    return {comment:'过期的模型输出'};
  }},command:command('changed-report')}),{statusCode:409});
  assert.equal((await comments.getComment(args)).status,'EMPTY');
  await db.pool.query("UPDATE academic_year SET business_phase='FROZEN'");
  assert.equal((await comments.getComment(args)).canEdit,false);
  await assert.rejects(comments.saveComment({...args,comment:'冻结后不能保存',expectedRevision:'2',expectedCommentId:null,command:command('frozen')}),{statusCode:423});
});
