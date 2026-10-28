const jwt=require('jsonwebtoken');const {resolveActorContext}=require('../services/authorizationService');const {fail}=require('../services/reportCorePolicy');
function secret(){if(!process.env.JWT_SECRET)throw Error('JWT_SECRET is required');return process.env.JWT_SECRET;}
function signToken(user){return jwt.sign({id:String(user.id),schoolId:String(user.schoolId||user.school_id),tokenVersion:user.tokenVersion||user.token_version,role:user.role},secret(),{expiresIn:'8h',issuer:'report-core-v1'});}
async function requireAuth(req,res,next){try{const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)fail(401,'请登录');let p;try{p=jwt.verify(token,secret(),{issuer:'report-core-v1'})}catch{fail(401,'登录已失效')};if(p.schoolId!==String(req.app.locals.schoolId))fail(401,'学校不符');req.actor=await resolveActorContext({userId:p.id,tokenVersion:p.tokenVersion,schoolId:p.schoolId},req.app.locals.pool);req.user=req.actor;next()}catch(e){next(e)}}
const requireRole=(...roles)=>(req,res,next)=>{try{if(!roles.includes(req.actor.role))fail(403,'无此操作权限');next()}catch(e){next(e)}};
module.exports={requireAuth,requireRole,signToken,get JWT_SECRET(){return process.env.JWT_SECRET}};
