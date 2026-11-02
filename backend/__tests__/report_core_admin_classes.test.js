const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const {
  createV2TestDb,
  command
} = require('./helpers/reportCoreV2Db');
const migration = () => require('../scripts/migrateAdminClasses').migrateAdminClasses;
const service = () => require('../services/reportCoreAdminClasses');
async function upgraded(t) {
  const db = await createV2TestDb(t);
  await migration()({
    connection: db.pool,
    targetDb: db.name,
    mode: 'apply'
  });
  return db;
}
const ctx = db => ({
  pool: db.pool,
  actor: db.actors.manager,
  termId: '1'
});
test('registry migration is read-only by default, backfills unique head, and is idempotent', async t => {
  const db = await createV2TestDb(t);
  const check = await migration()({
    connection: db.pool,
    targetDb: db.name
  });
  assert.equal(check.ready, false);
  assert.equal((await db.pool.query("SHOW TABLES LIKE 'school_class'"))[0].length, 0);
  const applied = await migration()({
    connection: db.pool,
    targetDb: db.name,
    mode: 'apply'
  });
  assert.equal(applied.ready, true);
  const [[cls]] = await db.pool.query('SELECT * FROM school_class');
  assert.equal(String(cls.responsible_teacher_id), '2');
  const [[term]] = await db.pool.query('SELECT evaluation_config FROM academic_year');
  assert.equal(JSON.parse(typeof term.evaluation_config === 'string' ? term.evaluation_config : JSON.stringify(term.evaluation_config)).adminClassRegistryVersion, 1);
  const again = await migration()({
    connection: db.pool,
    targetDb: db.name,
    mode: 'apply'
  });
  assert.deepEqual(again.applied, []);
  assert.equal((await require('../scripts/runCoreMigrations').runCoreMigrations({
    connection: db.pool,
    targetDb: db.name
  })).unchanged, true);
});
test('registry migration recovers after DDL, rejects unknown tables, wrong columns and cross-school FK', async t => {
  const db = await createV2TestDb(t);
  await db.pool.query("UPDATE teacher_teaching_assignment SET is_head_teacher=0");
  let calls = 0;
  const interrupted = {
    query: async (...args) => {
      if (++calls && args[0].startsWith('INSERT INTO school_class')) throw Error('injected after DDL');
      return db.pool.query(...args);
    }
  };
  await assert.rejects(migration()({
    connection: interrupted,
    targetDb: db.name,
    mode: 'apply'
  }), /injected/);
  await migration()({
    connection: db.pool,
    targetDb: db.name,
    mode: 'apply'
  });
  assert.equal((await db.pool.query('SELECT responsible_teacher_id FROM school_class'))[0][0].responsible_teacher_id, null);
  await assert.rejects(db.pool.query('INSERT INTO school_class(school_id,term_id,grade,class_no,responsible_teacher_id) VALUES(2,1,4,2,2)'), e => e.code === 'ER_NO_REFERENCED_ROW_2');
  await db.pool.query('ALTER TABLE school_class MODIFY display_name TEXT NULL');
  assert.equal((await migration()({
    connection: db.pool,
    targetDb: db.name
  })).conflicts.some(c => c.kind === 'COLUMN_DEFINITION'), true);
  await db.pool.query('CREATE TABLE unexpected(id INT)');
  await assert.rejects(migration()({
    connection: db.pool,
    targetDb: db.name
  }), /schema|结构|表/);
});
test('class imports preview atomically, skip duplicates, reject invalid teacher and apply CAS', async t => {
  const db = await upgraded(t),
    a = ctx(db);
  const input = {
    ...a,
    rows: [{
      grade: 4,
      classNo: 2,
      displayName: '四年二班'
    }],
    command: command('class-preview')
  };
  const p = await service().previewClassImport(input);
  assert.equal((await service().listClasses(a)).total, 1);
  assert.equal(p.result.counts.created, 1);
  const committed = await service().commitClassImport({
    ...a,
    previewId: p.result.previewId,
    expectedRevision: p.result.revision,
    command: command('class-commit')
  });
  assert.equal(committed.result.counts.created, 1);
  assert.equal((await service().listClasses(a)).total, 2);
  const dup = await service().previewClassImport({
    ...input,
    command: command('duplicate')
  });
  assert.equal(dup.result.counts.skipped, 1);
  await assert.rejects(service().previewClassImport({
    ...input,
    rows: [{
      grade: 4,
      classNo: 3
    }, {
      grade: 4,
      classNo: 4,
      responsibleTeacherUsername: 'student'
    }],
    command: command('invalid')
  }), e => e.statusCode === 422);
  assert.equal((await service().listClasses(a)).total, 2);
  const one = await service().previewClassImport({
    ...input,
    rows: [{
      grade: 4,
      classNo: 3
    }],
    command: command('stale1')
  });
  const two = await service().previewClassImport({
    ...input,
    rows: [{
      grade: 4,
      classNo: 4
    }],
    command: command('stale2')
  });
  await service().commitClassImport({
    ...a,
    previewId: one.result.previewId,
    expectedRevision: one.result.revision,
    command: command('stale-commit1')
  });
  await assert.rejects(service().commitClassImport({
    ...a,
    previewId: two.result.previewId,
    expectedRevision: two.result.revision,
    command: command('stale-commit2')
  }), e => e.statusCode === 409);
});
test('teacher configuration grants head scope without phantom courses and retires old assignments', async t => {
  const db = await upgraded(t),
    a = ctx(db);
  await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(5,1,'head','hash','New Head','teacher'),(6,2,'foreign','hash','Foreign','teacher')");
  const cls = (await service().listClasses(a)).rows[0];
  await assert.rejects(service().previewTeachers({
    ...a,
    classId: cls.id,
    expectedRevision: cls.revision,
    responsibleTeacherId: '6',
    assignments: [],
    command: command('foreign')
  }), e => e.statusCode === 422);
  const p = await service().previewTeachers({
    ...a,
    classId: cls.id,
    expectedRevision: cls.revision,
    responsibleTeacherId: '5',
    assignments: [{
      subjectCode: 'CHINESE',
      teacherId: '2'
    }],
    command: command('teachers')
  });
  await service().commitTeachers({
    ...a,
    classId: cls.id,
    previewId: p.result.previewId,
    expectedRevision: p.result.revision,
    command: command('teachers-commit')
  });
  const head = {
    id: '5',
    schoolId: '1',
    role: 'teacher',
    tokenVersion: 1
  };
  const auth = require('../services/authorizationService');
  assert.equal((await auth.assertScope({
    actor: head,
    studentKey: {
      schoolId: '1',
      termId: '1',
      studentId: '3'
    },
    action: 'report'
  }, db.pool)).head, true);
  const teaching = await auth.assignments(head, '1', db.pool);
  assert.deepEqual(teaching.map(r => r.subject_code), ['CLASS_HEAD']);
  const old = await auth.assignments(db.actors.teacher, '1', db.pool);
  assert.deepEqual(old.map(r => r.subject_code), ['CHINESE']);
  assert.equal(old[0].is_head_teacher, 0);
});
test('transfer preserves facts, advances roster, clears confirmations and reranks both classes; roster import uses registry', async t => {
  const db = await upgraded(t),
    a = ctx(db);
  const p = await service().previewClassImport({
    ...a,
    rows: [{
      grade: 4,
      classNo: 2
    }],
    command: command('target')
  });
  await service().commitClassImport({
    ...a,
    previewId: p.result.previewId,
    expectedRevision: p.result.revision,
    command: command('target-commit')
  });
  const target = (await service().listClasses(a)).rows.find(r => r.classNo === 2);
  await db.pool.query("UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=2,confirmed_at=NOW(),approval_fingerprint=REPEAT('a',64)");
  const x = await service().previewTransfer({
    ...a,
    studentIds: ['3'],
    targetClassId: target.id,
    reason: 'test transfer',
    command: command('transfer')
  });
  await service().commitTransfer({
    ...a,
    previewId: x.result.previewId,
    expectedRevision: x.result.revision,
    command: command('transfer-commit')
  });
  const [students] = await db.pool.query('SELECT student_id,class_no_snapshot,status,process_summary FROM student_term_evaluation ORDER BY student_id');
  assert.equal(students[0].class_no_snapshot, 2);
  assert.equal(students[1].status, 'DRAFT');
  assert.equal((typeof students[0].process_summary === 'string' ? JSON.parse(students[0].process_summary) : students[0].process_summary).chinese_process_star.population, 1);
  assert.equal(String((await db.pool.query('SELECT roster_revision FROM academic_year'))[0][0].roster_revision), '2');
  const imports = require('../services/reportCoreImports');
  await assert.rejects(imports.previewImport({
    ...a,
    kind: 'ROSTER',
    rows: [{
      username: 'student',
      real_name: 'student',
      role: 'student',
      grade: 4,
      classNo: 99
    }],
    command: command('invalid-roster')
  }), e => e.statusCode === 422);
  await assert.rejects(imports.previewImport({
    ...a,
    kind: 'HEALTH',
    rows: [{
      studentId: '3',
      values: {
        height_cm: 130
      }
    }],
    command: command('health')
  }), e => e.statusCode === 403);
});
test('responsible teacher reads class roster, report browser, workspace and comments without course cards', async t => {
  const db = await upgraded(t),
    a = ctx(db);
  await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(5,1,'head','hash','Head','teacher')");
  await db.pool.query('UPDATE school_class SET responsible_teacher_id=5');
  const actor = {
    id: '5',
    schoolId: '1',
    role: 'teacher',
    tokenVersion: 1
  };
  const {
    resolveTermRoster,
    getWorkspace
  } = require('../services/reportCoreReadModels');
  assert.equal((await resolveTermRoster({
    connection: db.pool,
    schoolId: '1',
    termId: '1',
    teacherId: '5'
  })).length, 2);
  const workspace = await getWorkspace({
    pool: db.pool,
    actor,
    termId: '1'
  });
  assert.equal(workspace.counts.total, 2);
  const comments = await require('../services/reportCoreComments').listComments({
    pool: db.pool,
    actor,
    termId: '1',
    grade: 4,
    classNo: 1
  });
  assert.equal(comments.rows.length, 2);
  const cards = await require('../services/reportCoreCourseCards').listCourseCards({
    pool: db.pool,
    actor,
    termId: '1',
    monthKey: '2026-10',
    now: new Date('2026-10-15T00:00:00Z')
  });
  assert.equal(cards.courses.length, 0);
  const accounts = await require('../services/reportCoreAdminData').listAccounts({
    ...a,
    role: 'teacher'
  });
  assert.equal(accounts.rows.find(r => r.id === '5').assignments.some(r => r.isHeadTeacher === 1), true);
  assert.equal(accounts.rows.find(r => r.id === '2').assignments.some(r => r.isHeadTeacher === 1), false);
  const settings = await require('../services/reportCoreTermSettings').getTermSettings(a);
  assert.deepEqual(settings.classes[0].headTeacherIds, ['5']);
});
test('roster import transfer advances same roster version, invalidates peers and keeps original source facts', async t => {
  const db = await upgraded(t),
    a = ctx(db);
  const p = await service().previewClassImport({
    ...a,
    rows: [{
      grade: 4,
      classNo: 2
    }],
    command: command('ri-target')
  });
  await service().commitClassImport({
    ...a,
    previewId: p.result.previewId,
    expectedRevision: p.result.revision,
    command: command('ri-target-commit')
  });
  const before = await db.pool.query('SELECT COUNT(*) n FROM evaluation_source_record WHERE student_id=3');
  const imports = require('../services/reportCoreImports');
  const preview = await imports.previewImport({
    ...a,
    kind: 'ROSTER',
    rows: [{
      username: 'student',
      real_name: 'student',
      role: 'student',
      grade: 4,
      classNo: 2
    }],
    command: command('ri-preview')
  });
  await imports.commitImport({
    ...a,
    batchId: preview.result.batchId,
    expectedRevision: preview.result.revision,
    command: command('ri-commit')
  });
  assert.equal(String((await db.pool.query('SELECT roster_revision FROM academic_year'))[0][0].roster_revision), '2');
  const [rows] = await db.pool.query('SELECT student_id,revision,class_no_snapshot,process_summary FROM student_term_evaluation ORDER BY student_id');
  assert.equal(rows[0].class_no_snapshot, 2);
  assert.ok(BigInt(rows[1].revision) > 1n);
  assert.equal((typeof rows[1].process_summary === 'string' ? JSON.parse(rows[1].process_summary) : rows[1].process_summary).chinese_process_star.population, 1);
  assert.ok(Number((await db.pool.query('SELECT COUNT(*) n FROM evaluation_source_record WHERE student_id=3'))[0][0].n) >= Number(before[0][0].n));
});
test('teacher previews use class CAS, revalidate disabled teacher and cannot be committed against another class', async t => {
  const db = await upgraded(t),
    a = ctx(db),
    cls = (await service().listClasses(a)).rows[0];
  const input = {
    ...a,
    classId: cls.id,
    expectedRevision: cls.revision,
    responsibleTeacherId: '2',
    assignments: [],
    command: command('cas-teacher')
  };
  const one = await service().previewTeachers(input);
  const two = await service().previewTeachers({
    ...input,
    command: command('cas-teacher2')
  });
  await service().commitTeachers({
    ...a,
    classId: cls.id,
    previewId: one.result.previewId,
    expectedRevision: one.result.revision,
    command: command('cas-teachercommit')
  });
  await assert.rejects(service().commitTeachers({
    ...a,
    classId: cls.id,
    previewId: two.result.previewId,
    expectedRevision: two.result.revision,
    command: command('cas-teachercommit2')
  }), e => e.statusCode === 409);
  await assert.rejects(service().previewTeachers({
    ...input,
    expectedRevision: '2',
    assignments: [{
      subjectCode: 'CLASS_HEAD',
      teacherId: '2'
    }],
    command: command('fake-subject')
  }), e => e.statusCode === 422);
});
test('enhanced terms reject legacy assignment preview and commit bypasses', async t => {
  const db = await upgraded(t),
    a = ctx(db),
    settings = require('../services/reportCoreTermSettings');
  const current = await settings.getTermSettings(a);
  await assert.rejects(settings.previewTermSettings({
    ...a,
    section: 'assignments',
    expectedConfigVersion: current.versions.config,
    expectedRuleVersion: current.versions.rule,
    expectedAssignmentFingerprint: current.assignmentFingerprint,
    changes: {
      assignments: [],
      heads: []
    },
    command: command('legacy-head')
  }), e => e.statusCode === 422);
});
test('registry rejects forged named index and nullable identity columns', async t => {
  const db = await upgraded(t);
  await db.pool.query('ALTER TABLE school_class DROP INDEX uk_class_identity, ADD UNIQUE KEY uk_class_identity(school_id,term_id,grade,class_no,id)');
  assert.equal((await migration()({
    connection: db.pool,
    targetDb: db.name
  })).ready, false);
  await db.pool.query('ALTER TABLE school_class MODIFY grade SMALLINT UNSIGNED NULL');
  assert.equal((await migration()({
    connection: db.pool,
    targetDb: db.name
  })).conflicts.some(c => c.kind === 'COLUMN_DEFINITION' && c.column === 'grade'), true);
});
test('class HTTP API enforces manager role, has no manual create, and exposes head-only student list', async t => {
  const db = await upgraded(t);
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'admin-classes-local-test-secret';
  t.after(() => {
    if (previous === undefined) delete process.env.JWT_SECRET;else process.env.JWT_SECRET = previous;
  });
  const app = require('../app').createApp({
      pool: db.pool,
      schoolId: '1'
    }),
    server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  const token = actor => require('../middleware/auth').signToken(actor);
  const request = async (path, {
    actor = db.actors.manager,
    body
  } = {}) => fetch(url + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: 'Bearer ' + token(actor),
      'content-type': 'application/json'
    },
    ...(body ? {
      body: JSON.stringify(body)
    } : {})
  });
  const roleLogs=[], originalError=console.error;
  console.error=(...args)=>{if(args.length===1 && args[0]==='[Error] AppError: 无此操作权限')roleLogs.push(args[0]);else originalError(...args);};
  try {
    assert.equal((await request('/admin/report-core/classes?termId=1', {actor: db.actors.teacher})).status,403);
  } finally {console.error=originalError;}
  assert.deepEqual(roleLogs,['[Error] AppError: 无此操作权限']);
  const response = await request('/admin/report-core/classes/imports/preview', {
    body: {
      termId: '1',
      requestKey: 'http-preview',
      rows: [{
        grade: 4,
        classNo: 2
      }]
    }
  });
  const json = await response.json();
  assert.equal(json.code, 200);
  assert.equal(json.data.result.counts.created, 1);
  assert.equal(json.data.replayed, false);
  const commit = await request(`/admin/report-core/classes/imports/${json.data.result.previewId}/commit`, {
    body: {
      termId: '1',
      requestKey: 'http-commit',
      expectedRevision: json.data.result.revision
    }
  });
  assert.equal((await commit.json()).data.result.counts.created, 1);
  const listed = await (await request('/admin/report-core/classes?termId=1&limit=1')).json();
  assert.equal(listed.data.total, 2);
  assert.equal(listed.data.rows.length, 1);
  assert.ok(listed.data.nextCursor);
  const detail = await (await request(`/admin/report-core/classes/${listed.data.rows[0].id}?termId=1`)).json();
  assert.equal(detail.data.students.length, 2);
  assert.equal((await request('/admin/report-core/classes', {
    body: {
      termId: '1',
      requestKey: 'manual-create',
      grade: 4,
      classNo: 3
    }
  })).status, 410);
  await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(5,1,'head','hash','Head','teacher')");
  await db.pool.query('UPDATE school_class SET responsible_teacher_id=5 WHERE class_no=1');
  const head = {
    id: '5',
    schoolId: '1',
    role: 'teacher',
    tokenVersion: 1
  };
  const students = await (await request('/report-core/students?termId=1', {
    actor: head
  })).json();
  assert.equal(students.data.length, 2);
});
test('commit revalidates disabled teachers and stale roster; audit and scoring facts survive transfer', async t => {
  const db = await upgraded(t),
    a = ctx(db);
  const cls = (await service().listClasses(a)).rows[0];
  const p = await service().previewTeachers({
    ...a,
    classId: cls.id,
    expectedRevision: cls.revision,
    responsibleTeacherId: '2',
    assignments: [],
    command: command('disabled-preview')
  });
  await db.pool.query('UPDATE users SET status=1 WHERE id=2');
  await assert.rejects(service().commitTeachers({
    ...a,
    classId: cls.id,
    previewId: p.result.previewId,
    expectedRevision: p.result.revision,
    command: command('disabled-commit')
  }), e => e.statusCode === 422);
  await db.pool.query('UPDATE users SET status=0 WHERE id=2');
  const fact = await require('../services/reportCoreStore').addSource(db.pool, {
    schoolId: '1',
    termId: '1',
    studentId: '3',
    actorId: '2',
    schemaVersion: 'SIX_EDU_V2',
    sourceType: 'CARD',
    kind: 'DIRECT',
    status: 'CONFIRMED',
    target: 'chinese_process_star',
    delta: 1,
    key: ['before-transfer'],
    payload: {
      proof: 'retain me'
    }
  });
  const target = await service().previewClassImport({
    ...a,
    rows: [{
      grade: 4,
      classNo: 2
    }],
    command: command('fact-target')
  });
  await service().commitClassImport({
    ...a,
    previewId: target.result.previewId,
    expectedRevision: target.result.revision,
    command: command('fact-target-commit')
  });
  const targetClass = (await service().listClasses(a)).rows.find(c => c.classNo === 2);
  const transfer = await service().previewTransfer({
    ...a,
    studentIds: ['3'],
    targetClassId: targetClass.id,
    reason: 'retain',
    command: command('fact-transfer')
  });
  await db.pool.query('UPDATE academic_year SET roster_revision=roster_revision+1');
  await assert.rejects(service().commitTransfer({
    ...a,
    previewId: transfer.result.previewId,
    expectedRevision: transfer.result.revision,
    command: command('fact-stale')
  }), e => e.statusCode === 409);
  const fresh = await service().previewTransfer({
    ...a,
    studentIds: ['3'],
    targetClassId: targetClass.id,
    reason: 'retain',
    command: command('fact-fresh')
  });
  await service().commitTransfer({
    ...a,
    previewId: fresh.result.previewId,
    expectedRevision: fresh.result.revision,
    command: command('fact-commit')
  });
  const [[source]] = await db.pool.query('SELECT delta,payload_json,status FROM evaluation_source_record WHERE id=?', [fact]);
  assert.equal(source.delta, 1);
  assert.equal(source.status, 'CONFIRMED');
  assert.equal((typeof source.payload_json === 'string' ? JSON.parse(source.payload_json) : source.payload_json).proof, 'retain me');
  const [[student]] = await db.pool.query('SELECT process_summary FROM student_term_evaluation WHERE student_id=3');
  assert.equal((typeof student.process_summary === 'string' ? JSON.parse(student.process_summary) : student.process_summary).chinese_process_star.points, 1);
});
test('registry fingerprint rejects a replaced named check constraint', async t => {
  const db = await upgraded(t);
  await db.pool.query('ALTER TABLE school_class DROP CHECK ck_class_identity, ADD CONSTRAINT ck_class_identity CHECK(grade>=0 AND class_no>=0)');
  assert.equal((await migration()({
    connection: db.pool,
    targetDb: db.name
  })).ready, false);
});
test('teacher validation rejects null or malformed assignment rows while enhanced teacher health import remains available', async t => {
  const db = await upgraded(t),
    a = ctx(db),
    cls = (await service().listClasses(a)).rows[0];
  for (const assignments of [[{
    subjectCode: 'CHINESE',
    teacherId: null
  }], [null]]) await assert.rejects(service().previewTeachers({
    ...a,
    classId: cls.id,
    expectedRevision: cls.revision,
    responsibleTeacherId: null,
    assignments,
    command: command('malformed-' + JSON.stringify(assignments))
  }), e => e.statusCode === 422);
  const imports = require('../services/reportCoreImports'),
    p = await imports.previewImport({
      ...a,
      actor: db.actors.teacher,
      kind: 'ACADEMIC',
      rows: [{
        studentId: '3',
        values: {
          height_cm: 135
        },
        measurement: {
          date: '2026-10-20'
        }
      }],
      command: command('teacher-health')
    });
  assert.equal(p.result.errors.length, 0);
  await imports.commitImport({
    ...a,
    actor: db.actors.teacher,
    batchId: p.result.batchId,
    expectedRevision: p.result.revision,
    command: command('teacher-health-commit')
  });
  assert.equal(Number((await db.pool.query('SELECT height_cm FROM student_term_evaluation WHERE student_id=3'))[0][0].height_cm), 135);
});

