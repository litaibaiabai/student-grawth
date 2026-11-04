const multer=require('multer');
const {requireRole}=require('../middleware/auth');
const {stableHash,fail}=require('../services/core/reportCorePolicy');
const service=require('../services/registry/reportCoreRegistry');
const {buildRegistryTemplate,registryColumns}=require('../services/registry/registryWorkbook');
function mountRegistry(router,{asyncRoute,ok}){
 const base='/admin/report-core/registry',guard=requireRole('manager');
 const context=req=>({pool:req.app.locals.pool,actor:req.actor,now:req.app.locals.clock()});
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:3}});
 router.use(base,guard,(req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
 router.get(base+'/template',asyncRoute(async(req,res)=>res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="semester-registry.xlsx"'}).send(buildRegistryTemplate())));
 router.get(base+'/columns',(req,res)=>ok(res,registryColumns));
 router.post(base+'/preview',upload.single('file'),asyncRoute(async(req,res)=>{if(!req.file||!req.file.originalname.toLowerCase().endsWith('.xlsx'))fail(422,'请选择xlsx初始化工作簿');ok(res,await service.previewRegistry({...context(req),buffer:req.file.buffer}));}));
 router.post(base+'/commit',asyncRoute(async(req,res)=>ok(res,await service.commitRegistry({...context(req),previewToken:req.body.previewToken,command:{requestKey:req.body.requestKey,payloadHash:stableHash(req.body)}}))));
 router.get(base+'/relations',asyncRoute(async(req,res)=>ok(res,await service.listRegistryRelations({...req.query,...context(req)}))));
}
module.exports={mountRegistry};
