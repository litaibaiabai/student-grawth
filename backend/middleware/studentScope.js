const {AppError}=require('./errorHandler');
const {pool}=require('../db');
// Shared read/write guard: school boundary always applies; teachers additionally need class scope.
async function requireStudentScope(user,studentId,connection=pool){
 const [[student]]=await connection.query("SELECT id,school_id,grade,class_no,status FROM users WHERE id=? AND role='student'",[studentId]);
 if(!student)throw new AppError(404,'目标学生不存在',404);
 if(Number(student.school_id)!==Number(user.schoolId||user.school_id)||user.role==='student'&&Number(user.id)!==Number(student.id))throw new AppError(403,'禁止跨校或读取其他学生资料',403);
 if(user.role==='teacher'){
  let classes=user.classes;if(typeof classes==='string'){try{classes=JSON.parse(classes)}catch{classes=[]}}
  if(!Array.isArray(classes)||!classes.some(c=>Number(c.grade)===Number(student.grade)&&Number(c.class_no)===Number(student.class_no)))throw new AppError(403,'学生不在当前教师任教班级范围内',403);
 }
 return student;
}
function classFilter(user,alias,params){
 if(user.role!=='teacher')return '';
 let classes=user.classes;if(typeof classes==='string'){try{classes=JSON.parse(classes)}catch{classes=[]}}
 if(!Array.isArray(classes)||!classes.length)return ' AND 1=0';
 classes.forEach(c=>params.push(Number(c.grade),Number(c.class_no)));
 return ' AND ('+classes.map(()=>`(${alias}.grade=? AND ${alias}.class_no=?)`).join(' OR ')+')';
}
module.exports={requireStudentScope,classFilter};
