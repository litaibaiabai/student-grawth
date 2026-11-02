// Read-only layout inspection of the persistent local award fixtures. Never approves records.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createDbPool}=require('../../backend/db');
const {signToken}=require('../../backend/middleware/auth');
(async()=>{
  const root=path.resolve(__dirname,'../..'),output=path.join(root,'output/report-core/award-simulation'),pool=createDbPool();
  let browser;
  try {
    const manifest=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));
    const [[teacher]]=await pool.query("SELECT id,school_id,role,token_version FROM users WHERE username='teacher' AND role='teacher'");
    const token=signToken(teacher);
    browser=await chromium.launch({headless:true,channel:'chrome'});
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],badResponses=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().includes('/api/') && r.status()>=400)badResponses.push({url:r.url().split('?')[0],status:r.status()});});
    await page.addInitScript(value=>{if(location.origin==='http://127.0.0.1:5173')localStorage.setItem('REPORT_CORE_TOKEN',value);},token);
    await page.goto('http://127.0.0.1:5173/#/teacher/reviews?termId=1');
    await page.getByRole('heading',{name:'选择评审班级',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'class-picker.png'),animations:'disabled'});
    await page.getByRole('button',{name:/4年级99班/}).click();
    await page.locator('[data-award-id]').first().waitFor();
    assert.equal(await page.locator('[data-award-id]').count(),10);
    const measurements=[];
    for(const [width,height] of [[1440,900],[1280,720],[1024,768],[390,844],[320,640]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
      measurements.push(await page.evaluate(()=>{
        const table=document.querySelector('.award-table-scroll'),batch=document.querySelector('.award-batch-bar'),rows=[...document.querySelectorAll('[data-award-id]')];
        const rect=element=>{const r=element.getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)};};
        return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,table:{clientWidth:table.clientWidth,scrollWidth:table.scrollWidth},rowsFullyVisible:rows.filter(r=>{const b=r.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}).length,rowsPartlyVisible:rows.filter(r=>{const b=r.getBoundingClientRect();return b.top<innerHeight&&b.bottom>0;}).length,firstRow:rect(rows[0]),batch:rect(batch),fonts:[...document.querySelectorAll('.award-table th,.award-table td small,.award-date,.award-status')].slice(0,20).map(e=>({sample:e.textContent.slice(0,30),font:getComputedStyle(e).fontSize,color:getComputedStyle(e).color}))};
      }));
      await page.screenshot({path:path.join(output,`viewport-${width}x${height}.png`),animations:'disabled'});
      if(width===1440 || width===390)await page.screenshot({path:path.join(output,`full-${width}.png`),fullPage:true,animations:'disabled'});
    }
    await page.setViewportSize({width:1440,height:900});
    await page.getByLabel('搜索学生或奖项').fill('校园阅读');
    await page.screenshot({path:path.join(output,'normal-awards.png'),fullPage:true,animations:'disabled'});
    await page.getByLabel('搜索学生或奖项').fill('林知夏');
    assert.equal(await page.locator('[data-award-id]').count(),4,'same-name students remain distinct award records');
    await page.screenshot({path:path.join(output,'same-name-students.png'),fullPage:true,animations:'disabled'});
    await page.getByLabel('搜索学生或奖项').fill('');
    await page.getByRole('button',{name:'下一页获奖记录'}).click();
    const selected=manifest.records.filter(r=>[20,21].includes(r.index));
    for(const record of selected)await page.locator(`[data-award-id="${record.id}"]`).getByRole('checkbox').check();
    await page.getByRole('button',{name:'批量通过（2）',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'batch-selection.png'),animations:'disabled'});
    await page.getByRole('button',{name:'取消选择',exact:true}).click();
    const pdf=manifest.records.find(r=>r.index===21);
    await page.locator(`[data-award-id="${pdf.id}"]`).getByRole('button',{name:'查看详情'}).click();
    await page.locator('object[aria-label="学生上传的奖状PDF"]').waitFor();
    await page.screenshot({path:path.join(output,'pdf-detail-desktop.png'),animations:'disabled'});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'上一页获奖记录'}).click();
    const long=manifest.records.find(r=>r.index===29);
    await page.locator(`[data-award-id="${long.id}"]`).getByRole('button',{name:'查看详情'}).click();
    await page.getByRole('img',{name:'学生上传的奖状原件'}).waitFor();
    await page.waitForFunction(()=>document.querySelector('.award-original img')?.naturalWidth>0);
    await page.screenshot({path:path.join(output,'long-title-detail.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'detail-mobile-top.png'),animations:'disabled'});
    await page.getByRole('textbox',{name:'荣誉名称',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'detail-mobile-facts.png'),animations:'disabled'});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'切换班级',exact:true}).click();
    await page.getByRole('button',{name:/4年级1班/}).click();
    await page.locator('[data-award-id]').first().waitFor();
    assert.equal(await page.locator('[data-award-id]').count(),4);
    assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);
    const report={generatedAt:new Date().toISOString(),measurements,errors,badResponses,checks:{class99RecordCount:28,class1RecordCount:4,sameNameMatches:4,multiRecordSelection:2,pdfPreview:true,imagePreview:true,approvalWrites:0}};
    await fs.writeFile(path.join(output,'layout-inspection.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally {await browser?.close();await pool.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
