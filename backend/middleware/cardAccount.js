const {pool}=require('../db');
const {fail}=require('../utils/response');

async function requireCardAccount(req,res,next){
  try{
    const [[user]]=await pool.query('SELECT id,school_id,role,status FROM users WHERE id=? AND school_id=?',[req.user.id||req.user.userId,req.user.schoolId]);
    if(!user||Number(user.status)!==0||user.role!==req.user.role) return fail(res,403,'账号已停用、身份已变更或不属于本校，请重新登录',403);
    next();
  }catch(e){next(e);}
}
module.exports={requireCardAccount};
