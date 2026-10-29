const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("draft renders every field, escapes user text and manager cannot read it; confirmation binds actual revision", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const service = require("../services/reportCoreEvaluation");
  const teacher = { id: "2", schoolId: "1", role: "teacher", tokenVersion: 1 },
    key = { schoolId: "1", termId: "1", studentId: "3" };
  await db.pool.query(
    "UPDATE academic_year SET evaluation_config=JSON_SET(evaluation_config,'$.applicableFields',JSON_ARRAY(),'$.requiredMonths',JSON_ARRAY()) WHERE id=1",
  );
  await db.pool.query(
    "UPDATE student_term_evaluation SET self_conduct_text='<script>alert(1)</script>',self_wisdom_text='学习',self_health_text='运动',self_art_text='唱歌',self_labor_text='劳动',semester_highlights='收获',next_term_goals='目标',teacher_comment='继续努力' WHERE student_id=3",
  );
  const d = await service.buildReportDraft({
    pool: db.pool,
    actor: teacher,
    studentKey: key,
  });
  assert.equal(d.model.displayFieldCount, 109);
  assert.equal((d.html.match(/data-view=/g) || []).length, 109);
  assert.ok(!d.html.includes("<script>alert"));
  assert.match(d.html, /德美少年/);
  await assert.rejects(
    service.buildReportDraft({
      pool: db.pool,
      actor: { ...teacher, id: "1", role: "manager" },
      studentKey: key,
    }),
    { statusCode: 403 },
  );
  await service.confirmReport({
    pool: db.pool,
    actor: teacher,
    studentKey: key,
    expectedRevision: d.revision,
    expectedFingerprint: d.fingerprint,
    layoutReview: {
      fingerprint: d.fingerprint,
      renderScope: 'FULL',
      documentKey: d.documentKey,
      templateVersion: "CORE_V1",
      overflow: false,
    },
    command: { requestKey: "confirm1", payloadHash: "a".repeat(64) },
  });
  assert.equal(
    (
      await db.pool.query(
        "SELECT status FROM student_term_evaluation WHERE student_id=3",
      )
    )[0][0].status,
    "CONFIRMED",
  );
  await db.pool.query(
    "UPDATE student_term_evaluation SET revision=revision+1,status='DRAFT' WHERE student_id=3",
  );
  await assert.rejects(
    service.confirmReport({
      pool: db.pool,
      actor: teacher,
      studentKey: key,
      expectedRevision: d.revision,
      expectedFingerprint: d.fingerprint,
      layoutReview: {
        fingerprint: d.fingerprint,
        renderScope: 'FULL',
        documentKey: d.documentKey,
        templateVersion: "CORE_V1",
        overflow: false,
      },
      command: { requestKey: "confirm2", payloadHash: "b".repeat(64) },
    }),
    { statusCode: 409 },
  );
});
