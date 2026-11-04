const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createV2TestDb} = require('../../backend/__tests__/helpers/reportCoreV2Db');

test('teacher class-first comments: automatic report-based drafts, persistence, edited and batch approvals, mobile', {timeout:120000}, async t => {
  const cleanups=[], db=await createV2TestDb({after:fn=>cleanups.push(fn)});
  const root=path.resolve(__dirname,'../..'), apiPort=19425, webPort=19426;
  let server,vite,browser,generated=0;
  t.after(async()=>{
    await browser?.close();
    if (vite && vite.exitCode === null) {const exited=once(vite,'exit');vite.kill();await exited;}
    if(server) await new Promise(resolve=>server.close(resolve));
    for(const cleanup of cleanups.reverse()) await cleanup();
  });
  const names=['林沐阳','陈知夏','周予安','许星禾','沈书言','陆可心','顾明远','苏念初'];
  for(let i=0;i<names.length;i++) {
    const id=String(i+3);
    if(i>1) {
      await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no) SELECT ?,1,?,password,?,'student',4,1 FROM users WHERE id=3",[id,'comment-student-'+id,names[i]]);
      await db.pool.query("INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(1,1,?,?,4,1,'CORE_V2','V2_1')",[id,names[i]]);
    } else await db.pool.query('UPDATE student_term_evaluation SET student_name_snapshot=? WHERE student_id=?',[names[i],id]);
  }
  await db.pool.query("UPDATE student_term_evaluation SET math_overall_grade='A',chinese_overall_grade='B',music_overall_grade='A',labor_literacy_grade='A'");
  const provider={generateTermComment:async({report})=>{
    generated++;
    assert.equal(report.values.math_overall_grade,'A');
    if(report.student.id==='10') require('../../backend/services/core/reportCorePolicy').fail(503, '模型服务暂不可用，请稍后重试');
    return {comment:`${report.student.name}，这一学期，你在数学学习中交出了一份令人欣喜的答卷，在音乐与劳动实践中也展现了自己的光彩。认真投入的每一次尝试，都在悄悄积蓄成长的力量。希望你继续保持对知识的好奇，多读、多问、大胆表达，在语文学习中找到属于自己的节奏。愿你带着这份热爱，走向更加丰盈的新学期。`,model:'fixture'};
  }};
  server=require('../../backend/app').createApp({pool:db.pool,schoolId:'1',provider}).listen(apiPort,'127.0.0.1');
  vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(webPort),'--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_TARGET:`http://127.0.0.1:${apiPort}`},stdio:'ignore'});
  for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${webPort}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${webPort}`);
  await page.getByLabel('账号',{exact:true}).waitFor({timeout:15000}).catch(async e=>{console.error('BOOT',await page.locator('body').innerText(),errors);throw e;});
  await page.getByLabel('账号',{exact:true}).fill('teacher');
  await page.getByLabel('密码',{exact:true}).fill('Test-pass-2026');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.locator('.direct-workbench').waitFor();
  await page.locator('.adult-navigation').getByRole('button',{name:'学期寄语',exact:true}).click();
  await page.getByLabel('寄语班级',{exact:true}).waitFor({timeout:5000}).catch(async e=>{console.error('COMMENTS_BOOT',page.url(),await page.locator('body').innerText(),errors);throw e;});
  assert.equal(await page.locator('.term-student-open').count(),0);
  await page.getByLabel('寄语班级',{exact:true}).selectOption('4:1');
  await page.getByRole('button',{name:'查看林沐阳的学期寄语',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'学期寄语',exact:true});
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="学期寄语"]')?.value.includes('数学学习'));
  assert.equal(generated,1);
  await page.getByText('查看六育报表依据',{exact:true}).click();
  assert.equal(await page.locator('.assessment-report [data-section]').count(),6);
  await page.getByText('查看六育报表依据',{exact:true}).click();
  await editor.fill('你在数学学习中保持专注。愿你继续保持好奇心，让每一次尝试都成为成长的礼物。');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'查看陈知夏的学期寄语',exact:true}).click();
  assert.match(await editor.inputValue(),/每一次尝试/);
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();
  await page.getByRole('status').filter({hasText:'寄语草稿已保存'}).waitFor();
  await page.reload();
  await page.getByLabel('寄语班级',{exact:true}).selectOption('4:1');
  await page.getByRole('button',{name:'查看林沐阳的学期寄语',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="学期寄语"]')?.value.includes('每一次尝试'));
  assert.equal(generated,1);
  await editor.fill('老师审核修改后的寄语：继续保持好奇心。');
  await page.getByRole('button',{name:'审核通过',exact:true}).click();
  await page.getByRole('status').filter({hasText:'寄语已审核通过'}).waitFor();
  assert.equal((await db.pool.query('SELECT teacher_comment FROM student_term_evaluation WHERE student_id=3'))[0][0].teacher_comment,'老师审核修改后的寄语：继续保持好奇心。');
  for(const name of ['陈知夏','周予安']) {
    await page.getByRole('button',{name:`查看${name}的学期寄语`,exact:true}).click();
    await page.waitForFunction(name=>document.querySelector('textarea[aria-label="学期寄语"]')?.value.startsWith(name),name);
    await page.getByLabel(`选择${name}`,{exact:true}).check();
  }
  await page.getByRole('button',{name:'批量审核通过（2）',exact:true}).click();
  await page.getByRole('status').filter({hasText:'已审核通过 2 名学生的寄语'}).waitFor();
  assert.ok((await db.pool.query('SELECT teacher_comment FROM student_term_evaluation WHERE student_id IN (4,5)'))[0].every(r=>r.teacher_comment));
  await page.getByRole('button',{name:'查看苏念初的学期寄语',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'模型服务暂不可用'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'审核通过',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'查看陈知夏的学期寄语',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="学期寄语"]')?.value.startsWith('陈知夏'));
  const output=path.join(root,'output/report-core/comments');await fs.mkdir(output,{recursive:true});
  await page.evaluate(()=>{document.activeElement?.blur();document.querySelector('.term-roster-list').scrollTop=0;window.scrollTo(0,0);});
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  await editor.scrollIntoViewIfNeeded();
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true,animations:'disabled'});
  await editor.fill('重新登录后仍应保留的老师修改。');
  await page.route('**/report-core/v2/comments/save', route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:401,message:'登录已过期'})}),{times:1});
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();
  await page.getByRole('heading',{name:'账号登录',exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog',{name:'重新登录',exact:true}).count(),0);
  assert.equal(await page.locator('textarea[aria-label="学期寄语"]').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('REPORT_CORE_TOKEN')),null);
  assert.deepEqual(errors,[]);
});
