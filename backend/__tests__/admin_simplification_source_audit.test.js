const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {auditV2SourceAssets}=require('../services/core/reportCoreSourceAudit');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
test('source audit preserves verified, changed, missing and unsafe attachment checks without writes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'six-education-audit-'));
 try{
  await fs.writeFile(path.join(root,'valid.txt'),'valid');await fs.writeFile(path.join(root,'changed.txt'),'changed');
  const rows=[['valid.txt',hash('valid')],['changed.txt',hash('original')],['missing.txt',hash('missing')],['../escape.txt',hash('outside')]].map(([fileRef,fileHash],i)=>({id:String(i+1),source_type:'CERTIFICATE',schema_version:'SIX_EDU_V2',payload_json:{fileRef,fileHash}}));
  const queries=[],connection={query:async(sql,params)=>{queries.push(sql);assert.match(sql,/^SELECT /);assert.deepEqual(params,['1','2']);return[rows];}};
  const result=await auditV2SourceAssets({connection,schoolId:'1',termId:'2',filesRoot:root});
  assert.deepEqual(result.assets.map(a=>a.status),['VERIFIED','HASH_MISMATCH','MISSING','UNSAFE_REFERENCE']);assert.equal(result.assetFailures,3);assert.equal(result.sourceCount,4);assert.equal(queries.length,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('source audit keeps legacy facts isolated instead of inferring V2 scores',async()=>{
 const rows=[{id:'1',source_type:'STORY',schema_version:'CORE_V1',payload_json:{}},{id:'2',source_type:'CARD',record_kind:'DIRECT',target_key:'obsolete_target',payload_json:{}},{id:'3',source_type:'IMPORT',record_kind:'ITEM',payload_json:{values:{teacher_comment:'not an academic grade'}}},{id:'4',source_type:'CARD',record_kind:'DIRECT',target_key:'chinese_process_star',schema_version:'SIX_EDU_V2',payload_json:{}}];
 const connection={query:async()=>[rows]},result=await auditV2SourceAssets({connection,schoolId:'1',termId:'2'});
 assert.deepEqual(result.isolated.map(a=>a.sourceId),['1','2','3']);assert.equal(result.preservedCount,1);
 await assert.rejects(auditV2SourceAssets({connection,schoolId:'0',termId:'2'}),/Explicit school and term/);
});
