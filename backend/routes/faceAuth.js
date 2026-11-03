const rateLimit = require("express-rate-limit"),
  crypto = require("node:crypto");
const { signToken } = require("../middleware/auth");
const ipLimit = rateLimit({
  windowMs: 60000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { code: 429, message: "操作过于频繁，请稍后重试" },
});
const accountLimit = rateLimit({
  windowMs: 60000,
  limit: 8,
  keyGenerator: (req) =>
    crypto
      .createHash("sha256")
      .update(
        String(req.app.locals.schoolId) +
          ":" +
          String(req.faceAuthRateKey || "anonymous"),
      )
      .digest("hex"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { code: 429, message: "操作过于频繁，请稍后重试" },
});
async function resolveFaceRateKey(req) {
  if (req.actor) {
    req.faceAuthRateKey = "u:" + req.actor.id;
    return;
  }
  const username = req.body?.username;
  if (typeof username !== "string" || username.length > 80) {
    req.faceAuthRateKey = "invalid";
    return;
  }
  const [[u]] = await req.app.locals.pool.query(
    "SELECT id FROM users WHERE school_id=? AND username=?",
    [req.app.locals.schoolId, username.trim()],
  );
  req.faceAuthRateKey = u
    ? "u:" + u.id
    : "unknown:" +
      crypto
        .createHash("sha256")
        .update(username.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase())
        .digest("hex");
}
async function canonicalLimit(req, _res, next) {
  try {
    await resolveFaceRateKey(req);
    next();
  } catch (e) {
    next(e);
  }
}
function secure(req, res, next) {
  res.set("Cache-Control", "no-store");
  const host = req.hostname,
    local =
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress,
      ) && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
  if (!req.secure && !(process.env.NODE_ENV !== "production" && local))
    return res
      .status(403)
      .json({ code: 403, message: "人脸验证需要HTTPS安全连接" });
  next();
}
function service(req) {
  if (!req.app.locals.faceAuthService) {
    const { FaceWorker } = require("../services/faceAuth/worker");
    const worker = new FaceWorker();
    req.app.locals.faceWorker = worker;
    req.app.locals.faceAuthService =
      require("../services/faceAuth/service").createFaceAuthService({
        pool: req.app.locals.pool,
        schoolId: req.app.locals.schoolId,
        worker,
      });
  }
  return req.app.locals.faceAuthService;
}
async function verifyRequest(req, res, input) {
  const controller = new AbortController();
  const abort = () => controller.abort(),
    closed = () => {
      if (!res.writableEnded) abort();
    };
  req.once("aborted", abort);
  res.once("close", closed);
  if (req.aborted || res.destroyed || req.socket.destroyed) abort();
  try {
    return await service(req).verify({ ...input, signal: controller.signal });
  } finally {
    req.off("aborted", abort);
    res.off("close", closed);
  }
}
function mountFacePublic(r, { asyncRoute, ok }) {
  r.use("/auth/face", secure, ipLimit);
  r.get(
    "/auth/face/capabilities",
    asyncRoute(async (req, res) => ok(res, await service(req).capabilities())),
  );
  r.post(
    "/auth/face/challenge",
    canonicalLimit,
    accountLimit,
    asyncRoute(async (req, res) =>
      ok(res, await service(req).challenge({ username: req.body.username })),
    ),
  );
  r.post(
    "/auth/face/login",
    canonicalLimit,
    accountLimit,
    asyncRoute(async (req, res) => {
      const u = await verifyRequest(req, res, {
        username: req.body.username,
        nonce: req.body.nonce,
        frames: req.body.frames,
      });
      ok(res, {
        token: signToken(u),
        user: {
          id: u.id,
          schoolId: u.school_id,
          username: u.username,
          real_name: u.real_name,
          role: u.role,
        },
      });
    }),
  );
}
function mountFacePrivate(r, { asyncRoute, ok }) {
  r.use("/me/face", secure, ipLimit);
  r.get(
    "/me/face",
    asyncRoute(async (req, res) =>
      ok(res, await service(req).status(req.actor)),
    ),
  );
  r.post(
    "/me/face/challenge",
    canonicalLimit,
    accountLimit,
    asyncRoute(async (req, res) =>
      ok(
        res,
        await service(req).challenge({
          actor: req.actor,
          password: req.body.password,
          consent: req.body.consent,
        }),
      ),
    ),
  );
  r.put(
    "/me/face",
    canonicalLimit,
    accountLimit,
    asyncRoute(async (req, res) =>
      ok(
        res,
        await verifyRequest(req, res, {
          actor: req.actor,
          nonce: req.body.nonce,
          frames: req.body.frames,
        }),
      ),
    ),
  );
  r.delete(
    "/me/face",
    canonicalLimit,
    accountLimit,
    asyncRoute(async (req, res) =>
      ok(res, await service(req).remove(req.actor, req.body.password)),
    ),
  );
}
module.exports = { mountFacePublic, mountFacePrivate, resolveFaceRateKey };
