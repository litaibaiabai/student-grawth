const fs = require('fs');
const path = require('path');

async function migrateSubjectCards(conn) {
  async function column(table, name, ddl) {
    const [rows] = await conn.query('SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,name]);
    if (!rows.length) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${ddl}`);
    return rows[0];
  }
  await column('academic_year','review_deadline_at','DATETIME NULL');
  await conn.query("UPDATE academic_year SET review_deadline_at=CONCAT(end_date,' 23:59:59') WHERE review_deadline_at IS NULL");
  const [termIndex]=await conn.query("SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academic_year' AND INDEX_NAME='uk_school_year_semester' ORDER BY SEQ_IN_INDEX");
  if(termIndex.map(r=>r.COLUMN_NAME).join(',')!=='school_id,academic_year,semester'){
    if(termIndex.length)await conn.query('ALTER TABLE academic_year DROP INDEX uk_school_year_semester');
    await conn.query('ALTER TABLE academic_year ADD UNIQUE KEY uk_school_year_semester(school_id,academic_year,semester)');
  }
  await column('users','primary_subject_id','BIGINT UNSIGNED NULL');
  await column('reward_card','allocation_id','BIGINT UNSIGNED NULL');
  await column('reward_card','dimension_code','CHAR(1) NULL');
  await column('reward_card','token_ciphertext','TEXT NULL');
  await column('reward_card','review_deadline_at','DATETIME NULL');
  await column('reward_card','is_legacy_test','TINYINT NOT NULL DEFAULT 1');
  const category = await column('reward_card','category_id','BIGINT UNSIGNED NULL');
  if (category?.IS_NULLABLE==='NO') await conn.query('ALTER TABLE reward_card MODIFY category_id BIGINT UNSIGNED NULL');
  await column('card_claim','category_id','BIGINT UNSIGNED NULL');
  await column('card_claim','category_version','VARCHAR(30) NULL');
  await column('card_claim','category_path_json','JSON NULL');
  await column('card_claim','review_remark','VARCHAR(500) NULL');
  const sql=fs.readFileSync(path.join(__dirname,'04_subject_card_issuance.sql'),'utf8');
  for(const statement of sql.split(';').filter(s=>s.trim())) await conn.query(statement);
  const [indexes]=await conn.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reward_card' AND INDEX_NAME='uk_card_allocation_serial'");
  if(!indexes.length) await conn.query('ALTER TABLE reward_card ADD UNIQUE KEY uk_card_allocation_serial(allocation_id,serial_no)');
  const [oldIndex]=await conn.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reward_card' AND INDEX_NAME='uk_card_month_serial'");
  if(oldIndex.length) await conn.query('ALTER TABLE reward_card DROP INDEX uk_card_month_serial');
}

module.exports={migrateSubjectCards};
