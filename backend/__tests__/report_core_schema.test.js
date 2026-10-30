const { test } = require("node:test");
const assert = require("node:assert/strict");
test("six-table bootstrap refuses legacy/partial databases and enforces stars and reversal uniqueness", async (t) => {
  const { createCoreTestDb } = require("./helpers/reportCoreDb");
  const { runCoreMigrations } = require("../scripts/runCoreMigrations");
  const db = await createCoreTestDb(t);
  const { pool } = db;
  const [tables] = await pool.query("SHOW TABLES");
  assert.equal(tables.length, 6);
  await db.seedBase();
  await assert.rejects(
    pool.query(
      "UPDATE student_term_evaluation SET conduct_politeness_self_star=4",
    ),
    /check|constraint/i,
  );
  await assert.rejects(
    pool.query("UPDATE student_term_evaluation SET status='CONFIRMED'"),
    /check|constraint/i,
  );
  await assert.rejects(
    runCoreMigrations({
      connection: pool,
      targetDb: "student_growth",
      mode: "apply",
    }),
    /target/i,
  );
  assert.equal(
    (
      await runCoreMigrations({
        connection: pool,
        targetDb: db.name,
        mode: "check",
      })
    ).unchanged,
    true,
  );
  const c = require("../db").createDbPool(db.config);
  await c.query("SELECT 1");
  await c.end();
  assert.equal((await pool.query("SHOW TABLES"))[0].length, 6);
});

test('canonical student_growth name requires the same six-table schema and rejects a restored legacy schema',async t=>{
 const previous=process.env.LEGACY_DB_NAME;process.env.LEGACY_DB_NAME='student_growth_legacy';t.after(()=>{if(previous===undefined)delete process.env.LEGACY_DB_NAME;else process.env.LEGACY_DB_NAME=previous;});
 const {runCoreMigrations,tables}=require('../scripts/runCoreMigrations');
 const fields=require('../../docs/database/term-report-core-v1.schema.json').fixedFields;
 const make=names=>({query:async sql=>{
  if(sql==='SELECT DATABASE() db')return [[{db:'student_growth'}]];
  if(sql==='SHOW TABLES')return [names.map(name=>({name}))];
  if(sql==='SHOW COLUMNS FROM student_term_evaluation')return [fields.map(f=>({Field:f.column,Type:f.sqlType}))];
  throw Error('Unexpected query');
 }});
 assert.equal((await runCoreMigrations({connection:make(tables),targetDb:'student_growth'})).unchanged,true);
 await assert.rejects(runCoreMigrations({connection:make([...tables,'reward_card']),targetDb:'student_growth'}),/Partial or legacy/);
});
