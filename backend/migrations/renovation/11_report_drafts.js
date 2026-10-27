/**
 * 11_report_drafts.js — 任务 11 报告草稿与教师确认数据库迁移
 */
module.exports = {
  id: '11_report_drafts',
  checksum: '11_report_drafts_v1',
  up: async (connection) => {
    // 1. 报告草稿与确认主表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_report_draft (
        id INT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        student_id INT NOT NULL,
        grade INT NOT NULL,
        class_no INT NOT NULL,
        status ENUM('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
        source_revision INT NOT NULL DEFAULT 1,
        policy_version VARCHAR(64) NULL,
        approval_fingerprint VARCHAR(64) NOT NULL,
        draft_snapshot JSON NOT NULL,
        teacher_comment TEXT NULL,
        comment_version INT NOT NULL DEFAULT 1,
        confirmed_by INT NULL,
        confirmed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_student_term_report (school_id, term_id, student_id),
        KEY idx_class_report (school_id, term_id, grade, class_no),
        KEY idx_confirmed (status, confirmed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // 2. 寄语修订历史表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS report_comment_revision (
        id INT AUTO_INCREMENT PRIMARY KEY,
        draft_id INT NOT NULL,
        revision_no INT NOT NULL,
        author_id INT NOT NULL,
        author_role VARCHAR(32) NOT NULL DEFAULT 'TEACHER',
        comment_text TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_draft_rev (draft_id, revision_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
