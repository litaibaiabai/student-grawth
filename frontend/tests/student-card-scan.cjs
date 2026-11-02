const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const QRCode = require('../../backend/node_modules/qrcode');

test('camera QR recognition waits for confirmation, releases camera, handles cancel and permission denial', {timeout:60000}, async t => {
  const root = path.resolve(__dirname, '..');
  const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '19694', '--strictPort'], {cwd:root, stdio:'ignore'});
  let browser;
  t.after(async () => { await browser?.close(); vite.kill(); });
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:19694')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[]; page.on('pageerror', e => errors.push(e.message));
  let previews=0, redemptions=0;
  await page.route('**/api/v1/report-core/cards/*', async route => {
    const body=route.request().postDataJSON();
    assert.equal(body.token,'scan-test-credential');
    if(route.request().url().endsWith('/preview')) {
      previews++;
      return route.fulfill({json:{data:{id:'2086',category:'CHINESE_PROCESS',grade:4,classNo:1,status:'UNUSED'}}});
    }
    redemptions++;
    await new Promise(r=>setTimeout(r,150));
    return route.fulfill({json:{data:{result:{pointsCredited:1}}}});
  });
  await page.route('**/scan-test', route => route.fulfill({contentType:'text/html',body:`<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" class="core-app role-student"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const Cards = (await import('/src/app/student/cards/Cards.jsx')).default;
    import '/src/app/core/tokens.css';
    import '/src/app/core/style.css';
    createRoot(document.getElementById('root')).render(React.createElement(Cards,{ctx:{catalog:{cardCatalog:[{code:'CHINESE_PROCESS',group:'智美',item:'语文·过程表现'}]},error:()=>{},refresh:()=>{window.refreshes=(window.refreshes||0)+1},notify:text=>{window.notice=text}}}));
    </script></body></html>`}));
  const qr = await QRCode.toDataURL('https://school.example/#/student/materials?card=scan-test-credential',{width:480,margin:4});
  await page.addInitScript(qr => {
    window.cameraCalls=0; window.tracks=[];
    navigator.mediaDevices.getUserMedia = async () => {
      window.cameraCalls++;
      await new Promise(r=>setTimeout(r,window.cameraDelay||0));
      if(window.denyCamera) throw new DOMException('denied','NotAllowedError');
      const img = new Image(); img.src=qr; await img.decode();
      const canvas=document.createElement('canvas');canvas.width=480;canvas.height=480;
      const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,480,480);
      const stream=canvas.captureStream(10);
      window.tracks.push(...stream.getTracks());
      setTimeout(()=>context.drawImage(img,0,0),500);
      return stream;
    };
  }, qr);
  await page.goto('http://127.0.0.1:19694/scan-test');
  page.setDefaultTimeout(8000);
  const scan = page.getByRole('button',{name:'扫一扫',exact:true});
  await scan.waitFor({timeout:5000}).catch(e=>{console.error('UI_ERRORS',errors);throw e;});
  assert.equal(await page.evaluate(()=>window.cameraCalls),0);
  await scan.click();
  await page.getByText('二维码编码',{exact:true}).waitFor();
  await page.getByText('scan-test-credential',{exact:true}).waitFor();
  assert.equal(previews,1); assert.equal(redemptions,0);
  assert.equal(await page.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')),true);
  await page.getByText('智美 · 语文·过程表现',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(root,'../output/student-card-scan-confirm.png'),fullPage:true});
  await page.getByRole('button',{name:'确认加分',exact:true}).dblclick();
  await page.waitForFunction(()=>window.notice?.includes('语文·过程表现'));
  assert.equal(redemptions,1); assert.equal(await page.evaluate(()=>window.refreshes),1);
  await page.evaluate(()=>window.cameraDelay=250);
  await scan.click(); await page.getByRole('button',{name:'取消扫描',exact:true}).click();
  await page.waitForTimeout(700);
  assert.equal(previews,1); assert.equal(await page.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')),true);
  await page.evaluate(()=>window.denyCamera=true);
  await scan.click(); await page.getByRole('alert').filter({hasText:'摄像头权限'}).waitFor();
  assert.equal(redemptions,1); assert.deepEqual(errors,[]);
});