test('assignment preview created before registry upgrade cannot commit afterward', async t => {
  const db = await createV2TestDb(t), a = ctx(db), settings = require('../services/reportCoreTermSettings');
  const current = await settings.getTermSettings(a);
  const preview = await settings.previewTermSettings({...a,section:'assignments',expectedConfigVersion:current.versions.config,expectedRuleVersion:current.versions.rule,expectedAssignmentFingerprint:current.assignmentFingerprint,changes:{heads:[{grade:4,classNo:1,teacherId:null}]},command:command('pre-upgrade-preview')});
  await migration()({connection:db.pool,targetDb:db.name,mode:'apply'});
  await assert.rejects(settings.commitTermSettingsPreview({...a,previewId:preview.result.previewId,expectedRevision:preview.result.revision,command:command('post-upgrade-commit')}), e => [409,422].includes(e.statusCode));
  assert.equal((await service().listClasses(a)).rows[0].responsibleTeacherId,'2');
});

test('overlapping teacher commits reject the second stale class revision after waiting for term lock', {timeout:15000}, async t => {
  const db=await upgraded(t), a=ctx(db), cls=(await service().listClasses(a)).rows[0];
  const input={...a,classId:cls.id,expectedRevision:cls.revision,responsibleTeacherId:'2',assignments:[]};
  const first=await service().previewTeachers({...input,command:command('overlap-preview-1')});
  const second=await service().previewTeachers({...input,responsibleTeacherId:null,command:command('overlap-preview-2')});
  let firstUpdated, releaseFirst, secondWaiting;
  const firstGate=new Promise(resolve=>firstUpdated=resolve), releaseGate=new Promise(resolve=>releaseFirst=resolve), secondGate=new Promise(resolve=>secondWaiting=resolve);
  let acquired=0;
  const wrapped={query:db.pool.query.bind(db.pool),getConnection:async()=>{
    const c=await db.pool.getConnection(), n=++acquired, query=c.query, release=c.release;
    c.query=async(sql,args)=>{
      if(n===2&&sql.startsWith('SELECT * FROM academic_year')&&sql.endsWith(' FOR UPDATE'))secondWaiting();
      const result=await query.call(c,sql,args);
      if(n===1&&sql.startsWith('UPDATE school_class SET')){firstUpdated();await releaseGate;}
      return result;
    };
    c.release=()=>{c.query=query;c.release=release;return release.call(c);};
    return c;
  }};
  const one=service().commitTeachers({...a,pool:wrapped,classId:cls.id,previewId:first.result.previewId,expectedRevision:first.result.revision,command:command('overlap-commit-1')});
  await firstGate;
  const two=service().commitTeachers({...a,pool:wrapped,classId:cls.id,previewId:second.result.previewId,expectedRevision:second.result.revision,command:command('overlap-commit-2')});
  const settled=Promise.allSettled([one,two]);
  try{await secondGate;}finally{releaseFirst();}
  const results=await settled;
  assert.equal(results[0].status,'fulfilled');
  assert.equal(results[1].status,'rejected');
  assert.equal(results[1].reason.statusCode,409);
  const current=(await service().listClasses(a)).rows[0];
  assert.equal(current.revision,'2');assert.equal(current.responsibleTeacherId,'2');
});

