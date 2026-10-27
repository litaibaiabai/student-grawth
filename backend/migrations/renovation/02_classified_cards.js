/**
 * 02_classified_cards.js — 任务 02 预分类制卡与固定分值数据迁移
 */
async function up(conn) {
  async function ensureColumn(table, colName, ddl) {
    const [rows] = await conn.query(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, colName]
    );
    if (!rows.length) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${colName}\` ${ddl}`);
    }
  }

  // 1. reward_card 增加 batch_code, points, category_name, category_version
  await ensureColumn('reward_card', 'batch_code', "VARCHAR(32) NOT NULL DEFAULT 'AUTO_V2'");
  await ensureColumn('reward_card', 'points', 'INT NOT NULL DEFAULT 1');
  await ensureColumn('reward_card', 'category_name', 'VARCHAR(128) NULL');
  await ensureColumn('reward_card', 'category_version', "VARCHAR(32) NOT NULL DEFAULT 'V2'");
  await ensureColumn('reward_card', 'category_path', 'VARCHAR(256) NULL');

  // 2. 索引优化
  const [indexes] = await conn.query(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reward_card' AND INDEX_NAME = 'idx_reward_card_batch'"
  );
  if (!indexes.length) {
    await conn.query('ALTER TABLE reward_card ADD INDEX idx_reward_card_batch (school_id, batch_code, status)');
  }
}

module.exports = {
  id: '02_classified_cards',
  name: '预分类制卡与固定分值扩展',
  up
};
