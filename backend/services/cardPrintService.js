const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const {pool} = require('../db');
const {AppError} = require('../middleware/errorHandler');
const {json,withSchoolLock} = require('./cardAllocationService');
const {validateMonth,DIMENSION_NAMES} = require('./cardRules');
const {decryptToken,credentialContext} = require('./cardCredentials');

const TEMPLATE = 'V2';
const colors = {D:'#7952A8',Z:'#236BB0',T:'#188567',M:'#C24F75',L:'#B87920',G:'#55717D'};
const printRoot = () => path.resolve(process.env.CARD_PRINT_DIR || path.join(__dirname,'../private/card-prints'));
function dto(row) {
  const teachers=json(row.manifest_json,[]);
  return {id:row.id,monthKey:row.month_key,status:row.status,teacherCount:teachers.length,
    cardCount:teachers.reduce((n,t)=>n+Number(t.total),0),teachers,issues:json(row.issues_json,[]),errorMessage:row.error_message};
}
async function loadPack(schoolId,id) {
  const [[row]]=await pool.query('SELECT * FROM card_print_pack WHERE id=?',[id]);
  if(!row) throw new AppError(404,'打印资料不存在',404);
  if(Number(row.school_id)!==Number(schoolId)) throw new AppError(403,'无权访问其他学校的打印资料',403);
  return row;
}
async function createPrintPack({schoolId,monthKey,actorId}) {
  validateMonth(monthKey);
  return withSchoolLock(schoolId,async c=>{
    const [rows]=await c.query("SELECT * FROM card_allocation WHERE school_id=? AND month_key=? AND status='READY' ORDER BY teacher_id,id",[schoolId,monthKey]);
    if(!rows.length) throw new AppError(409,'该月暂无已就绪的卡片，请先处理发卡异常',409);
    const manifest=rows.map(r=>({allocationId:r.id,teacherId:r.teacher_id,teacherName:r.teacher_name,subjectName:r.subject_name,total:r.monthly_total,counts:json(r.counts_json)}));
    const [pending]=await c.query(`SELECT u.id teacherId,u.real_name teacherName,COALESCE(a.error_message,'当月卡片尚未就绪') message
      FROM users u LEFT JOIN card_allocation a ON a.teacher_id=u.id AND a.school_id=u.school_id AND a.month_key=?
      WHERE u.school_id=? AND u.role='teacher' AND u.status=0 AND (a.id IS NULL OR a.status<>'READY') ORDER BY u.id`,[monthKey,schoolId]);
    const [errors]=await c.query(`SELECT i.teacher_id teacherId,u.real_name teacherName,i.reason_message message FROM card_generation_issue i
      LEFT JOIN users u ON u.id=i.teacher_id WHERE i.school_id=? AND i.month_key=? AND i.resolved=0 ORDER BY i.teacher_id,i.reason_code`,[schoolId,monthKey]);
    const readyIds=new Set(manifest.map(t=>Number(t.teacherId)));
    const issues=[...pending,...errors.filter(i=>!readyIds.has(Number(i.teacherId)))].filter((i,n,list)=>list.findIndex(v=>Number(v.teacherId)===Number(i.teacherId)&&v.message===i.message)===n);
    const hash=crypto.createHash('sha256').update(JSON.stringify({manifest,issues,template:TEMPLATE})).digest('hex');
    await c.query(`INSERT INTO card_print_pack(school_id,month_key,manifest_json,issues_json,manifest_hash,template_version,created_by)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,[schoolId,monthKey,JSON.stringify(manifest),JSON.stringify(issues),hash,TEMPLATE,actorId]);
    const [[row]]=await c.query('SELECT * FROM card_print_pack WHERE school_id=? AND month_key=? AND manifest_hash=? AND template_version=?',[schoolId,monthKey,hash,TEMPLATE]);
    if(row.status==='FAILED'){
      await c.query("UPDATE card_print_pack SET status='PENDING',error_message=NULL WHERE id=?",[row.id]);
      row.status='PENDING';row.error_message=null;
    }
    return dto(row);
  });
}
async function getPrintPack({schoolId,id}) {return dto(await loadPack(schoolId,id));}
async function downloadFile({schoolId,id}) {
  const row=await loadPack(schoolId,id);
  if(row.status!=='READY') throw new AppError(409,row.error_message||'打印资料正在准备，请稍后重试',409);
  try {await fs.access(row.file_path);} catch {
    await pool.query("UPDATE card_print_pack SET status='PENDING',error_message=NULL WHERE id=?",[id]);
    queuePrintPack(id);
    throw new AppError(409,'打印文件正在恢复，请稍后重新下载',409);
  }
  return {path:row.file_path,name:`evaluation-cards-${row.month_key}-${row.id}.pdf`};
}
function claimBase() {
  const value=process.env.FRONTEND_PUBLIC_URL||process.env.CORS_ORIGIN;
  let url;try{url=new URL(value);}catch{throw new Error('请配置可供学生访问的 FRONTEND_PUBLIC_URL');}
  if(!['http:','https:'].includes(url.protocol))throw new Error('FRONTEND_PUBLIC_URL 必须使用 http 或 https');
  url.hash='';url.search='';return url.toString().replace(/\/$/,'')+'/#/student/claim?token=';
}
async function writePdf(row,file,connection) {
  const doc=new PDFDocument({size:'A4',margin:32,autoFirstPage:false,info:{Title:`${row.month_key} 六育评价卡`,Author:'六育学生评价系统'}});
  const chunks=[];
  const complete=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.registerFont('Chinese',path.join(__dirname,'../assets/fonts/NotoSansCJKsc-Regular.otf')).font('Chinese');
  const teachers=json(row.manifest_json,[]),issues=json(row.issues_json,[]),base=claimBase();
  const text=(value,x,y,size=10,width=530,color='#243D34')=>doc.fontSize(size).fillColor(color).text(String(value),x,y,{width,lineGap:3});
  doc.addPage();
  text('六育评价卡 · 集中打印清单',32,40,22);
  text(`${row.month_key}  /  ${teachers.length} 位教师  /  ${teachers.reduce((n,t)=>n+Number(t.total),0)} 张卡`,32,82,12);
  text(`清单编号：${row.id}  /  版式：${row.template_version}`,32,103,9);
  text('请按教师分组分发；按实际大小（100%）单面打印。虚线为裁切参考。',32,116,10);
  text('学生扫码申领后，由教师选择一级、二级子类并审核，每张卡计 1 分。',32,138,10);
  let y=183;
  for(const t of teachers){
    if(y>730){doc.addPage();y=40;}
    text(`${t.teacherName} · ${t.subjectName}`,32,y,12,330);text(`${t.total} 张`,410,y,12,120);y+=26;
  }
  if(issues.length){
    if(y>670){doc.addPage();y=40;}
    y+=16;text(`未包含教师 / 异常（${issues.length} 项）`,32,y,14,530,'#A25120');y+=30;
    for(const i of issues){
      if(y>720){doc.addPage();y=40;}
      const label=`${i.teacherName|| (Number(i.teacherId)?'教师 '+i.teacherId:'校历')}：${i.message}`;
      text(label,32,y,10);y+=Math.max(26,doc.heightOfString(label,{width:530})+12);
    }
  }
  for(const teacher of teachers){
    const [cards]=await connection.query('SELECT * FROM reward_card WHERE school_id=? AND allocation_id=? ORDER BY serial_no',[row.school_id,teacher.allocationId]);
    if(cards.length!==Number(teacher.total))throw new Error('卡片数量不完整，请等待分配任务恢复');
    for(let i=0;i<cards.length;i++){
      if(i%8===0){doc.addPage();text(`${teacher.teacherName} · ${teacher.subjectName}`,32,25,15);text(`${row.month_key} / 共 ${teacher.total} 张 / 本组第 ${Math.floor(i/8)+1} 页`,32,51,9);}
      const card=cards[i],slot=i%8,x=32+(slot%2)*271.6,y=79+Math.floor(slot/2)*184,w=259.6,h=172;
      doc.save().lineWidth(.5).dash(3,{space:3}).strokeColor('#A7B8AF').rect(x,y,w,h).stroke().undash().restore();
      const color=colors[card.dimension_code];
      doc.rect(x+1,y+1,w-2,7).fill(color);
      doc.circle(x+20,y+31,5).fill(color);
      text(DIMENSION_NAMES[card.dimension_code]+'评价卡',x+32,y+18,17,w-45,color);
      const token=decryptToken(card.token_ciphertext,credentialContext(card));
      const qr=await QRCode.toBuffer(base+encodeURIComponent(token),{width:360,margin:4,errorCorrectionLevel:'M'});
      doc.image(qr,x+12,y+51,{width:96,height:96});
      text(teacher.teacherName,x+119,y+62,12,126);
      text(row.month_key,x+119,y+87,10,126);
      text('扫码申领 · 审核后 +1分',x+119,y+112,8,126);
      text(`卡号 ${card.allocation_id}-${card.serial_no}`,x+13,y+150,8,w-26,'#65766D');
    }
  }
  doc.end();
  const data=await complete;
  await fs.writeFile(file,data,{mode:0o600});
  return crypto.createHash('sha256').update(data).digest('hex');
}
async function renderPrintPack(id) {
  const c=await pool.getConnection(),lock=`card-print:${id}`;let acquired=false,temp;
  try{
    const [[l]]=await c.query('SELECT GET_LOCK(?,0) acquired',[lock]);acquired=Number(l.acquired)===1;if(!acquired)return;
    const [[row]]=await c.query('SELECT * FROM card_print_pack WHERE id=?',[id]);if(!row)return;
    if(row.status==='READY'&&row.file_path){try{await fs.access(row.file_path);return;}catch{}}
    await c.query("UPDATE card_print_pack SET status='PENDING',error_message=NULL WHERE id=?",[id]);
    const dir=path.join(printRoot(),String(row.school_id));await fs.mkdir(dir,{recursive:true,mode:0o700});
    const target=path.join(dir,`${id}.pdf`);temp=target+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
    const hash=await writePdf(row,temp,c);await fs.rename(temp,target);temp=null;
    await c.query("UPDATE card_print_pack SET status='READY',file_path=?,file_sha256=?,error_message=NULL WHERE id=?",[target,hash,id]);
  }catch(error){
    if(temp)await fs.rm(temp,{force:true}).catch(()=>{});
    // Renderer errors can contain private paths or credentials.
    await c.query("UPDATE card_print_pack SET status='FAILED',error_message='打印资料生成失败，请检查打印密钥、前端地址和字体配置后重试' WHERE id=?",[id]);
  }finally{if(acquired)await c.query('SELECT RELEASE_LOCK(?)',[lock]);c.release();}
}
const queued=new Set();
function queuePrintPack(id){if(queued.has(id))return;queued.add(id);setImmediate(()=>renderPrintPack(id).catch(()=>{}).finally(()=>queued.delete(id)));}
async function processPrintJobs(){
  const [rows]=await pool.query("SELECT id FROM card_print_pack WHERE status='PENDING' OR (status='FAILED' AND updated_at<DATE_SUB(NOW(),INTERVAL 1 MINUTE)) ORDER BY id LIMIT 5");
  for(const row of rows)await renderPrintPack(row.id);
}
module.exports={createPrintPack,getPrintPack,renderPrintPack,queuePrintPack,processPrintJobs,downloadFile};
