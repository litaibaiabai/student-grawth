const fs=require('fs'),path=require('path');
function createSteps(page,out,speed){
 const results=[],menus=new Set();let role=null;
 fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
 const pause=()=>new Promise(r=>setTimeout(r,2500/speed));
 async function shot(id){await page.screenshot({path:path.join(out,'screenshots',id+'.png'),fullPage:true});}
 async function chapter(id,title,action){console.log(`\n[${id}] ${title}`);const item={id,title,startedAt:new Date().toISOString(),status:'RUNNING'};results.push(item);try{await action();await pause();await shot(id+'-PASS');item.status='PASS';item.completedAt=new Date().toISOString();console.log(`  ✓ ${title}`)}catch(error){item.status='FAIL';item.error=String(error.message).replace(/(token[=:]\s*)[^\s&]+/gi,'$1[redacted]');await shot(id+'-FAIL').catch(()=>{});try{const snap=await page.locator('body').ariaSnapshot();fs.writeFileSync(path.join(out,'screenshots',id+'-FAIL.txt'),snap)}catch{};throw error}finally{fs.writeFileSync(path.join(out,'steps.json'),JSON.stringify(results,null,2));}}
 const button=name=>page.getByRole('button',{name:name==='确 定'?/^确\s*定$/:name,exact:true});
 async function menu(name,heading){await button(name).click();if(heading)await page.getByRole('main').getByText(heading,{exact:false}).first().waitFor();menus.add(role+':'+name);}
 async function login(username){
  if(role===username)return;
  const logout=button('logout');if(await logout.count()){await logout.click();await button('退出登录').click();await page.getByPlaceholder('请输入学号或教师工号').waitFor();}
  await page.getByPlaceholder('请输入学号或教师工号').fill(username);await page.getByPlaceholder('请输入登录密码').fill('Demo123456');await button('进入系统 arrow-right').click();await button('logout').waitFor();role=username;menus.add(role+':dashboard');
 }
 async function choose(label,text){
  const expanded=page.locator('[role=combobox][aria-expanded=true]');if(await expanded.count())await expanded.first().press('Escape');
  await page.locator('.ant-select-dropdown:visible').first().waitFor({state:'hidden'});
  const input=page.getByRole('combobox',{name:label,exact:true});await input.press('ArrowDown');
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:text}).first().click();
 }

 async function upload(name,file){const p=page.waitForEvent('filechooser');await button(name).click();await(await p).setFiles(file);}
 async function readApi(url){const token=await page.evaluate(()=>localStorage.getItem('AUTH_TOKEN'));const r=await page.request.get(url,{headers:{Authorization:'Bearer '+token}});if(!r.ok())throw Error(`只读核对失败 ${url.split('?')[0]} ${r.status()}`);return(await r.json()).data;}
 return {results,menus,chapter,button,menu,login,choose,upload,readApi,pause,shot};
}
module.exports={createSteps};
