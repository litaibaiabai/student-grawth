const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test(
  "school release and indexed class reads meet dedicated 3000-student fixture budgets",
  { skip: !process.env.REPORT_PERF, timeout: 600000 },
  async (t) => {
    const db = await createCoreTestDb(t);
    await db.seedBase();
    const p = require("../services/reportCorePolicy");
    const e = require("../services/reportCoreEvaluation");
    const pub = require("../services/reportCorePublish");
    const { getTerm } = require("../services/reportCoreStore");
    const [[u]] = await db.pool.query("SELECT password FROM users LIMIT 1");
    const total = 3000;
    for (let start = 5; start < total + 3; start += 500) {
      const users = [],
        evals = [];
      for (let id = start; id < Math.min(start + 500, total + 3); id++) {
        const cls = Math.floor((id - 3) / 50) + 1;
        users.push([
          id,
          1,
          "perf" + id,
          u.password,
          "样本" + id,
          "student",
          4,
          cls,
        ]);
        evals.push([1, 1, id, "样本" + id, 4, cls, "CORE_V1", "1"]);
      }
      await db.pool.query(
        "INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no) VALUES ?",
        [users],
      );
      await db.pool.query(
        "INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES ?",
        [evals],
      );
    }
    const assignments = p.fixedFields.map((f) => `\`${f.column}\`=?`);
    const values = p.fixedFields.map((f) =>
      f.valueType === "star"
        ? 3
        : f.valueType === "grade"
          ? "A"
          : ["height_cm", "weight_kg"].includes(f.column)
            ? 100
            : f.column === "jump_rope_1min"
              ? 160
              : f.column.startsWith("vision_")
                ? "5.0"
                : "简短真实文本",
    );
    const sources = Object.fromEntries(
      p.fixedFields
        .filter((f) => f.sourceType === "CARD")
        .map((f) => [f.column, { settled: true }]),
    );
    await db.pool.query(
      "UPDATE student_term_evaluation SET " +
        assignments.join(",") +
        "," +
        p.narratives.map((n) => `\`${n}\`='期末简短评价'`).join(",") +
        ",field_sources=?",
      [...values, JSON.stringify(sources)],
    );
    const term = await getTerm(db.pool, "1", "1");
    const [all] = await db.pool.query("SELECT * FROM student_term_evaluation");
    for (const row of all)
      await db.pool.query(
        "UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=2,confirmed_at=UTC_TIMESTAMP(6),approval_fingerprint=? WHERE id=?",
        [e.reportFingerprint(row, term), row.id],
      );
    const sourceCount = Number(process.env.REPORT_PERF_SOURCES || 2000000);
    for (let start = 0; start < sourceCount; start += 5000) {
      const rows = [];
      for (let i = start; i < Math.min(start + 5000, sourceCount); i++)
        rows.push([
          1,
          1,
          3 + (i % total),
          "CARD",
          "DIRECT",
          "CONFIRMED",
          1,
          p.catalog.cardCatalog[i % 37].targetColumn,
          p.stableHash(["perf", i]),
          "a".repeat(64),
          "{}",
        ]);
      await db.pool.query(
        "INSERT INTO evaluation_source_record(school_id,term_id,student_id,source_type,record_kind,status,delta,target_key,business_key,payload_hash,payload_json) VALUES ?",
        [rows],
      );
      if (start % 250000 === 0) console.log("performance sources", start);
    }
    const durations = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const start = performance.now();
        await db.pool.query(
          "SELECT student_id,revision,status FROM student_term_evaluation WHERE school_id=1 AND term_id=1 AND grade_snapshot=4 AND class_no_snapshot=1 LIMIT 100",
        );
        return performance.now() - start;
      }),
    );
    durations.sort((a, b) => a - b);
    const p95 = durations[47];
    assert.ok(p95 <= 800, `list p95 ${p95}`);
    const actor = { id: "1", schoolId: "1", role: "manager", tokenVersion: 1 },
      command = (n) => ({
        requestKey: "perf-" + n,
        payloadHash: p.stableHash(n),
      });
    const r = await pub.beginRelease({
      pool: db.pool,
      actor,
      termId: "1",
      command: command(1),
    });
    let state = r;
    const start = performance.now();
    while (state.prepared < state.total)
      state = await pub.prepareReleaseChunk({
        pool: db.pool,
        termId: "1",
        releaseKey: r.releaseKey,
        fence: r.fence,
        limit: 50,
      });
    const prepareMs = performance.now() - start;
    const active = performance.now();
    await pub.activateRelease({
      pool: db.pool,
      actor,
      termId: "1",
      releaseKey: r.releaseKey,
      fence: r.fence,
      command: command(2),
    });
    const activateMs = performance.now() - active;
    assert.ok(prepareMs <= 120000, `prepare ${prepareMs}`);
    assert.ok(activateMs <= 3000, `activate ${activateMs}`);
    const dir = path.join(__dirname, "../../output/report-core");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "performance.json"),
      JSON.stringify(
        {
          students: total,
          sources: sourceCount,
          concurrentReads: 50,
          classListP95Ms: p95,
          prepareMs,
          activateMs,
        },
        null,
        2,
      ),
    );
  },
);
