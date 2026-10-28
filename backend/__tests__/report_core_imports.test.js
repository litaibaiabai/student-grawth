const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("imports preview then commit exact field grades and health; stale previews cannot overwrite", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const {
    previewImport,
    commitImport,
  } = require("../services/reportCoreImports");
  const teacher = { id: "2", schoolId: "1", role: "teacher", tokenVersion: 1 },
    manager = { ...teacher, id: "1", role: "manager" };
  let n = 0;
  const cmd = () => ({
    requestKey: "import-" + ++n,
    payloadHash: String(n).padStart(64, "0"),
  });
  await assert.rejects(
    previewImport({
      pool: db.pool,
      actor: teacher,
      termId: "1",
      kind: "HEALTH",
      rows: [{ studentId: "3", values: { vision_left: "5.0" } }],
      command: cmd(),
    }),
    { statusCode: 403 },
  );
  const preview = await previewImport({
    pool: db.pool,
    actor: manager,
    termId: "1",
    kind: "HEALTH",
    rows: [
      { studentId: "3", values: { vision_left: "5.0", jump_rope_1min: 0 } },
    ],
    command: cmd(),
  });
  assert.equal(preview.result.validCount, 1);
  await commitImport({
    pool: db.pool,
    actor: manager,
    batchId: preview.result.batchId,
    expectedRevision: "1",
    command: cmd(),
  });
  const [[e]] = await db.pool.query(
    "SELECT * FROM student_term_evaluation WHERE student_id=3",
  );
  assert.equal(e.vision_left, "5.0");
  assert.equal(e.jump_rope_1min, 0);
  const p2 = await previewImport({
    pool: db.pool,
    actor: teacher,
    termId: "1",
    kind: "ACADEMIC",
    rows: [{ studentId: "3", values: { math_basic_knowledge_grade: "A" } }],
    command: cmd(),
  });
  await db.pool.query(
    "UPDATE student_term_evaluation SET revision=revision+1 WHERE student_id=3",
  );
  await assert.rejects(
    commitImport({
      pool: db.pool,
      actor: teacher,
      batchId: p2.result.batchId,
      expectedRevision: "1",
      command: cmd(),
    }),
    { statusCode: 409 },
  );
});
