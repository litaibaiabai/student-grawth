const multer=require('multer');
const {stableHash,fail}=require('../services/reportCorePolicy');
const {getTerm}=require('../services/reportCoreStore');
function mountV2(router,{asyncRoute,ok}) {
  const context=req=>({pool:req.app.locals.pool,actor:req.actor});
  const command=req=>({requestKey:req.body.requestKey,payloadHash:stableHash({body:req.body,params:req.params,fileHash:req.file?stableHash(req.file.buffer.toString('base64')):undefined})});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:20}});
  const writtenStories = require('../services/reportCoreWrittenStories');
  router.get('/report-core/v2/written-stories', asyncRoute(async (req,res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await writtenStories.listWrittenStories({...req.query,...context(req)}));
  }));
  router.get('/report-core/v2/written-stories/:id', asyncRoute(async (req,res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await writtenStories.getWrittenStory({...context(req),termId:req.query.termId,storyId:req.params.id}));
  }));
  router.post('/report-core/v2/written-stories', upload.single('file'), asyncRoute(async (req,res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await writtenStories.submitWrittenStory({...req.body,...context(req),file:req.file,command:command(req)}));
  }));
  const comments = require('../services/reportCoreComments');
  router.get('/report-core/v2/comments', asyncRoute(async (req,res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await comments.listComments({...req.query,...context(req)}));
  }));
  router.get('/report-core/v2/comments/:studentId', asyncRoute(async (req,res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    ok(res, await comments.getComment({...context(req),termId:req.query.termId,studentId:req.params.studentId}));
  }));
  for (const [path, method] of [['generate','generateComment'],['save','saveComment'],['approve','approveComments']])
    router.post('/report-core/v2/comments/'+path, asyncRoute(async (req,res) =>
      ok(res, await comments[method]({...req.body,...context(req),provider:req.app.locals.provider,command:command(req)}))));
  router.get('/report-core/imports/template',asyncRoute(async(req,res)=>{
    if(req.actor.role!=='teacher')fail(403,'仅教师下载模板');
    const term=await getTerm(req.app.locals.pool,req.actor.schoolId,req.query.termId);
    res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="comprehensive-scores.xlsx"; filename*=UTF-8''${encodeURIComponent('综合成绩导入模板.xlsx')}`,'Cache-Control':'private, no-store'});
    res.send(require('../services/reportCoreV2Imports').buildScoreTemplate({termId:term.id,config:term.evaluation_config}));
  }));
  router.post('/report-core/imports/file-preview',upload.single('file'),asyncRoute(async(req,res)=>{
    if(req.actor.role!=='teacher')fail(403,'无导入权限');
    const term=await getTerm(req.app.locals.pool,req.actor.schoolId,req.body.termId);
    if(!req.file)fail(422,'请选择Excel文件');
    if(req.body.kind&&req.body.kind!=='ACADEMIC')fail(403,'教师仅可上传综合成绩及体测');
    res.setHeader('Cache-Control','private, no-store');
    return ok(res,await require('../services/reportCoreV2ImportReview').reviewV2Workbook({...context(req),termId:term.id,buffer:req.file.buffer,command:command(req)}));
  }));
  router.get('/report-core/term-state',asyncRoute(async(req,res)=>{
    const term=await getTerm(req.app.locals.pool,req.actor.schoolId,req.query.termId);
    ok(res,{schemaVersion:term.evaluation_config.schemaVersion||'CORE_V1',phase:term.business_phase,collectionCutoff:require('../services/reportCorePolicy').collectionCutoff(term).toISOString(),dataRevision:String(term.data_revision||0),rosterRevision:String(term.roster_revision||0)});
  }));
}
module.exports={mountV2};
