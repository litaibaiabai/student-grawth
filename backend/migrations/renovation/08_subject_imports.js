/**
 * 08_subject_imports.js — 学科成绩导入批次表
 */

const migration = {
  id: '08_subject_imports',
  checksum: 'renovation_08_subject_imports_v1',
  async up(connection) {
    // 1. 学科成绩导入批次表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS subject_import_batch (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(64) NOT NULL UNIQUE,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        grade INT NOT NULL,
        class_no INT NOT NULL,
        subject_code VARCHAR(32) NOT NULL,
        teacher_id BIGINT NOT NULL,
        row_count INT NOT NULL DEFAULT 0,
        valid_count INT NOT NULL DEFAULT 0,
        error_count INT NOT NULL DEFAULT 0,
        diff_summary JSON NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PREVIEW',
        payload_hash VARCHAR(64) NOT NULL,
        expected_revisions JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        committed_at TIMESTAMP NULL,
        KEY idx_school_term_subject (school_id, term_id, subject_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. 确保 subject_score 包含 score 列
    try {
      await connection.query(`
        ALTER TABLE subject_score ADD COLUMN score DECIMAL(5,2) NULL AFTER subject_name
      `);
    } catch (e) {
      // 若已存在则忽略
    }
  }
};

module.exports = migration;
