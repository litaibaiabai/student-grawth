const crypto = require("node:crypto"),
  bcrypt = require("bcrypt");
const { readKeys, sealTemplate, openTemplate } = require("./crypto");
const {
  failure,
  nonceHash,
  framesInput,
  descriptorInput,
  cosine,
  MODEL_VERSION,
  actionForNonce,
} = require("./policy");
const { faceSchemaReady } = require("../../../scripts/migrateFaceAuth");
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const generic = () => failure("人脸验证未通过，请使用账号密码登录", 401);
function createFaceAuthService({
  pool,
  schoolId,
  worker,
  keys,
  enabled = process.env.FACE_AUTH_ENABLED === "1",
  now = () => Date.now(),
  threshold = Number(process.env.FACE_AUTH_MATCH_THRESHOLD || 0.65),
}) {
  let schemaReady = false;
  const getKeys = () => keys || readKeys();
  async function capabilities() {
    try {
      if (
        !enabled ||
        !Number.isFinite(threshold) ||
        threshold < 0.65 ||
        threshold > 0.95
      )
        return { available: false };
      schemaReady = await faceSchemaReady(pool);
      if (!schemaReady) return { available: false };
      getKeys();
      await worker.ready();
      return {
        available: true,
        modelVersion: MODEL_VERSION,
        maxFrames: 32,
        expiresIn: 60,
      };
    } catch {
      return { available: false };
    }
  }
  async function available() {
    if (!(await capabilities()).available)
      throw failure("人脸登录暂不可用，请使用密码登录", 503);
  }
  const usernameCheck = (v) => {
    if (typeof v !== "string" || !v.trim() || v.length > 80) throw generic();
    return v.trim();
  };
  async function userByName(username, connection = pool, lock = false) {
    return (
      await connection.query(
        "SELECT * FROM users WHERE school_id=? AND username=?" +
          (lock ? " FOR UPDATE" : ""),
        [schoolId, username],
      )
    )[0][0];
  }
  const notAborted = (signal) => {
    if (signal?.aborted) throw failure("本次人脸验证已取消", 408);
  };
  async function transaction(fn, signal) {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const result = await fn(c);
      notAborted(signal);
      await c.commit();
      return result;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async function passwordUser(
    actor,
    password,
    connection = pool,
    lock = false,
  ) {
    const [[u]] = await connection.query(
      "SELECT * FROM users WHERE school_id=? AND id=?" +
        (lock ? " FOR UPDATE" : ""),
      [schoolId, actor.id],
    );
    if (
      !u ||
      u.status !== 0 ||
      u.token_version !== actor.tokenVersion ||
      typeof password !== "string" ||
      password.length > 128 ||
      !(await bcrypt.compare(password, u.password))
    )
      throw failure("密码验证失败", 401);
    return u;
  }
  async function status(actor) {
    const ready = await capabilities();
    schemaReady = await faceSchemaReady(pool);
    if (!schemaReady) return { ...ready, enrolled: false, enrolledAt: null };
    const [[u]] = await pool.query(
      "SELECT face_template_enc,face_enrolled_at FROM users WHERE school_id=? AND id=?",
      [schoolId, actor.id],
    );
    return {
      ...ready,
      enrolled: !!u?.face_template_enc,
      enrolledAt: u?.face_enrolled_at || null,
    };
  }
  async function challenge({ username, actor, password, consent }) {
    await available();
    const purpose = actor ? "ENROLL" : "LOGIN";
    if (actor && consent !== true) throw failure("请先同意开启人脸登录");
    const nonce = crypto.randomBytes(32).toString("base64url"),
      action = actionForNonce(nonce),
      expiresAt = now() + 60000;
    await transaction(async (c) => {
      const u = actor
        ? await passwordUser(actor, password, c, true)
        : await userByName(usernameCheck(username), c, true);
      if (!u || u.status !== 0 || (purpose === "LOGIN" && !u.face_template_enc))
        return;
      await c.query(
        "UPDATE users SET face_challenge_json=? WHERE school_id=? AND id=?",
        [
          JSON.stringify({
            hash: nonceHash(nonce),
            purpose,
            action,
            expiresAt,
            version: u.face_credential_version,
            tokenVersion: u.token_version,
          }),
          schoolId,
          u.id,
        ],
      );
    });
    return { nonce, action, expiresAt, maxFrames: 32 };
  }
  async function consume({ username, actor, nonce, purpose }) {
    if (typeof nonce !== "string" || nonce.length > 128) throw generic();
    let claimed = null;
    await transaction(async (c) => {
      const u = actor
        ? (
            await c.query(
              "SELECT * FROM users WHERE school_id=? AND id=? FOR UPDATE",
              [schoolId, actor.id],
            )
          )[0][0]
        : await userByName(usernameCheck(username), c, true);
      if (!u) return;
      const ch = parse(u.face_challenge_json);
      if (!ch || ch.hash !== nonceHash(nonce)) return;
      await c.query(
        "UPDATE users SET face_challenge_json=NULL WHERE school_id=? AND id=?",
        [schoolId, u.id],
      );
      if (
        ch.purpose !== purpose ||
        ch.expiresAt <= now() ||
        ch.version !== u.face_credential_version ||
        ch.tokenVersion !== u.token_version ||
        u.status !== 0 ||
        (actor && actor.tokenVersion !== u.token_version)
      )
        return;
      claimed = { u, ch };
    });
    if (!claimed) throw generic();
    return claimed;
  }
  async function verifyCore({ username, actor, nonce, frames, signal }) {
    if (typeof nonce !== "string" || !/^[-_A-Za-z0-9]{43}$/.test(nonce))
      throw generic();
    const purpose = actor ? "ENROLL" : "LOGIN";
    let claimed;
    try {
      claimed = await consume({ username, actor, nonce, purpose });
    } catch (e) {
      if (actor) throw e;
    }
    framesInput(frames);
    notAborted(signal);
    let result;
    try {
      result = await worker.infer({
        frames,
        action: claimed?.ch.action || actionForNonce(nonce),
      });
    } catch (e) {
      throw failure(
        e.status === 422 ? e.message : "人脸验证暂不可用，请使用密码登录",
        e.status === 429 ? 429 : e.status === 422 ? 422 : 503,
      );
    }
    notAborted(signal);
    const inferred = descriptorInput(result);
    if (!claimed) throw generic();
    const { u, ch } = claimed;
    let template;
    if (purpose === "LOGIN") {
      if (!u.face_template_enc) throw generic();
      template = descriptorInput(
        openTemplate(
          u.face_template_enc,
          { schoolId, userId: u.id, version: u.face_credential_version },
          getKeys(),
        ),
      );
      if (cosine(template.descriptor, inferred.descriptor) < threshold)
        throw generic();
    }
    return transaction(async (c) => {
      notAborted(signal);
      const [[current]] = await c.query(
        "SELECT * FROM users WHERE school_id=? AND id=? FOR UPDATE",
        [schoolId, u.id],
      );
      if (
        !current ||
        current.status !== 0 ||
        now() >= ch.expiresAt ||
        current.token_version !== u.token_version ||
        current.face_credential_version !== u.face_credential_version
      )
        throw generic();
      if (purpose === "ENROLL") {
        const version = current.face_credential_version + 1;
        const encrypted = sealTemplate(
          inferred,
          { schoolId, userId: u.id, version },
          getKeys(),
        );
        await c.query(
          "UPDATE users SET face_template_enc=?,face_enrolled_at=UTC_TIMESTAMP(3),face_credential_version=?,face_challenge_json=NULL WHERE school_id=? AND id=?",
          [encrypted, version, schoolId, u.id],
        );
        return { enrolled: true };
      }
      if (JSON.parse(current.face_template_enc).keyId !== getKeys().active)
        await c.query(
          "UPDATE users SET face_template_enc=? WHERE school_id=? AND id=?",
          [
            sealTemplate(
              template,
              {
                schoolId,
                userId: u.id,
                version: current.face_credential_version,
              },
              getKeys(),
            ),
            schoolId,
            u.id,
          ],
        );
      return {
        id: String(current.id),
        school_id: String(current.school_id),
        username: current.username,
        real_name: current.real_name,
        role: current.role,
        token_version: current.token_version,
      };
    }, signal);
  }
  async function verify(input) {
    notAborted(input.signal);
    await available();
    try {
      return await verifyCore(input);
    } catch (e) {
      if (!input.actor) throw generic();
      throw e;
    }
  }
  async function remove(actor, password) {
    if (!(await faceSchemaReady(pool))) return { enrolled: false };
    await transaction(async (c) => {
      const u = await passwordUser(actor, password, c, true);
      await c.query(
        "UPDATE users SET face_template_enc=NULL,face_enrolled_at=NULL,face_credential_version=face_credential_version+1,face_challenge_json=NULL WHERE school_id=? AND id=?",
        [schoolId, u.id],
      );
    });
    return { enrolled: false };
  }
  return { capabilities, status, challenge, verify, remove };
}
module.exports = { createFaceAuthService };
