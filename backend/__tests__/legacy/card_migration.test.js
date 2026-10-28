const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {pool}=require('../db');
const {migrateSubjectCards}=require('../migrations/20261026_subject_cards');

after(()=>pool.end());
test('升级已有卡表保留测试数据，重复迁移不覆盖新正式卡',async()=>{
  const name='codex_card_migration_'+crypto.randomBytes(4).toString('hex');
  const c=await pool.getConnection();
  try {
    await c.query('CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    await c.query('USE `'+name+'`');
    const sql=fs.readFileSync(path.join(__dirname,'fixtures/legacy_cards_schema.sql'),'utf8');
    for(const statement of sql.split(';').filter(s=>s.trim())) await c.query(statement);
    await c.query("INSERT INTO academic_year(id,school_id,academic_year,semester,start_date,end_date) VALUES (1,1,'2026-2027',1,'2026-09-01','2027-01-31')");
    await c.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES (2,1,'migration_teacher','','教师','teacher')");
    await c.query("INSERT INTO edu_evaluation_category(id,parent_id,category_level,category_code,category_name,score) VALUES (1,0,1,'D','德育',0),(2,1,2,'D01','品德',0),(3,2,3,'D01-01','礼貌',1)");
    await c.query("INSERT INTO reward_card(id,school_id,term_id,teacher_id,month_key,serial_no,category_id,token_hash,valid_from,valid_until) VALUES (901,1,1,2,'2026-10',1,3,?,'2026-10-01','2026-10-31')",['a'.repeat(64)]);
    await migrateSubjectCards(c);
    await migrateSubjectCards(c);
    await c.query("INSERT INTO academic_year(id,school_id,academic_year,semester,start_date,end_date) VALUES (2,2,'2026-2027',1,'2026-09-10','2027-01-20')");
    const [[old]]=await c.query('SELECT id,category_id,is_legacy_test FROM reward_card WHERE id=901');
    assert.equal(Number(old.id),901);
    assert.equal(Number(old.category_id),3);
    assert.equal(Number(old.is_legacy_test),1);
    const [[term]]=await c.query("SELECT DATE_FORMAT(review_deadline_at,'%Y-%m-%d %H:%i:%s') AS deadline FROM academic_year WHERE id=1");
    assert.equal(term.deadline,'2027-01-31 23:59:59');
    await c.query("INSERT INTO reward_card(school_id,term_id,teacher_id,month_key,serial_no,category_id,dimension_code,token_hash,valid_from,valid_until,is_legacy_test) VALUES (1,1,2,'2026-10',2,NULL,'Z',?,'2026-10-01','2026-10-31',0)",['b'.repeat(64)]);
    await migrateSubjectCards(c);
    const [[fresh]]=await c.query('SELECT is_legacy_test,category_id FROM reward_card WHERE token_hash=?',['b'.repeat(64)]);
    assert.equal(Number(fresh.is_legacy_test),0);
    assert.equal(fresh.category_id,null);
  } finally {
    await c.query('DROP DATABASE IF EXISTS `'+name+'`');
    c.destroy();
  }
});

test('迁移在仅打包backend的部署结构中能找到建表SQL',async()=>{
 const os=require('os');const root=fs.mkdtempSync(path.join(os.tmpdir(),'card-migration-package-'));
 try{
  fs.cpSync(path.join(__dirname,'../migrations'),path.join(root,'migrations'),{recursive:true});
  const original=fs.readFileSync(path.join(__dirname,'../../sql/04_subject_card_issuance.sql'),'utf8');
  const statements=[];const conn={query:async(sql,args)=>{statements.push(sql);if(sql.includes('information_schema.COLUMNS'))return [[{IS_NULLABLE:'YES'}]];if(sql.includes('information_schema.STATISTICS'))return [[]];return [{affectedRows:0}];}};
  await require(path.join(root,'migrations/20261026_subject_cards')).migrateSubjectCards(conn);
  assert.ok(statements.some(s=>s.includes('CREATE TABLE IF NOT EXISTS card_allocation')));
  assert.ok(original.includes('card_allocation'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
