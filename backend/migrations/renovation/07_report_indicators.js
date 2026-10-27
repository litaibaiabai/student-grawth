/**
 * 07_report_indicators.js — 年级指标定义与教师过程评价值
 */

const migration = {
  id: '07_report_indicators',
  checksum: 'renovation_07_report_indicators_v1',
  async up(connection) {
    // 1. 年级指标字典表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS grade_indicator_definition (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        grade INT NOT NULL,
        indicator_code VARCHAR(64) NOT NULL,
        indicator_name VARCHAR(128) NOT NULL,
        dimension VARCHAR(8) NOT NULL,
        value_type VARCHAR(16) NOT NULL DEFAULT 'star',
        unit VARCHAR(32) DEFAULT '',
        is_required TINYINT(1) DEFAULT 0,
        status VARCHAR(16) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_school_term_grade_code (school_id, term_id, grade, indicator_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. 学生指标评价值表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_indicator_value (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        student_id BIGINT NOT NULL,
        indicator_id BIGINT DEFAULT NULL,
        indicator_code VARCHAR(64) NOT NULL,
        value_type VARCHAR(16) NOT NULL,
        raw_value TEXT NULL,
        typed_value VARCHAR(255) NULL,
        numeric_value DECIMAL(10,2) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'RECORDED',
        evaluated_by BIGINT NOT NULL,
        evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revision INT NOT NULL DEFAULT 1,
        UNIQUE KEY uk_student_term_indicator (student_id, term_id, indicator_code),
        KEY idx_school_term_student (school_id, term_id, student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
};

module.exports = migration;
