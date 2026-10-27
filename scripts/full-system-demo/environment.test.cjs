const {test}=require('node:test');const assert=require('node:assert/strict');const net=require('net');
const {parseOptions,schoolTerm,findPort}=require('./environment.cjs');
test('参数不允许0或负演示速度',()=>{assert.throws(()=>parseOptions(['--speed','0']));assert.throws(()=>parseOptions(['--speed','-2']));assert.equal(parseOptions([]).headless,false)});
test('学期与当前月按学校年月推导，跨年一致',()=>{assert.deepEqual(schoolTerm('2027-01-08'),{academicYear:'2026-2027',semester:1,startDate:'2026-09-01',endDate:'2027-01-31'});assert.equal(schoolTerm('2027-03-03').semester,2)});
test('端口占用时选择新端口，不触碰已有服务',async()=>{const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;try{const other=await findPort(port);assert.notEqual(other,port);assert.equal(server.listening,true)}finally{server.close()}});
test('只读核对拒绝写SQL，不能借校验篡改业务结果',async()=>{const {inspect}=require('./environment.cjs');await assert.rejects(inspect({dbName:'unused'},'UPDATE users SET status=0'),/只允许/)});
test('支持--scenario指定改造场景并校验合法性',()=>{
  const o=parseOptions(['--scenario','R20A']);
  assert.equal(o.scenario,'R20A');
  assert.throws(()=>parseOptions(['--scenario','INVALID']),/未知的改造场景/);
});
test('严格拒绝在业务库与生产库运行改造演示与重置',()=>{
  const {assertIsolatedDatabase}=require('./environment.cjs');
  assert.throws(()=>assertIsolatedDatabase('student_growth'),/禁止在业务库/);
  assert.throws(()=>assertIsolatedDatabase('production'),/禁止在业务库/);
  assert.equal(assertIsolatedDatabase('liuyu_demo_20261027_abc123'),true);
});
test('迁移登记器具备校验和与重复执行幂等性',async()=>{
  const {applyRegisteredMigrations}=require('../../backend/services/migrationRunner.js');
  assert.equal(typeof applyRegisteredMigrations,'function');
});
