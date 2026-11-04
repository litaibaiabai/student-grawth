const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createV2TestDb, command } = require('./helpers/reportCoreV2Db');
const { parse } = require('../services/core/reportCoreStore');
const now = new Date('2026-10-20T04:00:00Z');
let serial = 0;
const cmd = () => command(`course-cards-${++serial}`);

async function fixture(t, { configure = true } = {}) {
  const db = await createV2TestDb(t);
  process.env.CARD_PRINT_KEY = crypto.randomBytes(32).toString('hex');
  await db.pool.query('DELETE FROM teacher_teaching_assignment');
  for (const [classNo, subject] of [[1, 'CHINESE'], [2, 'CHINESE'], [1, 'MATH']])
    await db.pool.query('INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code) VALUES(1,1,2,4,?,?)', [classNo, subject]);
  const service = require('../services/cards/reportCoreCourseCards');
  const base = { pool: db.pool, termId: '1', now };
  const manager = { ...base, actor: db.actors.manager };
  const teacher = { ...base, actor: db.actors.teacher };
  if (configure) {
    const initial = await service.getCourseCardSettings(manager);
    await service.saveCourseCardSettings({ ...manager, expectedRevision: initial.revision, quotas: { CHINESE: 100, MATH: 120 }, command: cmd() });
  }
  return { db, service, manager, teacher };
}

test('unconfigured subjects inherit 100 per class and generate real cards without saving settings', async t => {
  const { db, service, manager, teacher } = await fixture(t, { configure:false });
  const settings = await service.getCourseCardSettings(manager);
  assert.equal(settings.defaultMonthlyTotal,100);
  assert.ok(settings.subjects.every(s => s.monthlyTotal===null && s.effectiveMonthlyTotal===100));
  const before = await service.listCourseCards({...teacher,monthKey:'2026-10'});
  assert.ok(before.courses.every(c => c.configuredTotal===100 && c.usesDefault===true));
  assert.equal((await service.syncCourseCards({...teacher,command:cmd()})).result.generated,300);
  const list = await service.listCourseCards({...teacher,monthKey:'2026-10'});
  assert.deepEqual(list.courses.map(c=>c.total),[100,100,100]);
  const [[count]] = await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE record_kind='CARD'");
  assert.equal(Number(count.n),300);
});

test('default 80 applies only to inherited courses while three Chinese classes receive 60 each', async t => {
  const { db, service, manager, teacher } = await fixture(t, { configure:false });
  await db.pool.query("INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code) VALUES(1,1,2,4,3,'CHINESE')");
  const initial = await service.getCourseCardSettings(manager);
  await service.saveCourseCardSettings({...manager,expectedRevision:initial.revision,defaultMonthlyTotal:80,quotas:{CHINESE:60},command:cmd()});
  const settings = await service.getCourseCardSettings(manager);
  assert.equal(settings.defaultMonthlyTotal,80);
  assert.equal(settings.subjects.find(s=>s.subjectCode==='CHINESE').monthlyTotal,60);
  assert.equal(settings.subjects.find(s=>s.subjectCode==='CHINESE').effectiveMonthlyTotal,60);
  assert.equal(settings.subjects.find(s=>s.subjectCode==='MATH').monthlyTotal,null);
  assert.equal(settings.subjects.find(s=>s.subjectCode==='MATH').effectiveMonthlyTotal,80);
  assert.equal((await service.syncCourseCards({...teacher,command:cmd()})).result.generated,260);
  const list = await service.listCourseCards({...teacher,monthKey:'2026-10'});
  assert.deepEqual(list.courses.filter(c=>c.subjectCode==='CHINESE').map(c=>[c.total,c.configuredTotal,c.usesDefault]),[[60,60,false],[60,60,false],[60,60,false]]);
  assert.deepEqual(list.courses.filter(c=>c.subjectCode==='MATH').map(c=>[c.total,c.configuredTotal,c.usesDefault]),[[80,80,true]]);
  const [[term]] = await db.pool.query('SELECT evaluation_config FROM academic_year WHERE id=1');
  assert.equal(parse(term.evaluation_config).courseCardDefaultQuota,80);
});

