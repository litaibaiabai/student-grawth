const {test,before,after,describe}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');
const {pool}=require('../db');
const {migrateSubjectCards}=require('../migrations/20261026_subject_cards');
const {saveSubjectPolicy,reconcileMonth,setTeacherSubjects}=require('../services/cardAllocationService');
const now=new Date('2026-10-26T04:00:00Z');
const ratios={D:20,Z:70,T:0,M:0,L:10,G:0};

describe('主教学科自动配卡真实数据库场景',()=>{
before(async()=>{const c=await pool.getConnection();try{await migrateSubjectCards(c);}finally{c.release();}});
after(()=>pool.end());
async function fixture(){
  const schoolId=1000000+crypto.randomInt(100000000);
  const suffix=String(schoolId);
  const [term]=await pool.query("INSERT INTO academic_year(school_id,academic_year,semester,start_date,end_date,active,review_deadline_at) VALUES (?, ?,1,'2026-09-01','2026-12-31',1,'2027-01-03 23:59:59')",[schoolId,'CARD-'+suffix]);
  const [subject]=await pool.query("INSERT INTO card_subject(school_id,subject_code,subject_name) VALUES (?,'CHINESE','语文')",[schoolId]);
  const [art]=await pool.query("INSERT INTO card_subject(school_id,subject_code,subject_name) VALUES (?,'ART','美术')",[schoolId]);
  async function teacher(primary=subject.insertId,status=0){
    const [t]=await pool.query("INSERT INTO users(school_id,username,password,real_name,role,status,primary_subject_id) VALUES (?,?,'','测试教师','teacher',?,?)",[schoolId,'ct_'+suffix+'_'+crypto.randomBytes(3).toString('hex'),status,primary]);
    if(primary) await pool.query('INSERT INTO teacher_subject(school_id,teacher_id,subject_id) VALUES (?,?,?)',[schoolId,t.insertId,primary]);
    return t.insertId;
  }
  const teacherId=await teacher();
  const policy=(monthlyTotal=10,at=now)=>saveSubjectPolicy({schoolId,subjectId:subject.insertId,monthlyTotal,ratios,enabled:true,actorId:1,now:at});
  return {schoolId,teacherId,subjectId:subject.insertId,artId:art.insertId,termId:term.insertId,teacher,policy};
}
async function cards(f){return (await pool.query('SELECT * FROM reward_card WHERE school_id=? AND is_legacy_test=0 ORDER BY serial_no',[f.schoolId]))[0];}

test('兼教教师按主学科只生成一份方向卡，不绑定叶子指标',async()=>{
  const f=await fixture();
  await pool.query('INSERT INTO teacher_subject(school_id,teacher_id,subject_id) VALUES (?,?,?)',[f.schoolId,f.teacherId,f.artId]);
  await f.policy();
  await reconcileMonth({schoolId:f.schoolId,now});
  const rows=await cards(f);
  assert.equal(rows.length,10);
  assert.deepEqual(Object.fromEntries(['D','Z','L','M'].map(d=>[d,rows.filter(r=>r.dimension_code===d).length])),{D:2,Z:7,L:1,M:0});
  assert.ok(rows.every(r=>r.category_id===null && r.token_ciphertext && r.allocation_id));
});

test('有批次修改下月生效，月中新教师使用当月旧版本',async()=>{
  const f=await fixture();await f.policy();await reconcileMonth({schoolId:f.schoolId,now});
  assert.equal((await f.policy(20)).effectiveMonth,'2026-11');
  await f.teacher();await reconcileMonth({schoolId:f.schoolId,now});
  assert.equal((await cards(f)).length,20);
  await reconcileMonth({schoolId:f.schoolId,now:new Date('2026-11-01T00:00:00+08:00')});
  const [[row]]=await pool.query("SELECT COUNT(*) n FROM reward_card WHERE school_id=? AND month_key='2026-11'",[f.schoolId]);
  assert.equal(Number(row.n),40);
});

test('零张未建立批次时改为正数在当月生效',async()=>{
  const f=await fixture();await f.policy(0);await reconcileMonth({schoolId:f.schoolId,now});
  const [[count]]=await pool.query('SELECT COUNT(*) n FROM card_allocation WHERE school_id=?',[f.schoolId]);
  assert.equal(Number(count.n),0);
  assert.equal((await f.policy(10)).effectiveMonth,'2026-10');
  await reconcileMonth({schoolId:f.schoolId,now});assert.equal((await cards(f)).length,10);
});

test('缺主学科不默认发卡，补齐后可补发完整一份',async()=>{
  const f=await fixture();await pool.query('UPDATE users SET primary_subject_id=NULL WHERE id=?',[f.teacherId]);
  await f.policy();await reconcileMonth({schoolId:f.schoolId,now});assert.equal((await cards(f)).length,0);
  const [issues]=await pool.query('SELECT reason_code FROM card_generation_issue WHERE school_id=? AND resolved=0',[f.schoolId]);
  assert.ok(issues.some(i=>i.reason_code==='NO_SUBJECT'));
  await setTeacherSubjects({schoolId:f.schoolId,teacherId:f.teacherId,subjectIds:[f.subjectId,f.artId],primarySubjectId:f.subjectId});
  await reconcileMonth({schoolId:f.schoolId,now});assert.equal((await cards(f)).length,10);
  const [[remaining]]=await pool.query('SELECT COUNT(*) n FROM card_generation_issue WHERE school_id=? AND resolved=0',[f.schoolId]);
  assert.equal(Number(remaining.n),0);
});

test('并发重试不重发，作废卡仍占原份额，缺失卡位按快照恢复',async()=>{
  const f=await fixture();await f.policy();
  await Promise.all([reconcileMonth({schoolId:f.schoolId,now}),reconcileMonth({schoolId:f.schoolId,now})]);
  const rows=await cards(f);assert.equal(rows.length,10);
  await pool.query("UPDATE reward_card SET status='VOID' WHERE id=?",[rows[0].id]);
  await pool.query('DELETE FROM reward_card WHERE id=?',[rows[9].id]);
  await pool.query("UPDATE card_allocation SET status='FAILED' WHERE id=?",[rows[0].allocation_id]);
  await reconcileMonth({schoolId:f.schoolId,now});
  const restored=await cards(f);assert.equal(restored.length,10);
  assert.equal(Number(restored[0].id),Number(rows[0].id));assert.equal(restored[0].status,'VOID');
  assert.equal(restored[1].token_hash,rows[1].token_hash);
});

test('生成失败仍保留版本快照，修复密钥后按原数量恢复',async()=>{
  const f=await fixture();await f.policy();const key=process.env.CARD_PRINT_KEY;
  try{delete process.env.CARD_PRINT_KEY;await reconcileMonth({schoolId:f.schoolId,now});}finally{process.env.CARD_PRINT_KEY=key;}
  const [[allocation]]=await pool.query('SELECT * FROM card_allocation WHERE school_id=?',[f.schoolId]);
  assert.equal(allocation.status,'FAILED');assert.equal((await cards(f)).length,0);
  assert.equal((await f.policy(20)).effectiveMonth,'2026-11');
  await reconcileMonth({schoolId:f.schoolId,now});assert.equal((await cards(f)).length,10);
});

test('已有旧测试卡不占正式卡位，停用教师不获新增分配',async()=>{
  const f=await fixture();await f.policy();
  const [[cat]]=await pool.query('SELECT id FROM edu_evaluation_category WHERE category_level=3 LIMIT 1');
  await pool.query("INSERT INTO reward_card(school_id,term_id,teacher_id,month_key,serial_no,category_id,token_hash,valid_from,valid_until) VALUES (?,?,?,'2026-10',1,?,?,'2026-10-01','2026-10-31')",[f.schoolId,f.termId,f.teacherId,cat.id,crypto.randomBytes(32).toString('hex')]);
  const inactive=await f.teacher(f.subjectId,1);
  await reconcileMonth({schoolId:f.schoolId,now});assert.equal((await cards(f)).length,10);
  const [[blocked]]=await pool.query('SELECT COUNT(*) n FROM card_allocation WHERE teacher_id=?',[inactive]);assert.equal(Number(blocked.n),0);
});

test('寒暑假不回退全局校历，跨校主学科无法保存',async()=>{
  const f=await fixture();const other=await fixture();await f.policy();
  await reconcileMonth({schoolId:f.schoolId,now:new Date('2026-07-01T00:00:00+08:00')});
  assert.equal((await cards(f)).length,0);
  await assert.rejects(setTeacherSubjects({schoolId:f.schoolId,teacherId:f.teacherId,subjectIds:[other.subjectId],primarySubjectId:other.subjectId}),e=>e.statusCode===403);
});
test('逐教师预留时重新读取校历，不使用遍历前已失效的校历',async()=>{
 const f=await fixture();await f.policy();const original=pool.query;let changed=false;
 pool.query=async function(sql,args){const result=await original.call(this,sql,args);
   if(!changed&&String(sql).includes("SELECT id FROM users WHERE school_id=? AND role='teacher'")&&Number(args[0])===f.schoolId){changed=true;await original.call(this,'UPDATE academic_year SET active=0 WHERE id=?',[f.termId]);}
   return result;
 };
 try{await reconcileMonth({schoolId:f.schoolId,now});}finally{pool.query=original;}
 assert.equal(changed,true);assert.equal((await cards(f)).length,0);
});

});
