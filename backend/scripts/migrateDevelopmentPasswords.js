const fs=require('node:fs/promises'),path=require('node:path'),bcrypt=require('bcrypt');
const {createDbPool}=require('../db');
async function migrateDevelopmentPasswords({apply=false}={}){
  if(process.env.NODE_ENV==='production')throw Error('Development plaintext passwords are disabled in production');
  const pool=createDbPool({database:'student_growth'}),c=await pool.getConnection();
  try{
    const [columns]=await c.query("SHOW COLUMNS FROM users LIKE 'password_plain'");
    if(columns.length&&(columns[0].Type!=='varchar(255)'||columns[0].Null!=='YES'))throw Error('Conflicting password_plain column');
    const [users]=await c.query('SELECT id,school_id,username,password FROM users');
    const known=new Set(['admin','teacher_lin','teacher_xu','20260401']),verified=[];
    for(const u of users)if(String(u.school_id)==='1'&&known.has(u.username)&&await bcrypt.compare('Demo-pass-2026',u.password))verified.push(u);
    if(!apply)return{mode:'check',columnExists:!!columns.length,verifiedDemoAccounts:verified.length,unknownPasswords:users.length-verified.length};
    const directory=path.resolve('output/report-core/development-passwords');await fs.mkdir(directory,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(directory,'users-before-'+Date.now()+'.json'),JSON.stringify(users,null,2),{mode:0o600});
    if(!columns.length)await c.query("ALTER TABLE users ADD COLUMN password_plain VARCHAR(255) NULL DEFAULT NULL COMMENT '仅开发调试查看；登录使用password哈希' AFTER password");
    await c.beginTransaction();
    try{for(const u of verified)await c.query('UPDATE users SET password_plain=? WHERE school_id=? AND id=? AND password=?',['Demo-pass-2026',u.school_id,u.id,u.password]);await c.commit();}catch(e){await c.rollback();throw e;}
    return{mode:'apply',column:'users.password_plain',verifiedDemoAccounts:verified.length,unknownPasswords:users.length-verified.length};
  }finally{c.release();await pool.end();}
}
if(require.main===module)migrateDevelopmentPasswords({apply:process.argv.includes('--apply')}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={migrateDevelopmentPasswords};
