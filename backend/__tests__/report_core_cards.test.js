const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("quota restricts generation; same class concurrent redemption credits only one student; reversal only once", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  process.env.CARD_PRINT_KEY = crypto.randomBytes(32).toString("hex");
  const cards = require("../services/reportCoreCards");
  const actor = { id: "2", schoolId: "1", role: "teacher", tokenVersion: 1 };
  const manager = { ...actor, id: "1", role: "manager" };
  let n = 0;
  const command = () => ({
    requestKey: `cards-${++n}`,
    payloadHash: String(n).padStart(64, "0"),
  });
  const quota = await cards.saveQuota({
    pool: db.pool,
    actor: manager,
    termId: "1",
    teacherId: "2",
    monthKey: "2026-10",
    total: 2,
    command: command(),
  });
  const quotaId = quota.result.quotaId;
  await assert.rejects(
    cards.savePlan({
      pool: db.pool,
      actor,
      quotaId,
      expectedRevision: "1",
      plans: [
        {
          grade: 4,
          classNo: 1,
          classTotal: 3,
          items: [{ categoryCode: "CONDUCT_POLITENESS_OTHER_STAR", count: 3 }],
        },
      ],
      command: command(),
    }),
    { statusCode: 422 },
  );
  await cards.savePlan({
    pool: db.pool,
    actor,
    quotaId,
    expectedRevision: "1",
    plans: [
      {
        grade: 4,
        classNo: 1,
        classTotal: 2,
        items: [{ categoryCode: "CONDUCT_POLITENESS_OTHER_STAR", count: 2 }],
      },
    ],
    command: command(),
  });
  await cards.generateCards({
    pool: db.pool,
    actor,
    quotaId,
    expectedRevision: "2",
    command: command(),
  });
  const list = await cards.listCards({ pool: db.pool, actor, termId: "1" });
  const token = await cards.cardToken({
    pool: db.pool,
    actor,
    sourceId: list[0].id,
  });
  const race = await Promise.allSettled(
    ["3", "4"].map((id) =>
      cards.redeemCard({
        pool: db.pool,
        actor: { ...actor, id, role: "student" },
        token,
        command: command(),
        now: new Date("2026-10-28"),
      }),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const [[used]] = await db.pool.query(
    "SELECT * FROM evaluation_source_record WHERE record_kind='CARD' AND status='USED'",
  );
  await cards.reverseSource({
    pool: db.pool,
    actor,
    sourceId: String(used.id),
    reason: "纠正",
    command: command(),
  });
  await assert.rejects(
    cards.reverseSource({
      pool: db.pool,
      actor,
      sourceId: String(used.id),
      reason: "再纠正",
      command: command(),
    }),
    { statusCode: 409 },
  );
  const zip = await cards.buildClassPrintZip({ pool: db.pool, actor, quotaId });
  const chunks = [];
  for await (const chunk of zip) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).subarray(0, 2).toString(), "PK");
});
