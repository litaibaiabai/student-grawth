function mountViews(router, { asyncRoute, ok }) {
  const ledger = require('../services/reportCoreLedger');
  const args = req => ({ pool: req.app.locals.pool, actor: req.actor, filters: ledger.normalizeLedgerQuery(req.query, req.actor), asOf: req.query.asOf, now: req.app.locals.clock(), cursor: req.query.cursor, limit: req.query.limit });
  const get = (path, fn) => router.get(path, asyncRoute(async (req, res) => { res.setHeader('Cache-Control','private, no-store'); return ok(res, await fn(req)); }));
  router.get('/report-core/card-ledger/export', asyncRoute(async (req, res) => ledger.streamLedgerCsv({ ...args(req), view: req.query.view, sourceMode:req.query.sourceMode, response: res })));
  get('/report-core/card-ledger/print', req => ledger.getLedgerPrintModel({ ...args(req), view: req.query.view, sourceMode:req.query.sourceMode }));
  get('/report-core/report-classes', req => require('../services/reportCoreReportBrowser').listReportClasses({...req.query,pool:req.app.locals.pool,actor:req.actor}));
  get('/report-core/report-students', req => require('../services/reportCoreReportBrowser').listReportStudents({...req.query,pool:req.app.locals.pool,actor:req.actor}));
  get('/report-core/report-detail/:studentId', req => require('../services/reportCoreReportBrowser').getReportDetail({pool:req.app.locals.pool,actor:req.actor,studentKey:{schoolId:req.actor.schoolId,termId:req.query.termId,studentId:req.params.studentId},version:req.query.version,scope:req.query.scope}));
  get('/report-core/workspace', req => require('../services/reportCoreReadModels').getWorkspace({ ...req.query, pool:req.app.locals.pool, actor:req.actor }));
  get('/report-core/teachers', req => require('../services/reportCoreReadModels').listTeachers({ ...req.query, pool:req.app.locals.pool, actor:req.actor }));
  get('/report-core/card-ledger/summary', req => ledger.getLedgerSummary(args(req)));
  get('/report-core/card-ledger/cards', req => ledger.listLedgerCards(args(req)));
  get('/report-core/card-ledger/cards/:id', req => ledger.getLedgerCardDetail({ ...args(req), sourceId: req.params.id }));
  get('/report-core/card-ledger/usage', req => ledger.listLedgerUsage({ ...args(req), groupBy: req.query.groupBy, sourceMode: req.query.sourceMode }));
  get('/report-core/card-ledger/audits', req => ledger.listLedgerAudits(args(req)));
}
module.exports = { mountViews };
