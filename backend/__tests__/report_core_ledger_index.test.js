const {test}=require('node:test');const assert=require('node:assert/strict');
const {createCoreTestDb}=require('./helpers/reportCoreDb');
test('ledger covering index upgrade is explicit, idempotent and preserves source facts in six tables',async t=>{
 const {upgradeLedgerIndex}=require('../scripts/upgradeCoreLedgerIndex');
 const db=await createCoreTestDb(t);await db.seedBase();
 await db.pool.query('ALTER TABLE evaluation_source_record DROP INDEX idx_source_ledger_direct,DROP COLUMN ledger_occurred_utc');
 const source=require('../services/reportCoreStore'),p=require('../services/reportCorePolicy');await source.addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',actorId:'2',sourceType:'CARD',kind:'DIRECT',status:'CONFIRMED',delta:1,target:'moral_process_star',payload:{occurredAt:'2026-10-15T00:00:00.000Z'},key:['index-fixture']});
 const original=(await db.pool.query('SELECT id,payload_json,business_key,created_at FROM evaluation_source_record'))[0];
 assert.equal((await upgradeLedgerIndex({connection:db.pool,targetDb:db.name})).required,true);
 const legacy=await require('../services/reportCoreLedger').listLedgerUsage({pool:db.pool,actor:{id:'2',schoolId:'1',role:'teacher'},filters:{termId:'1',monthFrom:'2026-10',monthTo:'2026-10'}});assert.equal(legacy.summary.direct,1);
 assert.equal((await db.pool.query("SHOW COLUMNS FROM evaluation_source_record LIKE 'ledger_occurred_utc'"))[0].length,0);
 await assert.rejects(upgradeLedgerIndex({connection:db.pool,targetDb:'student_growth',apply:true}),/target/i);
 assert.equal((await upgradeLedgerIndex({connection:db.pool,targetDb:db.name,apply:true})).required,false);
 assert.equal((await upgradeLedgerIndex({connection:db.pool,targetDb:db.name,apply:true})).changed,false);
 assert.equal((await db.pool.query('SHOW TABLES'))[0].length,6);assert.equal(p.stableHash((await db.pool.query('SELECT id,payload_json,business_key,created_at FROM evaluation_source_record'))[0]),p.stableHash(original));
 assert.equal((await db.pool.query('SELECT ledger_occurred_utc at FROM evaluation_source_record'))[0][0].at,'2026-10-15T00:00:00.000Z');
});
