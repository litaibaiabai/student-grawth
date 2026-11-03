const {test}=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {parseV2Workbook}=require('../services/reportCoreV2Imports');
const {createV2TestDb,command}=require('./helpers/reportCoreV2Db');
const {createCoreTestDb}=require('./helpers/reportCoreDb');
const headers=['学期标识','模板版本','账号','姓名','math_regular_grade'];
const row=(username,name,value='')=>['1','SIX_EDU_V2',username,name,value];
function workbook(sheets){const wb=XLSX.utils.book_new();for(const [name,rows] of Object.entries(sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}

test('current-term Excel studentId templates use the same report workflow without requiring a V2 migration',()=>{
 const rows=parseV2Workbook(workbook({学业录入:[['studentId','姓名','math_basic_knowledge_grade'],[3,'学生3','A'],[4,'学生4','']]}),{termId:'1',review:true,config:{}});
 assert.equal(rows.length,2);assert.equal(rows[0].studentId,'3');assert.equal(rows[0].values.math_basic_knowledge_grade,'A');assert.deepEqual(rows[1].values,{});assert.deepEqual(rows[0].inputErrors,[]);
});

test('current-term review retains saved values, returns both students and commits through existing academic permissions',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const actor={id:'2',role:'teacher',schoolId:'1',tokenVersion:1};
 await db.pool.query("UPDATE student_term_evaluation SET math_basic_knowledge_grade='C' WHERE student_id=3");
 const {result}=await require('../services/reportCoreV2ImportReview').reviewV2Workbook({pool:db.pool,actor,termId:'1',buffer:workbook({学业录入:[['studentId','姓名','math_basic_knowledge_grade'],[3,'学生3',''],[4,'学生4','A']]}),command:command('current-term-preview')});
 assert.equal(result.totalCount,2);assert.deepEqual(result.students.map(s=>s.student.id),['3','4']);assert.equal(result.students[0].values.math_basic_knowledge_grade,'C');assert.equal(result.errors.length,0);assert.ok(result.batchId);
 await require('../services/reportCoreImports').commitImport({pool:db.pool,actor,batchId:result.batchId,expectedRevision:result.revision,command:command('current-term-commit')});
 assert.equal((await db.pool.query('SELECT math_basic_knowledge_grade FROM student_term_evaluation WHERE student_id=4'))[0][0].math_basic_knowledge_grade,'A');
});

test('review preserves students from every sheet, blank scores and physical Excel row numbers',()=>{
 const rows=parseV2Workbook(workbook({一班:[headers,row('student','学生3','A'),[],row('student2','学生4')],二班:[headers,row('third','第三位','B')]}),{termId:'1',review:true});
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>[r.username,r.sheetName,r.rowNo]),[['student','一班',2],['student2','一班',4],['third','二班',2]]);
 assert.deepEqual(rows[1].values,{});
 assert.deepEqual(rows[1].columns,['math_regular_grade']);
});

test('review retains invalid grades and identity errors on their own row without losing later students',()=>{
 const rows=parseV2Workbook(workbook({成绩:[headers,row('student','学生3','Z'),row('','无账号','A'),row('student2','学生4','B')]}),{termId:'1',review:true});
 assert.equal(rows.length,3);
 assert.equal(rows[0].values.math_regular_grade,'Z');
 assert.ok(rows[0].inputErrors.some(e=>e.field==='math_regular_grade'));
 assert.ok(rows[1].inputErrors.some(e=>e.field==='username'));
 assert.deepEqual(rows[2].inputErrors,[]);
 assert.throws(()=>parseV2Workbook(workbook({成绩:[headers,row('student','学生3','Z')]}),{termId:'1'}),/等级/);
});

test('review retains Excel error and formula cells as row errors, without dropping valid later students',()=>{
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([headers,row('student','学生3','A'),row('student2','学生4','B'),row('third','学生5','A')]);
 ws.E2={t:'e',v:7};ws.E3={t:'s',v:'A',f:'"A"'};XLSX.utils.book_append_sheet(wb,ws,'成绩');
 const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
 const rows=parseV2Workbook(buffer,{termId:'1',review:true});
 assert.equal(rows.length,3);assert.ok(rows[0].inputErrors.some(e=>e.field==='math_regular_grade'&&/错误单元格/.test(e.reason)));assert.ok(rows[1].inputErrors.some(e=>e.field==='math_regular_grade'&&/公式/.test(e.reason)));assert.deepEqual(rows[2].inputErrors,[]);
 assert.throws(()=>parseV2Workbook(buffer,{termId:'1'}),/公式|错误单元格/);
});

test('review uses physical row numbers when the worksheet starts below the first row',()=>{
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([[],[],headers,row('student','学生3','Z')]);ws['!ref']='A3:E4';XLSX.utils.book_append_sheet(wb,ws,'成绩');
 const rows=parseV2Workbook(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{termId:'1',review:true});
 assert.equal(rows[0].rowNo,4);assert.equal(rows[0].sheetName,'成绩');
});

