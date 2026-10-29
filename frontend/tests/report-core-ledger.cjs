const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createCoreTestDb}=require('../../backend/__tests__/helpers/reportCoreDb');
const path=require('node:path'),fs=require('node:fs/promises'),{spawn,execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
 const cleanups=[],db=await createCoreTestDb({after:fn=>cleanups.push(fn)});let server,vite,browser;
 try{
  await db.seedBase();await db.pool.query('INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher) SELECT school_id,term_id,teacher_id,grade,2,subject_code,is_head_teacher FROM teacher_teaching_assignment WHERE class_no=1');
  await db.pool.query('UPDATE student_term_evaluation SET class_no_snapshot=2 WHERE student_id=4');
  const c=await db.pool.getConnection();try{await require('../../backend/scripts/runCoreMigrations').recordUtcCutover({connection:c,targetDb:db.name,schoolId:'1',verifiedLegacyOffsetMinutes:0});}finally{c.release();}
  const cards=require('../../backend/services/reportCoreCards'),actor={id:'2',schoolId:'1',role:'teacher',tokenVersion:1};let n=0;const command=()=>({requestKey:'ledger-ui-'+ ++n,payloadHash:String(n).padStart(64,'0')});
  const quotaId=(await cards.saveQuota({pool:db.pool,actor:{...actor,id:'1',role:'manager'},termId:'1',teacherId:'2',monthKey:'2026-10',total:200,command:command()})).result.quotaId;
  await cards.savePlan({pool:db.pool,actor,quotaId,expectedRevision:'1',plans:[1,2].map(classNo=>({grade:4,classNo,classTotal:classNo===1?61:60,items:[{categoryCode:'CONDUCT_POLITENESS_OTHER_STAR',count:classNo===1?61:60}]})),command:command()});
  await cards.generateCards({pool:db.pool,actor,quotaId,expectedRevision:'2',command:command()});
  const [issued]=await db.pool.query("SELECT id,payload_json FROM evaluation_source_record WHERE record_kind='CARD' ORDER BY id");
  for(const classNo of [1,2]){const source=issued.find(r=>r.payload_json.classNo===classNo);const token=await cards.cardToken({pool:db.pool,actor,sourceId:String(source.id)});await cards.redeemCard({pool:db.pool,actor:{...actor,id:String(classNo+2),role:'student'},token,command:command(),now:new Date('2026-10-15T00:00:00Z')});}
  await cards.directScore({pool:db.pool,actor,termId:'1',studentIds:['3'],categoryCode:'CONDUCT_POLITENESS_OTHER_STAR',command:command(),now:new Date('2026-10-16T00:00:00Z')});
  server=require('../../backend/app').createApp({pool:db.pool,schoolId:'1'}).listen(19373);
  const root=path.resolve(__dirname,'../..');vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','19374','--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_TARGET:'http://127.0.0.1:19373'},stdio:'ignore'});
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:19374')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:19374');await page.getByLabel('账号',{exact:true}).fill('teacher');await page.getByLabel('密码',{exact:true}).fill('Test-pass-2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'卡片管理',exact:true}).click();
  await page.getByRole('tab',{name:'月度台账',exact:true}).waitFor({timeout:8000});
  await page.getByTestId('ledger-generated').getByText('121',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'使用明细',exact:true}).click();await page.locator('[data-card-row]').first().waitFor();assert.equal(await page.locator('[data-card-row]').count(),25);
  await page.getByRole('button',{name:'查看卡片明细',exact:true}).first().click();
  await page.getByRole('button',{name:'作废未领卡',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'作废未领原卡',exact:true});
  await dialog.getByLabel('卡片操作原因').fill('纸卡损坏，留痕作废');await dialog.getByRole('button',{name:'确认',exact:true}).click();await dialog.waitFor({state:'hidden'});

  await page.getByLabel('每页条数').selectOption('100');await page.getByRole('button',{name:'查询',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-card-row]').length===100);
  await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-card-row]').length===21);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出筛选CSV',exact:true}).click();const file=await downloadEvent;const csv=await fs.readFile(await file.path(),'utf8');assert.ok(!/token_hash|token_ciphertext|card=/i.test(csv));
  const parsed=JSON.parse(execFileSync('python3',['-c','import sys,csv,json; print(json.dumps(list(csv.reader(sys.stdin))))'],{input:csv.replace(/^\uFEFF/,''),encoding:'utf8'}));const header=parsed.findIndex(r=>r.includes('卡号'));assert.equal(parsed.length-header-1,121);
  await page.getByLabel('台账班级').selectOption('4:1');await page.getByRole('button',{name:'查询',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-card-row]').length===61);
  await page.reload();await page.getByLabel('台账班级').waitFor();assert.equal(await page.getByLabel('台账班级').inputValue(),'4:1');
  await page.getByLabel('台账学生').selectOption('3');await page.getByLabel('台账指标').selectOption('CONDUCT_POLITENESS_OTHER_STAR');await page.getByRole('button',{name:'查询',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-card-row]').length===1);
  assert.ok(!(await page.locator('[data-card-row]').innerText()).includes('尚未领取'));

  await page.getByRole('button',{name:'重置筛选',exact:true}).click();await page.getByRole('tab',{name:'使用明细',exact:true}).click();
  await page.getByLabel('明细视图').selectOption('students');await page.getByRole('button',{name:'查询',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-usage-row]').length===2);
  await page.getByLabel('明细视图').selectOption('events');await page.getByLabel('事件来源').selectOption('direct');await page.getByRole('button',{name:'查询',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-usage-row]').length===1);
  const directDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出筛选CSV',exact:true}).click();const directFile=await directDownload;const directCsv=await fs.readFile(await directFile.path(),'utf8');
  const directRows=JSON.parse(execFileSync('python3',['-c','import sys,csv,json; print(json.dumps(list(csv.reader(sys.stdin))))'],{input:directCsv.replace(/^\uFEFF/,''),encoding:'utf8'}));assert.equal(directRows.length-directRows.findIndex(r=>r.includes('变动分'))-1,1);
  await page.getByRole('button',{name:'查看直评记录',exact:true}).waitFor({timeout:8000});await page.getByRole('button',{name:'查看直评记录',exact:true}).click();await page.getByRole('button',{name:'冲正本次得分',exact:true}).click();
  const reverseDialog=page.getByRole('dialog',{name:'冲正直评得分',exact:true});await reverseDialog.getByLabel('卡片操作原因').fill('直评选错方向，保留原记录');await reverseDialog.getByRole('button',{name:'确认',exact:true}).click();await reverseDialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelectorAll('[data-usage-row]').length===2);
  await page.getByRole('tab',{name:'月度台账',exact:true}).click();await page.getByTestId('ledger-generated').getByText('121',{exact:true}).waitFor();await page.getByTestId('ledger-remaining').getByText('79',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'制卡打印',exact:true}).click();await page.getByRole('button',{name:'管理此计划',exact:true}).click();await page.getByText('本计划已制卡，班级和方向已锁定。剩余额度不代表此计划可再次生成；可补打当前未领取原卡。',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'生成全部班级卡片',exact:true}).isDisabled(),true);
  await page.getByLabel('原卡打印班级').selectOption('4:2');const pdfDownload=page.waitForEvent('download');await page.getByRole('button',{name:'下载本班原卡 PDF',exact:true}).click();const pdf=await pdfDownload;assert.equal((await fs.readFile(await pdf.path())).subarray(0,4).toString(),'%PDF');
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}
  assert.deepEqual(errors,[]);console.log('PASS actual 121-card ledger, filtered CSV, pagination, scoped usage and responsive layout');
 }finally{await browser?.close();vite?.kill();if(server)await new Promise(r=>server.close(r));for(const cleanup of cleanups.reverse())await cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
