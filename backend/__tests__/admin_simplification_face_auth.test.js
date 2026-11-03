const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { withFormalRollback } = require("./helpers/formalRollback");
const { createFaceAuthService } = require("../services/faceAuth/service");
const keys = { active: "one", values: { one: crypto.randomBytes(32) } };
test("disabled face login never requires schema/models or interferes with password mode", async () => {
  const s = createFaceAuthService({
    pool: {
      query: () => {
        throw Error("must not query");
      },
    },
    schoolId: "1",
    enabled: false,
  });
  assert.deepEqual(await s.capabilities(), { available: false });
  await assert.rejects(s.challenge({ username: "admin" }), { status: 503 });
});
test("face descriptor policy rejects browser verdicts and repeated camera frames", () => {
  const {
    framesInput,
    descriptorInput,
  } = require("../services/faceAuth/policy");
  assert.throws(
    () =>
      framesInput(
        Array(8).fill(
          "data:image/jpeg;base64," +
            Buffer.concat([
              Buffer.from([255, 216, 255]),
              Buffer.alloc(100),
            ]).toString("base64"),
        ),
      ),
    /重复/,
  );
  assert.throws(
    () => descriptorInput({ matched: true, descriptor: [] }),
    /无效/,
  );
});
test("bound users can see and remove their credential even when face login is disabled", async () => {
  const pool = {
    query: async (sql) =>
      sql.includes("information_schema")
        ? [
            [
              ...[
                "face_template_enc",
                "face_enrolled_at",
                "face_credential_version",
                "face_challenge_json",
              ].map((COLUMN_NAME) => ({ COLUMN_NAME })),
            ],
          ]
        : [
            [
              {
                face_template_enc: "encrypted",
                face_enrolled_at: "2026-11-03",
              },
            ],
          ],
  };
  const s = createFaceAuthService({ pool, schoolId: "1", enabled: false });
  assert.equal((await s.status({ id: "4" })).enrolled, true);
});
const validFrames = () =>
  Array.from(
    { length: 8 },
    (_, i) =>
      "data:image/jpeg;base64," +
      Buffer.concat([
        Buffer.from([255, 216, 255]),
        Buffer.alloc(120, i),
      ]).toString("base64"),
  );
async function fixture(fn) {
  await withFormalRollback(async ({ pool }) => {
    const password = "Face-test-only-2026",
      hash = await require("bcrypt").hash(password, 4);
    await pool.query(
      "UPDATE users SET password=?,face_template_enc=NULL,face_credential_version=0,face_challenge_json=NULL WHERE id=1",
      [hash],
    );
    const [[u]] = await pool.query("SELECT * FROM users WHERE id=1");
    const actor = { id: "1", tokenVersion: u.token_version };
    let calls = 0;
    const worker = {
      ready: async () => {},
      infer: async () => {
        calls++;
        return {
          modelVersion: "sface-2021dec",
          descriptor: Array(128).fill(1 / Math.sqrt(128)),
        };
      },
    };
    let clock = Date.now();
    const service = createFaceAuthService({
      pool,
      schoolId: "1",
      worker,
      keys,
      enabled: true,
      now: () => clock,
    });
    await fn({
      pool,
      service,
      worker,
      actor,
      password,
      calls: () => calls,
      tick: (delta) => {
        clock += delta;
      },
    });
  });
}
test("password and consent protect binding; success encrypts features and replay cannot infer again", async () =>
  fixture(async ({ pool, service, actor, password, calls }) => {
    await assert.rejects(
      service.challenge({ actor, password: "wrong", consent: true }),
      { status: 401 },
    );
    await assert.rejects(
      service.challenge({ actor, password, consent: false }),
      { status: 422 },
    );
    const ch = await service.challenge({ actor, password, consent: true });
    await service.verify({ actor, nonce: ch.nonce, frames: validFrames() });
    const [[u]] = await pool.query("SELECT * FROM users WHERE id=1");
    assert.ok(
      u.face_template_enc && !u.face_template_enc.includes("descriptor"),
    );
    assert.equal(u.face_credential_version, 1);
    await assert.rejects(
      service.verify({ actor, nonce: ch.nonce, frames: validFrames() }),
      { status: 401 },
    );
    assert.equal(calls(), 1);
    const login = await service.challenge({ username: "admin" });
    const user = await service.verify({
      username: "admin",
      nonce: login.nonce,
      frames: validFrames(),
    });
    assert.equal(user.id, "1");
    assert.ok(!("face_template_enc" in user));
    await service.remove(actor, password);
    assert.equal((await service.status(actor)).enrolled, false);
  }));
