const multer = require('multer');
const { stableHash } = require('../services/reportCorePolicy');
const recordings = require('../services/reportCoreStoryRecordings');

function mountStoryRecordings(router, { asyncRoute, ok }) {
  const context = req => ({ pool: req.app.locals.pool, actor: req.actor });
  const base = '/report-core/v2/story-recordings';
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 6 } });
  router.get(base, asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await recordings.listRecordings({ ...req.query, ...context(req) }));
  }));
  router.post(base, upload.single('file'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await recordings.submitRecording({ ...req.body, ...context(req), file: req.file, command: {
      requestKey: req.body.requestKey,
      payloadHash: stableHash({ body: req.body, fileHash: req.file ? stableHash(req.file.buffer.toString('base64')) : null }),
    } }));
  }));
  router.get(base + '/:id/audio', asyncRoute(async (req, res) => {
    const file = await recordings.getRecordingAudio({ ...context(req), recordingId: req.params.id });
    res.set({ 'Content-Type': file.mime, 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename="${file.filename}"` });
    res.sendFile(file.path);
  }));
}
module.exports = { mountStoryRecordings };
