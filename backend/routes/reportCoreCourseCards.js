const service = require('../services/reportCoreCourseCards');
const { stableHash } = require('../services/reportCorePolicy');
function mountCourseCards(router, { asyncRoute, ok }) {
  const semester=require('../services/reportCoreSemesterCards');
  const {requireRole}=require('../middleware/auth');
  const context = req => ({ pool:req.app.locals.pool, actor:req.actor, now:req.app.locals.clock() });
  const read = (url, method) => router.get(url, asyncRoute(async(req,res) => {
    res.setHeader('Cache-Control','private, no-store');
    ok(res,await service[method]({...req.query,...context(req)}));
  }));
  router.get('/admin/report-core/semester-card-settings',requireRole('manager'),asyncRoute(async(req,res)=>ok(res,await semester.getSemesterCardSettings({...req.query,...context(req)}))));
  for(const[verb,url,method]of [['put','/admin/report-core/semester-card-settings','saveSemesterCardSettings'],['post','/admin/report-core/semester-cards/initialize','initializeSemesterCards']])router[verb](url,requireRole('manager'),asyncRoute(async(req,res)=>{res.setHeader('Cache-Control','private, no-store');ok(res,await semester[method]({...req.body,...context(req),command:{requestKey:req.body.requestKey,payloadHash:stableHash(req.body)}}));}));
  read('/report-core/course-card-settings','getCourseCardSettings');
  read('/report-core/course-cards','listCourseCards');
  read('/report-core/course-cards/preview','getCourseCardPage');
  read('/report-core/course-cards/print','getCourseCardPrint');
  for (const [verb,url,method] of [['put','/report-core/course-card-settings','saveCourseCardSettings']])
    router[verb](url,asyncRoute(async(req,res) => {
      res.setHeader('Cache-Control','private, no-store');
      ok(res,await service[method]({...req.body,...context(req),command:{requestKey:req.body.requestKey,payloadHash:stableHash(req.body)}}));
    }));
  router.get('/report-core/course-cards/pdf',asyncRoute(async(req,res) => {
    const file=await service.buildCourseCardPdf({...req.query,...context(req)});
    res.set({'Cache-Control':'private, no-store','Content-Type':'application/pdf','Content-Disposition':`attachment; filename="course-cards.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`});
    file.stream.on('error',()=>res.destroy());
    res.on('close',()=>file.stream.destroy());
    file.stream.pipe(res);
  }));
}
module.exports={mountCourseCards};
