/**
 * backend/migrations/renovation/19_identity_links.js
 *
 * 任务 19: 钉钉身份预留与外部账号映射表
 */
module.exports = {
  id: '19_identity_links',
  async up(connection) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS external_identity_link (
        id INT AUTO_INCREMENT PRIMARY KEY,
        school_id INT NOT NULL,
        user_id INT NOT NULL,
        provider VARCHAR(32) NOT NULL DEFAULT 'DINGTALK',
        tenant_id VARCHAR(128) NOT NULL,
        external_subject VARCHAR(128) NOT NULL,
        external_name VARCHAR(128) NULL,
        status TINYINT NOT NULL DEFAULT 1,
        bound_by INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_school_prov_sub (school_id, provider, external_subject),
        KEY idx_school_user (school_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
