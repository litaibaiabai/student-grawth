const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require('/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

test('expired session opens the login page and permits a fresh login', { timeout: 30000 }, async t => {
  const port = 19439;
  const vite = spawn(process.execPath, [path.resolve(__dirname, '../node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' });
  let browser;
  t.after(async () => {
    await browser?.close();
    if (vite.exitCode === null) { const exited = once(vite, 'exit'); vite.kill(); await exited; }
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('REPORT_CORE_TOKEN', 'expired-token'));
  const user = { id: 2, username: 'teacher', role: 'teacher', realName: '教师' };
  await page.route('**/api/v1/**', route => {
    const endpoint = new URL(route.request().url()).pathname;
    const expired = route.request().headers().authorization === 'Bearer expired-token';
    const status = endpoint.endsWith('/config') && expired ? 401 : 200;
    const data = endpoint.endsWith('/me') ? user : endpoint.endsWith('/auth/login') ? { token: 'fresh-token', user } : endpoint.endsWith('/terms') ? [] : {};
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 401 ? { message: '登录已过期' } : { data }) });
  });
  await page.goto(`http://127.0.0.1:${port}/#/teacher/comments`);
  await page.getByRole('heading', { name: '账号登录', exact: true }).waitFor({ timeout: 5000 });
  assert.equal(await page.getByRole('dialog', { name: '重新登录' }).count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('REPORT_CORE_TOKEN')), null);
  await page.getByLabel('账号', { exact: true }).fill('teacher');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '尚未配置学期' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('REPORT_CORE_TOKEN')), 'fresh-token');
});
