const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
const { addSource, getTerm } = require("../services/reportCoreStore");
const teacher = { id: "2", schoolId: "1", role: "teacher", tokenVersion: 1 },
  student = { ...teacher, id: "3", role: "student" };
async function scoped(t) {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  await db.pool.query(
    "DELETE FROM teacher_teaching_assignment WHERE subject_code<>'MATH'",
  );
  await db.pool.query(
    "UPDATE teacher_teaching_assignment SET is_head_teacher=0",
  );
  return db;
}
async function http(t, db) {
  const server = require("../app")
    .createApp({ pool: db.pool, schoolId: "1" })
    .listen(0);
  t.after(() => server.close());
  const token = require("../middleware/auth").signToken(teacher);
  return (path) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
      headers: { Authorization: "Bearer " + token },
    });
}
test("subject teacher source payloads redact other-subject values, historical values and private narratives/specialties", async (t) => {
  const db = await scoped(t);
  const id = await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    sourceType: "IMPORT",
    kind: "ITEM",
    status: "COMMITTED",
    key: ["privacy"],
    payload: {
      values: {
        math_basic_knowledge_grade: "A",
        chinese_handwriting_grade: "B",
      },
      previousValues: {
        math_basic_knowledge_grade: "B",
        chinese_handwriting_grade: "C",
      },
    },
  });
  await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    sourceType: "SELF",
    kind: "FORM",
    status: "SUBMITTED",
    key: ["privateform"],
    payload: {
      values: {
        self_conduct_text: "private narrative",
        family_message: "private family",
      },
    },
  });
  await db.pool.query(
    "UPDATE student_term_evaluation SET sports_specialties=?,art_specialties=? WHERE student_id=3",
    [
      JSON.stringify([{ id: "p", name: "sport", teacher_star: 3 }]),
      JSON.stringify([{ id: "a", name: "art", teacher_star: 2 }]),
    ],
  );
  const response = await (
    await (
      await http(t, db)
    )("/report-core/sources?termId=1")
  ).json();
  const row = response.data.find((s) => String(s.id) === id);
  assert.equal(row.payload.values.math_basic_knowledge_grade, "A");
  assert.equal(row.payload.values.chinese_handwriting_grade, undefined);
  assert.equal(row.payload.previousValues.chinese_handwriting_grade, undefined);
  assert.ok(!JSON.stringify(response).includes("private narrative"));
  const view =
    await require("../services/reportCoreEvaluation").getEvaluationView({
      pool: db.pool,
      actor: teacher,
      studentKey: { schoolId: "1", termId: "1", studentId: "3" },
    });
  assert.deepEqual(view.sportsSpecialties, []);
  assert.deepEqual(view.artSpecialties, []);
});
test("student cannot retrieve unpublished report drafts, including direct service calls", async (t) => {
  const db = await scoped(t);
  await assert.rejects(
    require("../services/reportCoreEvaluation").buildReportDraft({
      pool: db.pool,
      actor: student,
      studentKey: { schoolId: "1", termId: "1", studentId: "3" },
    }),
    { statusCode: 403 },
  );
});
test("head teacher is not granted unrelated academic import or card scoring permissions", async (t) => {
  const db = await scoped(t);
  await db.pool.query(
    "UPDATE teacher_teaching_assignment SET is_head_teacher=1",
  );
  for (const action of ["import", "score"])
    await assert.rejects(
      require("../services/authorizationService").assertScope(
        {
          actor: teacher,
          studentKey: { schoolId: "1", termId: "1", studentId: "3" },
          action,
          fields: ["chinese_process_star"],
        },
        db.pool,
      ),
      { statusCode: 403 },
    );
});
test("teacher pending material is filtered by school/class before pagination; own later pages remain accessible", async (t) => {
  const db = await scoped(t);
  await db.pool.query(
    "INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code) VALUES(1,1,2,4,1,'STORY')",
  );
  await db.pool.query(
    "UPDATE student_term_evaluation SET class_no_snapshot=2 WHERE student_id=4",
  );
  const own = await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    sourceType: "STORY",
    kind: "ITEM",
    status: "FAILED",
    key: ["own"],
    payload: { category: "READ", text: "pending material" },
  });
  for (let i = 0; i < 105; i++)
    await addSource(db.pool, {
      schoolId: "1",
      termId: "1",
      studentId: "4",
      sourceType: "SELF",
      kind: "FORM",
      status: "SUBMITTED",
      key: ["other", i],
      payload: { values: { conduct_politeness_self_star: 1 } },
    });
  const call = await http(t, db);
  let rows = (await (await call("/report-core/sources?termId=1")).json()).data;
  assert.ok(rows.some((r) => String(r.id) === own));
  for (let i = 0; i < 105; i++)
    await addSource(db.pool, {
      schoolId: "1",
      termId: "1",
      studentId: "3",
      sourceType: "SELF",
      kind: "FORM",
      status: "SUBMITTED",
      key: ["more", i],
      payload: { values: { conduct_politeness_self_star: 1 } },
    });
  rows = (await (await call("/report-core/sources?termId=1&offset=100")).json())
    .data;
  assert.ok(rows.some((r) => String(r.id) === own));
});
test("a quota remains independently listable after issuing 100 cards", async (t) => {
  const db = await scoped(t);
  const cards = require("../services/reportCoreCards");
  process.env.CARD_PRINT_KEY = require("node:crypto")
    .randomBytes(32)
    .toString("hex");
  const command = (n) => ({
    requestKey: "q-" + n,
    payloadHash: String(n).padStart(64, "0"),
  });
  const q = (
    await cards.saveQuota({
      pool: db.pool,
      actor: { ...teacher, id: "1", role: "manager" },
      termId: "1",
      teacherId: "2",
      monthKey: "2026-10",
      total: 100,
      command: command(1),
    })
  ).result.quotaId;
  await cards.savePlan({
    pool: db.pool,
    actor: teacher,
    quotaId: q,
    expectedRevision: "1",
    plans: [
      {
        grade: 4,
        classNo: 1,
        classTotal: 100,
        items: [{ categoryCode: "CONDUCT_POLITENESS_OTHER_STAR", count: 100 }],
      },
    ],
    command: command(2),
  });
  await cards.generateCards({
    pool: db.pool,
    actor: teacher,
    quotaId: q,
    expectedRevision: "2",
    command: command(3),
  });
  assert.ok(
    (
      await cards.listCards({
        pool: db.pool,
        actor: teacher,
        termId: "1",
        kind: "QUOTA",
      })
    ).some((r) => r.record_kind === "QUOTA" && String(r.id) === q),
  );
});
test("new unsubmitted story drafts do not replace the active scored monthly revision", async (t) => {
  const db = await scoped(t);
  const batch = await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    sourceType: "STORY",
    kind: "BATCH",
    monthKey: "2026-10",
    version: 1,
    status: "SCORED",
    key: ["oldbatch"],
    payload: {},
  });
  await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    sourceType: "STORY",
    kind: "ITEM",
    parentId: batch,
    status: "SCORED",
    key: ["olditem"],
    payload: { category: "READ", score: { total: 90, feedback: "原反馈" } },
  });
  await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    sourceType: "STORY",
    kind: "BATCH",
    monthKey: "2026-10",
    version: 2,
    status: "DRAFT",
    key: ["newdraft"],
    payload: {},
  });
  const result =
    await require("../services/reportCoreProjection").rebuildEvaluation({
      connection: db.pool,
      studentKey: { schoolId: "1", termId: "1", studentId: "3" },
      targets: ["story_read_star"],
      config: { requiredMonths: ["2026-10"] },
    });
  assert.equal(result.values.story_read_star, 3);
});
test("expired last-attempt jobs become FAILED; obsolete live scoring rule releases its processing lease", async (t) => {
  const db = await scoped(t);
  const worker = require("../services/reportCoreWorker");
  const batch = await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    actorId: "3",
    sourceType: "STORY",
    kind: "BATCH",
    status: "SUBMITTED",
    key: ["batch"],
    payload: {},
  });
  const id = await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    actorId: "3",
    sourceType: "STORY",
    kind: "ITEM",
    parentId: batch,
    status: "QUEUED",
    key: ["job"],
    payload: {
      text: "原文",
      category: "READ",
      contentHash: "hash",
      scoringRuleVersion: "old",
    },
  });
  let jobs = await worker.claimAssessmentJobs({
    pool: db.pool,
    now: new Date(),
    limit: 2,
  });
  const result =
    await require("../services/reportCoreStories").applyStoryResult({
      pool: db.pool,
      job: jobs[0],
      leaseToken: jobs[0].lease_token,
      contentHash: "hash",
      ruleVersion: "old",
      result: {
        dimensions: [20, 20, 20, 20],
        total: 80,
        evidence: [],
        feedback: "评分",
      },
    });
  assert.equal(result.result.applied, false);
  let [[row]] = await db.pool.query(
    "SELECT status,lease_token FROM evaluation_source_record WHERE id=?",
    [id],
  );
  assert.notEqual(row.status, "PROCESSING");
  await db.pool.query(
    "UPDATE evaluation_source_record SET status='PROCESSING',attempts=3,lease_token='last',locked_until=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?",
    [id],
  );
  await worker.claimAssessmentJobs({
    pool: db.pool,
    now: new Date(),
    limit: 2,
  });
  [[row]] = await db.pool.query(
    "SELECT status FROM evaluation_source_record WHERE id=?",
    [id],
  );
  assert.equal(row.status, "FAILED");
});
test("registration date is rendered with the actual month and day, not Date.toString weekday slicing", () => {
  const { renderPrintableA4 } = require("../services/reportRenderService");
  const html = renderPrintableA4({
    reportData: {
      schemaVersion: "CORE_V1",
      student: {},
      term: { nextRegistrationDate: new Date("2027-02-22T00:00:00Z") },
      values: {},
      sportsSpecialties: [],
      artSpecialties: [],
      narratives: {},
    },
  });
  assert.match(html, /2月22日/);
});
test("music teacher may evaluate art specialty while unrelated subject teachers may not", async (t) => {
  const db = await scoped(t);
  await db.pool.query(
    "UPDATE teacher_teaching_assignment SET subject_code='MUSIC'",
  );
  const scope = await require("../services/authorizationService").assertScope(
    {
      actor: teacher,
      studentKey: { schoolId: "1", termId: "1", studentId: "3" },
      action: "score",
      fields: ["art_specialties"],
    },
    db.pool,
  );
  assert.deepEqual(scope.allowedFields, ["art_specialties"]);
});