test('explicit zero overrides the default and zero default survives omitted-default saves', async t => {
  const { db, service, manager, teacher } = await fixture(t, { configure:false });
  let settings = await service.getCourseCardSettings(manager);
  await service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,defaultMonthlyTotal:80,quotas:{CHINESE:0},command:cmd()});
  assert.equal((await service.syncCourseCards({...teacher,command:cmd()})).result.generated,80);
  let list = await service.listCourseCards({...teacher,monthKey:'2026-10'});
  assert.deepEqual(list.courses.filter(c=>c.subjectCode==='CHINESE').map(c=>[c.total,c.configuredTotal,c.usesDefault]),[[0,0,false],[0,0,false]]);
  settings = await service.getCourseCardSettings(manager);
  await service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,defaultMonthlyTotal:0,quotas:{CHINESE:2},command:cmd()});
  settings = await service.getCourseCardSettings(manager);
  await service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,quotas:{CHINESE:2},command:cmd()});
  settings = await service.getCourseCardSettings(manager);
  assert.equal(settings.defaultMonthlyTotal,0);
  assert.equal(settings.subjects.find(s=>s.subjectCode==='MATH').effectiveMonthlyTotal,0);
  assert.equal((await service.syncCourseCards({...teacher,now:new Date('2026-11-02T04:00:00Z'),command:cmd()})).result.generated,4);
  list = await service.listCourseCards({...teacher,monthKey:'2026-11'});
  assert.deepEqual(list.courses.filter(c=>c.subjectCode==='MATH').map(c=>[c.total,c.configuredTotal,c.usesDefault]),[[0,0,true]]);
  const [[count]] = await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE month_key='2026-11' AND record_kind='CARD'");
  assert.equal(Number(count.n),4);
});

test('changing the default preserves generated snapshots and omitted-default saves preserve 80', async t => {
  const { service, manager, teacher } = await fixture(t, { configure:false });
  await service.syncCourseCards({...teacher,command:cmd()});
  let settings = await service.getCourseCardSettings(manager);
  await service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,defaultMonthlyTotal:80,quotas:{CHINESE:60},command:cmd()});
  settings = await service.getCourseCardSettings(manager);
  await service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,quotas:{CHINESE:60},command:cmd()});
  assert.equal((await service.getCourseCardSettings(manager)).defaultMonthlyTotal,80);
  assert.equal((await service.syncCourseCards({...teacher,command:cmd()})).result.generated,0);
  assert.deepEqual((await service.listCourseCards({...teacher,monthKey:'2026-10'})).courses.map(c=>c.total),[100,100,100]);
  await service.syncCourseCards({...teacher,now:new Date('2026-11-02T04:00:00Z'),command:cmd()});
  assert.deepEqual((await service.listCourseCards({...teacher,monthKey:'2026-11'})).courses.map(c=>c.total),[60,80,60]);
});

test('invalid defaults and unauthorized settings writes leave configuration unchanged', async t => {
  const { db, service, manager, teacher } = await fixture(t, { configure:false });
  const initial = await service.getCourseCardSettings(manager);
  for (const defaultMonthlyTotal of [-1,1.5,10001,'80',null,true])
    await assert.rejects(service.saveCourseCardSettings({...manager,expectedRevision:initial.revision,defaultMonthlyTotal,quotas:{},command:cmd()}),{statusCode:422});
  for (const actor of [teacher.actor,db.actors.student]) {
    await assert.rejects(service.getCourseCardSettings({...manager,actor}),{statusCode:403});
    await assert.rejects(service.saveCourseCardSettings({...manager,actor,expectedRevision:initial.revision,defaultMonthlyTotal:80,quotas:{},command:cmd()}),{statusCode:403});
  }
  assert.deepEqual(await service.getCourseCardSettings(manager),initial);
  await service.saveCourseCardSettings({...manager,expectedRevision:initial.revision,quotas:{},command:cmd()});
  assert.equal((await service.getCourseCardSettings(manager)).defaultMonthlyTotal,100);
});

