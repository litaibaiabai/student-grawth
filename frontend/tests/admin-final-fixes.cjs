const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {spawn}=require('node:child_process');
const {createAdminTestDb}=require('../../backend/__tests__/helpers/reportCoreAdminDb');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const XLSX=require('../node_modules/xlsx');
test('scoped UI: 500-row cap, name correction, expired panel sessions, direct-score identity, V2 settlements and profile reload',{timeout:120000},async t=>{
 const db=await createAdminTestDb(t),root=path.resolve(__dirname,'../..'),dir=path.join(root,'output/report-core/admin-closure');
 process.env.JWT_SECRET='isolated-admin-final-ui-secret';
 await db.pool.query("UPDATE users SET username='20260401',real_name='林小禾' WHERE id=3");
 await db.pool.query("UPDATE student_term_evaluation SET student_name_snapshot='林小禾' WHERE student_id=3");
 const app=require('../../backend/app').createApp({pool:db.pool,schoolId:'1'}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','19641','--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_TARGET:`http://127.0.0.1:${server.address().port}`},stdio:'ignore'});
 let browser, denialWindow=null;
 const expectedMessage='[Error] AppError: 账号或登录已失效',expectedDiagnostics=[],unexpectedDiagnostics=[],originalConsoleError=console.error;
 console.error=(...args)=>{
  if(denialWindow && args.length===1 && args[0]===expectedMessage){expectedDiagnostics.push({window:denialWindow,message:args[0]});return;}
  unexpectedDiagnostics.push(args);originalConsoleError(...args);
 };
 try{
  for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:19641')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const expectSessionDenials=async(name,count,action)=>{
   denialWindow=name;
   try{await action();await page.waitForLoadState('networkidle');}finally{denialWindow=null;}
   assert.deepEqual(expectedDiagnostics.filter(d=>d.window===name),Array.from({length:count},()=>({window:name,message:expectedMessage})),`${name}: exact expected server denials`);
  };
  const login=async username=>{await page.goto('http://127.0.0.1:19641');await page.getByLabel('账号',{exact:true}).fill(username);await page.getByLabel('密码',{exact:true}).fill('Test-pass-2026');await page.getByRole('button',{name:'登录',exact:true}).click();};
  const file=rows=>{const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),'班级');return {name:'classes.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(workbook,{bookType:'xlsx',type:'buffer'})};};
  await login('admin');await page.locator('.adult-navigation').getByRole('button',{name:'班级管理',exact:true}).click();
  await page.getByLabel('班级导入文件').setInputFiles(file(Array.from({length:501},(_,i)=>({'年级':4,'班级':i+1}))));await page.getByRole('alert').filter({hasText:'1–500'}).waitFor();
  await page.getByLabel('班级导入文件').setInputFiles(file([{'年级':4,'班级':1,'班级名称':'更正班名','班主任账号':'ignored-existing-account'}]));
  await page.getByRole('button',{name:'预览班级导入',exact:true}).click();await page.getByText('班名更正：',{exact:false}).waitFor();
  await page.getByRole('button',{name:'确认班级导入',exact:true}).click();await page.getByRole('button',{name:'查看更正班名',exact:true}).waitFor();
  await page.screenshot({path:path.join(dir,'final-fix-class-ui.png'),fullPage:true});
  await expectSessionDenials('class-detail',2,async()=>{
   await db.pool.query('UPDATE users SET token_version=token_version+1 WHERE id=1');
   await page.getByRole('button',{name:'查看更正班名',exact:true}).click();await page.getByRole('button',{name:'登录',exact:true}).waitFor();
  });
  await login('admin');await page.locator('.adult-navigation').getByRole('button',{name:'学籍与账号',exact:true}).click();await page.getByRole('button',{name:'调班',exact:true}).first().waitFor();
  await expectSessionDenials('transfer-list',1,async()=>{
   await db.pool.query('UPDATE users SET token_version=token_version+1 WHERE id=1');
   await page.getByRole('button',{name:'调班',exact:true}).first().click();await page.getByRole('button',{name:'登录',exact:true}).waitFor();
  });
  await login('teacher');await page.locator('.direct-name-grid').waitFor();await page.getByPlaceholder('搜索姓名 / 编号').fill('20260401');
  await page.locator('.direct-name-grid').getByText('学号 20260401',{exact:true}).waitFor();assert.equal(await page.locator('.direct-name-grid label').count(),1);
  await page.goto('http://127.0.0.1:19641/#/teacher/settlements');await page.getByRole('heading',{name:'采集结算',exact:true,level:2}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'特长教师评价',exact:true}).count(),0);
  assert.ok((await page.getByLabel('选择任教学科').locator('option').allTextContents()).includes('班级负责人'));
  await page.screenshot({path:path.join(dir,'final-fix-settlements-ui.png'),fullPage:true});
  await page.evaluate(()=>localStorage.removeItem('REPORT_CORE_TOKEN'));await page.reload();await login('20260401');await page.getByText('林小禾',{exact:true}).first().waitFor();
  await page.reload();await page.getByText('林小禾',{exact:true}).first().waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(unexpectedDiagnostics,[],'unexpected server diagnostics');assert.equal(expectedDiagnostics.length,3);console.log('PASS 500-row cap / name correction / class detail 401 / transfer list 401 / imported number search / CLASS_HEAD label / V2 specialty hidden / profile reload');
 }finally{console.error=originalConsoleError;await browser?.close();vite.kill('SIGTERM');await new Promise(r=>server.close(r));}
});
