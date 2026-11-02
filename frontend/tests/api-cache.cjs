const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

test('API reads recover from a cached retired endpoint after the server is updated', async t => {
  const client = await fs.readFile(path.join(__dirname, '../src/app/core/api.js'));
  let ready = false, reads = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/api.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(client); return; }
    if (request.url.startsWith('/api/v1/')) {
      reads++;
      response.writeHead(ready ? 200 : 410, { 'Content-Type': 'application/json', 'Cache-Control': ready ? 'no-store' : 'public, max-age=600' });
      response.end(JSON.stringify(ready ? { data: { collection: { open: true } } } : { message: '旧业务接口已退役' }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>API cache regression</title>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const read = () => page.evaluate(async () => {
    localStorage.setItem('REPORT_CORE_TOKEN', 'test-student-token');
    const { api } = await import('/api.js');
    try { return { data: await api('/report-core/v2/written-stories?termId=1') }; }
    catch (error) { return { status: error.status, message: error.message }; }
  });
  assert.equal((await read()).status, 410);
  ready = true;
  const recovered = await read();
  assert.equal(recovered.data?.collection.open, true, 'an old cached 410 must not keep the story page disabled after the backend recovers');
  assert.equal(reads, 2);
});