test('each class and subject receives its own quota; concurrent reloads preserve all 320 cards and tokens', async t => {
  const { db, service, teacher } = await fixture(t);
  await Promise.all([1, 2].map(() => service.syncCourseCards({ ...teacher, command: cmd() })));
  const result = await service.listCourseCards({ ...teacher, monthKey: '2026-10' });
  assert.equal(result.courses.length, 3);
  assert.deepEqual(result.courses.map(x => x.total).sort((a,b) => a-b), [100,100,120]);
  const scope = { ...teacher, monthKey:'2026-10', grade:4, classNo:1, subjectCode:'CHINESE' };
  const first = await service.getCourseCardPage({ ...scope, page:1 });
  assert.equal(first.total, 100);
  assert.equal(first.rows.length, 24);
  assert.match(first.rows[0].qrDataUrl, /^data:image\/png;base64,/);
  assert.match(first.rows[0].claimUrl, /#\/student\/materials\?card=/);
  const png=require('pngjs').PNG.sync.read(Buffer.from(first.rows[0].qrDataUrl.split(',')[1],'base64'));
  const decoded=require('jsqr')(new Uint8ClampedArray(png.data),png.width,png.height);
  assert.equal(decoded?.data,first.rows[0].claimUrl,'the displayed PNG must scan to the exact claim URL');
  await service.syncCourseCards({ ...teacher, command: cmd() });
  const again = await service.getCourseCardPage({ ...scope, page:1 });
  assert.equal(again.rows[0].claimUrl, first.rows[0].claimUrl);
  const second = await service.getCourseCardPage({ ...scope, page:2 });
  assert.equal(second.rows.length,24);
  assert.ok(!first.rows.some(a => second.rows.some(b => a.id===b.id)));
  const [[count]] = await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE record_kind='CARD'");
  assert.equal(Number(count.n),320);
  const math = await service.getCourseCardPage({ ...scope, subjectCode:'MATH' });
  assert.equal(math.total,120);
  assert.ok(math.rows.every(r => !first.rows.some(c=>c.id===r.id)));
  const expired=await service.getCourseCardPage({...scope,now:new Date('2026-11-01T00:00:00Z')});
  assert.ok(expired.rows.every(r=>r.status==='expired' && r.claimUrl===null && r.qrDataUrl===null));
  await assert.rejects(service.buildCourseCardPdf({...scope,now:new Date('2026-11-01T00:00:00Z')}),{statusCode:422});
});

test('settings are manager-only, validate all subjects and revisions, and preserve generated month snapshots', async t => {
  const { service, teacher, manager, db } = await fixture(t);
  await assert.rejects(service.getCourseCardSettings(teacher), {statusCode:403});
  const settings = await service.getCourseCardSettings(manager);
  assert.equal(settings.subjects.find(x=>x.subjectCode==='CHINESE').courseCount,2);
  await assert.rejects(service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,quotas:{CHINESE:1.5},command:cmd()}),{statusCode:422});
  await assert.rejects(service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,quotas:{UNKNOWN:100},command:cmd()}),{statusCode:422});
  await service.syncCourseCards({...teacher,command:cmd()});
  await service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,quotas:{CHINESE:200,MATH:0},command:cmd()});
  await assert.rejects(service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,quotas:{CHINESE:300},command:cmd()}),{statusCode:409});
  await service.syncCourseCards({...teacher,command:cmd()});
  let list = await service.listCourseCards({...teacher,monthKey:'2026-10'});
  assert.deepEqual(list.courses.map(c=>c.total).sort((a,b)=>a-b),[100,100,120]);
  await service.syncCourseCards({...teacher,now:new Date('2026-10-31T16:00:00Z'),command:cmd()});
  list = await service.listCourseCards({...teacher,monthKey:'2026-11',now:new Date('2026-11-01T00:00:00Z')});
  assert.deepEqual(list.courses.map(c=>c.total).sort((a,b)=>a-b),[0,200,200]);
  const [[term]] = await db.pool.query('SELECT evaluation_config FROM academic_year WHERE id=1');
  assert.equal(parse(term.evaluation_config).schemaVersion,'SIX_EDU_V2');
});

