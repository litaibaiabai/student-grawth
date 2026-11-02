const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('file selection and camera capture are separate; snapshots need confirmation and release the camera', {timeout:60000},async t=>{
  const root=path.resolve(__dirname,'..'),vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','19794','--strictPort'],{cwd:root,stdio:'ignore'});
  let browser;t.after(async()=>{await browser?.close();if(vite.exitCode===null){const ended=once(vite,'exit');vite.kill();await ended;}});
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:19794')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera']}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));let uploads=0,fileChoosers=0;page.on('filechooser',()=>fileChoosers++);
  await page.route('**/api/v1/report-core/sources?**',route=>route.fulfill({json:{data:{rows:[],nextOffset:null}}}));
  await page.route('**/api/v1/report-core/term-state?**',route=>route.fulfill({json:{data:{phase:'COLLECTING'}}}));
  await page.route('**/api/v1/report-core/certificates',route=>{
    uploads++;const body=route.request().postDataBuffer();assert.ok(body.includes(Buffer.from([0xff,0xd8,0xff])),'camera snapshot must be an actual JPEG');
    return route.fulfill({json:{data:{result:{sourceId:'1'}}}});
  });
  await page.route('**/camera-test',route=>route.fulfill({contentType:'text/html',body:`<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" class="core-app role-student"><main class="student-content" id="core-content"></main></div><script type="module">
  import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const AwardUpload=(await import('/src/app/student/awards/AwardUpload.jsx')).default;
  import '/src/app/core/style.css';import '/src/app/core/tokens.css';
  createRoot(document.querySelector('main')).render(React.createElement(AwardUpload,{ctx:{actor:{id:'3'},catalog:{schemaVersion:'SIX_EDU_V2'},termId:'1',refresh:()=>{},error:()=>{},sessionActive:true}}));
  </script></body></html>`}));
  await page.addInitScript(()=>{
    window.cameraCalls=0;window.cameraTracks=[];
    const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async constraints=>{
      window.cameraCalls++;
      if(window.denyCamera)throw new DOMException('Permission denied','NotAllowedError');
      const stream=await real(constraints);window.cameraTracks.push(...stream.getTracks());
      if(window.cameraDelay)await new Promise(r=>setTimeout(r,window.cameraDelay));
      return stream;
    };
  });
  await page.goto('http://127.0.0.1:19794/camera-test');page.setDefaultTimeout(5000);
  await page.waitForFunction(()=>{const input=document.querySelector('input[aria-label="奖状图片"]');return input && !input.disabled;}).catch(async error=>{console.log('CAMERA_READY',await page.locator('body').innerText(),errors);throw error;});
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'选择奖状图片',exact:true}).click()]).catch(async error=>{console.log('CAMERA_BOOT',await page.locator('body').innerText(),errors);throw error;});
  assert.equal(await page.evaluate(()=>window.cameraCalls),0);
  await chooser.setFiles(path.join(root,'../docs/test-file/award01.jpeg'));await page.getByRole('img',{name:'待上传的奖状图片'}).waitFor();await page.getByRole('button',{name:'移除待上传图片'}).click();
  await page.getByRole('button',{name:'拍照上传',exact:true}).click();
  await page.waitForFunction(()=>window.cameraCalls===1,{},{timeout:3000});
  assert.equal(fileChoosers,1,'camera button must not open a file picker');
  await page.getByRole('button',{name:'拍摄奖状',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-capture-award]').disabled);
  const output=path.join(root,'../output/report-core/student-awards');await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'camera-live.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'拍摄奖状',exact:true}).click();
  await page.getByRole('img',{name:'待上传的奖状图片'}).waitFor();
  assert.equal(await page.evaluate(()=>window.cameraTracks.every(track=>track.readyState==='ended')),true);
  assert.equal(uploads,0,'taking a photo must wait for student confirmation before upload');
  await page.waitForFunction(()=>!document.querySelector('[data-submit-student-award]').disabled);
  await page.screenshot({path:path.join(output,'camera-preview.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'提交奖状',exact:true}).click();await page.getByRole('status').filter({hasText:'奖状已收到'}).waitFor();assert.equal(uploads,1);
  await page.evaluate(()=>window.cameraDelay=300);await page.getByRole('button',{name:'拍照上传',exact:true}).click();
  await page.getByRole('button',{name:'取消拍照',exact:true}).click();
  await page.waitForFunction(()=>window.cameraTracks.length>=2 && window.cameraTracks.every(track=>track.readyState==='ended'));
  await page.evaluate(()=>{window.cameraDelay=0;window.denyCamera=true;});
  await page.getByRole('button',{name:'拍照上传',exact:true}).click();await page.getByRole('alert').filter({hasText:'摄像头权限'}).waitFor();assert.equal(fileChoosers,1);
  await page.getByRole('button',{name:'取消拍照',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
});
