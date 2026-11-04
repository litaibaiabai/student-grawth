const {parse}=require('./reportCoreStore');
async function auditV2SourceAssets({connection,schoolId,termId,filesRoot}) {
  if(!/^[1-9]\d*$/.test(String(schoolId)) || !/^[1-9]\d*$/.test(String(termId)))throw Error('Explicit school and term required');
  const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
  const policy=require('./reportCoreV2Policy');
  const root=path.resolve(filesRoot || process.env.REPORT_FILES_DIR || path.join(__dirname,'../../private/report-core'));
  const [rows]=await connection.query('SELECT * FROM evaluation_source_record WHERE school_id=? AND term_id=? ORDER BY id',[schoolId,termId]);
  const assets=[],isolated=[];
  const targets=new Set(policy.catalog.cardCatalog.map(c=>c.targetColumn));
  for(const row of rows) {
    const payload=parse(row.payload_json);
    let reason=null;
    if(row.source_type==='STORY' && row.schema_version!=='SIX_EDU_V2')reason='Legacy text does not prove V2 playback or actual recording';
    if(row.source_type==='CARD' && ['CARD','DIRECT','REVERSAL'].includes(row.record_kind) && !targets.has(row.target_key))reason='Legacy card target requires explicit approved mapping';
    if(row.source_type==='IMPORT' && row.record_kind==='ITEM' && Object.keys(payload.values||{}).some(k=>policy.byColumn.get(k)?.sourceType!=='IMPORT'))reason='Legacy imported fields cannot be inferred as V2 academic columns';
    if(reason)isolated.push({sourceId:String(row.id),reason});
    if(!payload.fileRef)continue;
    const asset={sourceId:String(row.id),fileRef:payload.fileRef,expectedHash:payload.fileHash||null,status:'MISSING'};
    if(typeof payload.fileRef!=='string' || path.basename(payload.fileRef)!==payload.fileRef){asset.status='UNSAFE_REFERENCE';assets.push(asset);continue;}
    try {
      const full=await fs.realpath(path.join(root,payload.fileRef));
      const realRoot=await fs.realpath(root);
      if(!full.startsWith(realRoot+path.sep))throw Error('Unsafe symlink');
      const bytes=await fs.readFile(full);
      asset.bytes=bytes.length;asset.actualHash=crypto.createHash('sha256').update(bytes).digest('hex');
      asset.status=!asset.expectedHash?'NO_EXPECTED_HASH':asset.expectedHash===asset.actualHash?'VERIFIED':'HASH_MISMATCH';
    } catch(error){asset.status=error.code==='ENOENT'?'MISSING':'UNREADABLE';}
    assets.push(asset);
  }
  return {sourceCount:rows.length,preservedCount:rows.length-isolated.length,isolated,assets,assetFailures:assets.filter(a=>a.status!=='VERIFIED').length};
}
module.exports={auditV2SourceAssets};
