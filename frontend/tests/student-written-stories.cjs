const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createV2TestDb } = require('../../backend/__tests__/helpers/reportCoreV2Db');
const { storyText, docx, pdf } = require('../../backend/__tests__/helpers/writtenStoryFixtures');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const path = require('node:path'), fs = require('node:fs/promises'), assert = require('node:assert/strict');
(async () => {
  const cleanups = [], db = await createV2TestDb({ after: fn => cleanups.push(fn) });
  const root = path.resolve(__dirname, '../..'), output = path.join(root, 'output/report-core/written-stories');
  let server, vite, browser;
  try {
    server = require('../../backend/app').createApp({ pool: db.pool, schoolId: '1' }).listen(19887, '127.0.0.1');
    vite = spawn(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '19888', '--strictPort'], { cwd: path.join(root, 'frontend'), env: { ...process.env, VITE_API_TARGET: 'http://127.0.0.1:19887' }, stdio: 'ignore' });
    for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:19888')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:19888/#/student/stories?termId=1');
    await page.getByLabel('账号', { exact: true }).fill('student');
    await page.getByLabel('密码', { exact: true }).fill('Test-pass-2026');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.route('**/api/v1/report-core/v2/written-stories?*', route => route.fulfill({
      status: 410, contentType: 'application/json', body: JSON.stringify({ message: '旧业务接口已退役' }),
    }));
    await page.getByRole('button', { name: '写故事', exact: true }).click();
    const submit = page.getByRole('button', { name: '递交故事', exact: true });
    const editor = page.getByLabel('故事正文', { exact: true });
    await submit.waitFor();
    await page.getByRole('alert').filter({ hasText: '旧业务接口已退役' }).waitFor();
    assert.equal(await editor.isEditable(), true, 'history/rank load failure must not disable writing a story draft');
    await editor.fill('记录尚未加载，也可以先写下故事。');
    assert.equal(await submit.isEnabled(), true, 'valid story text can be submitted even when history loading failed');
    const failurePage = await browser.newPage();
    failurePage.setDefaultTimeout(8000);
    failurePage.on('pageerror', error => errors.push(error.message));
    await failurePage.goto('http://127.0.0.1:19888/#/student/stories?termId=1');
    await failurePage.getByLabel('账号', { exact: true }).fill('student2');
    await failurePage.getByLabel('密码', { exact: true }).fill('Test-pass-2026');
    await failurePage.getByRole('button', { name: '登录', exact: true }).click();
    await failurePage.route('**/api/v1/report-core/v2/written-stories?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: '历史记录暂时不可用' }) }));
    await failurePage.getByRole('button', { name: '写故事', exact: true }).click();
    await failurePage.getByRole('alert').filter({ hasText: '历史记录暂时不可用' }).waitFor();
    await failurePage.getByLabel('故事正文', { exact: true }).fill('历史加载失败时也可以递交自己的故事。');
    await failurePage.getByRole('button', { name: '递交故事', exact: true }).click();
    await failurePage.getByRole('status').filter({ hasText: '故事已提交' }).waitFor();
    assert.equal(await failurePage.getByLabel('故事正文', { exact: true }).inputValue(), '');
    const [[savedDespiteHistoryError]] = await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE event_type='WRITE_WORK' AND student_id=4");
    assert.equal(Number(savedDespiteHistoryError.n), 1);
    await failurePage.close();
    await page.unroute('**/api/v1/report-core/v2/written-stories?*');
    await page.getByRole('button', { name: '刷新故事记录', exact: true }).click();
    await page.getByText('还没有故事，第一篇就从今天开始', { exact: true }).waitFor();
    assert.equal(await editor.inputValue(), '记录尚未加载，也可以先写下故事。');
    await editor.fill('');
    assert.equal(await submit.isDisabled(), true);
    await fs.mkdir(output, { recursive: true });
    const screenshot = async name => {
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
    };
    await screenshot('empty-desktop.png');
    await editor.fill(storyText);
    await submit.evaluate(button => { button.click(); button.click(); });
    await page.getByRole('status').filter({ hasText: '故事已提交' }).waitFor();
    await page.getByText('已提交 1 篇', { exact: true }).waitFor();
    assert.equal(await editor.inputValue(), '');
    assert.equal(await page.locator('[data-written-story-id]').count(), 1);
    await editor.fill('还没有提交的草稿');
    await page.locator('[data-written-story-id]').first().click();
    const dialog = page.getByRole('dialog', { name: '我的故事详情', exact: true });
    await dialog.locator('.written-story-content').getByText(storyText, { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await editor.inputValue(), '还没有提交的草稿');
    const fileInput = page.getByLabel('上传故事文档', { exact: true });
    await fileInput.setInputFiles({ name: '不支持.txt', mimeType: 'text/plain', buffer: Buffer.from('not allowed') });
    await page.getByRole('alert').filter({ hasText: 'PDF或Word' }).waitFor();
    assert.equal(await editor.inputValue(), '还没有提交的草稿');
    for (const [buffer, name, mimeType, count] of [
      [await docx(), '小树的约定.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 2],
      [await pdf(), '校园小故事.pdf', 'application/pdf', 3],
    ]) {
      await fileInput.setInputFiles({ name, mimeType, buffer });
      await page.getByText(`已提交 ${count} 篇`, { exact: true }).waitFor();
      assert.equal(await editor.inputValue(), '还没有提交的草稿');
      await page.locator('[data-written-story-id]').first().click();
      await dialog.locator('.written-story-content').getByText(/放学后，我和同学一起给小树浇水。/).waitFor();
      await page.keyboard.press('Escape');
    }
    await screenshot('stories-desktop.png');
    for (const [width, height] of [[390, 844], [320, 640]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await screenshot(`mobile-${width}.png`);
      await page.locator('[data-written-story-id]').first().click();
      await dialog.locator('.written-story-content').getByText(/放学后/).waitFor();
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    page.once('dialog', event => event.dismiss());
    await page.locator('.student-topnav').getByRole('button', { name: '自我评价', exact: true }).click();
    assert.match(page.url(), /student\/stories/);
    await page.route('**/api/v1/report-core/v2/written-stories', async route => {
      if (route.request().method() === 'POST') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: '上传服务暂时不可用' }) });
      return route.continue();
    });
    await submit.click();
    await page.getByRole('alert').filter({ hasText: '上传服务暂时不可用' }).waitFor();
    assert.equal(await editor.inputValue(), '还没有提交的草稿');
    await page.unroute('**/api/v1/report-core/v2/written-stories');
    await editor.fill('');
    // Exercise the shared draft guard with the current click-to-record flow.
    await page.getByRole('button', { name: '讲故事', exact: true }).click();
    await page.getByRole('button', { name: '开始录音', exact: true }).click();
    await page.getByRole('button', { name: '停止录音', exact: true }).waitFor();
    page.once('dialog', event => event.dismiss());
    await page.getByRole('button', { name: '写故事', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '讲故事', exact: true }).getAttribute('aria-pressed'), 'true');
    page.once('dialog', event => event.accept());
    await page.getByRole('button', { name: '写故事', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '写故事', exact: true }).click();
    await page.getByText('已提交 3 篇', { exact: true }).waitFor();
    await db.pool.query("UPDATE academic_year SET business_phase='RECONCILING' WHERE id=1");
    await page.getByRole('button', { name: '刷新故事记录', exact: true }).click();
    await page.getByText('本学期故事提交已结束', { exact: true }).waitFor();
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await fileInput.isDisabled(), true);
    await page.locator('[data-written-story-id]').first().click();
    await dialog.locator('.written-story-content').getByText(/放学后/).waitFor();
    assert.deepEqual(errors, []);
    const [[count]] = await db.pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE event_type='WRITE_WORK' AND student_id=3");
    assert.equal(Number(count.n), 3);
    console.log('WRITTEN_STORIES_PASS: text, double-click guard, PDF/Word, live count/rank, private history, preserved drafts, failure/retry, persistence, closed term, desktop/mobile');
  } finally {
    await browser?.close();
    if (vite && vite.exitCode === null) { const ended = once(vite, 'exit'); vite.kill(); await ended; }
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
