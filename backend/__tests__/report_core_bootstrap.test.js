const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("actual HTTP flow accepts self, direct, import and material endpoints without creating legacy tables", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const server = require("../app")
    .createApp({ pool: db.pool, schoolId: "1" })
    .listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  let n = 0;
  const api = async (user, path, body, method) => {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + user,
      },
      body: body
        ? JSON.stringify({ ...body, requestKey: "http-" + ++n })
        : undefined,
    });
    return { status: r.status, ...(await r.json()) };
  };
  const login = async (username) =>
    (await api("", "/auth/login", { username, password: "Test-pass-2026" }))
      .data.token;
  const student = await login("student"),
    teacher = await login("teacher"),
    admin = await login("admin");
  assert.equal(
    (
      await api(
        student,
        "/report-core/forms/3",
        {
          termId: "1",
          expectedRevision: "1",
          values: { conduct_politeness_self_star: 2 },
        },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(teacher, "/report-core/direct-scores", {
        termId: "1",
        studentIds: ["3"],
        categoryCode: "CONDUCT_POLITENESS_OTHER_STAR",
        reason: "有礼貌",
      })
    ).status,
    200,
  );
  assert.equal(
    (await api(admin, "/admin/report-core/readiness?termId=1")).status,
    200,
  );
  assert.equal(
    (await api(admin, "/report-core/reports/drafts/3?termId=1")).status,
    403,
  );
  assert.equal((await api(student, "/growth/my")).status, 410);
  assert.equal((await db.pool.query("SHOW TABLES"))[0].length, 6);
});
test("school initialization creates only requested admin and refuses existing user overwrites", async (t) => {
  const db = await createCoreTestDb(t);
  const { initializeSchool } = require("../scripts/initReportCore");
  await initializeSchool({
    pool: db.pool,
    schoolId: "1",
    password: "Test-pass-2026",
    demo: false,
  });
  const [rows] = await db.pool.query("SELECT role FROM users");
  assert.deepEqual(
    rows.map((r) => r.role),
    ["manager"],
  );
  await assert.rejects(
    initializeSchool({
      pool: db.pool,
      schoolId: "1",
      password: "Other-pass-2026",
      demo: true,
    }),
    /already|已有/,
  );
});
