/**
 * 18_device_sessions.js — 任务 18A 公共设备与受限会话迁移
 */
module.exports = {
  id: '18_device_sessions',
  checksum: '18_device_sessions_v1',
  up: async (connection) => {
    // 1. 公共终端设备表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS kiosk_device (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_code VARCHAR(64) NOT NULL UNIQUE,
        device_secret VARCHAR(64) NOT NULL,
        school_id INT NOT NULL,
        location_name VARCHAR(128) NOT NULL,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_school_device (school_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // 2. 终端受限短会话表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS kiosk_session (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_token VARCHAR(64) NOT NULL UNIQUE,
        device_code VARCHAR(64) NOT NULL,
        school_id INT NOT NULL,
        student_id INT NOT NULL,
        scope VARCHAR(64) NOT NULL DEFAULT 'CARD_REDEEM',
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_token_exp (session_token, expires_at),
        KEY idx_student_session (school_id, student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
