/**
 * 13_family_feedback.js — 任务 13 家长寄语与访问凭证数据库迁移
 */
module.exports = {
  id: '13_family_feedback',
  checksum: '13_family_feedback_v1',
  up: async (connection) => {
    // 1. 家长安全访问授权凭证表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS family_access_token (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) NOT NULL UNIQUE,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        student_id INT NOT NULL,
        parent_name VARCHAR(64) NULL,
        parent_phone VARCHAR(32) NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_student (school_id, term_id, student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // 2. 家长寄语独立反馈流表 (只追加保留)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS family_feedback_record (
        id INT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        student_id INT NOT NULL,
        parent_name VARCHAR(64) NULL,
        comment_text TEXT NOT NULL,
        proxy_by_student TINYINT(1) NOT NULL DEFAULT 0,
        token_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_student_feedback (school_id, term_id, student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
