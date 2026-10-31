// Run alongside assessment-upload-fixture.cjs, using only its synthetic local database.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const output=path.resolve(__dirname,'../../output/report-core/assessment-upload'),base='http://127.0.0.1:19587/api/v1';
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'teacher',password:'Test-pass-2026'})});
 assert.equal(login.status,200);const token=(await login.json()).data.token;
 const preview=async name=>{
  const form=new FormData();form.set('termId','1');form.set('kind','ACADEMIC');form.set('requestKey',crypto.randomUUID());form.set('file',new Blob([await fs.readFile(path.join(output,name))]),name);
  const response=await fetch(base+'/report-core/imports/file-preview',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.data.result;
 };
 const bad=await preview('invalid.xlsx');assert.equal(bad.totalCount,3);assert.equal(bad.students.length,3);assert.equal(bad.batchId,null);assert.ok(bad.errors.length>0);
 const good=await preview('valid.xlsx');assert.equal(good.totalCount,3);assert.equal(good.errors.length,0);assert.ok(good.batchId);assert.deepEqual(good.students.map(s=>s.student.id),['4','3','5']);assert.equal(good.students[0].values.jump_rope_1min,0);
 const commit=await fetch(base+`/report-core/imports/${good.batchId}/commit`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:good.revision,requestKey:crypto.randomUUID()})});
 assert.equal(commit.status,200,await commit.text());
 const prefill=await preview('prefill.xlsx');assert.equal(prefill.totalCount,3);assert.equal(prefill.errors.length,0);assert.equal(prefill.batchId,null);assert.ok(prefill.students.every(s=>s.values.math_regular_grade==='A'&&s.uploadedFields.length===0));
 await fs.writeFile(path.join(output,'http-evidence.json'),JSON.stringify({invalidRows:bad.students.length,invalidErrors:bad.errors.length,validRows:good.students.length,commitStatus:commit.status,prefilledRows:prefill.students.length,record:good.students[0]},null,2));
 console.log('UPLOAD_HTTP_PASS: error rows retained, all sheets reviewed in order, explicit commit accepted, blank-only rows retained with saved gray values.');
})().catch(e=>{console.error(e);process.exitCode=1;});
