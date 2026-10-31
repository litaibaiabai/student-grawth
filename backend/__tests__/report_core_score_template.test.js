const {test}=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {buildScoreTemplate,parseV2Workbook}=require('../services/reportCoreV2Imports');
const {createV2Config,policyFor}=require('../services/reportCoreV2Policy');
const health=['height_cm','weight_kg','vision_left','vision_right','jump_rope_1min'];

for(const [label,config] of [['current',{}],['v2',createV2Config()]]){
 test(`${label} downloadable template includes every supported score field and a parser-compatible example`,()=>{
  const buffer=buildScoreTemplate({termId:'17',config});
  const wb=XLSX.read(buffer,{type:'buffer',cellFormula:true,cellStyles:true});
  assert.deepEqual(wb.SheetNames,['成绩']);
  const sheet=wb.Sheets.成绩,data=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false});
  const fields=policyFor(config).fields.filter(f=>f.sourceType==='IMPORT'&&(label==='v2'||!health.includes(f.column)));
  assert.deepEqual(data[0].slice(8),fields.map(f=>f.column));
  assert.equal(new Set(data[0]).size,data[0].length);
  assert.equal(data.length,9);assert.match(data[1][2],/示例/);assert.match(sheet.C2.c[0].t,/替换|删除/);
  for(const row of data.slice(1))assert.deepEqual(data[0].filter((_,i)=>row[i]===undefined||String(row[i]).trim()===''),[],'Every student and score column must contain a concrete value');
  const parsed=parseV2Workbook(buffer,{termId:'17',config});
  assert.equal(parsed.length,8);assert.ok(parsed.every(row=>Object.keys(row.values).length===fields.length));
  assert.equal(new Set(parsed.map(row=>row.username)).size,8);
  assert.equal(new Set(parsed.map(row=>row.real_name)).size,8);
  const gradeColumn=fields.find(f=>f.valueType==='grade').column,starColumn=fields.find(f=>f.valueType==='star').column;
  assert.ok(new Set(parsed.map(row=>row.values[gradeColumn])).size>1);
  assert.ok(new Set(parsed.map(row=>row.values[starColumn])).size>1);
  assert.equal(parsed[0].username,'示例学号001');
  assert.equal(parsed[0].values[fields.find(f=>f.valueType==='grade').column],'A');
  for(const cell of Object.values(sheet))if(cell&&typeof cell==='object')assert.ok(!cell.f&&cell.t!=='e');
 });
}

test('template follows configured grade alphabet instead of hard-coded grades',()=>{
 const config={...createV2Config(),allowedGrades:['优','良','合格']};
 const parsed=parseV2Workbook(buildScoreTemplate({termId:'1',config}),{termId:'1',config});
 assert.equal(parsed[0].values.math_regular_grade,'优');
});

test('template endpoint downloads an actual workbook for the selected term and rejects student access',async t=>{
 const {createCoreTestDb}=require('./helpers/reportCoreDb');
 const db=await createCoreTestDb(t);await db.seedBase();
 const server=require('../app').createApp({pool:db.pool,schoolId:'1'}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const {signToken}=require('../middleware/auth');
 const [[teacher]]=await db.pool.query('SELECT * FROM users WHERE id=2');
 const [[student]]=await db.pool.query('SELECT * FROM users WHERE id=3');
 const url=`http://127.0.0.1:${server.address().port}/api/v1/report-core/imports/template?termId=1`;
 const response=await fetch(url,{headers:{Authorization:'Bearer '+signToken(teacher)}});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/spreadsheetml/);assert.match(response.headers.get('content-disposition'),/attachment/);
 const parsed=parseV2Workbook(Buffer.from(await response.arrayBuffer()),{termId:'1',config:{}});
 assert.equal(parsed.length,8);
 assert.equal(parsed[0].username,'示例学号001');
 assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+signToken(student)}})).status,403);
});
