// Persistent, idempotent fixtures for the local award-review design exercise.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parse, addSource, withMutation } = require('../services/reportCoreStore');
const { stableHash } = require('../services/reportCorePolicy');
const { honorLevel, isV2 } = require('../services/reportCoreV2Policy');
const { normalizeAwardFacts } = require('../services/reportCoreAwardFacts');
const { savePrivateFile, removePrivateFile } = require('../utils/privateFiles');
const fixture = 'award-review-design-v1';
const output = path.resolve(__dirname, '../../output/report-core/award-simulation');
const catalogue = [
  ['校园阅读之星', '云美小学阅读活动中心（模拟）', 'CHINESE', '区级', '阅读之星'],
  ['数学思维挑战赛', '云美小学数学教研组（模拟）', 'MATH', '区级', '一等奖'],
  ['青少年科技创新作品展示活动', '模拟市青少年科技活动中心', 'SCIENCE', '市级', '二等奖'],
  ['小学生现场书画比赛', '模拟区艺术教育活动组', 'FINE_ART', '区级', '一等奖'],
  ['校园运动会一分钟跳绳比赛', '云美小学体育组（模拟）', 'PE', '区级', '第一名'],
  ['青少年合唱艺术展演', '模拟省青少年艺术活动组', 'MUSIC', '省级', '优秀表演奖'],
  ['校园劳动实践小能手', '云美小学劳动教育中心（模拟）', 'LABOR', '区级', '劳动小能手'],
  ['全国青少年创意编程作品交流活动', '全国青少年创意活动组（模拟）', 'INFORMATION_TECHNOLOGY', '省级', '优秀作品奖'],
];
function planAwards(students) {
  const base = students.filter(s => Number(s.class_no_snapshot) === 1);
  const simulated = students.filter(s => Number(s.class_no_snapshot) === 99);
  const studentIndexes = [0,0,0,1,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,24,27,28,29];
  const selected = [...[0,1,0,1].map(i => base[i % base.length]), ...studentIndexes.map(i => simulated[i])];
  if (selected.some(s => !s)) throw Error('需要四年级1班2名演示学生，以及99班30名模拟学生');
  return selected.map((student, index) => {
    const j = index - 4;
    const status = index < 4 ? ['SUBMITTED','APPROVED','SUBMITTED','FAILED'][index] : j < 5 ? 'APPROVED' : j < 7 ? 'FAILED' : j < 9 ? 'REJECTED' : j < 11 ? 'REVOKED' : 'SUBMITTED';
    const [title,issuer,subjectCode,awardLevel,prizeLevel] = catalogue[index % catalogue.length];
    const date = `2026-10-${String(5 + index % 25).padStart(2,'0')}`;
    const originalFacts = {title,issuer,subjectCode,awardLevel,prizeLevel,date,studentName:student.student_name_snapshot,certificateNo:`SIM-AWARD-2026-${String(index+1).padStart(3,'0')}`};
    if (index === 29) {
      originalFacts.title = '2026年青少年“发现身边的科学之美”跨学科项目化学习暨城市生态观察与低碳校园创意设计优秀成果展示活动';
      originalFacts.issuer = '模拟市青少年综合实践教育中心与校园科学艺术劳动跨学科教育联合活动组';
    }
    const facts = normalizeAwardFacts(originalFacts);
    const scenarios = [];
    if (status === 'FAILED') { facts.awardRegion=''; facts.subjectCode=''; scenarios.push('识别失败、待补荣誉地域和学科'); }
    if (index === 28) { facts.awardLevel=''; scenarios.push('荣誉级别待核对'); }
    if (index === 29) scenarios.push('超长奖项和颁发单位');
    if (index === 30) scenarios.push('姓名含HTML符号');
    if (index === 31) scenarios.push('64字姓名');
    if ([4,5,6].includes(index)) scenarios.push('同一学生多项获奖');
    const pdf = index % 7 === 0;
    return {index,studentId:String(student.student_id),classNo:student.class_no_snapshot,status,facts,originalFacts,
      format:pdf?'pdf':'png',landscape:index % 3 !== 1,pages:index === 14?2:1,scenario:scenarios.join('；') || '常规奖状'};
  });
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function certificateHtml(item) {
  const f=item.originalFacts, color=['#925b31','#326c63','#536894'][item.index%3];
  const nameSize=f.studentName.length>25?18:f.studentName.length>8?25:36;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#fffaf0;color:#59432b;font-family:'Songti SC','STSong',serif}.paper{width:${item.landscape?1120:794}px;height:${item.landscape?794:1120}px;padding:46px;position:relative;background:radial-gradient(ellipse at 30% 15%,#fffef9,#faf0d7);page-break-after:always}.frame{height:100%;border:3px solid ${color};outline:1px solid ${color};outline-offset:9px;padding:32px 42px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}.flag{position:absolute;top:25px;left:24px;font:13px 'PingFang SC',sans-serif;letter-spacing:3px;color:#8f836d}.seal{position:absolute;bottom:42px;right:48px;border:3px double #be8073;border-radius:50%;width:100px;height:100px;display:grid;place-content:center;text-align:center;color:#b5786a;font:14px 'Songti SC',serif;transform:rotate(-13deg);opacity:.65}.watermark{position:absolute;top:41%;left:8%;font:bold 80px 'PingFang SC';letter-spacing:12px;transform:rotate(-22deg);color:#a1844920;pointer-events:none}.emblem{text-align:center;color:${color};font-size:30px;margin:0 0 13px;letter-spacing:12px}h1{text-align:center;color:${color};font-size:62px;letter-spacing:16px;font-weight:500;margin:0 0 25px}.name{font-size:${nameSize}px;font-weight:500;line-height:1.8;overflow-wrap:anywhere;margin:0 0 12px}.copy{font-size:${f.title.length>40?21:25}px;line-height:1.9;margin:0;text-indent:2em}.prize{color:${color};font-size:40px;text-align:center;letter-spacing:7px;margin:20px 0}.issuer{text-align:right;line-height:1.8;font-size:${f.issuer.length>25?16:19}px;margin-top:25px;padding-right:15px}.note{font:11px 'PingFang SC';color:#998e7d;letter-spacing:1px;text-align:center;margin:25px 0 0}.number{font:11px 'PingFang SC';color:#9a8d78;position:absolute;bottom:14px;left:22px}.extra{font:20px/2 'Songti SC';padding:70px}.extra h2{font-size:32px;color:${color};font-weight:500}.extra dl{display:grid;grid-template-columns:140px 1fr;gap:20px}.extra dt{color:#958265}.extra dd{margin:0}.extra .notice{padding:22px;background:#f5edda;margin-top:40px;font-size:16px}
  @page{size:${item.landscape?'1120px 794px':'794px 1120px'};margin:0}</style><section class="paper"><div class="frame"><div class="flag">云美少年 · 荣誉记录</div><div class="watermark">模拟样本</div><p class="emblem">✦  ${escape(f.awardLevel)}荣誉  ✦</p><h1>荣誉证书</h1><p class="name">${escape(f.studentName)} 同学：</p><p class="copy">在“${escape(f.title)}”活动中，表现出色，荣获</p><p class="prize">${escape(f.prizeLevel)}</p><p class="copy">特发此证，以资鼓励。</p><div class="issuer">${escape(f.issuer)}<br>${escape(f.date.replaceAll('-',' / '))}</div><div class="seal">模拟样本<br>版面评估专用</div><div class="number">${escape(f.certificateNo)}</div><p class="note">此为虚构的界面演示材料，不代表真实获奖或真实颁发机构</p></div></section>${item.pages===2?`<section class="paper extra"><h2>获奖信息附件 · 模拟样本</h2><dl><dt>学生姓名</dt><dd>${escape(f.studentName)}</dd><dt>活动名称</dt><dd>${escape(f.title)}</dd><dt>荣誉级别</dt><dd>${escape(f.awardLevel)}</dd><dt>所获奖项</dt><dd>${escape(f.prizeLevel)}</dd><dt>证书编号</dt><dd>${escape(f.certificateNo)}</dd></dl><p class="notice">第二页用于检查多页 PDF 在奖状详情中的显示与翻页。本附件仅供产品界面分析。</p></section>`:''}</html>`;
}
async function makeAssets(plan) {
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  await fs.mkdir(path.join(output,'certificates'),{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'chrome'}), assets=[];
  try {
    const page=await browser.newPage();
    for(const item of plan) {
      await page.setViewportSize({width:item.landscape?1120:794,height:item.landscape?794:1120});
      await page.setContent(certificateHtml(item));
      await page.evaluate(()=>document.fonts.ready);
      const basename=`award-${String(item.index+1).padStart(2,'0')}`, filename=path.join(output,'certificates',`${basename}.${item.format}`);
      if(item.format==='pdf') {
        await page.pdf({path:filename,printBackground:true,preferCSSPageSize:true});
        await page.locator('.paper').first().screenshot({path:path.join(output,'certificates',`${basename}-preview.png`)});
      } else await page.locator('.paper').first().screenshot({path:filename});
      const buffer=await fs.readFile(filename);
      const saved=await savePrivateFile({buffer,mimetype:item.format==='pdf'?'application/pdf':'image/png'},{maxBytes:10*1024*1024,allowPdf:true});
      assets.push({item,filename,saved});
    }
    return assets;
  } catch(error) { for(const asset of assets) await removePrivateFile(asset.saved.fileRef); throw error; }
  finally { await browser.close(); }
}
async function seedAwardReviewFixtures({pool,schoolId='1',termId='1',teacherId='2',mode='check'}) {
  if(!['check','apply'].includes(mode)) throw Error('仅支持 check 或 apply');
  const [[teacher]]=await pool.query("SELECT id,school_id,username,real_name,token_version FROM users WHERE id=? AND school_id=? AND role='teacher'",[teacherId,schoolId]);
  if(!teacher || teacher.username!=='teacher' || !/^(演示|测试|teacher$)/.test(teacher.real_name)) throw Error('仅支持明确标记的本地演示教师');
  const [[term]]=await pool.query('SELECT * FROM academic_year WHERE school_id=? AND id=?',[schoolId,termId]);
  if(!term || !isV2(parse(term.evaluation_config)) || term.release_status!=='IDLE' || Number(term.active_release_version) || term.business_phase!=='COLLECTING') throw Error('仅可对未发布、采集期的 V2 演示学期添加样本');
  const [students]=await pool.query('SELECT e.student_id,e.student_name_snapshot,e.class_no_snapshot,e.section_meta,u.username FROM student_term_evaluation e JOIN users u ON u.id=e.student_id AND u.school_id=e.school_id WHERE e.school_id=? AND e.term_id=? AND e.grade_snapshot=4 AND e.class_no_snapshot IN (1,99) ORDER BY e.class_no_snapshot,e.student_id',[schoolId,termId]);
  if(students.some(s=>!['student','student2'].includes(s.username) && parse(s.section_meta).uiFixture?.synthetic!==true)) throw Error('目标班级包含未标记的真实学生，停止添加');
  const [teaching]=await pool.query('SELECT class_no,is_head_teacher FROM teacher_teaching_assignment WHERE school_id=? AND term_id=? AND teacher_id=? AND grade=4 AND class_no IN (1,99) AND enabled=1',[schoolId,termId,teacherId]);
  if([1,99].some(n=>!teaching.some(t=>t.class_no===n && Number(t.is_head_teacher)===1))) throw Error('演示教师须为目标班级班主任');
  const [existing]=await pool.query("SELECT id,status,student_id,business_key,payload_json FROM evaluation_source_record WHERE school_id=? AND term_id=? AND source_type='CERTIFICATE' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.uiFixture.key'))=?",[schoolId,termId,fixture]);
  const plan=planAwards(students),summary={fixture,mode,planned:plan.length,existing:existing.length,classes:{'4:1':4,'4:99':28},statusCounts:(existing.length?existing:plan).reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),formats:plan.reduce((a,r)=>(a[r.format]=(a[r.format]||0)+1,a),{})};
  if(mode==='check') return {...summary,created:0,note:existing.length?'保留现有样本及其审批状态，不重复插入':'可应用模拟数据'};
  if(existing.length===plan.length) {
    const old=existing.filter(row=>parse(row.payload_json).uiFixture?.fieldsVersion!==2);
    if(!old.length) return {...summary,created:0,adapted:0,note:'保留现有样本及其审批状态，不重复插入'};
    const actor={id:String(teacher.id),schoolId:String(teacher.school_id),role:'teacher',tokenVersion:teacher.token_version};
    await withMutation({pool,actor,termId,studentIds:[...new Set(old.map(r=>String(r.student_id)))],action:'award-review-fixture-fields',command:{requestKey:`${fixture}-fields-${crypto.randomUUID()}`,payloadHash:stableHash(old.map(r=>r.id))}},async c=>{
      for(const row of old) {
        const item=plan.find(item=>stableHash([fixture,schoolId,termId,item.index])===row.business_key);
        if(!item) throw Error('无法对应模拟奖状，不修改未知记录');
        const previous=parse(row.payload_json),facts=normalizeAwardFacts(previous.facts);
        if(!['省级','市级','区级'].includes(facts.awardRegion)) facts.awardRegion=item.facts.awardRegion;
        const honor=row.status==='APPROVED'?{name:facts.title,region:facts.awardRegion,level:facts.awardLevel,subjectCode:facts.subjectCode,points:honorLevel(facts.awardRegion).points}:undefined;
        await c.query('UPDATE evaluation_source_record SET payload_json=?,numeric_value=?,revision=revision+1 WHERE id=?',[JSON.stringify({...previous,facts,...(honor?{honor}:{}),uiFixture:{...previous.uiFixture,fieldsVersion:2}}),honor?.points??null,row.id]);
      }
      return {result:{adapted:old.length},changedTargetsByStudent:Object.fromEntries([...new Set(old.map(r=>String(r.student_id)))].map(id=>[id,['honor_summary']]))};
    });
    return {...summary,created:0,adapted:old.length,note:'已将模拟记录适配为四项荣誉信息与选填备注，保留审批状态'};
  }
  if(existing.length) throw Error('存在不完整样本集合，请先核对，不自动覆盖');
  const assets=await makeAssets(plan),actor={id:String(teacher.id),schoolId:String(teacher.school_id),role:'teacher',tokenVersion:teacher.token_version};
  let committed=false;
  try {
    const result=await withMutation({pool,actor,termId,studentIds:[...new Set(plan.map(r=>r.studentId))],action:'award-review-fixture-seed',command:{requestKey:`${fixture}-${crypto.randomUUID()}`,payloadHash:stableHash(plan)}},async(c)=>{
      const [[duplicate]]=await c.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE school_id=? AND term_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.uiFixture.key'))=?",[schoolId,termId,fixture]);
      if(Number(duplicate.n)) throw Error('其他进程已创建样本，请重新检查');
      const records=[];
      for(const {item,saved,filename} of assets) {
        const honor=item.status==='APPROVED'?{name:item.facts.title,region:item.facts.awardRegion,level:item.facts.awardLevel,subjectCode:item.facts.subjectCode,points:honorLevel(item.facts.awardRegion).points}:null;
        const id=await addSource(c,{schoolId,termId,studentId:item.studentId,actorId:item.studentId,sourceType:'CERTIFICATE',kind:'ITEM',schemaVersion:'SIX_EDU_V2',status:item.status,submittedAt:new Date(`${item.originalFacts.date}T08:30:00Z`),effectiveAt:honor?new Date():null,numericValue:honor?.points,effectKey:honor?stableHash([fixture,schoolId,termId,item.index]):null,key:[fixture,schoolId,termId,item.index],payload:{...saved,facts:item.facts,...(honor?{honor,reviewerId:teacherId,reviewReason:'演示教师已核对模拟样本'}:{}),...(item.status==='REJECTED'?{reviewReason:'模拟情形：证书日期不在当前认定范围'}:{}),...(item.status==='REVOKED'?{revokeReason:'模拟情形：学生发现重复上传后撤回'}:{}),recognitionMethod:'MODEL',uiFixture:{key:fixture,synthetic:true,fieldsVersion:2,scenario:item.scenario}}});
        records.push({id,...item,file:filename});
      }
      return {result:{records},changedTargetsByStudent:Object.fromEntries([...new Set(plan.map(r=>r.studentId))].map(id=>[id,['honor_summary']]))};
    });
    committed=true;
    await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({...summary,created:plan.length,records:result.result.records},null,2));
    return {...summary,created:plan.length,manifest:path.join(output,'manifest.json')};
  } finally { if(!committed) for(const asset of assets) await removePrivateFile(asset.saved.fileRef); }
}
if(require.main===module) {
  const pool=require('../db').createDbPool();
  seedAwardReviewFixtures({pool,schoolId:process.env.SCHOOL_ID||'1',termId:process.env.TERM_ID||'1',teacherId:process.env.TEACHER_ID||'2',mode:process.argv.includes('--apply')?'apply':'check'}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
}
module.exports={seedAwardReviewFixtures,planAwards,certificateHtml};
