/**
 * 09_health_values.js — 学生体测与健康记录表
 */

const migration = {
  id: '09_health_values',
  checksum: 'renovation_09_health_values_v1',
  async up(connection) {
    // 1. 学生体测健康明细表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_health_record (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        student_id BIGINT NOT NULL,
        height DECIMAL(5,1) NULL,
        height_unit VARCHAR(16) NOT NULL DEFAULT 'cm',
        weight DECIMAL(5,1) NULL,
        weight_unit VARCHAR(16) NOT NULL DEFAULT 'kg',
        vital_capacity INT NULL,
        left_vision VARCHAR(16) NULL,
        right_vision VARCHAR(16) NULL,
        fifty_run DECIMAL(4,1) NULL,
        sit_and_reach DECIMAL(4,1) NULL,
        absence_type VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
        tested_at DATE NULL,
        imported_by BIGINT NOT NULL,
        batch_id VARCHAR(64) NULL,
        revision INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_student_term_health (student_id, term_id),
        KEY idx_school_term (school_id, term_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. 体测导入批次表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS health_import_batch (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(64) NOT NULL UNIQUE,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        teacher_id BIGINT NOT NULL,
        row_count INT NOT NULL DEFAULT 0,
        valid_count INT NOT NULL DEFAULT 0,
        error_count INT NOT NULL DEFAULT 0,
        diff_summary JSON NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PREVIEW',
        payload_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        committed_at TIMESTAMP NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
};

module.exports = migration;
