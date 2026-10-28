const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("self and other columns stay independent, stale forms conflict, settlement distinguishes zero from missing", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const {
    submitForm,
    settleSources,
    getEvaluationView,
  } = require("../services/reportCoreEvaluation");
  const actor = { id: "3", schoolId: "1", role: "student", tokenVersion: 1 },
    teacher = { ...actor, id: "2", role: "teacher" };
  const studentKey = { schoolId: "1", termId: "1", studentId: "3" };
  let n = 0;
  const cmd = () => ({
    requestKey: "form-" + ++n,
    payloadHash: String(n).padStart(64, "0"),
  });
  await assert.rejects(
    submitForm({
      pool: db.pool,
      actor,
      studentKey,
      expectedRevision: "1",
      values: { music_learning_teacher_star: 3 },
      command: cmd(),
    }),
    { statusCode: 403 },
  );
  await submitForm({
    pool: db.pool,
    actor,
    studentKey,
    expectedRevision: "1",
    values: { conduct_politeness_self_star: 2 },
    command: cmd(),
  });
  await assert.rejects(
    submitForm({
      pool: db.pool,
      actor,
      studentKey,
      expectedRevision: "1",
      values: { conduct_politeness_self_star: 3 },
      command: cmd(),
    }),
    { statusCode: 409 },
  );
  await settleSources({
    pool: db.pool,
    actor: teacher,
    termId: "1",
    grade: 4,
    classNo: 1,
    targetKeys: ["conduct_politeness_other_star"],
    settlement: "CARD_CLOSED",
    expectedRevisions: { 3: "2", 4: "1" },
    command: cmd(),
  });
  const [[row]] = await db.pool.query(
    "SELECT * FROM student_term_evaluation WHERE student_id=3",
  );
  assert.equal(row.conduct_politeness_self_star, 2);
  assert.equal(row.conduct_politeness_other_star, 1);
  const view = await getEvaluationView({ pool: db.pool, actor, studentKey });
  assert.ok(!Object.hasOwn(view.values, "teacher_comment"));
});
