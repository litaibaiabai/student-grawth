const crypto = require('node:crypto');
const path = require('node:path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { getTerm, withMutation, addSource, parse } = require('./reportCoreStore');
const { fail, stableHash, getSchoolMonthBounds, schoolDayStart, collectionCutoff } = require('./reportCorePolicy');
const { assignments } = require('./authorizationService');
const { isV2, catalog } = require('./reportCoreV2Policy');
const { encryptToken, decryptToken, tokenHash } = require('./cardCredentials');
const { monthsOf } = require('./termDates');

const {subjects}=require('./semesterCardPolicy');
const subjectByCode = new Map(subjects.map(s => [s.subjectCode, s]));
const courseKey = a => `${a.grade}:${a.class_no}:${a.subject_code}`;
const quotaKey = (actor, termId, monthKey, a) => ['COURSE_QUOTA', actor.schoolId, String(termId), monthKey, courseKey(a)];
const schoolMonth = date => new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit' }).format(date);
const teacherOnly = actor => { if (actor.role !== 'teacher') fail(403, '仅教师可领取本人任教课程卡片'); };
const managerOnly = actor => { if (actor.role !== 'manager') fail(403, '仅管理员可配置学科月额度'); };
function checkTerm(term) { if (!isV2(term.evaluation_config)) fail(422, '请选择六育 V2 学期'); }
function checkMonth(term, monthKey) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey || '') || !monthsOf(term).includes(monthKey)) fail(422, '月份不在当前学期内');
}
function available(row, now) { return row.status === 'UNUSED' && +row.valid_from <= +now && +now < +row.valid_until; }
function cardState(row, now) {
  if (row.status === 'USED') return 'used';
  if (row.status !== 'UNUSED') return 'voided';
  return available(row, now) ? 'available' : +row.valid_from > +now ? 'future' : 'expired';
}
function resolveCourseCardQuotas(config) {
  const defaultMonthlyTotal = config.courseCardDefaultQuota ?? 100;
  const bySubject = new Map(subjects.map(({ subjectCode }) => {
    const monthlyTotal = config.courseCardQuotas?.[subjectCode] ?? null;
    return [subjectCode, { monthlyTotal, effectiveMonthlyTotal:monthlyTotal ?? defaultMonthlyTotal, usesDefault:monthlyTotal === null }];
  }));
  return { defaultMonthlyTotal, bySubject };
}
async function getCourseCardSettings({ pool, actor, termId }) {
  managerOnly(actor);
  const term = await getTerm(pool, actor.schoolId, termId); checkTerm(term);
  const [counts] = await pool.query("SELECT a.subject_code,COUNT(*) courses,COUNT(DISTINCT a.teacher_id) teachers FROM teacher_teaching_assignment a JOIN users u ON u.school_id=a.school_id AND u.id=a.teacher_id WHERE a.school_id=? AND a.term_id=? AND a.enabled=1 AND u.status=0 GROUP BY a.subject_code", [actor.schoolId, termId]);
  const resolved = resolveCourseCardQuotas(term.evaluation_config);
  return {
    revision:String(term.config_version),
    defaultMonthlyTotal:resolved.defaultMonthlyTotal,
    canEdit:term.release_status === 'IDLE' && term.business_phase === 'COLLECTING',
    subjects:subjects.map(s => ({
      subjectCode:s.subjectCode, subjectName:s.subjectName,
      monthlyTotal:resolved.bySubject.get(s.subjectCode).monthlyTotal,
      effectiveMonthlyTotal:resolved.bySubject.get(s.subjectCode).effectiveMonthlyTotal,
      courseCount:Number(counts.find(c => c.subject_code === s.subjectCode)?.courses || 0),
      teacherCount:Number(counts.find(c => c.subject_code === s.subjectCode)?.teachers || 0),
    })),
  };
}
async function saveCourseCardSettings({ pool, actor, termId, expectedRevision, defaultMonthlyTotal, quotas, command }) {
  managerOnly(actor);
  if (defaultMonthlyTotal !== undefined && (!Number.isInteger(defaultMonthlyTotal) || defaultMonthlyTotal < 0 || defaultMonthlyTotal > 10000)) fail(422, '请填写默认每班每月 0–10000 的整数张数');
  if (!quotas || typeof quotas !== 'object' || Array.isArray(quotas) || Object.entries(quotas).some(([code, total]) => !subjectByCode.has(code) || !Number.isInteger(total) || total < 0 || total > 10000)) fail(422, '请填写各学科每班每月 0–10000 的整数张数');
  return withMutation({ pool, actor, termId, command, action:'course-card-settings', termLock:'exclusive' }, async (c, term) => {
    checkTerm(term);
    if (String(expectedRevision) !== String(term.config_version)) fail(409, '学科额度已被修改，请刷新后重试');
    const beforeDefault = resolveCourseCardQuotas(term.evaluation_config).defaultMonthlyTotal;
    const config = { ...term.evaluation_config, courseCardDefaultQuota:defaultMonthlyTotal ?? beforeDefault, courseCardQuotas:quotas };
    await c.query('UPDATE academic_year SET evaluation_config=?,config_version=CAST(CAST(config_version AS UNSIGNED)+1 AS CHAR) WHERE school_id=? AND id=?', [JSON.stringify(config), actor.schoolId, termId]);
    await addSource(c, { schoolId:actor.schoolId, termId, actorId:actor.id, kind:'AUDIT', status:'COMMITTED', key:['COURSE_CARD_SETTINGS',actor.id,command.requestKey], payload:{ action:'COURSE_CARD_SETTINGS', before:term.evaluation_config.courseCardQuotas || {}, after:quotas, beforeDefaultMonthlyTotal:beforeDefault, afterDefaultMonthlyTotal:config.courseCardDefaultQuota } });
    return { result:{ revision:String(BigInt(term.config_version)+1n) } };
  });
}
// A course/month budget belongs to the class, not the teacher. The earliest
// persisted batch freezes the budget, including pre-upgrade teacher-keyed batches.
async function courseQuotas(c, schoolId, termId, monthKey, a) {
  const [rows] = await c.query("SELECT * FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind='QUOTA' AND month_key=? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.mode'))='COURSE_SUBJECT' AND JSON_EXTRACT(payload_json,'$.grade')=? AND JSON_EXTRACT(payload_json,'$.classNo')=? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.subjectCode'))=? ORDER BY id", [schoolId,termId,monthKey,a.grade,a.class_no,a.subject_code]);
  return rows;
}
async function adoptCourseQuota(c, schoolId, termId, monthKey, a, ownerId, forceRotate=false) {
  const quotas = await courseQuotas(c,schoolId,termId,monthKey,a);
  if (!quotas.length) return false;
  const budget = Number(parse(quotas[0].payload_json).quotaTotal);
  const [rows] = await c.query("SELECT * FROM evaluation_source_record WHERE school_id=? AND parent_id IN (?) AND record_kind='CARD' ORDER BY id FOR UPDATE",[schoolId,quotas.map(q=>q.id)]);
  let remaining = Math.max(0,budget-rows.filter(r=>r.status==='USED').length);
  for (const row of rows) {
    if (row.status !== 'UNUSED') continue;
    if (remaining-- <= 0) {
      await c.query("UPDATE evaluation_source_record SET status='VOID',revision=revision+1 WHERE school_id=? AND id=?",[schoolId,row.id]);
    } else if (forceRotate || String(row.owner_teacher_id) !== String(ownerId)) {
      const token = crypto.randomBytes(32).toString('base64url');
      await c.query('UPDATE evaluation_source_record SET owner_teacher_id=?,token_hash=?,token_ciphertext=?,revision=revision+1 WHERE school_id=? AND id=?',[ownerId,tokenHash(token),encryptToken(token,`CORE_V1:${schoolId}:${row.parent_id}:${row.record_ordinal}`),schoolId,row.id]);
    }
  }
  return true;
}
async function replaceCourseQuotaOwners(c, {schoolId,termId,grade,classNo,before,after}) {
  const old = new Map(before.map(a=>[a.subject_code,String(a.teacher_id)]));
  const next = new Map(after.map(a=>[a.subjectCode,String(a.teacherId)]));
  for (const code of new Set([...old.keys(),...next.keys()])) {
    if (old.get(code) === next.get(code)) continue;
    const [months] = await c.query("SELECT DISTINCT month_key FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind='QUOTA' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.mode'))='COURSE_SUBJECT' AND JSON_EXTRACT(payload_json,'$.grade')=? AND JSON_EXTRACT(payload_json,'$.classNo')=? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.subjectCode'))=?",[schoolId,termId,grade,classNo,code]);
    for (const {month_key} of months) await adoptCourseQuota(c,schoolId,termId,month_key,{grade,class_no:classNo,subject_code:code},next.get(code)||null,true);
  }
}
async function semesterQuotas(c,schoolId,termId){return(await c.query("SELECT id,payload_json FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind='QUOTA' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.mode')) IN ('COURSE_SUBJECT','COURSE_SEMESTER') ORDER BY id",[schoolId,termId]))[0];}
async function listCourseCards({pool,actor,termId,now=new Date()}){
 teacherOnly(actor);const term=await getTerm(pool,actor.schoolId,termId);checkTerm(term);
 const quotas=await semesterQuotas(pool,actor.schoolId,termId),state=require('./semesterCardPolicy').semesterState(term.evaluation_config);
 const initializationStatus=state.status==='DRAFT'&&quotas.length?'LEGACY_LOCKED':state.status;
 if(initializationStatus==='DRAFT')return{initializationStatus,courses:[]};
 const teaching=(await assignments(actor,termId,pool)).filter(a=>subjectByCode.has(a.subject_code));
 const [stats]=await pool.query("SELECT parent_id,COUNT(*) total,SUM(status='USED') used,SUM(status='UNUSED' AND valid_from<=? AND valid_until>?) available FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind='CARD' GROUP BY parent_id",[now,now,actor.schoolId,termId]);
 const courses=teaching.map(a=>{const subject=subjectByCode.get(a.subject_code),matching=quotas.filter(q=>{const p=parse(q.payload_json);return p.grade===a.grade&&p.classNo===a.class_no&&p.subjectCode===a.subject_code;});const ids=new Set(matching.map(q=>String(q.id))),count=stats.filter(r=>ids.has(String(r.parent_id))).reduce((n,r)=>({total:n.total+Number(r.total),used:n.used+Number(r.used),available:n.available+Number(r.available)}),{total:0,used:0,available:0});return{key:courseKey(a),grade:a.grade,classNo:a.class_no,subjectCode:a.subject_code,subjectName:subject.subjectName,quotaId:matching[0]?String(matching[0].id):null,...count};});
 return{initializationStatus,courses,termName:term.term_name};
}
async function readScope({pool,actor,termId,grade,classNo,subjectCode}){
 teacherOnly(actor);const term=await getTerm(pool,actor.schoolId,termId);checkTerm(term);
 const teaching=await assignments(actor,termId,pool),assignment=teaching.find(a=>a.grade===Number(grade)&&a.class_no===Number(classNo)&&a.subject_code===subjectCode);
 if(!assignment||!subjectByCode.has(subjectCode))fail(403,'不在当前任教课程范围');
 const all=await semesterQuotas(pool,actor.schoolId,termId),state=require('./semesterCardPolicy').semesterState(term.evaluation_config);
 if(state.status==='DRAFT'&&!all.length)fail(422,'等待管理员初始化本学期卡片');
 const quotas=all.filter(q=>{const p=parse(q.payload_json);return p.grade===Number(grade)&&p.classNo===Number(classNo)&&p.subjectCode===subjectCode;});
 return{quotas,subject:subjectByCode.get(subjectCode),grade:Number(grade),classNo:Number(classNo),termName:term.term_name};
}
async function scopeRows(args) {
  const scope = await readScope(args);
  const [rows] = scope.quotas.length ? await args.pool.query("SELECT s.*,u.real_name teacher_name FROM evaluation_source_record s LEFT JOIN users u ON u.school_id=s.school_id AND u.id=s.owner_teacher_id WHERE s.school_id=? AND s.parent_id IN (?) AND (s.status='USED' OR s.owner_teacher_id=?) AND s.record_kind='CARD' ORDER BY s.record_ordinal",[args.actor.schoolId,scope.quotas.map(q=>q.id),args.actor.id]) : [[]];
  return { ...scope, rows };
}
async function publicCard(row, now) {
  const canClaim = available(row, now);
  const token = canClaim ? decryptToken(row.token_ciphertext, `CORE_V1:${row.school_id}:${row.parent_id}:${row.record_ordinal}`) : null;
  const base = (process.env.PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/$/, '');
  const claimUrl = token ? `${base}/#/student/materials?card=${encodeURIComponent(token)}` : null;
  return { id:String(row.id), serial:row.record_ordinal, status:cardState(row,now), claimUrl,
    qrDataUrl:claimUrl ? await QRCode.toDataURL(claimUrl,{width:240,margin:3,errorCorrectionLevel:'M'}) : null,
    validUntil:row.valid_until };
}
async function getCourseCardPage(args) {
  const { now=new Date(), status='all', q='', page=1 } = args;
  if (!['all','available','used','expired','future','voided'].includes(status)) fail(422,'卡片状态不合法');
  const number = Number(page);
  if (!Number.isInteger(number) || number<1) fail(422,'页码不合法');
  const scope = await scopeRows(args);
  const query = String(q).trim();
  if (query.length>64) fail(422,'卡号搜索最多64个字符');
  const rows = scope.rows.filter(r => (status==='all' || cardState(r,now)===status) && (!query || String(r.id).includes(query) || String(r.record_ordinal).includes(query)));
  const pages = Math.max(1,Math.ceil(rows.length/24)), current = Math.min(number,pages);
  return { total:rows.length, page:current, pageSize:24, pages, rows:await Promise.all(rows.slice((current-1)*24,current*24).map(r=>publicCard(r,now))) };
}
async function getCourseCardPrint(args) {
  const now=args.now || new Date(), scope=await scopeRows(args);
  const rows=scope.rows.filter(r=>available(r,now));
  if (!rows.length) fail(422,'当前课程没有可打印的有效卡片');
  return { title:`${scope.grade}年级${scope.classNo}班 · ${scope.subject.subjectName}`, termName:scope.termName,
    rows:await Promise.all(rows.map(r=>publicCard(r,now))) };
}
async function buildCourseCardPdf(args) {
  const now=args.now || new Date(), scope=await scopeRows(args);
  const rows=scope.rows.filter(r=>available(r,now));
  if (!rows.length) fail(422,'当前课程没有可下载的有效卡片');
  const doc = new PDFDocument({ size:'A4', margin:28 });
  setImmediate(async () => {
    try {
      doc.font(path.join(__dirname,'../assets/fonts/NotoSansCJKsc-Regular.otf'));
      for (let i=0;i<rows.length;i++) {
        if (i && i%10===0) doc.addPage();
        const card=await publicCard(rows[i],now), x=28+(i%2)*272, y=28+Math.floor((i%10)/2)*155;
        doc.roundedRect(x,y,265,145,8).strokeColor('#c6d3c8').stroke();
        doc.image(Buffer.from(card.qrDataUrl.split(',')[1],'base64'),x+8,y+25,{width:108});
        doc.fillColor('#214b3c').fontSize(12).text(`${scope.subject.subjectName}积分卡`,x+120,y+16,{width:136});
        doc.fontSize(9).text(`${scope.grade}年级${scope.classNo}班\n${rows[i].teacher_name}\n${scope.termName} · 每卡 1 分\n卡号 ${card.id}`,x+120,y+43,{width:136,lineGap:5});
        doc.fontSize(8).fillColor('#65776a').text('本班学生扫码领取 · 仅可领取一次',x+12,y+127,{width:240,align:'center'});
      }
      doc.end();
    } catch (error) { doc.destroy(error); }
  });
  return { stream:doc, cardCount:rows.length, filename:`${scope.grade}年级${scope.classNo}班-${scope.subject.subjectName}-${scope.termName}积分卡.pdf` };
}
module.exports = { replaceCourseQuotaOwners, getCourseCardSettings, saveCourseCardSettings,  listCourseCards, getCourseCardPage, getCourseCardPrint, buildCourseCardPdf };
