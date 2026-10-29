const {fail}=require('./reportCorePolicy');
const {parse}=require('./reportCoreStore');
async function commitReviewed(args,sections){
 if(args.actor.role!=='manager')fail(403,'仅管理员配置学期');
 if(!args.previewId||args.config!==undefined||args.nextRegistrationDate!==undefined||args.teacherId!==undefined)fail(422,'请先预览学期配置，并仅提交previewId与expectedRevision');
 const [[row]]=await args.pool.query('SELECT term_id,payload_json FROM evaluation_source_record WHERE school_id=? AND id=?',[args.actor.schoolId,args.previewId]);
 if(!row||String(row.term_id)!==String(args.termId)||!sections.includes(parse(row.payload_json).section))fail(422,'预览与当前学期或修改类型不一致');
 return require('./reportCoreTermSettings').commitTermSettingsPreview(args);
}
module.exports={updateTerm:args=>commitReviewed(args,['registration','rules']),saveAssignment:args=>commitReviewed(args,['assignments'])};
