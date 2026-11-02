const { requireRole } = require('../middleware/auth');
const { getAdminStatistics, getStudentRewardRecords } = require('../services/reportCoreAdminStatistics');

function mountStatistics(router,{asyncRoute,ok}) {
  const context=req=>({pool:req.app.locals.pool,actor:req.actor});
  router.get('/admin/report-core/statistics',requireRole('manager'),asyncRoute(async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    ok(res,await getAdminStatistics({...req.query,...context(req)}));
  }));
  router.get('/admin/report-core/statistics/rewards/:studentId',requireRole('manager'),asyncRoute(async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    ok(res,await getStudentRewardRecords({...req.query,studentId:req.params.studentId,...context(req)}));
  }));
}
module.exports={mountStatistics};
