/**
 * 06_story_review.js — 任务 06 故事建议与终审数据库迁移
 */
module.exports = {
  id: '06_story_review_and_suggestions',
  checksum: '06_story_review_v1',
  up: async (connection) => {
    const [cols] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'story_submission'
    `);
    const existing = new Set(cols.map(c => c.COLUMN_NAME));

    if (!existing.has('ai_score')) {
      await connection.query(`
        ALTER TABLE story_submission
        ADD COLUMN ai_score DECIMAL(5,2) NULL COMMENT 'AI初评规则建议得分'
      `);
    }

    if (!existing.has('ai_suggestion')) {
      await connection.query(`
        ALTER TABLE story_submission
        ADD COLUMN ai_suggestion TEXT NULL COMMENT 'AI初评规则建议'
      `);
    }
  }
};
