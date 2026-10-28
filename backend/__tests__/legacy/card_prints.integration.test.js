const {describe,test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const crypto=require('crypto');
const {pool}=require('../db');
const {migrateSubjectCards}=require('../migrations/20261026_subject_cards');
const {saveSubjectPolicy,reconcileMonth,setTeacherSubjects}=require('../services/cardAllocationService');
const {getMonthKey}=require('../utils/monthKey');
const {decryptToken,credentialContext}=require('../services/cardCredentials');
const {createPrintPack,renderPrintPack,getPrintPack}=require('../services/cardPrintService');
const {signToken}=require('../middleware/auth');
const app=require('../app');

describe('可恢复的集中PDF打印',()=>{
  let school,month,teacherId,waitingId,subjectId,manager,teacher,foreignManager,student,pack,server,base;
  before(async()=>{
    const c=await pool.getConnection();try{await migrateSubjectCards(c);}finally{c.release();}
    school=500000000+crypto.randomInt(10000000);month=getMonthKey();
    async function user(role,s=school,name='张明老师'){const [r]=await pool.query("INSERT INTO users(school_id,username,password,real_name,role) VALUES (?,?,'',?,?)",[s,crypto.randomBytes(12).toString('hex'),name,role]);return {id:r.insertId,token:signToken({id:r.insertId,school_id:s,role})};}
    manager=await user('manager');student=await user('student');teacher=await user('teacher');teacherId=teacher.id;waitingId=(await user('teacher',school,'待配置教师')).id;foreignManager=await user('manager',school+1);
    const [s]=await pool.query("INSERT INTO card_subject(school_id,subject_code,subject_name) VALUES (?,'CHINESE','语文')",[school]);subjectId=s.insertId;
    const [year,m]=month.split('-').map(Number);const end=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
    await pool.query("INSERT INTO academic_year(school_id,academic_year,semester,start_date,end_date,review_deadline_at) VALUES (?,?,1,?,?,DATE_ADD(?,INTERVAL 10 DAY))",[school,'PRINT-'+school,month+'-01',end,end+' 23:59:59']);
    await setTeacherSubjects({schoolId:school,teacherId,subjectIds:[subjectId],primarySubjectId:subjectId});
    await saveSubjectPolicy({schoolId:school,subjectId,monthlyTotal:6,ratios:{D:20,Z:20,T:20,M:20,L:10,G:10},actorId:manager.id});
    await reconcileMonth({schoolId:school});
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
  });
  after(async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r));await pool.end();});
  test('打印清单标明未就绪教师，可生成中文PDF且重复导出不增卡',async()=>{
    pack=await createPrintPack({schoolId:school,monthKey:month,actorId:manager.id});
    assert.equal(pack.teacherCount,1);assert.equal(pack.cardCount,6);assert.ok(pack.issues.some(i=>Number(i.teacherId)===waitingId));
    await renderPrintPack(pack.id);
    const ready=await getPrintPack({schoolId:school,id:pack.id});assert.equal(ready.status,'READY');
    const [[saved]]=await pool.query('SELECT * FROM card_print_pack WHERE id=?',[pack.id]);
    const pdf=await fs.readFile(saved.file_path);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
    const second=await createPrintPack({schoolId:school,monthKey:month,actorId:manager.id});assert.equal(second.id,pack.id);
    const [[count]]=await pool.query('SELECT COUNT(*) n FROM reward_card WHERE school_id=? AND is_legacy_test=0',[school]);assert.equal(Number(count.n),6);
    const [[card]]=await pool.query('SELECT * FROM reward_card WHERE school_id=? LIMIT 1',[school]);assert.ok(decryptToken(card.token_ciphertext,credentialContext(card)));
    assert.throws(()=>decryptToken(card.token_ciphertext,credentialContext({...card,school_id:school+1})));
  });
  test('真实PDF渲染后的二维码指向领取页且可预览原卡',async t=>{
    const {execFileSync}=require('child_process');
    let renderer,extractor;
    for(const prefix of ['/opt/homebrew/bin/','/usr/bin/']){
      try{await fs.access(prefix+'pdftoppm');renderer=prefix+'pdftoppm';}catch{}
      try{await fs.access(prefix+'pdftotext');extractor=prefix+'pdftotext';}catch{}
    }
    if(!renderer||!extractor){t.skip('视觉验证环境未安装Poppler');return;}
    const [[coverFile]]=await pool.query('SELECT file_path FROM card_print_pack WHERE id=?',[pack.id]);
    const cover=execFileSync(extractor,['-f','1','-l','1',coverFile.file_path,'-'],{encoding:'utf8'});
    assert.ok(cover.includes('清单编号：'+pack.id));assert.ok(cover.includes('版式：V2'));
    const [[saved]]=await pool.query('SELECT file_path FROM card_print_pack WHERE id=?',[pack.id]);
    const output='/private/tmp/card-qr-'+pack.id;
    execFileSync(renderer,['-f','2','-singlefile','-scale-to','1400','-png',saved.file_path,output]);
    const {PNG}=require('pngjs');const jsqr=require('jsqr');const png=PNG.sync.read(await fs.readFile(output+'.png'));
    const scale=png.width/595.28,x=Math.floor(44*scale)-2,y=Math.floor(130*scale)-2,size=Math.ceil(96*scale)+4;
    const cropped=new PNG({width:size,height:size});PNG.bitblt(png,cropped,x,y,size,size,0,0);
    const qr=jsqr(new Uint8ClampedArray(cropped.data),size,size);assert.ok(qr,'实际渲染的二维码应能解码');
    const url=new URL(qr.data);assert.equal(url.hash.split('?')[0],'#/student/claim');
    const credential=new URLSearchParams(url.hash.split('?')[1]).get('token');assert.equal(credential.length,64);
    const response=await fetch(base+'/api/v1/student/cards/preview',{method:'POST',headers:{Authorization:'Bearer '+student.token,'Content-Type':'application/json'},body:JSON.stringify({token:credential})});
    assert.equal(response.status,200);const data=(await response.json()).data;assert.equal(data.dimensionCode,'D');assert.equal(data.categoryId,null);
    await fs.unlink(output+'.png');
  });
  test('文件缺失可恢复，新增教师后旧包仍是原清单',async()=>{
    const [[saved]]=await pool.query('SELECT file_path FROM card_print_pack WHERE id=?',[pack.id]);await fs.unlink(saved.file_path);await renderPrintPack(pack.id);
    assert.equal((await getPrintPack({schoolId:school,id:pack.id})).status,'READY');
    await setTeacherSubjects({schoolId:school,teacherId:waitingId,subjectIds:[subjectId],primarySubjectId:subjectId});await reconcileMonth({schoolId:school});
    const newer=await createPrintPack({schoolId:school,monthKey:month,actorId:manager.id});assert.notEqual(newer.id,pack.id);assert.equal(newer.teacherCount,2);assert.equal(newer.cardCount,12);
    assert.equal((await getPrintPack({schoolId:school,id:pack.id})).teacherCount,1);
  });
  test('打印下载只允许同校管理员，不暴露文件位置和令牌',async()=>{
    const url=base+'/api/v1/admin/card-print-packs/'+pack.id;
    const get=async(user,suffix='')=>fetch(url+suffix,{headers:{Authorization:'Bearer '+user.token}});
    assert.equal((await get(teacher,'/download')).status,403);assert.equal((await get(foreignManager,'/download')).status,403);
    const info=await (await get(manager)).json();assert.equal(info.data.filePath,undefined);assert.equal(info.data.token,undefined);
    const download=await get(manager,'/download');assert.equal(download.status,200);assert.match(download.headers.get('content-type'),/application\/pdf/);
  });
  test('下载缺失PDF会进入可查询失败状态，重新准备同清单会转为PENDING再恢复',async()=>{
    const recovery=await createPrintPack({schoolId:school,monthKey:month,actorId:manager.id});await renderPrintPack(recovery.id);
    const [[saved]]=await pool.query('SELECT file_path FROM card_print_pack WHERE id=?',[recovery.id]);await fs.unlink(saved.file_path);
    const key=process.env.CARD_PRINT_KEY;
    const info=async()=>getPrintPack({schoolId:school,id:recovery.id});
    try{
      delete process.env.CARD_PRINT_KEY;
      const response=await fetch(base+'/api/v1/admin/card-print-packs/'+recovery.id+'/download',{headers:{Authorization:'Bearer '+manager.token}});
      assert.equal(response.status,409);
      let state=await info();
      for(let attempt=0;state.status==='PENDING'&&attempt<100;attempt++){await new Promise(r=>setTimeout(r,10));state=await info();}
      assert.equal(state.status,'FAILED');assert.ok(state.errorMessage);
    }finally{process.env.CARD_PRINT_KEY=key;}
    const retried=await createPrintPack({schoolId:school,monthKey:month,actorId:manager.id});
    assert.equal(retried.id,recovery.id);assert.equal(retried.status,'PENDING');assert.equal(retried.errorMessage,null);
    assert.equal((await info()).status,'PENDING');
    await renderPrintPack(recovery.id);assert.equal((await info()).status,'READY');assert.equal((await info()).cardCount,12);
  });

});
