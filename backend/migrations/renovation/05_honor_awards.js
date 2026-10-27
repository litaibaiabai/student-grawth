/**
 * 05_honor_awards.js — 任务 05 荣誉认定与奖励数据库迁移
 */
module.exports = {
  id: '05_honor_awards_and_c3_sync',
  checksum: '05_honor_awards_v1',
  up: async (connection) => {
    // 检查并扩展 honor_record 表列
    const [cols] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'honor_record'
    `);
    const existing = new Set(cols.map(c => c.COLUMN_NAME));

    if (!existing.has('dimension_code')) {
      await connection.query(`
        ALTER TABLE honor_record
        ADD COLUMN dimension_code VARCHAR(16) NULL DEFAULT 'T' COMMENT '认定的六育维度(T/M/L等)'
      `);
    }

    if (!existing.has('category_id')) {
      await connection.query(`
        ALTER TABLE honor_record
        ADD COLUMN category_id INT NULL COMMENT '认定的指标分类ID'
      `);
    }

    if (!existing.has('award_points')) {
      await connection.query(`
        ALTER TABLE honor_record
        ADD COLUMN award_points INT NOT NULL DEFAULT 1 COMMENT '认定的正式评价分'
      `);
    }

    if (!existing.has('score_record_id')) {
      await connection.query(`
        ALTER TABLE honor_record
        ADD COLUMN score_record_id BIGINT UNSIGNED NULL COMMENT '关联的C3账本流水ID'
      `);
    }

    if (!existing.has('rule_version')) {
      await connection.query(`
        ALTER TABLE honor_record
        ADD COLUMN rule_version VARCHAR(32) NOT NULL DEFAULT 'V2' COMMENT '采用的认定规则版本'
      `);
    }
  }
};