test('registry fingerprint rejects missing auto increment and required default drift', async t=>{
  const db=await upgraded(t);
  for(const [column,definition,restore] of [
    ['id','BIGINT UNSIGNED NOT NULL','BIGINT UNSIGNED NOT NULL AUTO_INCREMENT'],
    ['revision','BIGINT UNSIGNED NOT NULL DEFAULT 2','BIGINT UNSIGNED NOT NULL DEFAULT 1'],
    ['created_at','DATETIME(6) NOT NULL','DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)'],
    ['updated_at','DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)','DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)']
  ]){
    await db.pool.query(`ALTER TABLE school_class MODIFY ${column} ${definition}`);
    const result=await migration()({connection:db.pool,targetDb:db.name});
    assert.equal(result.ready,false,`${column} drift must not be ready`);
    assert.ok(result.conflicts.some(conflict=>conflict.column===column),`${column} conflict required`);
    await db.pool.query(`ALTER TABLE school_class MODIFY ${column} ${restore}`);
  }
  assert.equal((await migration()({connection:db.pool,targetDb:db.name})).ready,true);
});

test('class list and detail use the same active roster count',async t=>{
  const db=await upgraded(t),a=ctx(db),cls=(await service().listClasses(a)).rows[0];
  await db.pool.query("UPDATE student_term_evaluation SET section_meta=JSON_OBJECT('roster',JSON_OBJECT('included',false)) WHERE student_id=3");
  await db.pool.query("UPDATE student_term_evaluation SET section_meta=JSON_OBJECT('enrollment',JSON_OBJECT('status','TRANSFERRED_OUT')) WHERE student_id=4");
  assert.equal((await service().listClasses(a)).rows[0].studentCount,0);
  const detail=await service().getClass({...a,classId:cls.id});
  assert.equal(detail.class.studentCount,0);assert.equal(detail.students.length,0);
});
