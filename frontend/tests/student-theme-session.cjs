// Browser contract regression: local API fixtures only, no database access.
const { createRequire } = require('node:module');
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : createRequire(require.resolve('../../scripts/full-system-demo/package.json'))('playwright');
const assert = require('node:assert/strict');
const deferred = () => { let resolve; const promise = new Promise((r,reject) => { resolve = r; const timer=setTimeout(()=>reject(new Error('Deferred UI request did not arrive within 15s')),15000);timer.unref(); });return {promise,resolve}; };
(async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(8000);
    await page.addInitScript(() => { localStorage.setItem('AUTH_TOKEN','ui-test');localStorage.setItem('APP_USER',JSON.stringify({id:42,role:'student'})); });
    let theme='forest', mode='normal';
    const postSeen=deferred(), getSeen=deferred(), finishPost=deferred(), finishGet=deferred();
    const lateSeen=deferred(), finishLate=deferred();
    await page.route('**/api/**', async route => {
      const path=new URL(route.request().url()).pathname;
      if (path.endsWith('/growth/theme')) {
        if (mode==='theme401') return route.fulfill({status:401,json:{code:401,message:'会话已过期'}});
        if (mode==='race') { postSeen.resolve(); await finishPost.promise; }
        theme=route.request().postDataJSON().themeId;
        return route.fulfill({json:{code:200,data:{themeId:theme}}});
      }
      if (path.endsWith('/growth/my')) {
        if (mode==='late401') { lateSeen.resolve();await finishLate.promise;return route.fulfill({status:401,json:{code:401,message:'旧会话已过期'}}); }
        if (mode==='growth401') return route.fulfill({status:401,json:{code:401,message:'会话已过期'}});
        const data={studentProfile:{name:'测试学生'},theme,currentPoints:1,timeline:[]};
        if (mode==='race') { getSeen.resolve(); await finishGet.promise; }
        return route.fulfill({json:{code:200,data}});
      }
      return route.fulfill({json:{code:200,data:path.endsWith('/me')?{id:42,role:'student'}:{records:[],summary:{}}}});
    });
    await page.goto('http://127.0.0.1:5173/#/student/ledger');
    await page.getByRole('button',{name:'晴空海蓝'}).waitFor();
    await page.waitForSelector('.theme-forest');
    mode='race';
    await page.getByRole('button',{name:'晴空海蓝'}).click();await postSeen.promise;
    await page.locator('nav a[href="#/dashboard"]').click();await getSeen.promise;
    finishPost.resolve();await page.getByText('成长主题已保存',{exact:true}).waitFor();
    finishGet.resolve();await page.getByRole('heading',{name:/每一份努力/}).waitFor();
    assert.equal(await page.locator('.theme-ocean').count(),1,'写入前发起的旧GET不能覆盖已保存主题');
    mode='growth401';
    await page.locator('nav a[href="#/student/ledger"]').click();await page.locator('nav a[href="#/dashboard"]').click();
    await page.waitForURL('**/#/login');
    assert.equal(await page.evaluate(()=>localStorage.getItem('AUTH_TOKEN')),null);
    mode='normal';await page.reload();await page.goto('http://127.0.0.1:5173/#/student/ledger');await page.waitForSelector('.theme-ocean');
    mode='theme401';await page.getByRole('button',{name:'落日暖橙'}).click();await page.waitForURL('**/#/login');
    assert.equal(await page.evaluate(()=>localStorage.getItem('AUTH_TOKEN')),null);
    mode='normal';await page.reload();await page.waitForSelector('.theme-ocean');await page.locator('nav a[href="#/student/ledger"]').click();
    console.log('starting late401 scenario');mode='late401';await page.locator('nav a[href="#/dashboard"]').click();await lateSeen.promise;
    console.log('late request arrived; logout');await page.getByRole('button',{name:'logout',exact:true}).click();await page.waitForURL('**/#/login');
    mode='normal';await page.evaluate(()=>{localStorage.setItem('AUTH_TOKEN','new-student-token');localStorage.setItem('APP_USER',JSON.stringify({id:43,role:'student'}));window.dispatchEvent(new CustomEvent('auth-change',{detail:{isAuthenticated:true}}));});
    await page.getByRole('heading',{name:/每一份努力/}).waitFor();console.log('new account logged in');
    const oldResponse=page.waitForResponse(r=>r.status()===401 && r.url().endsWith('/growth/my'));finishLate.resolve();await oldResponse;await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>localStorage.getItem('AUTH_TOKEN')),'new-student-token','旧会话迟到401不能注销新账号');
    assert.ok(page.url().endsWith('#/dashboard'));
    console.log('PASS theme race; current-session 401 recovery; late old-session 401 cannot log out new account');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
