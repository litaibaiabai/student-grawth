const {catalog,rankProcess,storySummary}=require('./reportCoreV2Policy');
const {stableHash}=require('./reportCorePolicy');
const {parse,getTerm}=require('./reportCoreStore');
const classKey=e=>`${e.grade_snapshot}:${e.class_no_snapshot}`;
const enrolled=e=>!['TRANSFERRED_OUT','NOT_APPLICABLE'].includes(parse(e.section_meta).enrollment?.status) && parse(e.section_meta).roster?.included!==false;
async function loadV2Statistics(connection,{schoolId,termId}) {
  const term=await getTerm(connection,schoolId,termId);
  const [all]=await connection.query('SELECT student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,field_sources,section_meta FROM student_term_evaluation WHERE school_id=? AND term_id=? ORDER BY student_id',[schoolId,termId]);
  const roster=all.filter(enrolled);
  const [cards]=await connection.query(`SELECT student_id,target_key,SUM(delta) points FROM evaluation_source_record WHERE school_id=? AND term_id=? AND schema_version='SIX_EDU_V2' AND source_type='CARD' AND ((record_kind IN ('DIRECT','REVERSAL') AND status='CONFIRMED') OR (record_kind='CARD' AND status='USED')) GROUP BY student_id,target_key`,[schoolId,termId]);
  const points=new Map(cards.map(r=>[`${r.student_id}:${r.target_key}`,Number(r.points)]));
  const processByStudent=Object.fromEntries(roster.map(e=>[String(e.student_id),{}]));
  const classes=new Set(roster.map(classKey));
  for(const cls of classes)for(const card of catalog.cardCatalog) {
    const cohort=roster.filter(e=>classKey(e)===cls && parse(e.field_sources)[card.targetColumn]?.notApplicable!==true && (term.evaluation_config.applicableFields||[]).includes(card.targetColumn));
    const settled=cohort.every(e=>parse(e.field_sources)[card.targetColumn]?.settled===true);
    const inputs=cohort.map(e=>({studentId:String(e.student_id),points:points.get(`${e.student_id}:${card.targetColumn}`)||0}));
    const version=stableHash({cls,target:card.targetColumn,inputs,settled,rosterRevision:String(term.roster_revision),ruleVersion:term.rule_version});
    for(const row of rankProcess(inputs,{settled}))processByStudent[row.studentId][card.targetColumn]={points:row.points,rank:row.rank,star:row.star,population:row.population,settled,version};
  }
  const [listens]=await connection.query("SELECT student_id,COUNT(*) total FROM evaluation_source_record WHERE school_id=? AND term_id=? AND schema_version='SIX_EDU_V2' AND event_type='LISTEN_COMPLETE' AND status='CONFIRMED' GROUP BY student_id",[schoolId,termId]);
  const [works]=await connection.query(`SELECT w.student_id,w.event_type,COUNT(*) total,MAX(v.numeric_value) best FROM evaluation_source_record w JOIN evaluation_source_record v ON v.school_id=w.school_id AND v.id=w.current_version_id AND v.parent_id=w.id AND v.student_id=w.student_id AND v.term_id=w.term_id WHERE w.school_id=? AND w.term_id=? AND w.schema_version='SIX_EDU_V2' AND w.record_kind='BATCH' AND w.status='SUBMITTED' AND ((w.event_type='WRITE_WORK' AND v.event_type='WRITE_SUBMISSION' AND v.status='APPROVED') OR (w.event_type='TELL_WORK' AND v.event_type='TELL_SUBMISSION' AND v.status='SCORED')) AND v.numeric_value IS NOT NULL GROUP BY w.student_id,w.event_type`,[schoolId,termId]);
  const listenCounts=new Map(listens.map(r=>[String(r.student_id),Number(r.total)]));
  const workValues=new Map(works.map(r=>[`${r.student_id}:${r.event_type}`,r]));
  const storyByStudent={};
  for(const e of roster) {
    const id=String(e.student_id);
    storyByStudent[id]=storySummary({listenCount:listenCounts.get(id)||0,writeCount:Number(workValues.get(`${id}:WRITE_WORK`)?.total||0),tellScore:workValues.has(`${id}:TELL_WORK`)?Number(workValues.get(`${id}:TELL_WORK`).best):null});
  }
  const storyVersions={};
  for(const type of ['LISTEN','WRITE','TELL']) {
    const participants=roster.map(e=>({studentId:String(e.student_id),...storyByStudent[e.student_id][type]})).filter(r=>r.participating).sort((a,b)=>b.value-a.value || (BigInt(a.studentId)<BigInt(b.studentId)?-1:BigInt(a.studentId)>BigInt(b.studentId)?1:0));
    let rank=0;
    for(const [i,r] of participants.entries()) {if(i===0 || r.value!==participants[i-1].value)rank=i+1;storyByStudent[r.studentId][type].rank=rank;}
    for(const e of roster)Object.assign(storyByStudent[e.student_id][type],{rank:storyByStudent[e.student_id][type].rank??null,population:participants.length});
    storyVersions[type]=stableHash({type,participants:participants.map(r=>[r.studentId,r.value]),rosterRevision:String(term.roster_revision),ruleVersion:term.rule_version});
  }
  return {roster,processByStudent,storyByStudent,storyVersions,revision:String(term.data_revision),rosterRevision:String(term.roster_revision)};
}
async function rebuildV2Scope(connection,term,changed) {
  const targets=new Set(Object.values(changed).flat());
  const processTargets=catalog.cardCatalog.map(c=>c.targetColumn).filter(k=>targets.has(k));
  const storyChanged=[...targets].some(k=>k.startsWith('story_'));
  if(!processTargets.length && !storyChanged)return;
  const stats=await loadV2Statistics(connection,{schoolId:String(term.school_id),termId:String(term.id)});
  const touchedClasses=new Set(stats.roster.filter(e=>Object.hasOwn(changed,String(e.student_id))).map(classKey));
  for(const e of stats.roster) {
    const id=String(e.student_id),process=processTargets.length && touchedClasses.has(classKey(e));
    if(!process && !storyChanged)continue;
    const [[current]]=await connection.query('SELECT field_sources,process_summary FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=? FOR UPDATE',[term.school_id,term.id,id]);
    const values={},sources=parse(current.field_sources),summary=parse(current.process_summary);
    if(process)for(const target of processTargets) {
      const item=stats.processByStudent[id][target];
      if(!item)continue;
      values[target]=item.star;summary[target]=item;
      sources[target]={...sources[target],sourceType:'CARD',raw:item.points,settled:item.settled,statisticsVersion:item.version};
    }
    if(process)values.process_summary=JSON.stringify(summary);
    if(storyChanged) {
      values.story_summary=JSON.stringify({...stats.storyByStudent[id],versions:stats.storyVersions});
      for(const type of ['WRITE','LISTEN','TELL'])values[`story_${type.toLowerCase()}_star`]=stats.storyByStudent[id][type].star;
    }
    const keys=Object.keys(values);
    await connection.query(`UPDATE student_term_evaluation SET ${keys.map(k=>`\`${k}\`=?`).join(',')},field_sources=?,revision=revision+1,status='DRAFT',confirmed_revision=NULL,confirmed_by=NULL,confirmed_at=NULL,approval_fingerprint=NULL WHERE school_id=? AND term_id=? AND student_id=?`,[...keys.map(k=>values[k]),JSON.stringify(sources),term.school_id,term.id,id]);
  }
}
module.exports={loadV2Statistics,rebuildV2Scope,enrolled};
