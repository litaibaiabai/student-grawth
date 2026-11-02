const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createAdminTestDb } = require('../../backend/__tests__/helpers/reportCoreAdminDb');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

test('UI01–UI14: imports, direct teacher save, version conflict, terminology, feedback and review pagination', {timeout:120000}, async t => {
  const cleanups=[], db=await createAdminTestDb({after:fn=>cleanups.push(fn)});
  let browser, vite, server;
  t.after(async()=>{await browser?.close();if(vite && vite.exitCode===null){const done=once(vite,'exit');vite.kill();await done;}if(server)await new Promise(r=>server.close(r));for(const fn of cleanups.reverse())await fn();});
  const root=path.resolve(__dirname,'../..'), output=path.join(root,'output/ui-fixes');
  await fs.mkdir(output,{recursive:true});
  server=require('../../backend/app').createApp({pool:db.pool,schoolId:'1'}).listen(0,'127.0.0.1');
  await once(server,'listening');
  vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','19688','--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_TARGET:`http://127.0.0.1:${server.address().port}`},stdio:'ignore'});
  for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:19688')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const go=async(role,tab)=>{await page.goto(`http://127.0.0.1:19688/#/${role}/${tab}`);};
  const login=async(username,role,tab)=>{await page.goto('http://127.0.0.1:19688');await page.evaluate(()=>localStorage.removeItem('REPORT_CORE_TOKEN'));await go(role,tab);await page.getByLabel('账号',{exact:true}).fill(username);await page.getByLabel('密码',{exact:true}).fill('Test-pass-2026');await page.getByRole('button',{name:'登录',exact:true}).click();};
  await login('admin','manager','classes');
  await page.locator('.admin-class-card').first().click();
  await page.getByRole('button',{name:'教师配置',exact:true}).click();
  await page.getByLabel('数学任课教师',{exact:true}).selectOption('');
  assert.equal(await page.getByRole('button',{name:'确认教师配置',exact:true}).isEnabled(),true,'valid draft saves without manually previewing');
  await page.getByRole('button',{name:'确认教师配置',exact:true}).click();
  await page.getByText('教师配置已保存',{exact:true}).waitFor();
  const [[math]]=await db.pool.query("SELECT COUNT(*) n FROM teacher_teaching_assignment WHERE school_id=1 AND term_id=1 AND subject_code='MATH' AND enabled=1");
  assert.equal(Number(math.n),0);
  await page.getByLabel('数学任课教师',{exact:true}).selectOption('2');
  // A concurrent class edit must still fail the server revision check.
  await db.pool.query('UPDATE school_class SET revision=revision+1 WHERE school_id=1 AND term_id=1');
  await page.getByRole('button',{name:'确认教师配置',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'配置已变化'}).waitFor();
  assert.equal(await page.getByLabel('数学任课教师',{exact:true}).inputValue(),'2');
  await page.getByRole('button',{name:'刷新班级版本，保留配置',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'配置已变化'}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'确认教师配置',exact:true}).click();
  await page.getByText('教师配置已保存',{exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭班级详情',exact:true}).click();
  const upload=page.getByRole('heading',{name:'批量导入班级',exact:true}), list=page.getByRole('heading',{name:'本学期班级',exact:true});
  assert.ok((await upload.boundingBox()).y<(await list.boundingBox()).y);
  assert.equal(await page.getByText('负责教师',{exact:false}).count(),0);
  await page.getByLabel('班级导入文件').evaluate(el=>{const panel=el.closest('section');panel.style.outline='3px solid #c65c2f';const label=document.createElement('p');label.textContent='UI02 标注对象：批量导入班级（已移至班级列表前）';label.style.cssText='font-weight:bold;color:#a13b18';panel.prepend(label);});
  await page.screenshot({path:path.join(output,'ui02-class-import-annotated.png'),fullPage:true});
  await go('manager','roster');
  for(const [type,name] of [['教师账号','下载教师账号模板'],['学生学籍','下载学生学籍模板']]){
    await page.getByRole('button',{name:type,exact:true}).click();
    const template=page.getByRole('button',{name,exact:true});await template.waitFor();
    const file=page.getByLabel('学籍账号文件');
    assert.ok((await template.boundingBox()).y<(await file.boundingBox()).y);
    assert.ok((await file.boundingBox()).y<(await page.getByRole('columnheader',{name:'账号',exact:true}).boundingBox()).y);
    const downloaded=page.waitForEvent('download');await template.click();assert.equal((await downloaded).suggestedFilename(),name.replace('下载','')+'.xlsx');
  }
  await page.screenshot({path:path.join(output,'ui03-ui04-account-import.png'),fullPage:true});
  await go('manager','quota');await page.getByLabel('默认每班月额度').waitFor();assert.equal(await page.locator('.subject-quota-estimate').count(),0);
  await page.getByLabel('默认每班月额度').fill('0');await page.getByRole('button',{name:'保存学科额度',exact:true}).click();await page.getByText('学科月额度已保存',{exact:true}).waitFor();
  await go('manager','config');await page.getByRole('heading',{name:'开启下一学期',exact:true}).waitFor();
  const region=page.locator('.admin-new-term');const originalY=(await region.boundingBox()).y;
  for(const button of await page.getByRole('navigation',{name:'学期配置分类'}).getByRole('button').all()) {await button.click();assert.equal(await region.count(),1);assert.equal((await region.boundingBox()).y,originalY);}
  await go('manager','audit');
  await page.getByLabel('操作或人员',{exact:true}).fill('配置班级教师');
  await page.getByLabel('操作类型',{exact:true}).selectOption('CLASS_TEACHERS');
  await page.getByRole('button',{name:'查询记录',exact:true}).click();
  await page.getByRole('cell',{name:/配置班级教师/}).first().waitFor();
  assert.ok(await page.getByRole('cell',{name:'已完成',exact:true}).first().isVisible());
  const auditDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出操作记录',exact:true}).click();
  const auditFile=await auditDownload;assert.equal(auditFile.suggestedFilename(),'操作记录.csv');
  const csv=await fs.readFile(await auditFile.path(),'utf8');
  for(const text of ['配置班级教师','已完成','任课关系','数学','操作代码','CLASS_TEACHERS'])assert.ok(csv.includes(text),text);
  await page.screenshot({path:path.join(output,'ui08-chinese-audit.png'),fullPage:true});
  await login('student','student','self');await page.getByRole('button',{name:'保存评价',exact:true}).waitFor();
  const nav=page.locator('.student-topnav');assert.deepEqual(await nav.getByRole('button').allTextContents(),['领取积分','云美故事','上传奖状','自我评价','六育报告']);
  await page.screenshot({path:path.join(output,'ui10-student-navigation.png'),fullPage:true});
  await page.getByRole('radio').first().check();
  await page.getByRole('button',{name:'保存评价',exact:true}).click();
  const toast=page.locator('.app-toast');await toast.getByText('评价已保存',{exact:true}).waitFor();
  assert.ok((await toast.boundingBox()).y<100,'success floats in view even after scrolling to the save button');
  await page.screenshot({path:path.join(output,'ui12-self-saved-toast.png')});
  // Inject an HTTP save failure and verify it cannot leave a success message on screen.
  await page.getByRole('radio').nth(1).check();
  await page.route('**/api/v1/report-core/forms/3',route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({message:'测试保存失败'})}));
  await page.getByRole('button',{name:'保存评价',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'测试保存失败'}).waitFor();
  assert.equal(await toast.count(),0);
  await page.unroute('**/api/v1/report-core/forms/3');
  await page.getByRole('button',{name:'保存评价',exact:true}).click();await toast.waitFor();
  await page.getByLabel('关闭消息提示').click();
  await page.setViewportSize({width:390,height:844});
  const mobileNav=page.locator('.student-bottomnav');
  assert.deepEqual(await mobileNav.getByRole('button').allTextContents(),['领取积分','云美故事','上传奖状','自我评价','六育报告']);
  assert.ok(await mobileNav.getByRole('button',{name:'六育报告',exact:true}).isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'ui10-mobile-five-tabs.png')});
  await mobileNav.getByRole('button',{name:'六育报告',exact:true}).click();
  await page.getByRole('heading',{name:'六育报告尚未发布',exact:true}).waitFor();
  await page.setViewportSize({width:1440,height:1000});
  // Populate enough records to exercise the review page beyond its first UI page.
  const ids=[];
  for(let i=0;i<23;i++)ids.push(String(await require('../../backend/services/reportCoreStore').addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'3',sourceType:'CERTIFICATE',kind:'ITEM',status:'SUBMITTED',schemaVersion:'SIX_EDU_V2',key:['ui-review',i],payload:{facts:{title:`测试奖状${i}`,awardRegion:'区级',awardLevel:'一等奖',subjectCode:'MATH'}}})));
  await login('teacher','teacher','reviews');
  await page.getByRole('button',{name:/4年级1班/}).click();
  await page.locator('[data-award-id]').first().waitFor();
  assert.equal(await page.locator('[data-award-id]').count(),10);
  assert.equal(await page.getByRole('button',{name:'加载更多材料与记录',exact:true}).count(),0);
  const firstId=await page.locator('[data-award-id]').first().getAttribute('data-award-id');
  await db.pool.query("UPDATE evaluation_source_record SET status='APPROVED',revision=revision+1 WHERE id=?",[firstId]);
  await page.getByRole('button',{name:'刷新获奖记录',exact:true}).click();
  await page.locator(`[data-award-id="${firstId}"]`).getByText('已通过',{exact:true}).waitFor();
  const seen=new Set();
  for(let i=0;i<3;i++){
    for(const id of await page.locator('[data-award-id]').evaluateAll(rows=>rows.map(r=>r.dataset.awardId)))seen.add(id);
    if(i<2)await page.getByRole('button',{name:'下一页获奖记录',exact:true}).click();
  }
  assert.equal(seen.size,23,'refresh must retain access to every paginated record');
  await page.getByRole('button',{name:'刷新获奖记录',exact:true}).click();
  await page.getByText('共 23 条记录 · 第 3 / 3 页',{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'ui14-review-refresh-and-pagination.png'),fullPage:true});
  await go('teacher','cards-manage');await page.getByRole('heading',{name:'打印积分卡',exact:true}).waitFor();
  const {renderPrintableA4}=require('../../backend/services/reportRenderService');
  const report={schemaVersion:'CORE_V2',student:{name:'术语验收',grade:4,classNo:1},term:{academicYear:'2026-2027',semester:1},values:{},sportsSpecialties:[],artSpecialties:[],narratives:{teacher_comment:'继续保持对学习的好奇心。'},honors:[]};
  const reportPage=await browser.newPage({viewport:{width:1587,height:1123}});
  for(const schemaVersion of ['CORE_V1','CORE_V2']){
    const html=renderPrintableA4({reportData:{...report,schemaVersion}});
    await reportPage.setContent(html);
    for(const media of ['screen','print']){
      await reportPage.emulateMedia({media});
      const text=await reportPage.locator('body').innerText();
      assert.ok(text.includes('班主任寄语'));assert.ok(text.includes('师评'));
      assert.ok(!text.includes('学期寄语'));assert.ok(!text.includes('他评'));
    }
  }
  await reportPage.screenshot({path:path.join(output,'ui11-report-print-terminology.png'),fullPage:true});
  assert.equal(renderPrintableA4({reportData:{...report,renderedHtml:'历史报告：学期寄语 / 他评'}}),'历史报告：学期寄语 / 他评');
  await reportPage.close();
  assert.deepEqual(errors,[]);
});
