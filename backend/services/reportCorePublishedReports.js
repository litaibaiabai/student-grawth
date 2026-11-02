const {getTerm,parse}=require('./reportCoreStore');
const {stableHash,fail}=require('./reportCorePolicy');
const {assertScope}=require('./authorizationService');
async function findLatestPublishedReport(c,{schoolId,termId,studentId,reportId}){
 if(reportId!==undefined&&!/^[1-9]\d*$/.test(String(reportId)))fail(422,'报告编号不合法');
 const params=[schoolId,termId,studentId];if(reportId)params.push(reportId);
 const[[row]]=await c.query("SELECT * FROM term_report WHERE school_id=? AND term_id=? AND student_id=? AND status='PUBLISHED'"+(reportId?' AND id=?':'')+' ORDER BY version DESC LIMIT 1',params);return row||null;
}
async function listLatestPublishedReports(c,{schoolId,termId}){
 return(await c.query("SELECT r.* FROM term_report r WHERE r.school_id=? AND r.term_id=? AND r.status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM term_report n WHERE n.school_id=r.school_id AND n.term_id=r.term_id AND n.student_id=r.student_id AND n.status='PUBLISHED' AND n.version>r.version)",[schoolId,termId]))[0];
}
async function publishConfirmedReport(c,{actor,studentKey,term,evaluation:e,fingerprint}){
 const[[same]]=await c.query("SELECT id,version,published_at FROM term_report WHERE school_id=? AND term_id=? AND student_id=? AND source_revision=? AND approval_fingerprint=? AND status='PUBLISHED' ORDER BY version DESC LIMIT 1",[actor.schoolId,studentKey.termId,studentKey.studentId,e.revision,fingerprint]);
 if(same)return{reportId:String(same.id),version:Number(same.version),publishedAt:same.published_at};
 const[[last]]=await c.query('SELECT MAX(version) n FROM term_report WHERE school_id=? AND term_id=? AND student_id=?',[actor.schoolId,studentKey.termId,studentKey.studentId]),version=Number(last.n||0)+1;
 const {buildReportModel}=require('./reportCoreEvaluation'),{renderPrintableA4}=require('./reportRenderService');
 const model=buildReportModel({evaluation:e,config:term.evaluation_config});
 model.term={id:String(term.id),name:term.term_name,academicYear:term.academic_year,semester:term.semester,nextRegistrationDate:require('./termDates').day(term.next_term_registration_date)};
 Object.assign(model,{templateVersion:term.template_version,ruleVersion:term.rule_version,configVersion:String(term.config_version),releaseVersion:version,fingerprint});
 const renderedHtml=renderPrintableA4({reportData:model,renderScope:'FULL'}),renderedDetailHtml=renderPrintableA4({reportData:model,renderScope:'DETAIL_ONLY'});
 const snapshot=JSON.parse(JSON.stringify({...model,renderedHtml,renderedDetailHtml,renderedDetailHash:stableHash(renderedDetailHtml)}));
 const [insert]=await c.query("INSERT INTO term_report(school_id,term_id,student_id,version,release_version,release_key,schema_version,template_version,rule_version,source_revision,approval_fingerprint,snapshot_json,snapshot_hash,status,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'PUBLISHED',UTC_TIMESTAMP(6))",[actor.schoolId,studentKey.termId,studentKey.studentId,version,version,stableHash(['HEAD_CONFIRM',actor.schoolId,String(term.id),String(studentKey.studentId),String(e.revision),fingerprint]),model.schemaVersion,term.template_version,term.rule_version,e.revision,fingerprint,JSON.stringify(snapshot),stableHash(snapshot)]);
 const[[row]]=await c.query('SELECT published_at FROM term_report WHERE id=?',[insert.insertId]);
 return{reportId:String(insert.insertId),version,publishedAt:row.published_at};
}
async function getPublishedReport({pool,actor,termId,studentId=actor.id,reportId}){
 await assertScope({actor,studentKey:{schoolId:actor.schoolId,termId,studentId},action:'report'},pool);
 await getTerm(pool,actor.schoolId,termId);
 const r=await findLatestPublishedReport(pool,{schoolId:actor.schoolId,termId,studentId,reportId});
 if(!r){if(reportId)fail(404,'已发布报告不存在');return null;}
 const snapshot=parse(r.snapshot_json);if(stableHash(snapshot)!==r.snapshot_hash)fail(409,'报告快照校验失败');
 if(snapshot.renderedDetailHtml)require('./reportCoreReportBrowser').validateFrozenSnapshot(snapshot,r);
 return{id:String(r.id),termId:String(r.term_id),studentId:String(r.student_id),version:Number(r.version),releaseVersion:r.release_version,publishedAt:r.published_at,snapshot,html:snapshot.renderedHtml||require('./reportRenderService').renderPrintableA4({reportData:snapshot})};
}
module.exports={publishConfirmedReport,findLatestPublishedReport,listLatestPublishedReports,getPublishedReport};
