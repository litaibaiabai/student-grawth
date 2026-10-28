const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("migration rejects same database, audit is read-only and rerun preserves legacy report snapshot", async (t) => {
  const source = await createCoreTestDb(t),
    target = await createCoreTestDb(t);
  await source.seedBase();
  await source.pool.query(
    "INSERT INTO term_report(school_id,term_id,student_id,version,release_version,release_key,schema_version,template_version,source_revision,snapshot_json,snapshot_hash,status,published_at) VALUES(1,1,3,1,0,REPEAT('a',64),'LEGACY_V1','OLD',0,?,REPEAT('b',64),'PUBLISHED',UTC_TIMESTAMP(6))",
    [JSON.stringify({ student: { name: "原样存档" }, original: [1, 2, 3] })],
  );
  const { migrateReportCore } = require("../scripts/migrateReportCore");
  await assert.rejects(
    migrateReportCore({
      sourceConnection: source.pool,
      targetConnection: source.pool,
      schoolId: "1",
      termIds: ["1"],
      mode: "audit",
    }),
    /different/,
  );
  const audit = await migrateReportCore({
    sourceConnection: source.pool,
    targetConnection: target.pool,
    schoolId: "1",
    termIds: ["1"],
    mode: "audit",
  });
  assert.equal(audit.mode, "audit");
  assert.equal(
    Number((await target.pool.query("SELECT COUNT(*) n FROM users"))[0][0].n),
    0,
  );
  await migrateReportCore({
    sourceConnection: source.pool,
    targetConnection: target.pool,
    schoolId: "1",
    termIds: ["1"],
    mode: "apply",
  });
  await migrateReportCore({
    sourceConnection: source.pool,
    targetConnection: target.pool,
    schoolId: "1",
    termIds: ["1"],
    mode: "apply",
  });
  const [rows] = await target.pool.query("SELECT * FROM term_report");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].snapshot_json, {
    student: { name: "原样存档" },
    original: [1, 2, 3],
  });
});
