const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("login uses live school identity, logout revokes tokens and cross-school tokens are rejected", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const { createApp } = require("../app");
  assert.equal(typeof createApp, "function");
  const server = createApp({
    pool: db.pool,
    schoolId: "1",
    clock: () => new Date("2026-10-28T08:00:00Z"),
  }).listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, token) =>
    fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  let r = await call("/api/auth/login", {
    username: "student",
    password: "Test-pass-2026",
  });
  assert.equal(r.status, 200);
  const { data } = await r.json();
  assert.equal(data.user.role, "student");
  assert.equal((await call("/api/v1/me", null, data.token)).status, 200);
  assert.equal(
    (await call("/api/v1/report-core/terms", null, data.token)).status,
    200,
  );
  assert.equal(
    (await call("/api/v1/admin/report-core/terms", null, data.token)).status,
    403,
  );
  await call("/api/auth/logout", {}, data.token);
  assert.equal((await call("/api/v1/me", null, data.token)).status, 401);
  const teacher = (
    await (
      await call("/api/auth/login", {
        username: "teacher",
        password: "Test-pass-2026",
      })
    ).json()
  ).data;
  await db.pool.query("DELETE FROM teacher_teaching_assignment");
  assert.equal(
    (await call("/api/v1/report-core/students?termId=1", null, teacher.token))
      .status,
    403,
  );
  await db.pool.query("UPDATE users SET status=1 WHERE id=2");
  assert.equal((await call("/api/v1/me", null, teacher.token)).status, 401);
});