test('道德与法治 cards target subject process points instead of general conduct', async t => {
  const { service, teacher, manager, db } = await fixture(t);
  await db.pool.query("INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code) VALUES(1,1,2,4,1,'MORAL')");
  const settings=await service.getCourseCardSettings(manager);
  await service.saveCourseCardSettings({...manager,expectedRevision:settings.revision,quotas:{MORAL:1},command:cmd()});
  await service.syncCourseCards({...teacher,command:cmd()});
  const [[row]]=await db.pool.query("SELECT target_key FROM evaluation_source_record WHERE record_kind='CARD' AND subject_code='MORAL'");
  assert.equal(row.target_key,'moral_process_star');
});

test('redemption changes preview and print scope, adds only the subject point and enforces assigned class', async t => {
  const { service, teacher, db } = await fixture(t);
  await service.syncCourseCards({...teacher,command:cmd()});
  const scope = {...teacher,monthKey:'2026-10',grade:4,classNo:1,subjectCode:'CHINESE'};
  await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(5,1,'unassigned','unused','未任教教师','teacher')");
  const foreign={...scope,actor:{...teacher.actor,id:'5'}};
  await assert.rejects(service.getCourseCardPage(foreign),{statusCode:403});
  await assert.rejects(service.getCourseCardPrint(foreign),{statusCode:403});
  await assert.rejects(service.getCourseCardPage({...scope,actor:db.actors.student}),{statusCode:403});
  const page = await service.getCourseCardPage(scope);
  const token = new URL(page.rows[0].claimUrl).hash.split('card=')[1];
  await require('../services/cards/reportCoreCards').redeemCard({...teacher,actor:db.actors.student,token,command:cmd()});
  const available = await service.getCourseCardPage({...scope,status:'available'});
  assert.equal(available.total,99);
  const used = await service.getCourseCardPage({...scope,status:'used'});
  assert.equal(used.total,1);
  assert.equal(used.rows[0].qrDataUrl,null);
  assert.equal(used.rows[0].claimUrl,null);
  const [[card]] = await db.pool.query('SELECT target_key,student_id FROM evaluation_source_record WHERE id=?',[page.rows[0].id]);
  assert.equal(card.target_key,'chinese_process_star');
  assert.equal(String(card.student_id),'3');
  const other = await service.getCourseCardPage({...scope,classNo:2});
  await assert.rejects(require('../services/cards/reportCoreCards').redeemCard({...teacher,actor:db.actors.student,token:new URL(other.rows[0].claimUrl).hash.split('card=')[1],command:cmd()}),{statusCode:403});
  const pdf = await service.buildCourseCardPdf(scope);
  const chunks=[];for await(const chunk of pdf.stream)chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).subarray(0,5).toString(),'%PDF-');
  assert.equal(pdf.cardCount,99);
  const print = await service.getCourseCardPrint(scope);
  assert.equal(print.rows.length,99);
  assert.ok(!print.rows.some(r=>r.id===page.rows[0].id));
});

test('revoked assignment, foreign teacher, invalid month and frozen term never expose or generate cards', async t => {
  const { service, teacher, db } = await fixture(t);
  await service.syncCourseCards({...teacher,command:cmd()});
  const scope = {...teacher,monthKey:'2026-10',grade:4,classNo:1,subjectCode:'CHINESE'};
  await assert.rejects(service.getCourseCardPage({...scope,subjectCode:'SCIENCE'}),{statusCode:403});
  await assert.rejects(service.listCourseCards({...teacher,monthKey:'2026-99'}),{statusCode:422});
  await assert.rejects(service.syncCourseCards({...teacher,monthKey:'2026-09',command:cmd()}),{statusCode:422});
  await db.pool.query("UPDATE teacher_teaching_assignment SET enabled=0 WHERE subject_code='CHINESE' AND class_no=1");
  await assert.rejects(service.getCourseCardPage(scope),{statusCode:403});
  await assert.rejects(service.buildCourseCardPdf(scope),{statusCode:403});
  assert.equal((await service.listCourseCards({...teacher,monthKey:'2026-10'})).courses.length,2);
  await db.pool.query("UPDATE academic_year SET business_phase='FROZEN'");
  await assert.rejects(service.syncCourseCards({...teacher,command:cmd()}),{statusCode:423});
});
