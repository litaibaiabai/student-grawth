/**
 * 01_authorization.js — 任务 01 授权与学期状态数据库迁移
 */
module.exports = {
  id: '01_authorization_and_term_state',
  checksum: '01_auth_tables_v1',
  up: async (connection) => {
    // 1. 教师按学期任教关系与班主任职责表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS teacher_teaching_assignment (
        id INT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        teacher_id INT NOT NULL,
        grade INT NOT NULL,
        class_no INT NOT NULL,
        subject_code VARCHAR(32) NOT NULL,
        is_head_teacher TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code),
        KEY idx_teacher_term (school_id, term_id, teacher_id),
        KEY idx_class_subject (school_id, term_id, grade, class_no, subject_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // 2. 学生学期状态与权威版本表 (C2 student_term_state)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_term_state (
        id INT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        student_id INT NOT NULL,
        source_revision INT NOT NULL DEFAULT 1,
        profile_revision INT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_student_term (school_id, term_id, student_id),
        KEY idx_term_student (term_id, student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // 3. 请求幂等记录表 (C2 idempotency)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS request_idempotency (
        request_key VARCHAR(64) NOT NULL PRIMARY KEY,
        school_id INT NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        response_body JSON NULL,
        source_revision INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_school_created (school_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
