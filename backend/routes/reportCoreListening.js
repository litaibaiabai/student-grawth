const { stableHash } = require('../services/reportCorePolicy');
const listening = require('../services/reportCoreListening');
function mountListening(router, { asyncRoute, ok }) {
  const context = req => ({ pool:req.app.locals.pool, actor:req.actor });
  const read = (url, fn) => router.get('/report-core/v2' + url, asyncRoute(async (req,res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await fn({ ...req.query, ...context(req) }));
  }));
  read('/catalog', listening.listCatalog);
  read('/listening/history', listening.listHistory);
  read('/rankings', listening.getRankings);
  router.get('/report-core/v2/catalog/:storyId/audio', asyncRoute(async (req,res) => {
    const file = await listening.storyAudio({ ...context(req), storyId:req.params.storyId });
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('audio/mpeg').sendFile(file);
  }));
  for (const [url, fn] of [
    ['/listening', listening.startListening],
    ['/listening/:sessionId/heartbeat', listening.heartbeat],
    ['/listening/:sessionId/complete', listening.completeListening],
  ]) router.post('/report-core/v2' + url, asyncRoute(async (req,res) => ok(res, await fn({
    ...req.body, ...context(req), ...req.params, now:req.app.locals.clock(),
    command:{ requestKey:req.body.requestKey, payloadHash:stableHash({body:req.body,params:req.params}) },
  }))));
}
module.exports = { mountListening };
