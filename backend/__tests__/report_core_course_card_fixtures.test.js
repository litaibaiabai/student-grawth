const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createV2TestDb}=require('./helpers/reportCoreV2Db');
const {seedClassUiFixtures}=require('../scripts/seedClassUiFixtures');

test('course card demo keeps four assignments, real nonzero card states, head roles, and stable repeat runs',async t=>{
  const db=await createV2TestDb(t);
  process.env.CARD_PRINT_KEY=require('node:crypto').randomBytes(32).toString('hex');
  await seedClassUiFixtures({pool:db.pool,schoolId:'1',termId:'1',teacherId:'2',mode:'apply'});
  const {seedCourseCardFixtures}=require('../scripts/seedCourseCardFixtures');
  const args={pool:db.pool,schoolId:'1',termId:'1',teacherId:'2',now:new Date('2026-10-20T04:00:00Z')};
  const checked=await seedCourseCardFixtures({...args,mode:'check'});
  assert.equal(checked.courses.length,4);
  const [[before]]=await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE record_kind='CARD'");
  assert.equal(Number(before.n),0);
  const result=await seedCourseCardFixtures({...args,mode:'apply'});
  assert.equal(result.courses.length,4);
  assert.equal(result.courses.reduce((n,c)=>n+c.total,0),420);
  assert.equal(result.courses.reduce((n,c)=>n+c.used,0),93);
  assert.ok(result.courses.every(c=>c.total>0&&c.used>0&&c.available>0));
  const [assignments]=await db.pool.query('SELECT * FROM teacher_teaching_assignment WHERE teacher_id=2 AND enabled=1');
  assert.equal(assignments.length,4);
  assert.equal(new Set(assignments.filter(a=>a.is_head_teacher).map(a=>a.class_no)).size,2);
  const repeated=await seedCourseCardFixtures({...args,mode:'apply'});
  assert.deepEqual(repeated.courses,result.courses);
  const [[cards]]=await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE record_kind='CARD'");
  assert.equal(Number(cards.n),420);
  const [[summary]]=await db.pool.query("SELECT COUNT(*) n FROM student_term_evaluation WHERE JSON_LENGTH(process_summary)>0");
  assert.ok(Number(summary.n)>0,'fixture claims also rebuild the real process-point projection');
});

test('course card demo refuses a non-demo teacher without changing any assignments',async t=>{
  const db=await createV2TestDb(t);
  await db.pool.query("UPDATE users SET username='real-teacher',real_name='正式教师' WHERE id=2");
  const {seedCourseCardFixtures}=require('../scripts/seedCourseCardFixtures');
  await assert.rejects(seedCourseCardFixtures({pool:db.pool,schoolId:'1',termId:'1',teacherId:'2',mode:'apply'}),/演示/);
  const [[count]]=await db.pool.query('SELECT COUNT(*) n FROM teacher_teaching_assignment WHERE teacher_id=2 AND enabled=1');
  assert.equal(Number(count.n),13);
});
