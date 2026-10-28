// UI regression only: start Vite on 127.0.0.1:5173 first. Uses API fixtures; never a business database.
// Requires Node >=20 and Playwright (PLAYWRIGHT_MODULE may point to an existing installation).
const { createRequire } = require('node:module');
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : createRequire(require.resolve('../../scripts/full-system-demo/package.json'))('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
 const page = await browser.newPage({viewport:{width:1440,height:1100}});
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('AUTH_TOKEN','ui-test');localStorage.setItem('APP_USER',JSON.stringify({id:42,role:'student',real_name:'林小满',name:'林小满'}));});
 let theme='forest', failTheme=false, failGrowth=false, empty=false, published=false, points=28, replay=false, legacy=false;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/student/cards/preview')) return route.fulfill({json:{code:200,data:{dimensionCode:'D',dimensionName:'德育',categoryId:legacy?null:55,categoryName:'友爱互助',points:1,teacherName:'陈老师',monthKey:'2026-10',serialNo:1}}});
  if(path.endsWith('/student/card-claims')) return route.fulfill({json:{code:200,data:{claimId:88,status:legacy?'PENDING':'APPROVED',pointsCredited:legacy?0:1,replayed:replay}}});
  if(path.endsWith('/growth/theme')) {if(failTheme)return route.fulfill({status:500,json:{code:500,message:'保存失败'}});theme=route.request().postDataJSON().themeId;return route.fulfill({json:{code:200,data:{themeId:theme}}});}
  if(path.endsWith('/growth/my')) {if(failGrowth)return route.fulfill({status:500,json:{code:500,message:'加载失败'}});return route.fulfill({json:{code:200,data:{studentProfile:{name:'林小满',grade:4,classNo:2},currentPoints:points,theme,gameLevel:{levelName:'奋楫少年',minPoints:20,nextLevelPoints:50},evaluation:{isPublished:published,version:2},timeline:empty?[]:[{id:'1',type:'SCORE',title:'主动帮助同学',detail:'德育 · 友爱互助',delta:1,createdAt:'2026-10-27T08:00:00Z'},{id:'2',type:'STORY',title:'我和秋天的约定',detail:'故事已提交',delta:0,createdAt:'2026-10-26T08:00:00Z'}]}}});}
  const data=path.endsWith('/student/reports/current')?null:path.endsWith('/student/comprehensive-score')?{status:'INCOMPLETE',missing_dimensions:['D','Z']}:path.endsWith('/me')?{id:42,role:'student'}:path.endsWith('/terms/current')?{id:1,name:'2026 学年第一学期',start_date:'2026-09-01',end_date:'2027-01-31'}:[];
  await route.fulfill({json:{code:200,data}});
 });
 try {
 await page.goto('http://127.0.0.1:5173/#/dashboard');
 await page.getByRole('heading',{name:/每一份努力/ }).waitFor({timeout:10000});
 assert.equal(await page.locator('.app-shell').count(),0,'学生不应嵌在管理工作台');
 const originalUrl=page.url();await page.locator('.student-skip').focus();await page.locator('.student-skip').click();assert.equal(page.url(),originalUrl,'跳过导航不应改变HashRouter路由');assert.equal(await page.evaluate(()=>document.activeElement.id),'student-main');
 await page.locator('nav a[href="#/student/ledger"]').click();
 await page.waitForURL('**/#/student/ledger');
 assert.equal(await page.getByRole('navigation',{name:'学生导航'}).count(),1);
 points=35;await page.locator('nav a[href="#/dashboard"]').click();
 await page.waitForFunction(()=>document.querySelector('.points-number')?.textContent.includes('35'));
 await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.growth-home')).opacity)===1);await page.mouse.move(1430,0);
 await page.screenshot({path:'/tmp/student-forest-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'晴空海蓝'}).click();
 await page.waitForFunction(()=>document.querySelector('.student-layout.theme-ocean'));
 await page.reload();await page.waitForSelector('.theme-ocean');
 failTheme=true;await page.getByRole('button',{name:'落日暖橙'}).click();
 await page.getByText('主题保存失败，请重试').waitFor();assert.equal(await page.locator('.theme-ocean').count(),1);
 await page.waitForTimeout(3200);
 await page.screenshot({path:'/tmp/student-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/student-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'手机不应横向溢出');
 for(const [name,path] of [['扫卡领取','claim'],['成长足迹','ledger'],['我的荣誉','honors'],['生活故事','stories'],['六育评价','evaluation'],['学期报告','report']]) { await page.locator('nav a[href="#/student/'+path+'"]').click(); await page.waitForURL('**/#/student/'+path);await page.waitForTimeout(450);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+'手机横向溢出'); }
 await page.locator('nav a[href="#/dashboard"]').click();empty=true;published=true;await page.reload();await page.getByText('第一片叶子，等你来点亮').waitFor();await page.getByText('学期报告已发布 · V2').waitFor();
 failGrowth=true;await page.reload();await page.getByRole('button',{name:'重新加载'}).click();
 await page.getByText('成长记录暂时没有加载成功').waitFor();
 assert.equal(await page.locator('.growth-points').count(),0,'加载失败不显示虚假的零积分');
 failGrowth=false;await page.goto('http://127.0.0.1:5173/#/student/claim');await page.getByPlaceholder('扫描二维码后自动读取，也可粘贴扫码链接').fill('ui-test-card');await page.getByRole('button',{name:'读取卡片'}).click();await page.getByText('友爱互助',{exact:true}).waitFor();await page.getByRole('button',{name:'确认领取，立即入账'}).click();await page.getByText('领取成功，成长积分 +1',{exact:true}).waitFor();assert.equal(await page.getByText('申领已提交，等待教师审核',{exact:true}).count(),0);
 replay=true;await page.getByRole('button',{name:'取消本次领取 / 清空卡片'}).click();await page.getByPlaceholder('扫描二维码后自动读取，也可粘贴扫码链接').fill('ui-replay');await page.getByRole('button',{name:'读取卡片'}).click();await page.getByRole('button',{name:'确认领取，立即入账'}).click();await page.getByText('这张卡已领取，本次没有重复加分',{exact:true}).waitFor();
 replay=false;legacy=true;await page.getByRole('button',{name:'取消本次领取 / 清空卡片'}).click();await page.getByPlaceholder('扫描二维码后自动读取，也可粘贴扫码链接').fill('legacy-card');await page.getByRole('button',{name:'读取卡片'}).click();await page.getByRole('button',{name:/提交旧卡，等待教师审核|确认申领，提交教师审核/}).click();await page.getByText(/^(旧卡)?申领已提交，等待教师审核$/).waitFor();
 const teacher = await browser.newPage();
 teacher.on('pageerror',e=>errors.push(e.message));
 await teacher.addInitScript(()=>{localStorage.setItem('AUTH_TOKEN','teacher-ui-test');localStorage.setItem('APP_USER',JSON.stringify({id:9,role:'teacher',real_name:'陈老师'}));});
 await teacher.route('**/api/**',r=>r.fulfill({json:{code:200,data:new URL(r.request().url()).pathname.endsWith('/me')?{id:9,role:'teacher'}:[]}}));
 await teacher.goto('http://127.0.0.1:5173/#/dashboard');await teacher.locator('.app-shell').waitFor();assert.equal(await teacher.locator('.student-layout').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS student shell; all 7 routes; return-home refresh; themes persist/rollback; mobile overflow; empty/published/error states. API fixtures only.');
 } catch(e) { console.error('UI STATE',await page.locator('body').innerText(),errors);await page.screenshot({path:'/tmp/student-debug.png',fullPage:true});throw e; } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
