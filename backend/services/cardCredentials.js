const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');

function printKey() {
  const raw=process.env.CARD_PRINT_KEY || '';
  const key=Buffer.from(raw,/^[a-f\d]{64}$/i.test(raw)?'hex':'base64');
  if(key.length!==32) throw new AppError(503,'打印服务未配置，请联系系统维护人员；修复后会自动恢复生成',503);
  return key;
}
function encryptToken(token, context) {
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',printKey(),iv);
  cipher.setAAD(Buffer.from(context));
  const data=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),data.toString('base64')].join('.');
}
function decryptToken(value, context) {
  const [version,iv,tag,data]=String(value||'').split('.');
  if(version!=='v1'||!iv||!tag||!data) throw new AppError(500,'打印凭证不可恢复，请联系系统维护人员',500);
  const cipher=crypto.createDecipheriv('aes-256-gcm',printKey(),Buffer.from(iv,'base64'));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([cipher.update(Buffer.from(data,'base64')),cipher.final()]).toString('utf8');
}
function credentialContext(card) { return `${card.school_id}:${card.allocation_id}:${card.serial_no}`; }
const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
module.exports={printKey,encryptToken,decryptToken,credentialContext,tokenHash};
