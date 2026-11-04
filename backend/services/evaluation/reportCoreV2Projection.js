const {byColumn}=require('../core/reportCoreV2Policy');
const {parse}=require('../core/reportCoreStore');
const {fail,narratives}=require('../core/reportCorePolicy');
async function rebuildV2Evaluation({connection,studentKey,targets}) {
  const {schoolId,termId,studentId}=studentKey;
  const [[e]]=await connection.query('SELECT field_sources,section_meta FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?',[schoolId,termId,studentId]);
  const fieldSources=parse(e.field_sources),sectionMeta=parse(e.section_meta),values={};
  const [records]=await connection.query("SELECT * FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? AND schema_version='SIX_EDU_V2' ORDER BY id",[schoolId,termId,studentId]);
  for(const r of records) {
    r.payload=parse(r.payload_json);
    if(r.payload.gender)sectionMeta.gender=r.payload.gender;
    if(r.payload.birthDate)sectionMeta.birthDate=r.payload.birthDate;
  }
  if(targets.includes('honor_summary')) {
    const items=records.filter(r=>r.source_type==='CERTIFICATE'&&r.status==='APPROVED'&&r.payload.honor).map(r=>({sourceId:String(r.id),...r.payload.honor}));
    values.honor_summary={items,points:items.reduce((sum,item)=>sum+item.points,0)};
  }
  for(const r of records.filter(r=>r.record_kind==='FORM' && r.status==='CONFIRMED'))for(const target of r.payload.targetKeys||[]) {
    if(r.payload.action==='SETTLE_CARD_TARGETS')fieldSources[target]={...fieldSources[target],settled:true};
    if(r.payload.action==='V2_NOT_APPLICABLE')fieldSources[target]={...fieldSources[target],notApplicable:true,reason:r.payload.reason};
  }
  for(const target of new Set(targets)) {
    if(['story_summary','process_summary','honor_summary'].includes(target))continue;
    const f=byColumn.get(target);
    if(!f && !narratives.includes(target))fail(422,'未知评价字段');
    if(['CARD','STORY'].includes(f?.sourceType))continue;
    const expectedSource=f?.sourceType || 'TEACHER';
    const latest=records.filter(r=>r.source_type===expectedSource && ['COMMITTED','SUBMITTED','CONFIRMED'].includes(r.status) && Object.hasOwn(r.payload.values||{},target)).at(-1);
    values[target]=latest?.payload.values[target]??null;
    fieldSources[target]={...fieldSources[target],sourceType:expectedSource,sourceIds:latest?[String(latest.id)]:[],sourceVersion:latest?.version??null,...(latest?.payload.measurement?{measurement:latest.payload.measurement}: {}),...(latest?.payload.gender?{gender:latest.payload.gender}: {}),...(latest?.payload.birthDate?{birthDate:latest.payload.birthDate}: {})};
  }
  return {values,fieldSources,sectionMeta};
}
module.exports={rebuildV2Evaluation};