test('review still rejects formula headers because their column mapping cannot be trusted',()=>{
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([headers,row('student','学生3','A')]);ws.A1.f='"学期标识"';XLSX.utils.book_append_sheet(wb,ws,'成绩');
 assert.throws(()=>parseV2Workbook(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{termId:'1',review:true}),/表头.*公式/);
});

test('complete review retains blank and unknown rows, merges prefilled values and blocks the entire bad batch',async t=>{
 const {pool,actors}=await createV2TestDb(t,{applicableFields:['math_regular_grade']});
 await pool.query("UPDATE student_term_evaluation SET math_regular_grade='B' WHERE student_id=3");
 const {result}=await require('../services/reportCoreV2ImportReview').reviewV2Workbook({pool,actor:actors.teacher,termId:'1',buffer:workbook({成绩:[headers,row('student','学生3'),row('student2','学生4'),row('unknown','未知学生','A')]}),command:command('complete-review')});
 assert.equal(result.totalCount,3);assert.equal(result.students.length,3);assert.equal(result.batchId,null);
 assert.equal(result.students[0].values.math_regular_grade,'B');assert.deepEqual(result.students[0].uploadedFields,[]);assert.deepEqual(result.students[0].errors,[]);
 assert.ok(result.students[1].errors.some(e=>e.field==='math_regular_grade'));
 assert.ok(result.students[2].errors.some(e=>e.field==='username'));assert.equal(result.students[2].student.name,'未知学生');
 assert.equal(Number((await pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE source_type='IMPORT'"))[0][0].n),0);
});

test('valid review keeps workbook order, zero and prefilled sources then uses the existing explicit commit',async t=>{
 const {pool,actors}=await createV2TestDb(t,{applicableFields:['math_regular_grade','jump_rope_1min']});
 const {result}=await require('../services/reportCoreV2ImportReview').reviewV2Workbook({pool,actor:actors.teacher,termId:'1',buffer:workbook({成绩:[['学期标识','模板版本','账号','姓名','math_regular_grade','jump_rope_1min','测量日期'],['1','SIX_EDU_V2','student2','学生4','A',0,'2026-10-20'],['1','SIX_EDU_V2','student','学生3','B',12,'2026-10-20']]}),command:command('valid-review')});
 assert.deepEqual(result.students.map(s=>s.student.id),['4','3']);assert.equal(result.students[0].values.jump_rope_1min,0);assert.equal(result.errors.length,0);assert.ok(result.batchId);
 assert.equal((await pool.query('SELECT math_regular_grade FROM student_term_evaluation WHERE student_id=4'))[0][0].math_regular_grade,null);
 await require('../services/reportCoreImports').commitImport({pool,actor:actors.teacher,batchId:result.batchId,expectedRevision:result.revision,command:command('review-commit')});
 assert.equal((await pool.query('SELECT math_regular_grade FROM student_term_evaluation WHERE student_id=4'))[0][0].math_regular_grade,'A');
});

test('duplicate and out-of-scope rows stay visible without returning unauthorized evaluation values',async t=>{
 const {pool,actors}=await createV2TestDb(t,{applicableFields:['math_regular_grade']});
 await pool.query("UPDATE student_term_evaluation SET grade_snapshot=5,math_regular_grade='D' WHERE student_id=4");
 const {result}=await require('../services/reportCoreV2ImportReview').reviewV2Workbook({pool,actor:actors.teacher,termId:'1',buffer:workbook({成绩:[headers,row('student','学生3','A'),row('student','学生3','B'),row('student2','学生4','A')]}),command:command('scope-review')});
 assert.equal(result.students.length,3);assert.equal(result.batchId,null);
 assert.ok(result.students[0].errors.some(e=>/重复/.test(e.reason)));assert.ok(result.students[1].errors.some(e=>/重复/.test(e.reason)));
 assert.ok(result.students[2].errors.some(e=>/任教范围/.test(e.reason)));assert.notEqual(result.students[2].values.math_regular_grade,'D');
});

test('review parses gender and birthDate columns and computes BMI with classification', async () => {
 const wb = workbook({
   体测录入: [
     ['学期标识', '模板版本', '账号', '姓名', 'height_cm', 'weight_kg', '性别', '出生日期', '测量日期'],
     ['1', 'SIX_EDU_V2', '示例学号001', '林知夏（示例）', 125, 18, '男', '2019-10-01', '2026-03-01'],
   ]
 });
 const rows = parseV2Workbook(wb, { termId: '1', review: true });
 assert.equal(rows[0].gender, '男');
 assert.equal(rows[0].birthDate, '2019-10-01');

 const mockPool = { query: async () => [[{ evaluation_config: JSON.stringify({ schemaVersion: 'SIX_EDU_V2' }) }]] };
 const { result } = await require('../services/reportCoreV2ImportReview').reviewV2Workbook({
   pool: mockPool,
   actor: { id: '2', role: 'teacher', schoolId: '1' },
   termId: '1',
   buffer: wb,
   command: { id: 'test-cmd' }
 });
 assert.equal(result.students[0].values.bmi, 11.52);
 assert.equal(result.students[0].values.bmi_label, '中重度消瘦');
 assert.equal(result.students[0].values.bmi_standard, 'WS_T_2018');
});
