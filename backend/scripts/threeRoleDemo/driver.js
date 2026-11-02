const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function createDemoDriver(page,{outputDir,stepDelay=1200}={}){
 const button=(name,scope=page)=>scope.getByRole('button',{name,exact:true});
 async function click(locator){await locator.waitFor({state:'visible'});await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();if(!box)throw Error('操作目标不可见');await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:12});await sleep(100);await locator.click();await sleep(180);}
 async function fill(label,value){const field=page.getByLabel(label,{exact:true});await click(field);await field.fill(String(value));}
 async function waitText(locator,expected,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const text=await locator.innerText().catch(()=> '');if(typeof expected==='string'?text.includes(expected):expected.test(text))return text;await sleep(250);}throw Error('未观察到预期结果：'+expected);}
 async function upload(buttonName,file){const waiting=page.waitForEvent('filechooser');await click(button(buttonName));await(await waiting).setFiles(file);}
 async function download(locator,name){const waiting=page.waitForEvent('download');await click(locator);const file=await waiting;await file.saveAs(path.join(outputDir,name));}
 async function selectTerm(termId){const student=page.locator('.student-account summary');if(await student.isVisible()&&!await page.getByRole('combobox',{name:'当前学期',exact:true}).isVisible())await click(student);const selector=page.getByRole('combobox',{name:'当前学期',exact:true});await selector.waitFor({state:'visible'});await selector.selectOption(String(termId));if(await student.isVisible()){const menu=page.locator('.student-account');if(await menu.getAttribute('open')!==null)await click(student);}await sleep(200);}
 async function signIn(account){
  const logout=button('退出登录');if(!await logout.isVisible()&&await page.locator('.student-account summary').isVisible())await click(page.locator('.student-account summary'));
  if(await logout.isVisible()){await click(logout);await button('登录').waitFor({state:'visible'});}
  await fill('账号',account.username);await fill('密码',account.password);await click(button('登录'));await page.getByRole('navigation',{name:'核心业务导航'}).waitFor({state:'visible'});
 }
 async function present(step){
  await page.evaluate(({role,title,expected})=>{let el=document.getElementById('three-role-demo-caption');if(!el){el=document.createElement('aside');el.id='three-role-demo-caption';Object.assign(el.style,{position:'fixed',top:'0',left:'0',right:'0',zIndex:'2147483646',padding:'12px 24px',background:'#183f35',color:'white',font:'15px sans-serif',pointerEvents:'none',boxShadow:'0 2px 12px #0003'});document.body.append(el);document.body.style.paddingTop='70px';}el.replaceChildren();const strong=document.createElement('strong');strong.textContent=role+' · '+title;const detail=document.createElement('div');detail.textContent='预期：'+expected;detail.style.cssText='font-size:12px;opacity:.85;margin-top:5px';el.append(strong,detail);},{role:step.role,title:step.title,expected:step.expected});
 }
 async function installPointer(){await page.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const cursor=document.createElement('div');cursor.id='three-role-demo-pointer';cursor.style.cssText='position:fixed;width:20px;height:20px;border:3px solid #ed8e3b;border-radius:50%;box-shadow:0 0 0 5px #ed8e3b33;pointer-events:none;z-index:2147483647;left:-50px;top:-50px;transition:width .08s,height .08s';document.body.append(cursor);document.addEventListener('mousemove',event=>{cursor.style.left=event.clientX-10+'px';cursor.style.top=event.clientY-10+'px';});document.addEventListener('mousedown',()=>{cursor.style.background='#ed8e3b88';});document.addEventListener('mouseup',()=>{cursor.style.background='transparent';});});});}
 async function capture(id){await fs.mkdir(path.join(outputDir,'screenshots'),{recursive:true,mode:0o700});await page.screenshot({path:path.join(outputDir,'screenshots',id+'.png'),fullPage:false});}
 async function settle(){await click(button('六域综合情况'));await click(button('采集结算'));await page.getByRole('combobox',{name:'结算班级',exact:true}).waitFor({state:'visible'});await click(button('确认结算'));await waitText(page.getByRole('status').filter({hasText:'采集结算已完成'}),'采集结算已完成');}
 async function openHeadReport(){await click(button('六域综合情况'));await click(button('4年级1班'));await click(button('查看林小禾的六育报表'));await button('打印').waitFor({state:'visible'});}
 async function studentReport(){await click(button('六育报告'));await button('打印').waitFor({state:'visible'});const frame=page.frameLocator('iframe');await frame.getByRole('heading',{name:'学生综合素质发展报告单',exact:true}).waitFor({state:'visible'});return frame;}
 return{page,button,click,fill,waitText,upload,download,selectTerm,signIn,present,installPointer,capture,settle,openHeadReport,studentReport,sleep,assert,stepDelay};
}
module.exports={createDemoDriver};
