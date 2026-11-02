const {
  requireRole
} = require('../middleware/auth');
const {
  stableHash
} = require('../services/reportCorePolicy');
const service = require('../services/reportCoreAdminClasses');
function mountAdminClasses(r, {
  asyncRoute,
  ok
}) {
  const base = '/admin/report-core/classes';
  const args = req => ({
    ...req.body,
    pool: req.app.locals.pool,
    actor: req.actor,
    classId: req.params.id,
    previewId: req.params.previewId,
    command: {
      requestKey: req.body.requestKey,
      payloadHash: stableHash({
        body: req.body,
        params: req.params
      })
    }
  });
  const get = (url, fn) => r.get(base + url, requireRole('manager'), asyncRoute(async (req, res) => ok(res, await fn({
    pool: req.app.locals.pool,
    actor: req.actor,
    ...req.query,
    classId: req.params.id
  }))));
  const post = (url, fn) => r.post(base + url, requireRole('manager'), asyncRoute(async (req, res) => ok(res, await fn(args(req)))));
  get('', service.listClasses);
  get('/:id', service.getClass);
  post('/imports/preview', service.previewClassImport);
  post('/imports/:previewId/commit', service.commitClassImport);
  post('/:id/teachers/preview', service.previewTeachers);
  post('/:id/teachers/previews/:previewId/commit', service.commitTeachers);
  post('/transfers/preview', service.previewTransfer);
  post('/transfers/:previewId/commit', service.commitTransfer);
}
module.exports = {
  mountAdminClasses
};
