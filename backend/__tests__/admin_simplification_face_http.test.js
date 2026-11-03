const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { createApp } = require("../app");
async function fixture(fn) {
  const app = createApp({ pool: { query: async () => [[]] }, schoolId: "1" });
  let calls = 0;
  app.locals.faceAuthService = {
    capabilities: async () => ({ available: true }),
    challenge: async () => ({
      nonce: "test-only",
      action: "BLINK",
      expiresAt: Date.now() + 60000,
    }),
    verify: async () => {
      calls++;
      throw Object.assign(Error("人脸验证未通过，请使用账号密码登录"), {
        code: 401,
        status: 401,
      });
    },
  };
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn({
      app,
      server,
      url: "http://127.0.0.1:" + server.address().port,
      calls: () => calls,
    });
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("both face endpoint aliases return authentication failures without exposing payloads", async () =>
  fixture(async ({ url, calls }) => {
    for (const prefix of ["/api/v1/auth/face", "/api/auth/face"]) {
      const r = await fetch(url + prefix + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "test",
          matched: true,
          descriptor: Array(128).fill(0),
          nonce: "invalid",
          frames: [],
        }),
      });
      assert.equal(r.status, 401);
      const body = await r.text();
      assert.ok(!body.includes("descriptor"));
      assert.equal(r.headers.get("cache-control"), "no-store");
    }
    assert.equal(calls(), 2);
  }));
test("production rejects plain HTTP even if client forges forwarded TLS headers", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await fixture(async ({ url }) => {
      const r = await fetch(url + "/api/v1/auth/face/capabilities", {
        headers: { "X-Forwarded-Proto": "https" },
      });
      assert.equal(r.status, 403);
    });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
test("account rate limiting follows database identity rather than username spelling", async () => {
  const { resolveFaceRateKey } = require("../routes/faceAuth");
  const keys = [];
  for (const username of ["admin", "ADMIN", "ádmin"]) {
    const req = {
      body: { username },
      app: {
        locals: { schoolId: "1", pool: { query: async () => [[{ id: 1 }]] } },
      },
    };
    await resolveFaceRateKey(req);
    keys.push(req.faceAuthRateKey);
  }
  assert.equal(new Set(keys).size, 1);
});
test("oversize biometric requests are rejected before model or authentication work", async () =>
  fixture(async ({ url, calls }) => {
    const r = await fetch(url + "/api/v1/auth/face/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames: ["x".repeat(7 * 1024 * 1024)] }),
    });
    assert.equal(r.status, 413);
    assert.equal(calls(), 0);
  }));
test("malformed biometric JSON never echoes or logs submitted image material", async () => {
  const original = console.error,
    logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try {
    await fixture(async ({ url }) => {
      const response = await fetch(url + "/api/v1/auth/face/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "!BIOMETRIC_LOG_SECRET",
      });
      assert.equal(response.status, 400);
      assert.ok(!(await response.text()).includes("BIOMETRIC_LOG_SECRET"));
    });
    assert.ok(!logs.join(" ").includes("BIOMETRIC_LOG_SECRET"));
  } finally {
    console.error = original;
  }
});
test("uppercase face aliases and all body-parser errors are redacted before logging", async () => {
  const original = console.error,
    logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try {
    await fixture(async ({ url }) => {
      const r = await fetch(url + "/api/v1/AUTH/FACE/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "!FACEPIXEL",
      });
      assert.equal(r.status, 400);
    });
    assert.ok(!logs.join(" ").includes("FACEPIXEL"));
  } finally {
    console.error = original;
  }
});
test("closing a verification HTTP request propagates cancellation to the service", async () =>
  fixture(async ({ app, url }) => {
    let started, observed;
    const begin = new Promise((r) => (started = r)),
      cancelled = new Promise((r) => (observed = r));
    app.locals.faceAuthService.verify = async ({ signal }) => {
      started();
      await new Promise((resolve) => {
        if (signal.aborted) {
          observed();
          resolve();
        } else
          signal.addEventListener(
            "abort",
            () => {
              observed();
              resolve();
            },
            { once: true },
          );
      });
      throw Object.assign(Error("本次验证已取消"), { code: 408, status: 408 });
    };
    const c = new AbortController(),
      request = fetch(url + "/api/v1/auth/face/login", {
        method: "POST",
        signal: c.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "cancel-test",
          nonce: "test",
          frames: [],
        }),
      });
    request.catch(() => {});
    await begin;
    c.abort();
    await assert.rejects(request, { name: "AbortError" });
    let timer;
    try {
      await Promise.race([
        cancelled,
        new Promise(
          (_, reject) =>
            (timer = setTimeout(
              () => reject(Error("cancel was not propagated")),
              2000,
            )),
        ),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }));
test("a disconnect during account lookup is already aborted when verification begins", async () =>
  fixture(async ({ app, server, url }) => {
    let began, release, closed, seen;
    const started = new Promise((r) => (began = r)),
      gate = new Promise((r) => (release = r)),
      gone = new Promise((r) => (closed = r)),
      signalSeen = new Promise((r) => (seen = r));
    server.once("request", (_req, res) => res.once("close", closed));
    app.locals.pool.query = async () => {
      began();
      await gate;
      return [[]];
    };
    app.locals.faceAuthService.verify = async ({ signal }) => {
      seen(signal.aborted);
      throw Object.assign(Error("验证已取消"), { status: 408, code: 408 });
    };
    const c = new AbortController(),
      request = fetch(url + "/api/v1/auth/face/login", {
        method: "POST",
        signal: c.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "early-cancel",
          nonce: "test",
          frames: [],
        }),
      });
    request.catch(() => {});
    await started;
    c.abort();
    await assert.rejects(request, { name: "AbortError" });
    await gone;
    release();
    assert.equal(await signalSeen, true);
  }));
