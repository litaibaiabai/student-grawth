const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function run(){
 const input=process.env.ADMIN_CLOSURE_REPORT_HTML;
 if(!input)throw Error('Set ADMIN_CLOSURE_REPORT_HTML to a real published report HTML');
 const html=await fs.readFile(input,'utf8'),output=path.join(path.dirname(input),'print-check');await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
 try{
  const page=await browser.newPage();
  for(const width of [1120,390]){
   await page.setViewportSize({width,height:1000});await page.emulateMedia({media:'screen'});await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
   const result=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,positions:document.querySelectorAll('[data-view]').length,pages:document.querySelectorAll('[data-print-page]').length}));
   results.push({mode:'screen',...result});await page.screenshot({path:path.join(output,`screen-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1587,height:1123});await page.emulateMedia({media:'print'});await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
  const pages=await page.locator('[data-print-page]').evaluateAll(rows=>rows.map(el=>({height:el.getBoundingClientRect().height,scrollHeight:el.scrollHeight,width:el.getBoundingClientRect().width})));
  results.push({mode:'print',pages});await page.screenshot({path:path.join(output,'print-layout.png'),fullPage:true});
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({input,results},null,2));
  for(const r of results.filter(r=>r.mode==='screen')){assert.equal(r.positions,94);assert.ok(r.width<=r.viewport+1,`screen ${r.viewport}px overflows to ${r.width}px`);}
  assert.equal(pages.length,2);for(const p of pages)assert.ok(p.scrollHeight<=Math.ceil(p.height)+2,`print page overflows: ${JSON.stringify(p)}`);
  console.log('ADMIN_CLOSURE_PRINT_PASS',JSON.stringify(results));
 }finally{await browser.close();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
