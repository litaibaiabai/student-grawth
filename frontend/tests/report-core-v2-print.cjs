const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {buildV2ReportModel,renderV2Report}=require('../../backend/services/reportV2Render');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:1587,height:1123}});await page.emulateMedia({media:'print'});
 const model=buildV2ReportModel({evaluation:{student_id:3,student_name_snapshot:'验收学生',grade_snapshot:4,class_no_snapshot:1,honor_summary:{items:Array.from({length:100},(_,i)=>({name:`荣誉${String(i+1).padStart(3,'0')}：`+'认真参与校园综合实践活动'.repeat(18),level:'国家级'}))},teacher_comment:'继续保持好奇心与合作精神。'.repeat(70)},config:{}});
 await page.setContent(renderV2Report(model));await page.evaluate(()=>document.fonts.ready);assert.equal(await page.locator('[data-view]').count(),94);
 const overflow=await page.locator('[data-print-page]').evaluateAll(p=>p.map((x,i)=>({page:i+1,height:x.getBoundingClientRect().height,scroll:x.scrollHeight})).filter(x=>x.scroll>Math.ceil(x.height)+2));assert.deepEqual(overflow,[],'every printed page must fit its A3 sheet');
 const body=await page.locator('body').innerText();for(let i=1;i<=100;i++)assert.ok(body.includes('荣誉'+String(i).padStart(3,'0')));
 const output=path.resolve(__dirname,'../../output/report-core/v2');await fs.mkdir(output,{recursive:true});await page.pdf({path:path.join(output,'long-report.pdf'),preferCSSPageSize:true});await page.screenshot({path:path.join(output,'long-report.png'),fullPage:true});
 console.log('V2_PRINT_PASS: 94 locations, 100 long honors, long comment, no page overflow');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
