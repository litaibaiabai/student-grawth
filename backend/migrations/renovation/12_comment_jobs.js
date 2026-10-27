/**
 * 12_comment_jobs.js — 任务 12 AI 寄语异步任务与扩展位迁移
 */
module.exports = {
  id: '12_comment_jobs',
  checksum: '12_comment_jobs_v1',
  up: async (connection) => {
    // 1. 在报告草稿表增加可选 AI 建议与家长评语扩展位
    try {
      await connection.query(`ALTER TABLE student_report_draft ADD COLUMN ai_suggestion TEXT NULL`);
    } catch (e) {
      // 容错已存在列
    }

    try {
      await connection.query(`ALTER TABLE student_report_draft ADD COLUMN parent_comment TEXT NULL`);
    } catch (e) {
      // 容错已存在列
    }

    // 2. 创建 AI 寄语异步任务表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ai_comment_job (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id VARCHAR(64) NOT NULL UNIQUE,
        draft_id INT NOT NULL,
        expected_fingerprint VARCHAR(64) NOT NULL,
        model_name VARCHAR(64) NOT NULL DEFAULT 'deepseek-chat',
        source VARCHAR(32) NOT NULL DEFAULT 'MODEL',
        status ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
        prompt_tokens INT NULL,
        completion_tokens INT NULL,
        cited_evidence JSON NULL,
        suggestion_text TEXT NULL,
        error_message VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_draft (draft_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
