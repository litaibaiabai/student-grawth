// Explicit, optional development column; never used to authenticate users.
const crypto=require('node:crypto');
async function hasColumn(c){return (await c.query("SHOW COLUMNS FROM users LIKE 'password_plain'"))[0].length===1;}
function key(){if(!process.env.JWT_SECRET)throw Error('JWT_SECRET is required');return crypto.createHash('sha256').update('development-password:'+process.env.JWT_SECRET).digest();}
async function previewPassword(c,schoolId,username,password){
  if(process.env.NODE_ENV==='production'||!await hasColumn(c))return undefined;
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from(`${schoolId}:${username}`));
  const value=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),value.toString('base64')].join('.');
}
function readPreview(schoolId,username,value){
  if(!value||process.env.NODE_ENV==='production')return null;
  const [version,iv,tag,data]=value.split('.');if(version!=='v1')throw Error('Invalid development credential envelope');
  const cipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64'));
  cipher.setAAD(Buffer.from(`${schoolId}:${username}`));cipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([cipher.update(Buffer.from(data,'base64')),cipher.final()]).toString('utf8');
}
async function writePassword(c,schoolId,id,password){
  if(await hasColumn(c))await c.query('UPDATE users SET password_plain=? WHERE school_id=? AND id=?',[process.env.NODE_ENV==='production'?null:password,schoolId,id]);
}
module.exports={previewPassword,readPreview,writePassword};
