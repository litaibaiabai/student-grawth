const multer = require("multer");
const {
  stableHash,
} = require("../services/core/reportCorePolicy");
const {
  assertScope,
  assignments,
} = require("../services/auth/authorizationService");
const { parse, getTerm } = require("../services/core/reportCoreStore");
const cards = require("../services/cards/reportCoreCards"),
  imports = require("../services/imports/reportCoreImports"),
  materials = require("../services/materials/reportCoreMaterials"),
  stories = require("../services/stories/reportCoreStories"),
  evaluation = require("../services/evaluation/reportCoreEvaluation");
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
  post("/report-core/cards/preview", (req) =>
    cards.previewCard({ ...args(req) }),
  );
  post("/report-core/cards/redeem", (req) =>
    cards.redeemCard({ ...args(req), now: req.app.locals.clock() }),
  );
  post("/report-core/direct-scores", (req) => cards.directScore({ ...args(req), now: req.app.locals.clock() }));
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
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
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
  r.get('/report-core/story-month', asyncRoute(async (req,res) => ok(res,await stories.getStudentStoryMonth({ ...context(req),termId:req.query.termId,monthKey:req.query.monthKey,studentId:req.query.studentId }))));
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
      const page = await require("../services/core/reportCoreSources").listSources({
        ...context(req),
        termId: req.query.termId,
        studentId: req.query.studentId,
        grade: req.query.grade, classNo: req.query.classNo,
        offset: req.query.offset,
        sourceId:req.query.sourceId, monthKey: req.query.monthKey, sourceType: req.query.sourceType, recordKind: req.query.recordKind, latest: req.query.latest,
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
    "/report-core/reports/current",
    asyncRoute(async (req, res) =>
      ok(
        res,
        await require('../services/reports/reportCorePublishedReports').getPublishedReport({
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
      const result = await require('../services/reports/reportCorePublishedReports').getPublishedReport({
        ...context(req),
        termId: req.query.termId,
        studentId: req.query.studentId || req.actor.id,
        reportId: req.params.id,
      });
      res.type("html").send(result.html);
    }),
  );
  r.get(
    "/report-core/assignments",
    asyncRoute(async (req, res) => {
      let rows;
      if (req.actor.role === "manager" && (await getTerm(req.app.locals.pool,req.actor.schoolId,req.query.termId)).evaluation_config.adminClassRegistryVersion===1) {
        rows=await require('../services/auth/authorizationService').scopeAssignments(req.actor.schoolId,req.query.termId,req.app.locals.pool);
      } else if (req.actor.role === "manager") {
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
