const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createV2TestDb } = require('../../backend/__tests__/helpers/reportCoreV2Db');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const cleanup = [], db = await createV2TestDb({ after: fn => cleanup.push(fn) });
  const root = path.resolve(__dirname, '../..'), output = path.join(root, 'output/report-core/story-recordings');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'story-recordings-browser-'));
  process.env.REPORT_FILES_DIR = directory;
  cleanup.push(() => fs.rm(directory, { recursive: true, force: true }));
  let server, vite, browser;
  try {
    server = require('../../backend/app').createApp({ pool: db.pool, schoolId: '1' }).listen(19847, '127.0.0.1');
    await once(server, 'listening');
    vite = spawn(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '19848', '--strictPort'], {
      cwd: path.join(root, 'frontend'), env: { ...process.env, VITE_API_TARGET: 'http://127.0.0.1:19847' }, stdio: 'ignore',
    });
    for (let attempt = 0; attempt < 80; attempt++) {
      try { if ((await fetch('http://127.0.0.1:19848')).ok) break; } catch { /* Wait for the test server. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.recordingTestTracks = [];
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (window.recordingTestDeny) throw new DOMException('Permission denied', 'NotAllowedError');
        const stream = await original(constraints);
        window.recordingTestTracks.push(...stream.getTracks());
        if (window.recordingTestDelay) await new Promise(resolve => { window.recordingTestRelease = resolve; });
        return stream;
      };
    });
    await page.goto('http://127.0.0.1:19848/#/student/stories?termId=1');
    await page.getByLabel('账号', { exact: true }).fill('student');
    await page.getByLabel('密码', { exact: true }).fill('Test-pass-2026');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.route('**/api/v1/report-core/v2/story-recordings?*', route => route.fulfill({
      status: 410, contentType: 'application/json', body: JSON.stringify({ message: '旧业务接口已退役' }),
    }));
    await page.getByRole('button', { name: '讲故事', exact: true }).click();
    const start = () => page.getByRole('button', { name: '开始录音', exact: true });
    await start().waitFor({ timeout: 6000 });
    const studio = page.getByLabel('故事录音室', { exact: true });
    await studio.getByRole('alert').filter({ hasText: '录音功能暂时未连接成功' }).waitFor({ timeout: 4000 });
    assert.equal(await start().isDisabled(), true);
    await page.unroute('**/api/v1/report-core/v2/story-recordings?*');
    await studio.getByRole('button', { name: '重新连接录音服务', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-start-recording]')?.disabled);
    await page.getByText('暂无排名', { exact: true }).waitFor();
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'empty-mobile.png'), fullPage: true });

    // Real MediaRecorder + synthetic microphone: recording is click-to-toggle.
    await start().click();
    await page.getByRole('button', { name: '停止录音', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[data-recording-time]')?.textContent !== '00:00');
    await page.screenshot({ path: path.join(output, 'recording-mobile.png'), fullPage: true });
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: '写故事', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '停止录音', exact: true }).count(), 1);
    await page.getByRole('button', { name: '停止录音', exact: true }).click();
    const save = () => page.getByRole('button', { name: '保存并上传', exact: true });
    await save().waitFor();
    assert.equal(await page.getByLabel('本次故事录音试听').count(), 1);
    assert.equal(await page.evaluate(() => window.recordingTestTracks.every(track => track.readyState === 'ended')), true);

    // A dropped response must preserve the actual recording and reuse its key.
    let postAttempt = 0;
    await page.route('**/api/v1/report-core/v2/story-recordings', async route => {
      postAttempt++;
      if (postAttempt === 2) await route.fetch();
      if (postAttempt <= 2) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '测试网络暂不可用，请重试' }) });
      else await route.continue();
    });
    await save().click();
    await page.getByRole('alert').filter({ hasText: '测试网络暂不可用' }).waitFor();
    assert.equal(await page.getByLabel('本次故事录音试听').count(), 1);
    await save().click();
    await page.waitForFunction(() => !document.querySelector('[data-save-recording]')?.disabled);
    await save().evaluate(button => { button.click(); button.click(); });
    await page.getByRole('status').filter({ hasText: '录音保存成功' }).waitFor();
    const ownRows = async () => (await db.pool.query("SELECT id,payload_json FROM evaluation_source_record WHERE event_type='TELL_RECORDING' AND student_id=3 ORDER BY id"))[0];
    assert.equal((await ownRows()).length, 1);
    await page.getByLabel('已保存录音数量').getByText('1', { exact: true }).waitFor();
    await page.getByLabel('我的全校录音名次').getByText('1', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'saved-mobile.png'), fullPage: true });
    await page.unroute('**/api/v1/report-core/v2/story-recordings');

    const record = page.locator('[data-story-recording-id]').first();
    await page.evaluate(() => {
      const nativePlay = HTMLMediaElement.prototype.play;
      window.recordingTestRestorePlayback = () => { HTMLMediaElement.prototype.play = nativePlay; };
      HTMLMediaElement.prototype.play = function () {
        if (this.getAttribute('aria-label') === '历史故事录音播放器') return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
        return nativePlay.call(this);
      };
    });
    await record.getByRole('button', { name: /^播放/ }).click();
    await page.getByRole('alert').filter({ hasText: '录音已经加载，请点击播放器的播放按钮。' }).waitFor();
    assert.equal(await page.getByLabel('历史故事录音播放器').isVisible(), true, 'an autoplay denial must keep the player available for a manual tap');
    await page.evaluate(() => window.recordingTestRestorePlayback());
    await record.getByRole('button', { name: /^播放/ }).click();
    await page.getByLabel('历史故事录音播放器').waitFor();
    await page.waitForFunction(() => { const audio = document.querySelector('audio[aria-label="历史故事录音播放器"]'); return audio && audio.duration > 0 && !audio.paused; });
    const media = await page.getByLabel('历史故事录音播放器').evaluate(audio => ({ duration: audio.duration, seekable: audio.seekable.length }));
    console.log('RECORDED_AUDIO_METADATA', media);
    assert.equal(Number.isFinite(media.duration), true, 'saved WebM needs a finite duration for the playback seek bar');
    const download = page.waitForEvent('download');
    await record.getByRole('button', { name: /^下载/ }).click();
    assert.ok((await download).suggestedFilename().endsWith('.webm'));
    await page.reload();
    await page.getByRole('button', { name: '讲故事', exact: true }).click();
    await page.locator('[data-story-recording-id]').first().waitFor();
    assert.equal(await page.locator('[data-story-recording-id]').count(), 1);
    await page.locator('[data-story-recording-id]').first().getByRole('button', { name: /^播放/ }).click();
    await page.waitForFunction(() => { const audio = document.querySelector('audio[aria-label="历史故事录音播放器"]'); return audio && audio.duration > 0; });

    // Re-record does not increment a count; failure leaves clear recovery.
    await start().click();
    await page.getByRole('button', { name: '停止录音', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.querySelector('audio[aria-label="历史故事录音播放器"]')?.paused ?? true), true);
    await page.waitForFunction(() => document.querySelector('[data-recording-time]')?.textContent !== '00:00');
    await page.getByRole('button', { name: '停止录音', exact: true }).click();
    await page.getByRole('button', { name: '重新录音', exact: true }).click();
    await page.getByRole('button', { name: '停止录音', exact: true }).waitFor();
    assert.equal((await ownRows()).length, 1);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '写故事', exact: true }).click();
    await page.getByLabel('故事正文', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.recordingTestTracks.every(track => track.readyState === 'ended')), true);
    await page.getByRole('button', { name: '讲故事', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-start-recording]')?.disabled);
    await page.evaluate(() => { window.recordingTestDeny = true; });
    await start().click();
    await page.getByRole('alert').filter({ hasText: /麦克风/ }).waitFor();
    assert.equal((await ownRows()).length, 1);
    await page.evaluate(() => { window.recordingTestDeny = false; window.recordingTestDelay = true; });
    await start().click();
    await page.waitForFunction(() => !!window.recordingTestRelease);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '写故事', exact: true }).click();
    await page.evaluate(() => window.recordingTestRelease());
    await page.waitForFunction(() => window.recordingTestTracks.every(track => track.readyState === 'ended'));
    await page.getByRole('button', { name: '讲故事', exact: true }).click();

    for (const [width, height] of [[1440, 1000], [390, 844], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, `history-${width}.png`), fullPage: true });
    }
    await page.evaluate(() => { window.recordingTestDelay = false; });
    await start().click();
    await page.getByRole('button', { name: '停止录音', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[data-recording-time]')?.textContent !== '00:00');
    await db.pool.query("UPDATE academic_year SET business_phase='RECONCILING' WHERE id=1");
    await page.getByRole('button', { name: '刷新录音记录', exact: true }).click();
    await page.getByText('本学期录音上传已结束', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '停止录音', exact: true }).isEnabled(), true, 'closing collection must never disable stopping an active microphone');
    await page.getByRole('button', { name: '停止录音', exact: true }).click();
    await page.getByLabel('本次故事录音试听').waitFor();
    assert.equal(await page.evaluate(() => window.recordingTestTracks.every(track => track.readyState === 'ended')), true);
    assert.equal(await save().isDisabled(), true);
    assert.equal(await page.locator('[data-story-recording-id]').count(), 1);
    assert.deepEqual(errors, []);
    console.log('STORY_RECORDINGS_PASS: real click recording, stop/preview/re-record, retained failed upload, lost-response idempotency, rank, private replay/download, navigation/permission cleanup, closed collection, desktop/mobile');
  } finally {
    await browser?.close();
    if (vite && vite.exitCode === null) { const ended = once(vite, 'exit'); vite.kill(); await ended; }
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    for (const fn of cleanup.reverse()) await fn();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
