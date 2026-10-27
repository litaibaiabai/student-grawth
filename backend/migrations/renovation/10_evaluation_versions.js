/**
 * 10_evaluation_versions.js — 六育评价快照与核算版本表
 */

const migration = {
  id: '10_evaluation_versions',
  checksum: 'renovation_10_evaluation_versions_v1',
  async up(connection) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_evaluation_snapshot (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        student_id BIGINT NOT NULL,
        policy_version VARCHAR(64) NOT NULL,
        source_revision INT NOT NULL,
        comprehensive_score DECIMAL(5,2) NOT NULL,
        six_average DECIMAL(5,2) NOT NULL,
        six_dimensions JSON NOT NULL,
        process_summary JSON NULL,
        honor_summary JSON NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'COMPLETE',
        missing_reasons JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_student_term_policy_rev (student_id, term_id, policy_version, source_revision),
        KEY idx_school_term_student (school_id, term_id, student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
};

module.exports = migration;
