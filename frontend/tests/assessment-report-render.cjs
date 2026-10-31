const assert=require('node:assert/strict');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const catalog=require('../../backend/config/reportCoreV2Policy.json');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({configFile:false,root:require('node:path').resolve(__dirname,'..'),server:{middlewareMode:true,hmr:{server:require('node:http').createServer()}},appType:'custom'});
 try{
  const Report=(await server.ssrLoadModule('/src/component/StudentAssessmentReport/index.jsx')).default;
  const record={student:{name:'模板验收学生'},values:{story_summary:{WRITE:{value:0,rank:1}}},uploadedFields:[],errors:[],narratives:{teacher_comment:'保持好奇心'}};
  const full=renderToStaticMarkup(React.createElement(Report,{catalog,record}));
  for(const f of catalog.fields)assert.equal(full.split(`data-view="${f.viewCode}"`).length-1,1,`${f.viewCode} must appear exactly once`);
  assert.ok(full.includes('故事美'));assert.ok(full.includes('成长自述与寄语'));assert.ok(full.includes('保持好奇心'));
  const upload=renderToStaticMarkup(React.createElement(Report,{catalog,record,sections:['conduct','wisdom','health','art','labor'],showNarratives:false}));
  assert.equal((upload.match(/data-view=/g)||[]).length,85);assert.ok(!upload.includes('故事美'));assert.ok(!upload.includes('成长自述与寄语'));assert.ok(!upload.includes('保持好奇心'));
  const currentCatalog=require('../../backend/config/reportCorePolicy.json');
  const current=renderToStaticMarkup(React.createElement(Report,{catalog:currentCatalog,record,sections:['conduct','wisdom','health','art','labor'],showNarratives:false}));
  for(const f of currentCatalog.fields.filter(f=>f.section!=='story'))assert.equal(current.split(`data-view="${f.viewCode}"`).length-1,1,`${f.viewCode} current-term field must appear once`);
  assert.equal((current.match(/data-view=/g)||[]).length,100);assert.ok(!current.includes('故事美'));assert.ok(!current.includes('成长自述与寄语'));
  if(process.argv.includes('--qa')){
   const fs=require('node:fs/promises'),path=require('node:path');
   const sample=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../output/report-core/assessment-upload/http-evidence.json'),'utf8')).record;
   const markup=renderToStaticMarkup(React.createElement(Report,{catalog,record:sample,term:{term_name:'2026 上学期'},sections:['conduct','wisdom','health','art','labor'],showNarratives:false,sequence:1}));
   const css=await fs.readFile(path.resolve(__dirname,'../src/component/StudentAssessmentReport/style.css'),'utf8');
   await fs.writeFile(path.resolve(__dirname,'assessment-report-qa.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>教师报表组件 · 合成数据验收</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f5ef;font:14px/1.6 'PingFang SC','Microsoft YaHei',sans-serif;padding:20px}main{max-width:1440px;margin:auto}.qa-note{font-size:11px;color:#6f7e64;margin:0 0 15px}@media(max-width:800px){body{padding:12px}}${css}</style><main><p class="qa-note">综合成绩 · 教师上传报表 · 合成数据验收</p>${markup}</main></html>`);
  }
  console.log('REPORT_RENDER_PASS: full template has every one of 94 fields once; teacher upload has 85 fields and excludes story/narratives.');
 }finally{await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
