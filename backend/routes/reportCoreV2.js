const multer=require('multer');
const {stableHash,fail}=require('../services/reportCorePolicy');
const {getTerm}=require('../services/reportCoreStore');
const {isV2}=require('../services/reportCoreV2Policy');
function mountV2(router,{asyncRoute,ok}) {
  const context=req=>({pool:req.app.locals.pool,actor:req.actor});
  const command=req=>({requestKey:req.body.requestKey,payloadHash:stableHash({body:req.body,params:req.params,fileHash:req.file?stableHash(req.file.buffer.toString('base64')):undefined})});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:20}});
  router.get('/report-core/imports/template',asyncRoute(async(req,res)=>{
    if(req.actor.role==='student')fail(403,'仅教师或管理员下载模板');
    const term=await getTerm(req.app.locals.pool,req.actor.schoolId,req.query.termId);
    if(!isV2(term.evaluation_config))fail(422,'请选择V2学期');
    const roster=await require('../services/reportCoreReadModels').resolveTermRoster({connection:req.app.locals.pool,schoolId:req.actor.schoolId,termId:term.id,...(req.actor.role==='teacher'?{teacherId:req.actor.id}:{})});
    res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="six-education-v2.xlsx"','Cache-Control':'private, no-store'});
    res.send(require('../services/reportCoreV2Imports').buildV2Workbook({termId:term.id,roster}));
  }));
  router.post('/report-core/imports/file-preview',upload.single('file'),asyncRoute(async(req,res)=>{
    if(!['teacher','manager'].includes(req.actor.role))fail(403,'无导入权限');
    const term=await getTerm(req.app.locals.pool,req.actor.schoolId,req.body.termId);
    if(!req.file)fail(422,'请选择Excel文件');
    if(req.actor.role==='teacher'){
      if(req.body.kind&&req.body.kind!=='ACADEMIC')fail(422,'教师仅可上传综合成绩');
      res.setHeader('Cache-Control','private, no-store');
      return ok(res,await require('../services/reportCoreV2ImportReview').reviewV2Workbook({...context(req),termId:term.id,buffer:req.file.buffer,command:command(req)}));
    }
    if(!isV2(term.evaluation_config))fail(422,'请选择V2学期');
    const rows=require('../services/reportCoreV2Imports').parseV2Workbook(req.file.buffer,{termId:term.id});
    ok(res,await require('../services/reportCoreImports').previewImport({...context(req),termId:term.id,kind:req.body.kind||'ACADEMIC',rows,command:command(req)}));
  }));
  router.get('/report-core/term-state',asyncRoute(async(req,res)=>{
    const term=await getTerm(req.app.locals.pool,req.actor.schoolId,req.query.termId);
    ok(res,{schemaVersion:term.evaluation_config.schemaVersion||'CORE_V1',phase:term.business_phase,dataRevision:String(term.data_revision||0),rosterRevision:String(term.roster_revision||0)});
  }));
  router.post('/admin/report-core/phase',asyncRoute(async(req,res)=>ok(res,await require('../services/reportCoreV2Lifecycle').changePhase({...req.body,...context(req),command:command(req)}))));
}
module.exports={mountV2};
