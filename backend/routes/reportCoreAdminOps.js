const { requireRole } = require('../middleware/auth');
const { stableHash } = require('../services/reportCorePolicy');
const ops = require('../services/reportCoreAdminOps');
const progress = require('../services/reportCoreAdminProgress');
function mountAdminOps(router, { asyncRoute, ok }) {
  const base = '/admin/report-core';
  const context = req => ({ pool: req.app.locals.pool, actor: req.actor });
  const post = (path, fn) => router.post(base + path, requireRole('manager'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await fn({
      ...req.body,
      ...context(req),
      accountId: req.params.id,
      command: { requestKey: req.body.requestKey, payloadHash: stableHash({ body: req.body, params: req.params }) }
    }));
  }));
  const get = (path, fn, filename) => router.get(base + path, requireRole('manager'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const result = await fn({ ...req.query, ...context(req) });
    if (filename) res.type('text/csv; charset=utf-8').attachment(filename).send(result);
    else ok(res, result);
  }));
  post('/accounts/:id/status', ops.setAccountStatus);
  post('/accounts/:id/password', ops.resetAccountPassword);
  post('/terms/create', ops.createTerm);
  post('/terms/:id/current', args => ops.makeTermCurrent({ ...args, termId: args.accountId }));
  get('/audits/export', ops.exportAudits, 'operation-audits.csv');
  get('/audits', ops.listAudits);
  get('/progress/export', progress.exportProgress, 'completion-progress.csv');
  get('/progress', progress.getProgress);
}
module.exports = { mountAdminOps };
