const crypto=require('node:crypto');
const {fail}=require('./reportCorePolicy');
const key=()=>{if(!process.env.JWT_SECRET)throw Error('JWT_SECRET required');return crypto.createHash('sha256').update('registry-preview-v1:'+process.env.JWT_SECRET).digest();};
function sealRegistryPreview(payload,{actor,now=new Date()}){
 const bytes=Buffer.from(JSON.stringify({...payload,schoolId:actor.schoolId,actorId:actor.id,tokenVersion:actor.tokenVersion,expiresAt:+now+30*60*1000}));
 if(bytes.length>2*1024*1024)fail(422,'工作簿数据过大，请缩小导入范围');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from('REGISTRY_V1'));
 return Buffer.concat([iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]).toString('base64url');
}
function openRegistryPreview(token,{actor,now=new Date()}){
 if(typeof token!=='string'||token.length>3*1024*1024)fail(422,'导入预览无效');
 let p;try{const b=Buffer.from(token,'base64url');if(b.length<29)throw Error();const cipher=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));cipher.setAAD(Buffer.from('REGISTRY_V1'));cipher.setAuthTag(b.subarray(-16));p=JSON.parse(Buffer.concat([cipher.update(b.subarray(12,-16)),cipher.final()]).toString());}catch{fail(422,'导入预览已损坏，请重新上传');}
 if(p.schoolId!==actor.schoolId||p.actorId!==actor.id||p.tokenVersion!==actor.tokenVersion)fail(403,'仅原学校的预览操作者可以提交');
 if(!Number.isFinite(p.expiresAt)||+now>=p.expiresAt)fail(409,'导入预览已过期，请重新上传');return p;
}
module.exports={sealRegistryPreview,openRegistryPreview};
