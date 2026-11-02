const {test}=require('node:test');
const assert=require('node:assert/strict');
test('audit presentation translates actions, fields and contextual statuses without changing identifiers',()=>{
  const {presentAudit}=require('../services/reportCoreAuditPresentation');
  const raw={type:'CLASS_TEACHERS',status:'COMMITTED',diffs:[{field:'responsibleTeacherId',before:'1',after:'2'},{field:'assignment',subjectCode:'MATH',before:false,after:true},{field:'status',before:0,after:1}],metadata:{section:'assignments',releaseStatus:'READY',termId:'1',permissionsChanged:true}};
  const copy=JSON.stringify(raw), display=presentAudit(raw);
  assert.equal(display.type,'配置班级教师');assert.equal(display.status,'已完成');
  assert.deepEqual(display.diffs,['班主任：1 → 2','数学 · 任课关系：否 → 是','账号状态：启用 → 停用']);
  assert.deepEqual(display.metadata,['配置分类：任教职责','发布状态：准备完成','学期标识：1','权限变更：是']);
  assert.equal(JSON.stringify(raw),copy);
});
test('unknown codes stay diagnosable and quota zero remains numeric',()=>{
  const {presentAudit}=require('../services/reportCoreAuditPresentation');
  const d=presentAudit({type:'FUTURE_ACTION',status:'FUTURE_STATE',diffs:[{field:'monthlyTotal',subjectCode:'MATH',before:null,after:0}],metadata:{}});
  assert.equal(d.type,'其他操作（FUTURE_ACTION）');assert.equal(d.status,'未知状态（FUTURE_STATE）');assert.deepEqual(d.diffs,['数学 · 学科每班月额度：空 → 0']);
});
test('audit names and class labels are literal data, even when they match state codes or object properties',()=>{
  const {presentAudit}=require('../services/reportCoreAuditPresentation');
  const display=presentAudit({type:'constructor',status:'constructor',diffs:[{field:'real_name',before:'READY',after:'ACTIVE'},{field:'displayName',before:'constructor',after:'toString'}],metadata:{releaseKey:'READY',section:'rules'}});
  assert.equal(display.type,'其他操作（constructor）');assert.equal(display.status,'未知状态（constructor）');
  assert.deepEqual(display.diffs,['姓名：READY → ACTIVE','班级名称：constructor → toString']);
  assert.deepEqual(display.metadata,['发布操作标识：READY','配置分类：评价规则']);
});
test('Chinese action search and CSV use the same translated operation as the list',async t=>{
  const db=await require('./helpers/reportCoreAdminDb').createAdminTestDb(t);
  const {addSource}=require('../services/reportCoreStore');
  await addSource(db.pool,{schoolId:'1',termId:'1',actorId:'1',kind:'AUDIT',status:'COMMITTED',key:['chinese-search'],payload:{action:'TERM_CREATE',sourceTermId:'1',termId:'2'}});
  const args={pool:db.pool,actor:db.actors.manager,termId:'1'},ops=require('../services/reportCoreAdminOps');
  const full=await ops.listAudits({...args,q:'开启下一学期'}),partial=await ops.listAudits({...args,q:'下一学期'});
  assert.equal(full.total,1);assert.equal(partial.total,1);
  assert.equal(full.rows[0].display.type,'开启下一学期');
  assert.equal(await ops.exportAudits({...args,q:'开启下一学期'}),await ops.exportAudits({...args,type:'TERM_CREATE'}));
});
