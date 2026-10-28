const {test}=require('node:test');const assert=require('node:assert/strict');
test('six-table bootstrap refuses legacy/partial databases and enforces stars and reversal uniqueness',async t=>{
 const {createCoreTestDb}=require('./helpers/reportCoreDb');
 const {runCoreMigrations}=require('../scripts/runCoreMigrations');
 const db=await createCoreTestDb(t); const {pool}=db;
 const [tables]=await pool.query('SHOW TABLES'); assert.equal(tables.length,6);
 await db.seedBase();
 await assert.rejects(pool.query("UPDATE student_term_evaluation SET conduct_politeness_self_star=4"),/check|constraint/i);
 await assert.rejects(pool.query("UPDATE student_term_evaluation SET status='CONFIRMED'"),/check|constraint/i);
 await assert.rejects(runCoreMigrations({connection:pool,targetDb:'student_growth',mode:'apply'}),/target/i);
 assert.equal((await runCoreMigrations({connection:pool,targetDb:db.name,mode:'check'})).unchanged,true);
 const c=require('../db').createDbPool(db.config);await c.query('SELECT 1');await c.end();assert.equal((await pool.query('SHOW TABLES'))[0].length,6);
});
