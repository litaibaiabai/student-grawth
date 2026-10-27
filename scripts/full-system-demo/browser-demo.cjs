const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {backendRequire,inspect,root}=require('./environment.cjs');
async function browserDemo({page,context,m,rt,s}){
 const input=n=>path.join(m.out,'inputs',n),story=n=>fs.readFileSync(path.join(m.out,'stories',n),'utf8'),dl=n=>path.join(m.out,'downloads',n);
 const main=()=>page.getByRole('main'),dialog=()=>page.getByRole('dialog');
 const text=async t=>main().getByText(t,{exact:false}).first().waitFor();
 const modalDone=async name=>{if(name==='确 定')await dialog().locator('.ant-modal-footer button.ant-btn-primary').click();else await s.button(name).click();await dialog().waitFor({state:'hidden'});};
 const row=name=>page.getByRole('row').filter({hasText:name});
 const api=ep=>s.readApi('/api/v1'+ep);
 async function download(button,file){const promise=page.waitForEvent('download');await s.button(button).click();const d=await promise;const err=await d.failure();assert.equal(err,null);await d.saveAs(dl(file));assert.ok(fs.statSync(dl(file)).size>0);return dl(file);}
 async function cards(){await s.menu('credit-card 评价卡管理','学科策略与月度发卡');}
 async function importExcel(filename,type,expected){
  const tab=type==='DIMENSION'?'2. 六育主观维度终测评分 (占总评80%)':m.activeRole==='teacher'?'任教学科期末成绩（独立记录）':'1. 文化课与学科期末成绩 (全科大总表)';
  await page.getByRole('tab',{name:tab,exact:true}).click();
  const again=s.button('reload 继续导入其他成绩文件');if(await again.isVisible())await again.click();
  await s.upload('file-excel 选择本地 Excel 文件',input(filename));await s.button(`check-circle 确认写入 ${expected} 条正常成绩`).waitFor();
 }
 async function commitExcel(n){await s.button(`check-circle 确认写入 ${n} 条正常成绩`).click();await text('全校学生成绩批量导入成功！');await s.pause();}
 await s.chapter('01','管理员：校历、指标与评价规则',async()=>{
  await s.login('demo_admin');m.activeRole='manager';
  await s.menu('calendar 学期与校历','学期与校历周期管理');await s.button('编辑校历与审核截止').click();await modalDone('保存修改');
  await s.menu('appstore 六育指标树','六育指标字典');await text('固定');
  await s.menu('experiment 综合评分规则','综合核算与规则引擎');await page.getByPlaceholder('填写一个新的版本名，如 V2026-1（不能与已有版本重名）').fill('DEMO_V1');await s.button('保存并激活为当前规则').click();await text('DEMO_V1 生效中');
 });
 await s.chapter('02','管理员：学科、兼课主学科与自动分配',async()=>{
  await cards();await page.getByRole('tab',{name:'学科发卡策略',exact:true}).click();
  for(const [code,name]of [['CHINESE','语文'],['MATH','数学'],['ART','美术']]){await s.button('plus 新增学科').click();await page.getByPlaceholder('如 CHINESE').fill(code);await page.getByPlaceholder('如 语文').fill(name);await modalDone('确 定');}
  await page.getByRole('tab',{name:'教师学科',exact:true}).click();
  for(const [teacher,subjects,primary]of [['林老师',['语文','数学'],'语文'],['陈老师',['美术'],'美术']]){
   await row(teacher).getByRole('button',{name:'设置学科',exact:true}).click();
   for(const subject of subjects)await s.choose('* 任教学科',subject);
   await page.getByRole('combobox',{name:'* 任教学科',exact:true}).press('Escape');await s.choose('* 主教学科（按此学科领取一份卡）',primary);await modalDone('确 定');
  }
  await page.getByRole('tab',{name:'学科发卡策略',exact:true}).click();
  for(const subject of ['语文','美术']){await row(subject).getByRole('button',{name:'设置策略',exact:true}).click();if(subject==='美术'){await page.getByRole('spinbutton',{name:'* 智育比例',exact:true}).fill('0');await page.getByRole('spinbutton',{name:'* 美育比例',exact:true}).fill('70');}await modalDone('确 定');}
  await page.getByRole('tab',{name:'月度分配与打印',exact:true}).click();
  for(let n=0;n<30;n++){await s.button('reload 刷新分配').click();await s.pause();const a=await api('/card-allocations');if(a.length===2&&a.every(x=>x.generatedCount===100)){assert.equal(a.find(x=>x.teacherId===2).counts.Z,70);assert.equal(a.find(x=>x.teacherId===3).counts.M,70);break}if(n===29)throw Error('自动配卡未就绪');}
 });
 let claimUrl;
 await s.chapter('03','管理员下载真实200张卡片，识别实际二维码',async()=>{
  await s.button('printer 准备打印 PDF').click();await page.getByText('可以下载',{exact:true}).waitFor({timeout:60000});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('下载打印 PDF')&&!b.disabled));
  const file=await download('下载打印 PDF','月度评价卡.pdf');assert.ok(fs.readFileSync(file).subarray(0,5).equals(Buffer.from('%PDF-')));
  const prefix=path.join(m.out,'.private/card-page');execFileSync(rt.renderer,['-f','5','-singlefile','-scale-to','1400','-png',file,prefix],{stdio:'pipe'});
  const {PNG}=backendRequire('pngjs'),jsqr=backendRequire('jsqr'),p=PNG.sync.read(fs.readFileSync(prefix+'.png')),scale=p.width/595.28,x=Math.floor(44*scale)-2,y=Math.floor(130*scale)-2,size=Math.ceil(96*scale)+4,crop=new PNG({width:size,height:size});PNG.bitblt(p,crop,x,y,size,size,0,0);const qr=jsqr(new Uint8ClampedArray(crop.data),size,size);assert.ok(qr,'真实PDF二维码应可识别');claimUrl=qr.data;assert.equal(new URL(claimUrl).origin,m.baseUrl);fs.writeFileSync(dl('真实卡领取链接.txt'),claimUrl+'\n');
 });
 await s.chapter('04','教师查看本人配卡，学生预览取消再申领',async()=>{
  await s.login('demo_teacher_a');await s.menu('credit-card 我的评价卡','我的月度评价卡');await text('100 张');
  await s.login('demo_s01');await page.goto(claimUrl);await s.button('确认申领，提交教师审核').waitFor();await page.waitForLoadState('networkidle');await text('智育');await s.button('取消本次领取 / 清空卡片').click();assert.equal(await s.button('确认申领，提交教师审核').count(),0);
  await page.getByPlaceholder('扫描二维码后自动读取，也可粘贴扫码链接').fill(claimUrl);await page.locator('button:not(.ant-btn-loading)').filter({hasText:/^读取卡片$/}).click();await s.button('确认申领，提交教师审核').click();await text('申领已提交，等待教师审核');
  s.menus.add('demo_s01:qrcode 扫卡领取');await s.menu('book 积分账本','积分账本');assert.equal((await api('/student/scores')).totalPoints,18);
 });
 await s.chapter('05','教师选择两级子类审核，学生积分19',async()=>{
  await s.login('demo_teacher_a');await s.menu('check-circle 扫卡审核','评价卡申领审核');await s.button('选择分类并审核').click();await s.button('审核通过并加1分').click();await page.getByText('请选择一级子类',{exact:true}).waitFor();
  await s.choose('* 一级子类','勤奋好学');await s.choose('* 二级子类','课堂认真专注');await page.getByPlaceholder('记录这次值得鼓励的表现').fill('演示：校园观察研讨中认真记录并倾听');await modalDone('审核通过并加1分');await page.getByRole('tab',{name:'已通过',exact:true}).click();await text('已加1分');
  await s.login('demo_s01');await s.menu('book 积分账本','积分账本');assert.equal((await api('/student/scores')).totalPoints,19);
 });
 await s.chapter('06','日常直评与管理员受控冲销，净分20',async()=>{
  await s.login('demo_teacher_a');await s.menu('form 无卡直评','无卡直评');await page.getByPlaceholder('搜索姓名或学号').fill('周知行');
  await page.getByRole('combobox').nth(2).press('ArrowDown');await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'关爱互助'}).click();
  for(const remark of ['演示日常帮助整理观察资料','演示误评待冲销']){await page.getByRole('checkbox').first().check();await page.getByPlaceholder('记录这次值得肯定的集体表现或课堂事由…').fill(remark);await s.button('确认评价 (1 位学生)').click();await modalDone('确认发分 (+1)');await page.getByRole('button',{name:/确认评价 \(0 位学生\)$/}).waitFor();}
  await s.login('demo_admin');const ledger=await api('/student/scores?studentId=11'),mistake=ledger.records.find(x=>x.remark==='演示误评待冲销');assert.ok(mistake);assert.equal(ledger.totalPoints,21);
  await s.menu('safety-certificate 审计与冲销','审计与受控更正');await s.button('rollback 受控冲销流水录入').click();await dialog().getByRole('spinbutton').fill(String(mistake.id));await dialog().getByRole('textbox').fill('完整自动演示：此条为演示误评，保留原记录并受控冲销。');await modalDone('确认冲销入账');
  await s.login('demo_s01');await s.menu('book 积分账本','积分账本');assert.equal((await api('/student/scores')).totalPoints,20);
 });
 await s.chapter('07','学生申报荣誉V1，教师退回，学生补交V2',async()=>{
  await s.menu('trophy 荣誉申报','荣誉奖项申报与认定');await s.button('plus 申报新荣誉').click();await page.getByPlaceholder('例如：全国青少年信息素养大赛科技创新赛').fill('演示市青少年校园观察创作活动');await s.upload('upload 选择证书图片',input('10_模拟证书_v1.png'));await s.button('upload 重新选择图片').waitFor();await modalDone('确认申报');await text('待审核');
  await s.login('demo_teacher_a');await s.menu('trophy 荣誉审核','荣誉申报审核队列');await s.button('close-circle 驳回').click();await dialog().getByRole('textbox').fill('第一版模拟证书缺少学生姓名与奖项等次，请补齐后重提。');await modalDone('确认驳回并退回学生');
  await s.login('demo_s01');await s.menu('trophy 荣誉申报','荣誉奖项申报与认定');await s.button('edit 补充材料重新提交').click();await s.upload('upload 选择证书图片',input('10_模拟证书_v2.png'));await s.button('upload 重新选择图片').waitFor();await page.getByRole('textbox',{name:'修订原因说明',exact:true}).fill('已补齐姓名、级别和等次，上传第二版模拟证书。');await modalDone('重新提交审阅');await text('V2');
 });
 await s.chapter('08','教师认定荣誉6分，学生查看正式结果',async()=>{
  await s.login('demo_teacher_a');await s.menu('trophy 荣誉审核','荣誉申报审核队列');await s.button('check-circle 核准').click();await modalDone('确认核准通过');
  await s.login('demo_s01');await s.menu('trophy 荣誉申报','荣誉奖项申报与认定');await text('已认定通过');const h=(await api('/honors'))[0];assert.equal(h.status,'APPROVED');assert.equal(Number(h.honor_points),6);assert.equal(Number(h.material_version),2);
 });
 await s.chapter('09','学生故事草稿、修订提交与教师终审88.5',async()=>{
  await s.menu('read 月度故事','月度故事');const month=Number(m.monthKey.slice(5));const monthButton=page.getByRole('button',{name:new RegExp(`^${month} 月`)});if(await monthButton.count())await monthButton.click();
  await page.getByPlaceholder('请输入本月生活故事篇名...').fill('在观察中学会倾听');await page.getByPlaceholder('记录一个真实的场景、你的真实行动和内心的收获感受...').fill(story('01_故事草稿.txt'));await s.button('save 保存草稿').click();await text('规则模拟建议');
  await page.getByPlaceholder('记录一个真实的场景、你的真实行动和内心的收获感受...').fill(story('02_故事修订提交稿.txt'));await s.button('send 提交本月故事').click();await text('已正式提交');
  await s.login('demo_teacher_a');await s.menu('read 故事评阅','学生故事提交列表');await s.button('edit 批阅评分').click();await dialog().getByRole('spinbutton').fill('88.5');await page.getByPlaceholder('给学生的温暖反馈、发展建议或鼓励箴言...').fill(story('03_教师评语.txt'));await modalDone('核定终审分数并锁定归档');
  await s.login('demo_s01');await s.menu('read 月度故事','月度故事');await text('教师终审确认分：88.50');
 });
 await s.chapter('10','教师Excel错误隔离、正确导入与更正',async()=>{
  await s.login('demo_teacher_a');m.activeRole='teacher';await s.menu('cloud-upload 学科成绩导入','学生成绩批量导入中心');assert.equal(Number((await inspect(m,'SELECT COUNT(*) n FROM subject_score'))[0].n),0);await importExcel('04_学科成绩_错误.xlsx','SUBJECT',1);await text('导出 4 条异常名单');await download('download 导出 4 条异常名单 (Excel)','成绩错误名单.xlsx');const XLSX=require(path.join(root,'frontend/node_modules/xlsx'));const workbook=XLSX.readFile(dl('成绩错误名单.xlsx'));assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]).length,4);assert.equal(Number((await inspect(m,'SELECT COUNT(*) n FROM subject_score'))[0].n),0);await commitExcel(1);
  await importExcel('03_学科成绩_正确.xlsx','SUBJECT',8);await commitExcel(8);await importExcel('05_学科成绩_更正.xlsx','SUBJECT',8);await commitExcel(8);assert.equal(Number((await inspect(m,"SELECT raw_score FROM subject_score WHERE student_id=11 AND subject_code='CHINESE'"))[0].raw_score),96);assert.equal(Number((await inspect(m,'SELECT COUNT(*) n FROM subject_score'))[0].n),32);
 });
 await s.chapter('11','管理员缺项发布阻断，补齐后全部发布',async()=>{
  await s.login('demo_admin');m.activeRole='manager';await s.menu('cloud-upload 成绩导入','学生成绩批量导入中心');await importExcel('06_六育终测_缺体育.xlsx','DIMENSION',8);await commitExcel(8);
  await s.menu('send 报告批量发布','期末报告发布中心');await s.button('send 检查并发布所选报告（8 人）').click();await text('成功 6 份，阻断 2 份');await s.shot('11-missing-T');
  await s.menu('cloud-upload 成绩导入','学生成绩批量导入中心');await importExcel('07_六育终测_完整补齐.xlsx','DIMENSION',8);await commitExcel(8);await s.menu('send 报告批量发布','期末报告发布中心');await s.button('send 检查并发布所选报告（8 人）').click();await text('成功 8 份，阻断 0 份');
 });
 await s.chapter('12','管理员审计与复发布，独立核对8人结果',async()=>{
  const expected=fs.readFileSync(input('09_预期核算.csv'),'utf8').trim().split(/\r?\n/).slice(1);const checked=[];
  for(const line of expected){const a=line.split(','),u=m.users.find(u=>u.username===a[0]),x=await api('/student/comprehensive-score?studentId='+u.id);assert.equal(x.comprehensiveScore,Number(a[13]));assert.equal(x.sixAverage,Number(a[10]));checked.push({username:a[0],expected:Number(a[13]),actual:x.comprehensiveScore});}
  fs.writeFileSync(path.join(m.out,'independent-check.json'),JSON.stringify(checked,null,2));await s.menu('check-circle 评价卡审核','评价卡申领审核');await page.getByRole('tab',{name:'已通过',exact:true}).click();await text('已加1分');
  await s.menu('send 报告批量发布','期末报告发布中心');await s.button('send 检查并发布所选报告（8 人）').click();await text('成功 8 份，阻断 0 份');await s.menu('safety-certificate 审计与冲销','审计与受控更正');await text('PUBLISH_REPORT');
 });
 await s.chapter('13','学生90.50正式评价、报告与真实PDF导出',async()=>{
  await s.login('demo_s01');await s.menu('line-chart 综合评价','综合评价');await text('90.5');await text('DEMO_V1');const x=await api('/student/comprehensive-score');assert.equal(x.comprehensiveScore,90.5);assert.equal(x.dimensions.G,88.5);
  await s.menu('file-protect 学期报告','学期发展报告');await text('第 2 版');await text('96.00 分');const popupPromise=context.waitForEvent('page');await s.button('download 在线防伪打印 / 查看报告').click();const print=await popupPromise;await print.waitForLoadState('domcontentloaded');await print.getByText('周知行',{exact:false}).first().waitFor();const html=await print.content();assert.ok(html.includes('90.5')||html.includes('90.50'));fs.writeFileSync(dl('期末报告.html'),html);await print.emulateMedia({media:'print'});await print.pdf({path:dl('期末报告.pdf'),format:'A4',printBackground:true});const printed=execFileSync(rt.extractor,[dl('期末报告.pdf'),'-'],{encoding:'utf8'});assert.ok(printed.includes('周知行'));assert.ok(printed.includes('90.50')||printed.includes('90.5'));await print.screenshot({path:path.join(m.out,'screenshots','13-真实打印报告.png'),fullPage:true});await print.close();await page.bringToFront();assert.equal(s.menus.size,23,`菜单覆盖应为23，实际${s.menus.size}`);
 });
}
module.exports={browserDemo};
