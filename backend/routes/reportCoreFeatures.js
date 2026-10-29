const multer = require("multer");
const fs = require("node:fs/promises");
const {
  stableHash,
  fail,
  subjectFor,
} = require("../services/reportCorePolicy");
const {
  assertScope,
  assignments,
} = require("../services/authorizationService");
const { parse, getTerm } = require("../services/reportCoreStore");
const cards = require("../services/reportCoreCards"),
  imports = require("../services/reportCoreImports"),
  materials = require("../services/reportCoreMaterials"),
  stories = require("../services/reportCoreStories"),
  evaluation = require("../services/reportCoreEvaluation"),
  publish = require("../services/reportCorePublish"),
  admin = require("../services/reportCoreAdmin");
function mountFeatures(r, { asyncRoute, ok }) {
  const context = (req) => ({ pool: req.app.locals.pool, actor: req.actor });
  const command = (req) => ({
    requestKey: req.body.requestKey,
    payloadHash: stableHash({
      body: req.body,
      params: req.params,
      fileHash: req.file
        ? stableHash(req.file.buffer.toString("base64"))
        : undefined,
    }),
  });
  const args = (req) => ({
    ...req.body,
    ...context(req),
    command: command(req),
  });
  const key = (req) => ({
    schoolId: req.actor.schoolId,
    termId: req.body?.termId || req.query.termId,
    studentId: req.params.studentId,
  });
  const post = (url, fn) =>
    r.post(
      url,
      asyncRoute(async (req, res) => ok(res, await fn(req))),
    );
  r.get(
    "/report-core/evaluations/:studentId",
    asyncRoute(async (req, res) =>
      ok(
        res,
        await evaluation.getEvaluationView({
          ...context(req),
          studentKey: key(req),
        }),
      ),
    ),
  );
  r.patch(
    "/report-core/forms/:studentId",
    asyncRoute(async (req, res) =>
      ok(
        res,
        await evaluation.submitForm({ ...args(req), studentKey: key(req) }),
      ),
    ),
  );
  post("/report-core/settlements", (req) =>
    evaluation.settleSources(args(req)),
  );
  r.get(
    "/report-core/card-quotas",
    asyncRoute(async (req, res) =>
      ok(
        res,
        await cards.listCards({
          ...context(req),
          termId: req.query.termId,
          kind: req.query.kind,
          offset: req.query.offset,
        }),
      ),
    ),
  );
  post("/report-core/card-quotas", (req) => cards.saveQuota(args(req)));
  r.patch(
    "/report-core/card-quotas/:id/plan",
    asyncRoute(async (req, res) =>
      ok(res, await cards.savePlan({ ...args(req), quotaId: req.params.id })),
    ),
  );
  post("/report-core/card-quotas/:id/generate", (req) =>
    cards.generateCards({ ...args(req), quotaId: req.params.id }),
  );
  r.get(
    "/report-core/card-quotas/:id/print",
    asyncRoute(async (req, res) => {
      const zip = await cards.buildClassPrintZip({
        ...context(req),
        quotaId: req.params.id,
      });
      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="class-cards.zip"',
      });
      zip.on("error", () => res.destroy());
      zip.pipe(res);
    }),
  );
  r.get(
    "/report-core/cards/:id/token",
    asyncRoute(async (req, res) =>
      ok(res, {
        token: await cards.cardToken({
          ...context(req),
          sourceId: req.params.id,
        }),
      }),
    ),
  );
  post("/report-core/cards/preview", (req) =>
    cards.previewCard({ ...args(req) }),
  );
  post("/report-core/cards/redeem", (req) =>
    cards.redeemCard({ ...args(req), now: req.app.locals.clock() }),
  );
  post("/report-core/direct-scores", (req) => cards.directScore({ ...args(req), now: req.app.locals.clock() }));
  post('/report-core/cards/:id/void', req => cards.voidCard({ ...args(req), sourceId: req.params.id }));
  post("/report-core/sources/:id/reverse", (req) =>
    cards.reverseSource({ ...args(req), sourceId: req.params.id }),
  );
  post("/report-core/imports/preview", (req) =>
    imports.previewImport(args(req)),
  );
  post("/report-core/imports/:id/commit", (req) =>
    imports.commitImport({ ...args(req), batchId: req.params.id }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
  });
  r.post(
    "/report-core/certificates",
    upload.single("file"),
    asyncRoute(async (req, res) =>
      ok(
        res,
        await materials.submitCertificate({ ...args(req), file: req.file }),
      ),
    ),
  );
  post("/report-core/certificates/:id/decision", (req) =>
    materials.decideCertificate({ ...args(req), sourceId: req.params.id }),
  );
  post("/report-core/certificates/:id/revoke", (req) =>
    materials.revokeCertificate({ ...args(req), sourceId: req.params.id }),
  );
  r.get(
    "/report-core/files/:id",
    asyncRoute(async (req, res) => {
      const s = await materials.getCertificate(
        req.app.locals.pool,
        req.actor,
        req.params.id,
      );
      await assertScope(
        {
          actor: req.actor,
          studentKey: {
            schoolId: req.actor.schoolId,
            termId: s.term_id,
            studentId: s.student_id,
          },
          action: "material",
        },
        req.app.locals.pool,
      );
      res.set("Content-Type", parse(s.payload_json).mime || "image/png");
      res.set("Cache-Control", "private, no-store");
      res.send(
        await require("../utils/privateFiles").readPrivateFile(
          parse(s.payload_json).fileRef,
        ),
      );
    }),
  );
  post("/report-core/story-batches", (req) =>
    stories.saveStoryDraft(args(req)),
  );
  post("/report-core/story-batches/:id/submit", (req) =>
    stories.submitStoryBatch({ ...args(req), batchId: req.params.id }),
  );
  r.patch(
    "/report-core/story-batches/:id/items/:itemId/review",
    asyncRoute(async (req, res) =>
      ok(
        res,
        await stories.reviewStoryItem({
          ...args(req),
          itemId: req.params.itemId,
        }),
      ),
    ),
  );
  post("/report-core/sources/:id/retry", (req) =>
    stories.retryStoryItem({ ...args(req), itemId: req.params.id }),
  );
  r.get(
    "/report-core/sources",
    asyncRoute(async (req, res) => {
      const page = await require("../services/reportCoreSources").listSources({
        ...context(req),
        termId: req.query.termId,
        studentId: req.query.studentId,
        offset: req.query.offset,
      });
      ok(res, req.query.page === "1" ? page : page.rows);
    }),
  );
  r.get(
    "/report-core/reports/drafts/:studentId",
    asyncRoute(async (req, res) =>
      ok(
        res,
        await evaluation.buildReportDraft({
          ...context(req),
          studentKey: key(req),
        }),
      ),
    ),
  );
  post("/report-core/reports/confirm", (req) =>
    evaluation.confirmReport({
      ...args(req),
      studentKey: {
        schoolId: req.actor.schoolId,
        termId: req.body.termId,
        studentId: req.body.studentId,
      },
    }),
  );
  post("/report-core/reports/confirm-batch", (req) =>
    evaluation.confirmReports(args(req)),
  );
  r.get(
    "/admin/report-core/readiness",
    asyncRoute(async (req, res) =>
      ok(
        res,
        await publish.getReadiness({
          ...context(req),
          termId: req.query.termId,
        }),
      ),
    ),
  );
  post("/admin/report-core/releases", (req) => publish.beginRelease(args(req)));
  r.get(
    "/admin/report-core/releases/:key",
    asyncRoute(async (req, res) => {
      if (req.actor.role !== "manager") fail(403, "仅管理员");
      const term = await getTerm(
        req.app.locals.pool,
        req.actor.schoolId,
        req.query.termId,
      );
      if (term.release_key !== req.params.key) fail(404, "批次不存在");
      ok(res, publish.releaseInfo(term));
    }),
  );
  post("/admin/report-core/releases/:key/prepare", async (req) => {
    if (req.actor.role !== "manager") fail(403, "仅管理员");
    const term = await getTerm(
      req.app.locals.pool,
      req.actor.schoolId,
      req.body.termId,
    );
    if (term.release_key !== req.params.key) fail(404, "批次不存在");
    return publish.prepareReleaseChunk({
      ...args(req),
      releaseKey: req.params.key,
    });
  });
  for (const [action, fn] of [
    ["activate", publish.activateRelease],
    ["resume", publish.resumeRelease],
    ["cancel", publish.cancelRelease],
  ])
    post(`/admin/report-core/releases/:key/${action}`, (req) =>
      fn({ ...args(req), releaseKey: req.params.key }),
    );
  r.get(
    "/report-core/reports/current",
    asyncRoute(async (req, res) =>
      ok(
        res,
        await publish.getPublishedReport({
          ...context(req),
          termId: req.query.termId,
          studentId: req.query.studentId || req.actor.id,
        }),
      ),
    ),
  );
  r.get(
    "/report-core/reports/:id/print",
    asyncRoute(async (req, res) => {
      const result = await publish.getPublishedReport({
        ...context(req),
        termId: req.query.termId,
        studentId: req.query.studentId || req.actor.id,
        reportId: req.params.id,
      });
      res.type("html").send(result.html);
    }),
  );
  r.patch(
    "/admin/report-core/terms/:id",
    asyncRoute(async (req, res) =>
      ok(res, await admin.updateTerm({ ...args(req), termId: req.params.id })),
    ),
  );
  post("/admin/report-core/assignments", (req) =>
    admin.saveAssignment(args(req)),
  );
  r.get(
    "/report-core/assignments",
    asyncRoute(async (req, res) => {
      let rows;
      if (req.actor.role === "manager") {
        [rows] = await req.app.locals.pool.query(
          "SELECT a.*,u.real_name FROM teacher_teaching_assignment a JOIN users u ON u.id=a.teacher_id WHERE a.school_id=? AND a.term_id=?",
          [req.actor.schoolId, req.query.termId],
        );
      } else if (req.actor.role === "teacher")
        rows = await assignments(
          req.actor,
          req.query.termId,
          req.app.locals.pool,
        );
      else rows = [];
      ok(res, rows);
    }),
  );
}
module.exports = { mountFeatures };
