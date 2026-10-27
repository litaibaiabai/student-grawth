/**
 * 14_report_publish_jobs.js — 任务 14 状态发布批次与版本冻结迁移
 */
module.exports = {
  id: '14_report_publish_jobs',
  checksum: '14_report_publish_jobs_v1',
  up: async (connection) => {
    // 1. 为 term_report 增加审批指纹与发布批次标识
    try {
      await connection.query(`ALTER TABLE term_report ADD COLUMN approval_fingerprint VARCHAR(64) NULL`);
    } catch (e) {
      // 容错已存在列
    }

    try {
      await connection.query(`ALTER TABLE term_report ADD COLUMN source_revision INT NOT NULL DEFAULT 1`);
    } catch (e) {
      // 容错已存在列
    }

    // 2. 创建发布批次与状态汇总表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS report_publish_batch (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(64) NOT NULL UNIQUE,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        grade INT NULL,
        operator_id INT NOT NULL,
        total_target INT NOT NULL DEFAULT 0,
        success_count INT NOT NULL DEFAULT 0,
        blocked_count INT NOT NULL DEFAULT 0,
        blocked_summary JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_school_batch (school_id, term_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
