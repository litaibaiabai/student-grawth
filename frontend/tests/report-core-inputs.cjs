const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const apiPort=20000+(process.pid%10000)*2,webPort=apiPort+1;
const {createCoreTestDb}=require('../../backend/__tests__/helpers/reportCoreDb');
async function open(t,account,v2=false,provider){const cleanups=[],hooks={after:f=>cleanups.push(f)},db=v2?await require('../../backend/__tests__/helpers/reportCoreV2Db').createV2TestDb(hooks):await createCoreTestDb(hooks);if(!v2)await db.seedBase();const root=path.resolve(__dirname,'../..');let browser,vite,server;t.after(async()=>{await browser?.close();if(vite?.exitCode===null&&vite.signalCode===null){const done=once(vite,'exit');vite.kill();await done;}if(server)await new Promise(r=>server.close(r));for(const fn of cleanups.reverse())await fn();});server=require('../../backend/app').createApp({pool:db.pool,schoolId:'1',provider}).listen(apiPort);vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(webPort),'--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_TARGET:'http://127.0.0.1:'+apiPort},stdio:'ignore'});for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:'+webPort)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+webPort);await page.getByLabel('账号',{exact:true}).fill(account);await page.getByLabel('密码',{exact:true}).fill('Test-pass-2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('.student-topnav,.adult-navigation').waitFor();return {page,db};}
async function delayedResponse(page,pattern){let release,arrive;const arrived=new Promise(r=>arrive=r);await page.route(pattern,async route=>{const response=await route.fetch();await new Promise(r=>{release=r;arrive();});await route.fulfill({response});},{times:1});return {arrived,release:()=>release()};}
const confirm=page=>page.getByRole('button',{name:'确认导入',exact:true});
test('pending TXT prevents save or formal submit until the latest file read settles',async t=>{const {page}=await open(t,'student');await page.locator('.student-topnav').getByRole('button',{name:'月度故事',exact:true}).click();for(const [name,label] of [['我爱读故事','我爱读故事1'],['我爱听故事','我爱听故事1'],['我爱讲故事','我爱讲故事1']]){await page.getByRole('tab',{name:new RegExp(name)}).click();await page.getByLabel(label,{exact:true}).fill('本月认真阅读、倾听并表达自己的理解。');}await page.getByRole('tab',{name:/我爱读故事/}).click();await page.evaluate(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){return new Promise(resolve=>{window.finishRead=()=>original.call(this).then(resolve);});};});await page.getByLabel('我爱读故事文本文件',{exact:true}).setInputFiles({name:'delayed.txt',mimeType:'text/plain',buffer:Buffer.from('文件里的新故事')});await page.waitForFunction(()=>!!window.finishRead);assert.equal(await page.getByRole('button',{name:'保存草稿',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'提交本月三类故事',exact:true}).isDisabled(),true);await page.evaluate(()=>window.finishRead());await page.waitForFunction(()=>document.querySelector('textarea[aria-label="我爱读故事1"]')?.value==='文件里的新故事');await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.getByText('草稿已保存',{exact:true}).waitFor();await page.reload();await page.getByLabel('我爱读故事1',{exact:true}).waitFor();assert.equal(await page.getByLabel('我爱读故事1',{exact:true}).inputValue(),'文件里的新故事');});
test('late health preview cannot become committable after its input changes',async t=>{const {page}=await open(t,'admin');await page.getByRole('button',{name:'体测原始值',exact:true}).click();await page.getByLabel('3 · 身高',{exact:true}).fill('141');const gate=await delayedResponse(page,'**/api/v1/report-core/imports/preview');await page.getByRole('button',{name:'预览导入',exact:true}).click();await gate.arrived;await page.getByLabel('3 · 身高',{exact:true}).fill('142');const done=page.waitForResponse(r=>r.url().includes('/imports/preview'));gate.release();await done;await page.waitForTimeout(100);assert.equal(await confirm(page).isDisabled(),true);assert.equal(await page.getByLabel('3 · 身高',{exact:true}).inputValue(),'142');});
test('successful health commit clears only the submitted input version',async t=>{const {page,db}=await open(t,'admin');await page.getByRole('button',{name:'体测原始值',exact:true}).click();await page.getByLabel('3 · 身高',{exact:true}).fill('141');await page.getByRole('button',{name:'预览导入',exact:true}).click();await confirm(page).waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='确认导入')?.disabled);const gate=await delayedResponse(page,'**/api/v1/report-core/imports/*/commit');await confirm(page).click();await gate.arrived;await page.getByLabel('3 · 身高',{exact:true}).fill('142');const done=page.waitForResponse(r=>r.url().includes('/commit'));gate.release();await done;await page.getByText(/批次 #.*已提交/).waitFor();assert.equal(await page.getByLabel('3 · 身高',{exact:true}).inputValue(),'142');assert.equal(Number((await db.pool.query('SELECT height_cm FROM student_term_evaluation WHERE student_id=3'))[0][0].height_cm),141);assert.equal(await confirm(page).isDisabled(),true);});
test('teacher without current assignments still opens own monthly card ledger',async t=>{const {page,db}=await open(t,'teacher');await db.pool.query('UPDATE teacher_teaching_assignment SET enabled=0 WHERE teacher_id=2');await page.reload();await page.getByRole('button',{name:'卡片管理',exact:true}).click();await page.getByRole('heading',{name:'班级分配与领取',exact:true}).waitFor({timeout:5000});assert.equal(await page.getByRole('cell',{name:'学生3',exact:true}).count(),0);});
test('mixed-subject multi-class card settlement sends only current class assignments',async t=>{const {page,db}=await open(t,'teacher');await db.pool.query("DELETE FROM teacher_teaching_assignment WHERE teacher_id=2 AND subject_code<>'MATH'");await db.pool.query("INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code) VALUES(1,1,2,4,2,'SCIENCE')");await page.reload();await page.getByRole('button',{name:'评价录入',exact:true}).click();await page.getByRole('button',{name:'采集结算',exact:true}).click();const done=page.waitForResponse(r=>r.url().includes('/report-core/settlements')&&r.request().method()==='POST');await page.getByRole('button',{name:'确认结算',exact:true}).click();assert.equal((await done).status(),200);});
test('switching teacher scope after next tasks page clears cursor and prior class rows',async t=>{const {page,db}=await open(t,'teacher');await db.pool.query("INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code) VALUES(1,1,2,4,2,'MATH')");await page.reload();await page.getByRole('button',{name:'查看更多待办',exact:true}).click();await page.getByRole('button',{name:'查看更多待办',exact:true}).waitFor();const done=page.waitForResponse(r=>r.url().includes('/workspace?')&&r.url().includes('classNo=2'));await page.getByLabel('选择班级',{exact:true}).selectOption('4:2');const response=await done;assert.equal(response.status(),200);assert.equal(new URL(response.url()).searchParams.has('cursor'),false);await page.getByText('当前范围没有这类待办。',{exact:true}).waitFor();assert.equal(await page.locator('.table-scroll tbody tr').count(),0);});
test('recognized specialty supports actual teacher and student stars without replacing each other',async t=>{const {page,db}=await open(t,'teacher');const item={id:'sport-fixture',name:'跳绳',outcome:'校级展示',self_star:null,teacher_star:null};await require('../../backend/services/core/reportCoreStore').addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'2',sourceType:'CERTIFICATE',kind:'ITEM',status:'APPROVED',key:['specialty-fixture'],payload:{outputs:{sports_specialties:[item]}}});await db.pool.query('UPDATE student_term_evaluation SET sports_specialties=? WHERE student_id=3',[JSON.stringify([item])]);await page.getByRole('button',{name:'评价录入',exact:true}).click();await page.getByRole('button',{name:'采集结算',exact:true}).click();await page.getByLabel('特长评价学生',{exact:true}).selectOption('3');await page.getByRole('radio',{name:'跳绳 · 教师评价 3星',exact:true}).check({timeout:4000});await require('node:fs/promises').mkdir(path.resolve(__dirname,'../../output/report-core'),{recursive:true});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:path.resolve(__dirname,'../../output/report-core/teacher-specialty-new-ui.png'),fullPage:true});await page.getByRole('button',{name:'保存特长教师评价',exact:true}).click();await page.getByText('特长教师评价已保存',{exact:true}).waitFor();assert.equal(require('../../backend/services/core/reportCoreStore').parse((await db.pool.query('SELECT sports_specialties FROM student_term_evaluation WHERE student_id=3'))[0][0].sports_specialties)[0].teacher_star,3);await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByLabel('账号',{exact:true}).fill('student');await page.getByLabel('密码',{exact:true}).fill('Test-pass-2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'开始自我评价 →',exact:true}).click();await page.getByRole('button',{name:'2 · 健康与体育特长',exact:true}).click();await page.getByRole('radio',{name:'跳绳 · 自评 2星',exact:true}).check();await page.getByRole('button',{name:'保存评价',exact:true}).click();await page.getByText('评价已保存',{exact:true}).waitFor();const saved=require('../../backend/services/core/reportCoreStore').parse((await db.pool.query('SELECT sports_specialties FROM student_term_evaluation WHERE student_id=3'))[0][0].sports_specialties)[0];assert.equal(saved.self_star,2);assert.equal(saved.teacher_star,3);assert.equal(saved.id,'sport-fixture');});
test('workspace opens an authorized material outside the first one hundred sources',async t=>{const {page,db}=await open(t,'teacher');const store=require('../../backend/services/core/reportCoreStore');const oldest=await store.addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',status:'SUBMITTED',payload:{facts:{title:'待处理旧奖状'}},key:['old-material']});for(let i=0;i<101;i++)await store.addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',status:'REJECTED',payload:{facts:{title:'已处理'+i}},key:['new-material',i]});await page.reload();await page.getByRole('button',{name:'奖状',exact:true}).click();await page.getByRole('button',{name:'前往处理 →',exact:true}).first().click();await page.getByRole('heading',{name:new RegExp('材料 #'+oldest)}).waitFor({timeout:5000});});
test('unsaved class card plan prompts before leaving print tab and retains input when canceled',async t=>{const {page,db}=await open(t,'teacher'),cards=require('../../backend/services/cards/reportCoreCards'),{stableHash}=require('../../backend/services/core/reportCorePolicy');await cards.saveQuota({pool:db.pool,actor:{id:'1',schoolId:'1',role:'manager',tokenVersion:1},termId:'1',teacherId:'2',monthKey:'2026-10',total:120,command:{requestKey:'dirty-plan',payloadHash:stableHash('dirty-plan')}});await page.getByRole('button',{name:'卡片管理',exact:true}).click();await page.getByRole('tab',{name:'制卡打印',exact:true}).click();await page.getByRole('button',{name:'管理此计划',exact:true}).click();await page.getByLabel('班级总量0',{exact:true}).fill('7');let prompted=false;page.once('dialog',async dialog=>{prompted=true;await dialog.dismiss();});await page.getByRole('tab',{name:'月度台账',exact:true}).click();assert.equal(prompted,true);assert.equal(await page.getByLabel('班级总量0',{exact:true}).inputValue(),'7');});
test('whole-school activation first confirms term, student count and version without changing visibility on cancel',async t=>{const {page,db}=await open(t,'admin');await db.pool.query("UPDATE academic_year SET release_status='READY',release_key='confirmation-fixture',release_target_version=1,release_manifest=JSON_OBJECT('students',JSON_ARRAY(JSON_OBJECT('studentId','3','revision','1'),JSON_OBJECT('studentId','4','revision','1'))),release_state=JSON_OBJECT('prepared',2) WHERE id=1");await page.reload();let activates=0;page.on('request',r=>{if(r.url().includes('/activate'))activates++;});await page.getByRole('button',{name:'统一发布',exact:true}).click();const dialog=page.getByRole('dialog',{name:'确认全校统一发布',exact:true});await dialog.waitFor({timeout:4000});assert.equal(activates,0);await require('node:fs/promises').mkdir(path.resolve(__dirname,'../../output/report-core'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../../output/report-core/admin-release-confirm-new-ui.png'),fullPage:true});const text=await dialog.innerText();assert.match(text,/2026/);assert.match(text,/2/);assert.match(text,/版本.*1/);await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(activates,0);assert.equal(Number((await db.pool.query('SELECT active_release_version FROM academic_year WHERE id=1'))[0][0].active_release_version),0);});
test('monthly operation history exposes pagination beyond one hundred audits',async t=>{const {page,db}=await open(t,'teacher'),store=require('../../backend/services/core/reportCoreStore');for(let i=0;i<105;i++)await store.addSource(db.pool,{schoolId:'1',termId:'1',ownerId:'2',actorId:'1',monthKey:'2026-10',kind:'AUDIT',status:'COMMITTED',payload:{action:'QUOTA_CHANGE',oldTotal:i,newTotal:i+1,reason:'操作-'+i},key:['audit-page',i]});await page.getByRole('button',{name:'卡片管理',exact:true}).click();await page.getByText('共 105 条操作记录',{exact:true}).waitFor({timeout:4000});await page.getByRole('button',{name:'下一页操作记录',exact:true}).click();await page.getByText(/操作-0$/).waitFor();assert.equal(await page.getByText(/操作-104$/).count(),0);});

test('V2 direct scoring accepts optional empty notes and preserves supplied notes', async t => {
  const {page,db}=await open(t,'teacher',true);
  const submit=page.getByRole('button',{name:'确认记分',exact:true});
  const reason=page.getByLabel('直评说明',{exact:true});
  await page.locator('.direct-workbench').waitFor();
  assert.equal(await submit.isDisabled(),true);
  for (const note of ['', '   ', '主动完成值日']) {
    await page.getByRole('checkbox',{name:'学生3 · 4年级1班',exact:true}).check();
    assert.equal(await submit.isDisabled(),true);
    await page.getByRole('button',{name:'劳美',exact:true}).click();
    await page.locator('.direct-target-grid button').first().click();
    await reason.fill(note);
    assert.equal(await submit.isEnabled(),true,'selected student and category allow submission without a note');
    assert.equal(await page.locator('.direct-reason small').innerText(),'选填');
    const response=page.waitForResponse(r=>r.url().includes('/direct-scores')&&r.request().method()==='POST');
    await submit.click();
    assert.equal((await response).status(),200);
    await page.waitForFunction(()=>!document.querySelector('.direct-workbench').getAttribute('aria-busy') || document.querySelector('.direct-workbench').getAttribute('aria-busy')==='false');
    assert.equal(await reason.inputValue(),'');
  }
  const [rows]=await db.pool.query("SELECT payload_json,delta FROM evaluation_source_record WHERE record_kind='DIRECT' AND student_id=3 ORDER BY id");
  assert.deepEqual(rows.map(r=>JSON.parse(JSON.stringify(r.payload_json)).reason),['','','主动完成值日']);
  assert.deepEqual(rows.map(r=>Number(r.delta)),[1,1,1]);
});

test('award table headers combine search and filters and remain usable with no matches on mobile', async t => {
  const {page,db}=await open(t,'teacher',true);
  const store=require('../../backend/services/core/reportCoreStore');
  for(const [id,title,region,level,subject,status] of [
    ['3','数学竞赛','市级','一等奖','MATH','SUBMITTED'],
    ['4','音乐展演','省级','二等奖','MUSIC','APPROVED'],
    ['3','科学展示','区级','三等奖','SCIENCE','FAILED'],
  ]) await store.addSource(db.pool,{schoolId:'1',termId:'1',studentId:id,actorId:id,sourceType:'CERTIFICATE',kind:'ITEM',status,payload:{facts:{title,awardRegion:region,awardLevel:level,subjectCode:subject}},key:['header-filter',title]});
  await page.getByRole('button',{name:'评审获奖',exact:true}).click();
  await page.getByRole('button',{name:/4年级1班/}).click();
  await page.locator('tr[data-award-id]').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'刷新获奖记录',exact:true}).count(),0);
  const student=page.getByRole('columnheader').getByLabel('搜索学生姓名或学号',{exact:true});
  const title=page.getByRole('columnheader').getByLabel('搜索荣誉名称',{exact:true});
  const status=page.getByRole('columnheader').getByLabel('过滤评审状态',{exact:true});
  assert.equal(await student.isVisible(),false,'search controls are collapsed until the header icon is clicked');
  async function useFilter(control, method, value) {
    if(!await control.isVisible()) await control.locator('xpath=ancestor::th').getByRole('button').first().click();
    await control[method](value);
    await control.press('Escape');
  }

  const count=async n=>assert.equal(await page.locator('tr[data-award-id]').count(),n);
  await useFilter(status,'selectOption','pending'); await count(2);
  await useFilter(student,'fill','student2'); await count(0);
  await useFilter(student,'fill','学生3'); await count(2);
  await useFilter(title,'fill','数学'); await count(1);
  const checkbox=page.locator('tbody input[type=checkbox]').first();
  await checkbox.check();
  await useFilter(page.getByLabel('过滤荣誉地域',{exact:true}),'selectOption','省级'); await count(0);
  assert.equal(await page.getByRole('button',{name:'批量通过（0）',exact:true}).isDisabled(),true);
  await useFilter(page.getByLabel('过滤荣誉地域',{exact:true}),'selectOption',''); await count(1);
  await useFilter(page.getByLabel('过滤荣誉级别',{exact:true}),'selectOption','二等奖'); await count(0);
  await useFilter(page.getByLabel('过滤荣誉级别',{exact:true}),'selectOption','');
  await useFilter(page.getByLabel('过滤所属学科',{exact:true}),'selectOption','MUSIC'); await count(0);
  await useFilter(page.getByLabel('过滤所属学科',{exact:true}),'selectOption','');
  await useFilter(title,'fill',''); await useFilter(student,'fill','');
  await useFilter(status,'selectOption','approved'); await count(1);
  await useFilter(student,'fill','student2'); await count(1);
  await page.setViewportSize({width:390,height:844});
  await student.locator('xpath=ancestor::th').getByRole('button').first().click();
  assert.equal(await student.isVisible(),true);
  await student.press('Escape');
  await status.locator('xpath=ancestor::th').getByRole('button').first().click();
  assert.equal(await status.isVisible(),true);
  await status.press('Escape');
  await useFilter(student,'fill','不存在的学生'); await count(0);
  await title.locator('xpath=ancestor::th').getByRole('button').first().click();
  assert.equal(await title.isVisible(),true);
  await title.press('Escape');
  await useFilter(student,'fill',''); await useFilter(status,'selectOption','all'); await count(3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('comment evidence opens on the left beside an editable letter, preserves drafts and closes accessibly', async t => {
  const {page}=await open(t,'teacher',true,{generateTermComment:async()=>({comment:'你在学习中认真投入，也愿意帮助同学。继续保持好奇心。',model:'fixture'})});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'班主任寄语',exact:true}).click();
  await page.getByLabel('寄语班级',{exact:true}).selectOption('4:1');
  await page.getByRole('button',{name:'查看学生3的班主任寄语',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'班主任寄语',exact:true});
  await page.waitForFunction(()=>document.querySelector('#term-comment-text')?.value.includes('好奇心'));
  const original=await editor.inputValue();
  const trigger=page.getByRole('button',{name:'查看六育报表依据',exact:true});
  assert.equal(await trigger.count(),1,'evidence uses a drawer button rather than a details accordion');
  const regenerateBox=await page.getByRole('button',{name:/重新生成/}).boundingBox(),triggerBox=await trigger.boundingBox();
  assert.ok(triggerBox.x>=regenerateBox.x+regenerateBox.width&&Math.abs((triggerBox.y+triggerBox.height/2)-(regenerateBox.y+regenerateBox.height/2))<2,'evidence button sits beside regenerate: '+JSON.stringify({regenerateBox,triggerBox}));
  await editor.fill(original+'老师修改的内容。');
  const layoutBefore=await editor.evaluate(el=>{window.originalCommentEditor=el;const r=el.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height};});
  await trigger.click();
  const layoutAfter=await editor.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height};});
  assert.deepEqual(layoutAfter,layoutBefore,'opening evidence must not move or resize the original editor');
  assert.equal(await editor.evaluate(el=>el===window.originalCommentEditor),true,'editor stays in its original DOM position');
  const comparison=page.getByRole('dialog',{name:'六育报表依据',exact:true});
  await comparison.waitFor();
  const drawer=page.getByRole('region',{name:'六育报表依据',exact:true});
  assert.equal(await drawer.locator('[data-section]').count(),6);
  const assertReportFits=async()=>{
    const fits=await page.waitForFunction(el=>{
      const viewport=el.getBoundingClientRect(),report=el.querySelector('.assessment-report').getBoundingClientRect();
      const tables=[...el.querySelectorAll('.assessment-table-wrap')];
      return Math.abs((report.left+report.width/2)-(viewport.left+viewport.width/2))<2
        &&Math.abs((report.top+report.height/2)-(viewport.top+viewport.height/2))<2
        &&report.left>=viewport.left-1&&report.right<=viewport.right+1&&report.bottom<=viewport.bottom+1
        &&el.scrollHeight<=el.clientHeight+1&&el.scrollWidth<=el.clientWidth+1
        &&tables.every(table=>table.scrollWidth<=table.clientWidth+1);
    },await drawer.locator('.term-evidence-scroll').elementHandle());
    assert.equal(await fits.jsonValue(),true,'the complete report fits within the drawer without scrollbars');
  };
  await assertReportFits();

  const sectionBoxes=await drawer.locator('[data-section]').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
  for(let i=0;i<6;i+=2) assert.ok(Math.abs(sectionBoxes[i].y-sectionBoxes[i+1].y)<1&&sectionBoxes[i+1].x>sectionBoxes[i].x,'report sections display two per row');
  assert.ok(Math.abs(sectionBoxes[0].width/sectionBoxes[1].width-2/3)<0.002,'conduct and wisdom widths use a 2:3 ratio');
  assert.ok(Math.abs(sectionBoxes[2].width-sectionBoxes[3].width)<1,'other rows retain equal widths');

  const left=await drawer.boundingBox(),right=await editor.boundingBox();
  assert.ok(left.x<right.x&&left.x+left.width<=right.x+1,'report sits to the left without covering the letter');
  await editor.fill(original+'对照报表后修改的内容。');
  const edited=await editor.inputValue();
  await page.screenshot({path:'/tmp/liuyu-comment-comparison-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:1366,height:768});
  await page.waitForFunction(()=>innerWidth===1366);
  await assertReportFits();
  await page.setViewportSize({width:1440,height:1000});
  assert.equal(await editor.inputValue(),edited);
  await trigger.click();
  assert.equal(await comparison.count(),0);
  assert.equal(await editor.inputValue(),edited);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='查看六育报表依据');
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  await trigger.click();
  await editor.press('Escape');
  assert.equal(await comparison.count(),0);
  assert.equal(await editor.inputValue(),edited);
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();
  await page.getByRole('status').filter({hasText:'寄语草稿已保存'}).waitFor();
  await trigger.click();
  await page.getByRole('button',{name:/继续核对下一位/}).click();
  await page.waitForFunction(()=>document.querySelector('#term-comment-text')&&!document.querySelector('.term-evidence-panel'));
  await page.getByRole('button',{name:'查看学生3的班主任寄语',exact:true}).click();
  await page.waitForFunction(edited=>document.querySelector('#term-comment-text')?.value===edited,edited);
  await page.setViewportSize({width:390,height:844});
  await trigger.click();
  await drawer.waitFor();
  await drawer.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
  await comparison.screenshot({path:'/tmp/liuyu-comment-comparison-mobile.png',animations:'disabled'});
  await assertReportFits();
  const mobile=await drawer.boundingBox();
  assert.ok(mobile.x>=0&&mobile.x+mobile.width<=390);
  assert.equal(await page.getByRole('button',{name:'关闭报表依据',exact:true}).count(),0);
  await page.mouse.click(389,100);
  assert.equal(await comparison.count(),0);
  assert.equal(await editor.inputValue(),edited);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('teacher account card keeps identity and two clear actions aligned on desktop and mobile', async t => {
  const {page,db}=await open(t,'teacher',true);
  await db.pool.query("UPDATE users SET real_name='林知行' WHERE id=2");
  await page.reload();
  await page.locator('.side-account').waitFor();
  const account=page.locator('.side-account');
  const settings=account.getByRole('button',{name:'人脸登录设置',exact:true});
  const logout=account.getByRole('button',{name:'退出登录',exact:true});
  assert.equal((await logout.innerText()).trim(),'退出登录','logout has a visible text label');
  await page.setViewportSize({width:1440,height:1000});
  assert.match(await account.innerText(),/林知行/);
  const label=account.getByText('人脸登录设置',{exact:true});
  assert.equal(await label.evaluate(el=>{const r=new Range();r.selectNodeContents(el);return r.getClientRects().length;}),1,'settings label stays on one line');
  await settings.click();
  await page.getByRole('dialog',{name:'人脸登录设置',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭人脸设置',exact:true}).click();
  await page.screenshot({path:'/tmp/liuyu-teacher-account-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await settings.isVisible(),true);
  assert.equal(await logout.isVisible(),true);
  const a=await settings.boundingBox(),b=await logout.boundingBox();
  assert.ok(a.x+a.width<=b.x+1&&b.x+b.width<=390);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await settings.click();
  await page.getByRole('dialog',{name:'人脸登录设置',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭人脸设置',exact:true}).click();
  await logout.click();
  await page.getByRole('heading',{name:'账号登录',exact:true}).waitFor();
});

test('redesigned login supports keyboard mode switching, errors, all roles and mobile layout', async t => {
  const {page,db}=await open(t,'teacher',true);
  await require('../../backend/scripts/migrateAdminClasses').migrateAdminClasses({connection:db.pool,targetDb:db.name,mode:'apply'});
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  const main=page.getByRole('main',{name:'云美登录',exact:true});
  await main.waitFor();
  assert.equal(await main.count(),1);
  await page.getByLabel('账号',{exact:true}).fill('teacher');
  await page.getByLabel('密码',{exact:true}).fill('wrong-password');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('账号',{exact:true}).inputValue(),'teacher');
  const passwordTab=page.getByRole('tab',{name:'账号密码',exact:true}),faceTab=page.getByRole('tab',{name:'人脸登录',exact:true});
  await passwordTab.focus(); await passwordTab.press('ArrowRight');
  assert.equal(await faceTab.getAttribute('aria-selected'),'true');
  assert.equal(await page.getByLabel('人脸登录账号',{exact:true}).inputValue(),'teacher');
  assert.equal(await page.getByRole('button',{name:'开启摄像头',exact:true}).isVisible(),true);
  await faceTab.press('Home');
  assert.equal(await passwordTab.getAttribute('aria-selected'),'true');
  assert.equal(await page.getByLabel('密码',{exact:true}).inputValue(),'');
  assert.equal(await page.getByRole('alert').count(),0);
  await page.getByLabel('账号',{exact:true}).fill('');
  await page.evaluate(()=>document.activeElement?.blur());
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'/tmp/liuyu-login-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const loginBox=await page.getByRole('button',{name:'登录',exact:true}).boundingBox();
  assert.ok(loginBox.y+loginBox.height<=844,'login action is visible without scrolling on a phone');
  await page.screenshot({path:'/tmp/liuyu-login-mobile.png',animations:'disabled'});
  for(const [account,role] of [['teacher','teacher'],['admin','manager'],['student','student']]) {
    await page.getByLabel('账号',{exact:true}).fill(account);
    await page.getByLabel('密码',{exact:true}).fill('Test-pass-2026');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.locator('.role-'+role).waitFor();
    if(role!=='student') await page.getByRole('button',{name:'退出登录',exact:true}).click();
  }
});

test('administrator account card keeps identity clear and settings and logout usable on mobile', async t => {
  const {page,db}=await open(t,'teacher',true);
  await require('../../backend/scripts/migrateAdminClasses').migrateAdminClasses({connection:db.pool,targetDb:db.name,mode:'apply'});
  await db.pool.query("UPDATE users SET real_name='学校管理员' WHERE id=1");
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.getByLabel('账号',{exact:true}).fill('admin');
  await page.getByLabel('密码',{exact:true}).fill('Test-pass-2026');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.locator('.role-manager .side-account').waitFor();
  const account=page.getByRole('region',{name:'管理员账号菜单',exact:true});
  assert.equal(await account.count(),1);
  await page.setViewportSize({width:1440,height:1000});
  assert.match(await account.innerText(),/学校管理员/);
  assert.match(await account.innerText(),/管理员账号/);
  const settings=account.getByRole('button',{name:'人脸登录设置',exact:true}),logout=account.getByRole('button',{name:'退出登录',exact:true});
  assert.equal((await logout.innerText()).trim(),'退出登录');
  assert.equal(await settings.locator('span').first().evaluate(el=>{const r=new Range();r.selectNodeContents(el);return r.getClientRects().length;}),1);
  const a=await settings.boundingBox(),b=await logout.boundingBox();
  assert.ok(b.y>=a.y+a.height&&Math.abs(a.x-b.x)<1);
  await settings.click();
  await page.getByRole('dialog',{name:'人脸登录设置',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭人脸设置',exact:true}).click();
  await account.screenshot({path:'/tmp/liuyu-admin-account-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await settings.isVisible(),true);
  assert.equal(await logout.isVisible(),true);
  const mobileSettings=await settings.boundingBox(),mobileLogout=await logout.boundingBox();
  assert.ok(mobileSettings.x+mobileSettings.width<=mobileLogout.x+1&&mobileLogout.x+mobileLogout.width<=390);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/tmp/liuyu-admin-account-mobile.png',animations:'disabled'});
  await settings.click();
  await page.getByRole('dialog',{name:'人脸登录设置',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭人脸设置',exact:true}).click();
  await logout.click();
  await page.getByRole('heading',{name:'账号登录',exact:true}).waitFor();
});
