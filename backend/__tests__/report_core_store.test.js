const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("mutation replays identical commands once, rejects changed payload and invalidates confirmation", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const { withMutation, addSource } = require("../services/reportCoreStore");
  const actor = { id: "2", schoolId: "1", role: "teacher", tokenVersion: 1 };
  const args = {
    pool: db.pool,
    actor,
    termId: "1",
    studentIds: ["3"],
    action: "test",
    command: { requestKey: "test-one", payloadHash: "a".repeat(64) },
  };
  const mutate = async (c) => {
    await addSource(c, {
      schoolId: "1",
      termId: "1",
      studentId: "3",
      actorId: "2",
      sourceType: "SELF",
      kind: "FORM",
      status: "SUBMITTED",
      payload: { values: { conduct_politeness_self_star: 2 } },
      key: ["test", 1],
    });
    return {
      result: { saved: true },
      changedTargetsByStudent: { 3: ["conduct_politeness_self_star"] },
    };
  };
  const a = await withMutation(args, mutate),
    b = await withMutation(args, mutate);
  assert.equal(a.replayed, false);
  assert.equal(b.replayed, true);
  assert.equal(b.revisions["3"], a.revisions["3"]);
  assert.equal(
    (
      await db.pool.query(
        "SELECT conduct_politeness_self_star s FROM student_term_evaluation WHERE student_id=3",
      )
    )[0][0].s,
    2,
  );
  await assert.rejects(
    withMutation(
      { ...args, command: { ...args.command, payloadHash: "b".repeat(64) } },
      mutate,
    ),
    { statusCode: 409 },
  );
  await db.pool.query(
    "UPDATE academic_year SET release_status='FAILED' WHERE id=1",
  );
  await assert.rejects(
    withMutation(
      { ...args, command: { requestKey: "new", payloadHash: "a".repeat(64) } },
      mutate,
    ),
    { statusCode: 423 },
  );
  assert.equal((await withMutation(args, mutate)).replayed, true);
});