test("one challenge has only one winner and wrong-purpose attempts consume it", async () =>
  fixture(async ({ service, actor, password, calls }) => {
    const ch = await service.challenge({ actor, password, consent: true });
    const results = await Promise.allSettled([
      service.verify({ actor, nonce: ch.nonce, frames: validFrames() }),
      service.verify({ actor, nonce: ch.nonce, frames: validFrames() }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(calls(), 1);
    const login = await service.challenge({ username: "admin" });
    await assert.rejects(
      service.verify({ actor, nonce: login.nonce, frames: validFrames() }),
      { status: 401 },
    );
    await assert.rejects(
      service.verify({
        username: "admin",
        nonce: login.nonce,
        frames: validFrames(),
      }),
      { status: 401 },
    );
  }));
test("logout or rebind during inference invalidates the result", async () =>
  fixture(async ({ pool, service, worker, actor, password }) => {
    const ch = await service.challenge({ actor, password, consent: true });
    worker.infer = async () => {
      await pool.query(
        "UPDATE users SET token_version=token_version+1 WHERE id=1",
      );
      return {
        modelVersion: "sface-2021dec",
        descriptor: Array(128).fill(1 / Math.sqrt(128)),
      };
    };
    await assert.rejects(
      service.verify({ actor, nonce: ch.nonce, frames: validFrames() }),
      { status: 401 },
    );
    const [[u]] = await pool.query(
      "SELECT face_template_enc FROM users WHERE id=1",
    );
    assert.equal(u.face_template_enc, null);
  }));
test("expired or malformed attempts consume the nonce without running a model", async () =>
  fixture(async ({ pool, service, actor, password, calls }) => {
    const expired = await service.challenge({ actor, password, consent: true });
    await pool.query(
      "UPDATE users SET face_challenge_json=JSON_SET(face_challenge_json,'$.expiresAt',0) WHERE id=1",
    );
    await assert.rejects(
      service.verify({ actor, nonce: expired.nonce, frames: validFrames() }),
      { status: 401 },
    );
    const invalid = await service.challenge({ actor, password, consent: true });
    await assert.rejects(
      service.verify({ actor, nonce: invalid.nonce, frames: [] }),
      { status: 422 },
    );
    await assert.rejects(
      service.verify({ actor, nonce: invalid.nonce, frames: validFrames() }),
      { status: 401 },
    );
    assert.equal(calls(), 0);
  }));
test("unknown and disabled users receive unusable same-shaped challenges", async () =>
  fixture(async ({ pool, service, actor, password, calls }) => {
    const unknown = await service.challenge({
      username: "nonexistent-face-user",
    });
    assert.equal(typeof unknown.nonce, "string");
    await assert.rejects(
      service.verify({
        username: "nonexistent-face-user",
        nonce: unknown.nonce,
        frames: validFrames(),
      }),
      { status: 401 },
    );
    await pool.query("UPDATE users SET status=1 WHERE id=1");
    const disabled = await service.challenge({ username: "admin" });
    assert.deepEqual(Object.keys(disabled), Object.keys(unknown));
    await assert.rejects(
      service.verify({
        username: "admin",
        nonce: disabled.nonce,
        frames: validFrames(),
      }),
      { status: 401 },
    );
    assert.equal(calls(), 2);
  }));
test("a challenge expiring during inference cannot create a credential", async () =>
  fixture(async ({ pool, service, worker, actor, password, tick }) => {
    const ch = await service.challenge({ actor, password, consent: true });
    worker.infer = async () => {
      tick(60001);
      return {
        modelVersion: "sface-2021dec",
        descriptor: Array(128).fill(1 / Math.sqrt(128)),
      };
    };
    await assert.rejects(
      service.verify({ actor, nonce: ch.nonce, frames: validFrames() }),
      { status: 401 },
    );
    const [[u]] = await pool.query(
      "SELECT face_template_enc FROM users WHERE id=1",
    );
    assert.equal(u.face_template_enc, null);
  }));
test("successful verification rewraps older encryption keys without changing credential identity", async () =>
  fixture(async ({ pool, service, actor, password }) => {
    const ch = await service.challenge({ actor, password, consent: true });
    await service.verify({ actor, nonce: ch.nonce, frames: validFrames() });
    keys.values.two = crypto.randomBytes(32);
    keys.active = "two";
    try {
      const login = await service.challenge({ username: "admin" });
      await service.verify({
        username: "admin",
        nonce: login.nonce,
        frames: validFrames(),
      });
      const [[u]] = await pool.query(
        "SELECT face_template_enc,face_credential_version FROM users WHERE id=1",
      );
      assert.equal(JSON.parse(u.face_template_enc).keyId, "two");
      assert.equal(u.face_credential_version, 1);
    } finally {
      keys.active = "one";
      delete keys.values.two;
    }
  }));
test("public face login never reveals enrollment through malformed input or model failures", async () =>
  fixture(async ({ service, worker, actor, password }) => {
    const enroll = await service.challenge({ actor, password, consent: true });
    await service.verify({ actor, nonce: enroll.nonce, frames: validFrames() });
    const statuses = [];
    for (const username of ["admin", "teacher_lin", "unknown-face-test"]) {
      const ch = await service.challenge({ username });
      try {
        await service.verify({ username, nonce: ch.nonce, frames: [] });
      } catch (e) {
        statuses.push([e.status, e.message]);
      }
    }
    assert.equal(new Set(statuses.map(JSON.stringify)).size, 1);
    assert.equal(statuses[0][0], 401);
    let calls = 0;
    worker.infer = async () => {
      calls++;
      throw Object.assign(Error("光照不足"), { status: 422 });
    };
    for (const username of ["admin", "unknown-face-test"]) {
      const ch = await service.challenge({ username });
      await assert.rejects(
        service.verify({ username, nonce: ch.nonce, frames: validFrames() }),
        { status: 401 },
      );
    }
    assert.equal(
      calls,
      2,
      "same model validation for valid-image negative attempts",
    );
  }));
test("disabling or rebinding during inference prevents template creation", async () => {
  for (const column of ["status", "face_credential_version"])
    await fixture(async ({ pool, service, worker, actor, password }) => {
      const ch = await service.challenge({ actor, password, consent: true });
      worker.infer = async () => {
        await pool.query(
          "UPDATE users SET `" + column + "`=`" + column + "`+1 WHERE id=1",
        );
        return {
          modelVersion: "sface-2021dec",
          descriptor: Array(128).fill(1 / Math.sqrt(128)),
        };
      };
      await assert.rejects(
        service.verify({ actor, nonce: ch.nonce, frames: validFrames() }),
        { status: 401 },
      );
      assert.equal(
        (
          await pool.query("SELECT face_template_enc FROM users WHERE id=1")
        )[0][0].face_template_enc,
        null,
      );
    });
});
test("a different identity is rejected even when the worker reports a structurally valid descriptor", async () =>
  fixture(async ({ service, worker, actor, password }) => {
    const ch = await service.challenge({ actor, password, consent: true });
    await service.verify({ actor, nonce: ch.nonce, frames: validFrames() });
    worker.infer = async () => ({
      modelVersion: "sface-2021dec",
      descriptor: Array.from(
        { length: 128 },
        (_, i) => (i % 2 ? 1 : -1) / Math.sqrt(128),
      ),
    });
    const login = await service.challenge({ username: "admin" });
    await assert.rejects(
      service.verify({
        username: "admin",
        nonce: login.nonce,
        frames: validFrames(),
      }),
      { status: 401 },
    );
  }));
test("another account or school cannot consume a user enrollment challenge", async () =>
  fixture(async ({ pool, service, worker, actor, password }) => {
    const ch = await service.challenge({ actor, password, consent: true });
    const [[other]] = await pool.query(
      "SELECT id,token_version FROM users WHERE id<>1 LIMIT 1",
    );
    await assert.rejects(
      service.verify({
        actor: { id: String(other.id), tokenVersion: other.token_version },
        nonce: ch.nonce,
        frames: validFrames(),
      }),
      { status: 401 },
    );
    const otherSchool = createFaceAuthService({
      pool,
      schoolId: "2",
      worker,
      keys,
      enabled: true,
    });
    await assert.rejects(
      otherSchool.verify({ actor, nonce: ch.nonce, frames: validFrames() }),
      { status: 401 },
    );
    await service.verify({ actor, nonce: ch.nonce, frames: validFrames() });
  }));
test("real MySQL users row lock excludes a second connection until the first rolls back", async () => {
  const pool = require("../db").createDbPool({ database: "student_growth" }),
    a = await pool.getConnection(),
    b = await pool.getConnection();
  let pending;
  try {
    await a.beginTransaction();
    await b.beginTransaction();
    await a.query("SELECT id FROM users WHERE id=1 FOR UPDATE");
    let acquired = false;
    pending = b.query("SELECT id FROM users WHERE id=1 FOR UPDATE").then(() => {
      acquired = true;
    });
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(acquired, false);
    await a.rollback();
    await pending;
    assert.equal(acquired, true);
  } finally {
    await a.rollback();
    await b.rollback();
    a.release();
    b.release();
    await pool.end();
  }
});
test("cancelled enrollment during inference never persists a face credential", async () =>
  fixture(async ({ pool, service, worker, actor, password }) => {
    const controller = new AbortController(),
      ch = await service.challenge({ actor, password, consent: true });
    worker.infer = async () => {
      controller.abort();
      return {
        modelVersion: "sface-2021dec",
        descriptor: Array(128).fill(1 / Math.sqrt(128)),
      };
    };
    await assert.rejects(
      service.verify({
        actor,
        nonce: ch.nonce,
        frames: validFrames(),
        signal: controller.signal,
      }),
      /取消/,
    );
    assert.equal(
      (await pool.query("SELECT face_template_enc FROM users WHERE id=1"))[0][0]
        .face_template_enc,
      null,
    );
  }));
