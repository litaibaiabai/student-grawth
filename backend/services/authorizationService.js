const {fail,subjectFor}=require('./reportCorePolicy');
async function resolveActorContext({userId,tokenVersion,schoolId},connection){const [[u]]=await connection.query('SELECT id,school_id,role,status,token_version FROM users WHERE id=?',[userId]);if(!u||u.status!==0||u.token_version!==tokenVersion||(schoolId&&String(u.school_id)!==String(schoolId)))fail(401,'账号或登录已失效');return {id:String(u.id),schoolId:String(u.school_id),role:u.role,tokenVersion:u.token_version};}
async function assignments(actor,termId,connection){return (await connection.query('SELECT * FROM teacher_teaching_assignment WHERE school_id=? AND term_id=? AND teacher_id=? AND enabled=1',[actor.schoolId,termId,actor.id]))[0];}
async function assertScope({actor,studentKey,action='read',fields=[]},connection){
 if(actor.schoolId!==String(studentKey.schoolId))fail(403,'学校范围不符');
 const [[e]]=await connection.query('SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?',[actor.schoolId,studentKey.termId,studentKey.studentId]);if(!e)fail(404,'学生学期记录不存在');
 if(actor.role==='student'){if(actor.id!==String(studentKey.studentId))fail(403,'仅可操作本人');if(['report','read','form','material'].includes(action))return {allowedFields:fields,evaluation:e,head:false};fail(403,'需要教师权限');}
 if(actor.role==='manager'){if(['report','confirm','form','material'].includes(action))fail(403,'管理员无权访问报告正文');return {allowedFields:fields,evaluation:e,head:false};}
 const all=await assignments(actor,studentKey.termId,connection);const rows=all.filter(a=>a.grade===e.grade_snapshot&&a.class_no===e.class_no_snapshot);if(!rows.length)fail(403,'不在任教范围');const head=rows.some(a=>a.is_head_teacher===1);if(['report','confirm'].includes(action)&&!head)fail(403,'仅班主任可查看完整报告');
 const allowedFields=fields.filter(f=>head||subjectFor(f)==='CONDUCT'||rows.some(a=>a.subject_code===subjectFor(f)));if(allowedFields.length!==fields.length)fail(403,'不在学科字段范围');return {allowedFields,evaluation:e,head,assignments:rows};
}
module.exports={resolveActorContext,assertScope,assignments};
