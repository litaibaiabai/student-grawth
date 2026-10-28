const {describe,test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');
const {pool}=require('../db');
const {signToken}=require('../middleware/auth');
const {migrateSubjectCards}=require('../migrations/20261026_subject_cards');
const {saveSubjectPolicy,reconcileMonth}=require('../services/cardAllocationService');
const {decryptToken,credentialContext}=require('../services/cardCredentials');
const {schoolTimestamp}=require('../services/cardRules');
const {getMonthKey}=require('../utils/monthKey');
const {expireOldCards}=require('../services/scheduler');
const app=require('../app');

describe('实体卡扫码审核真实事务',()=>{
  let server,base,school,manager,teacher,otherTeacher,student,student2,foreignStudent,cards,leaf,wrongLeaf,versionLeaf,termId;
  before(async()=>{
    const c=await pool.getConnection();try{await migrateSubjectCards(c);}finally{c.release();}
    school=300000000+crypto.randomInt(10000000);
    async function user(role,s=school){const [r]=await pool.query("INSERT INTO users(school_id,username,password,real_name,role,grade,class_no) VALUES (?,?,'','事务测试',?,4,1)",[s,crypto.randomBytes(12).toString('hex'),role]);return {id:r.insertId,school_id:s,role,token:signToken({id:r.insertId,school_id:s,role})};}
    manager=await user('manager');teacher=await user('teacher');otherTeacher=await user('teacher');student=await user('student');student2=await user('student');foreignStudent=await user('student',school+1);
    const month=getMonthKey();const [y,m]=month.split('-').map(Number);const end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
    const [term]=await pool.query("INSERT INTO academic_year(school_id,academic_year,semester,start_date,end_date,review_deadline_at) VALUES (?,?,1,?,?,DATE_ADD(?,INTERVAL 10 DAY))",[school,'FLOW-'+school,month+'-01',end,end+' 23:59:59']);termId=term.insertId;
    const [s]=await pool.query("INSERT INTO card_subject(school_id,subject_code,subject_name) VALUES (?,'CHINESE','语文')",[school]);
    await pool.query('UPDATE users SET primary_subject_id=? WHERE id=?',[s.insertId,teacher.id]);await pool.query('INSERT INTO teacher_subject VALUES (?,?,?)',[school,teacher.id,s.insertId]);
    await saveSubjectPolicy({schoolId:school,subjectId:s.insertId,monthlyTotal:12,ratios:{Z:100},actorId:manager.id});await reconcileMonth({schoolId:school});
    [cards]=await pool.query('SELECT * FROM reward_card WHERE school_id=? AND is_legacy_test=0 ORDER BY serial_no',[school]);
    cards=cards.map(card=>({...card,token:decryptToken(card.token_ciphertext,credentialContext(card))}));
    const [[root]]=await pool.query("SELECT id FROM edu_evaluation_category WHERE category_code='Z' AND version='V1'");
    const code='ZQA'+crypto.randomBytes(4).toString('hex');
    const [parent]=await pool.query("INSERT INTO edu_evaluation_category(parent_id,category_level,category_code,category_name,score,version) VALUES (?,2,?,'测试一级子类',0,'V1')",[root.id,code]);
    const [l]=await pool.query("INSERT INTO edu_evaluation_category(parent_id,category_level,category_code,category_name,score,version) VALUES (?,3,?,'测试二级子类',1,'V1')",[parent.insertId,code+'-01']);leaf=l.insertId;
    const [vl]=await pool.query("INSERT INTO edu_evaluation_category(parent_id,category_level,category_code,category_name,score,version) VALUES (?,3,?,'不同版本子类',1,'V2')",[parent.insertId,code+'-02']);versionLeaf=vl.insertId;
    const [[d]]=await pool.query("SELECT id FROM edu_evaluation_category WHERE category_level=3 AND category_code LIKE 'D%' AND version='V1' LIMIT 1");wrongLeaf=d.id;
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
  });
  after(async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r));await pool.end();});
  async function call(path,user,method='GET',body){const r=await fetch(base+'/api/v1'+path,{method,headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
  async function claim(card,user=student){return call('/student/card-claims',user,'POST',{token:card.token,requestKey:'claim-'+card.id+'-'+user.id});}

  test('不预绑子类也能预览、申领并进入待审，尚不加分',async()=>{
    const preview=await call('/student/cards/preview',student,'POST',{token:cards[0].token});assert.equal(preview.status,200);assert.equal(preview.body.data.dimensionCode,'Z');assert.equal(preview.body.data.categoryId,null);
    const result=await claim(cards[0]);assert.equal(result.status,200);assert.equal(result.body.data.pointsCredited,0);
    const replay=await claim(cards[0]);assert.equal(replay.status,200);assert.equal(replay.body.data.claimId,result.body.data.claimId);
    const list=await call('/teacher/card-claims?status=PENDING',teacher);assert.ok(list.body.data.some(r=>Number(r.claim_id)===Number(result.body.data.claimId)));
    const [[score]]=await pool.query('SELECT COUNT(*) n FROM score_record WHERE card_claim_id=?',[result.body.data.claimId]);assert.equal(Number(score.n),0);
  });
  test('拒绝缺子类、跨方向、跨版本及他人审核，通过后只入账一次+1',async()=>{
    const [[cl]]=await pool.query('SELECT id FROM card_claim WHERE card_id=?',[cards[0].id]);const path='/teacher/card-claims/'+cl.id+'/decision';
    assert.equal((await call(path,teacher,'POST',{decision:'APPROVE',requestKey:'missing'})).status,422);
    assert.equal((await call(path,teacher,'POST',{decision:'APPROVE',categoryId:wrongLeaf,requestKey:'wrong-dim'})).status,422);
    assert.equal((await call(path,teacher,'POST',{decision:'APPROVE',categoryId:versionLeaf,requestKey:'wrong-version'})).status,422);
    assert.equal((await call(path,otherTeacher,'POST',{decision:'APPROVE',categoryId:leaf,requestKey:'wrong-owner'})).status,403);
    const body={decision:'APPROVE',categoryId:leaf,requestKey:'approve-'+cl.id,remark:'主动探究'};
    const approved=await call(path,teacher,'POST',body);assert.equal(approved.status,200);assert.equal(approved.body.data.delta,1);
    assert.equal((await call(path,teacher,'POST',body)).status,200);
    const [[score]]=await pool.query('SELECT COUNT(*) n,SUM(delta) total,MAX(category_id) category_id FROM score_record WHERE card_claim_id=?',[cl.id]);assert.equal(Number(score.n),1);assert.equal(Number(score.total),1);assert.equal(Number(score.category_id),leaf);
    const [[card]]=await pool.query('SELECT status,category_id FROM reward_card WHERE id=?',[cards[0].id]);assert.equal(card.status,'USED');assert.equal(card.category_id,null);
  });
  test('同一张卡并发申领只有一个成功，驳回不要求子类也不加分',async()=>{
    const result=await Promise.all([claim(cards[1]),claim(cards[1],student2)]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
    const accepted=result.find(r=>r.status===200);const rejected=await call('/teacher/card-claims/'+accepted.body.data.claimId+'/decision',teacher,'POST',{decision:'REJECT',rejectReason:'核实未达到奖励要求'});assert.equal(rejected.status,200);
    const [[card]]=await pool.query('SELECT status FROM reward_card WHERE id=?',[cards[1].id]);assert.equal(card.status,'VOID');
    const [[score]]=await pool.query('SELECT COUNT(*) n FROM score_record WHERE card_claim_id=?',[accepted.body.data.claimId]);assert.equal(Number(score.n),0);
  });
  test('接口检查申领时间，待审到期任务不改写已入账卡',async()=>{
    const past=schoolTimestamp(new Date(Date.now()-60000));await pool.query('UPDATE reward_card SET valid_until=? WHERE id=?',[past,cards[2].id]);
    assert.equal((await claim(cards[2])).status,400);
    const cl=await claim(cards[3]);await pool.query('UPDATE reward_card SET review_deadline_at=? WHERE id=?',[past,cards[3].id]);
    assert.equal((await call('/teacher/card-claims/'+cl.body.data.claimId+'/decision',teacher,'POST',{decision:'APPROVE',categoryId:leaf})).status,400);
    await expireOldCards();
    const [[expired]]=await pool.query('SELECT status FROM card_claim WHERE id=?',[cl.body.data.claimId]);assert.equal(expired.status,'EXPIRED');
    const [[used]]=await pool.query('SELECT status FROM reward_card WHERE id=?',[cards[0].id]);assert.equal(used.status,'USED');
  });
  test('跨校凭证、旧测试令牌及旧GET预览不能绕过新规则',async()=>{
    assert.equal((await call('/student/cards/preview',foreignStudent,'POST',{token:cards[4].token})).status,403);
    await pool.query('UPDATE reward_card SET is_legacy_test=1 WHERE id=?',[cards[4].id]);assert.equal((await claim(cards[4])).status,410);
    assert.equal((await call('/student/cards/preview?token=legacy-test',student)).status,410);
  });
  test('停用教师不能继续审核，同校管理员能接管待审',async()=>{
    const cl=await claim(cards[5]);await pool.query('UPDATE users SET status=1 WHERE id=?',[teacher.id]);
    try{
      const body={decision:'APPROVE',categoryId:leaf,requestKey:'manager-'+cl.body.data.claimId};
      assert.equal((await call('/teacher/card-claims/'+cl.body.data.claimId+'/decision',teacher,'POST',body)).status,403);
      assert.equal((await call('/teacher/card-claims/'+cl.body.data.claimId+'/decision',manager,'POST',body)).status,200);
    }finally{await pool.query('UPDATE users SET status=0 WHERE id=?',[teacher.id]);}
  });
});
