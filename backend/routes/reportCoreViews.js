function mountViews(router, { asyncRoute, ok }) {
  const ledger = require('../services/reportCoreLedger');
  const args = req => ({ pool: req.app.locals.pool, actor: req.actor, filters: ledger.normalizeLedgerQuery(req.query, req.actor), asOf: req.query.asOf, now: req.app.locals.clock(), cursor: req.query.cursor, limit: req.query.limit });
  const get = (path, fn) => router.get(path, asyncRoute(async (req, res) => ok(res, await fn(req))));
  get('/report-core/card-ledger/summary', req => ledger.getLedgerSummary(args(req)));
  get('/report-core/card-ledger/cards', req => ledger.listLedgerCards(args(req)));
  get('/report-core/card-ledger/cards/:id', req => ledger.getLedgerCardDetail({ ...args(req), sourceId: req.params.id }));
  get('/report-core/card-ledger/usage', req => ledger.listLedgerUsage({ ...args(req), groupBy: req.query.groupBy, sourceMode: req.query.sourceMode }));
  get('/report-core/card-ledger/audits', req => ledger.listLedgerAudits(args(req)));
}
module.exports = { mountViews };
