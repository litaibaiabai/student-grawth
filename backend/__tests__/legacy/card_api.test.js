const {describe,test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');
const {pool}=require('../db');
const {signToken}=require('../middleware/auth');
const {migrateSubjectCards}=require('../migrations/20261026_subject_cards');
const app=require('../app');

describe('学科发卡管理API与权限',()=>{
  let server,base,manager,teacher,otherManager,schoolId,teacherId;
  before(async()=>{
    const c=await pool.getConnection();try{await migrateSubjectCards(c);}finally{c.release();}
    schoolId=200000000+crypto.randomInt(10000000);
    async function user(role,school){const [r]=await pool.query("INSERT INTO users(school_id,username,password,role,real_name) VALUES (?,?,'',?,'接口测试')",[school,crypto.randomBytes(10).toString('hex'),role]);return {id:r.insertId,school_id:school,role};}
    manager=signToken(await user('manager',schoolId));const t=await user('teacher',schoolId);teacherId=t.id;teacher=signToken(t);otherManager=signToken(await user('manager',schoolId+1));
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
  });
  after(async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r));await pool.end();});
  async function call(path,token=manager,method='GET',body){const r=await fetch(base+'/api/v1'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
  test('管理员维护学科和教师主学科，教师不能越权配置',async()=>{
    const created=await call('/admin/card-subjects',manager,'POST',{subjectCode:'CHINESE',subjectName:'语文',status:1});assert.equal(created.status,200);
    const subjectId=created.body.data.id;
    assert.equal((await call('/admin/card-subjects',teacher,'POST',{subjectCode:'ART',subjectName:'美术'})).status,403);
    assert.equal((await call('/admin/card-teachers/'+teacherId+'/subjects',manager,'PUT',{subjectIds:[subjectId],primarySubjectId:subjectId})).status,200);
    const teachers=await call('/admin/card-teachers');assert.equal(teachers.body.data.find(t=>Number(t.id)===teacherId).primarySubjectId,subjectId);
    const policy=await call('/admin/subject-card-policies/'+subjectId,manager,'PUT',{monthlyTotal:10,ratios:{D:20,Z:70,L:10},enabled:true});assert.equal(policy.status,200);assert.deepEqual(policy.body.data.counts,{D:2,Z:7,T:0,M:0,L:1,G:0});
    assert.equal((await call('/admin/subject-card-policies/'+subjectId,otherManager,'PUT',{monthlyTotal:10,ratios:{M:100},enabled:true})).status,403);
    const list=await call('/admin/subject-card-policies');assert.equal(list.body.data[0].subjectId,subjectId);assert.equal(list.body.data[0].monthlyTotal,10);
  });
  test('分配查询教师不能借teacherId参数查看他人，学生不允许读取卡片清单',async()=>{
    assert.equal((await call('/card-allocations?teacherId=1',teacher)).status,403);
    assert.equal((await call('/admin/card-generation-issues',teacher)).status,403);
    const student=signToken({id:4,schoolId:1,role:'student'});
    assert.equal((await call('/cards',student)).status,403);
  });
  test('旧手工制卡和配额接口在两个前缀同时退役',async()=>{
    for(const prefix of ['/api/v1','/api']) for(const path of ['/admin/card-quotas','/admin/cards/generate-month']){
      const r=await fetch(base+prefix+path,{method:'POST',headers:{Authorization:'Bearer '+manager,'Content-Type':'application/json'},body:'{}'});
      assert.equal(r.status,410);
    }
  });
  test('学期保存和查询保留审核截止，并拒绝早于学期结束的截止',async()=>{
    const term={academicYear:'2038-2039',semester:1,startDate:'2038-09-01',endDate:'2039-01-31',reviewDeadlineAt:'2039-02-02 23:59:59',isCurrent:false};
    const created=await call('/admin/terms',manager,'POST',term);assert.equal(created.status,200);assert.equal(created.body.data.reviewDeadlineAt,term.reviewDeadlineAt);
    const list=await call('/terms');assert.equal(list.body.data.find(t=>Number(t.id)===Number(created.body.data.id)).reviewDeadlineAt,term.reviewDeadlineAt);
    assert.equal((await call('/admin/terms/'+created.body.data.id,manager,'PUT',{...term,reviewDeadlineAt:'2039-01-01 00:00:00'})).status,422);
  });
  test('缩短后再延长学期截止，不恢复已建批次和卡片的旧截止',async()=>{
    const {getMonthKey}=require('../utils/monthKey');const {reconcileMonth}=require('../services/cardAllocationService');
    const month=getMonthKey(),[year,m]=month.split('-').map(Number);const end=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
    const next=new Date(Date.UTC(year,m,1)).toISOString().slice(0,10),third=new Date(Date.UTC(year,m,3)).toISOString().slice(0,10);
    const term={academicYear:'CLAMP-'+schoolId,semester:1,startDate:month+'-01',endDate:end,reviewDeadlineAt:third+' 23:59:59'};
    const created=await call('/admin/terms',manager,'POST',term);assert.equal(created.status,200);
    await reconcileMonth({schoolId});
    const id=created.body.data.id;
    assert.equal((await call('/admin/terms/'+id,manager,'PUT',{...term,reviewDeadlineAt:next+' 23:59:59'})).status,200);
    assert.equal((await call('/admin/terms/'+id,manager,'PUT',term)).status,200);
    const [[card]]=await pool.query("SELECT DATE_FORMAT(review_deadline_at,'%Y-%m-%d %H:%i:%s') deadline FROM reward_card WHERE school_id=? AND is_legacy_test=0 LIMIT 1",[schoolId]);
    assert.equal(card.deadline,next+' 23:59:59');
    const [[allocation]]=await pool.query("SELECT DATE_FORMAT(review_deadline_at,'%Y-%m-%d %H:%i:%s') deadline FROM card_allocation WHERE school_id=? LIMIT 1",[schoolId]);assert.equal(allocation.deadline,next+' 23:59:59');
  });
  test('已维护策略的学科不能用字典停用绕过策略生效月',async()=>{
    const list=await call('/admin/card-subjects');const subject=list.body.data[0];
    const response=await call('/admin/card-subjects/'+subject.id,manager,'PUT',{...subject,status:0});
    assert.equal(response.status,422);assert.match(response.body.message,/策略/);
  });

  test('停用学科在建立首个策略前需启用，历史已配策略的停用学科也能恢复',async()=>{
    const created=await call('/admin/card-subjects',manager,'POST',{subjectCode:'RESTORE',subjectName:'待启用学科',status:0});const subject=created.body.data;
    const policy={monthlyTotal:2,ratios:{D:100},enabled:true};
    const blocked=await call('/admin/subject-card-policies/'+subject.id,manager,'PUT',policy);
    assert.equal(blocked.status,422);assert.match(blocked.body.message,/启用学科/);
    assert.equal((await call('/admin/card-subjects/'+subject.id,manager,'PUT',{...subject,status:1})).status,200);
    assert.equal((await call('/admin/subject-card-policies/'+subject.id,manager,'PUT',policy)).status,200);
    // Reproduce an already-created inactive subject from the previous implementation.
    await pool.query('UPDATE card_subject SET status=0 WHERE id=?',[subject.id]);
    assert.equal((await call('/admin/card-subjects/'+subject.id,manager,'PUT',{...subject,status:1})).status,200);
    assert.equal((await call('/admin/card-teachers/'+teacherId+'/subjects',manager,'PUT',{subjectIds:[subject.id],primarySubjectId:subject.id})).status,200);
    const {reconcileMonth}=require('../services/cardAllocationService');await reconcileMonth({schoolId});
    const result=await call('/card-allocations');const allocation=result.body.data.find(a=>a.teacherId===teacherId);
    assert.equal(allocation.subjectChanged,true);assert.equal(allocation.currentSubjectId,subject.id);
    assert.match(allocation.subjectChangeNotice,/下月/);
  });

});
