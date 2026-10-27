/**
 * 04_reward_ledger.js — 任务 04 账本追加合同与防二次冲销数据表扩展
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

  // 1. score_record 增加纠错与链条跟踪字段
  await ensureColumn('score_record', 'correction_type', "VARCHAR(16) NOT NULL DEFAULT 'NONE'");
  await ensureColumn('score_record', 'reversed_by_id', 'BIGINT UNSIGNED NULL');
  await ensureColumn('score_record', 'correction_chain_id', 'BIGINT UNSIGNED NULL');

  // 2. 检查并添加冲销索引与约束
  const [indexes] = await conn.query(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'score_record' AND INDEX_NAME = 'idx_score_record_orig'"
  );
  if (!indexes.length) {
    await conn.query('ALTER TABLE score_record ADD INDEX idx_score_record_orig (original_id, source)');
  }
}

module.exports = {
  id: '04_reward_ledger',
  name: '账本追加流水平面扩展',
  up
};
