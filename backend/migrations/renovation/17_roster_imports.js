/**
 * 17_roster_imports.js — 任务 17 学籍表导入与批次记录迁移
 */
module.exports = {
  id: '17_roster_imports',
  checksum: '17_roster_imports_v1',
  up: async (connection) => {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS roster_import_batch (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(64) NOT NULL UNIQUE,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        operator_id INT NOT NULL,
        total_rows INT NOT NULL DEFAULT 0,
        insert_count INT NOT NULL DEFAULT 0,
        update_count INT NOT NULL DEFAULT 0,
        conflict_count INT NOT NULL DEFAULT 0,
        details_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_school_term (school_id, term_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
