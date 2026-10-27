/**
 * 16_growth_theme.js — 任务 16 学生主题偏好与成长首页迁移
 */
module.exports = {
  id: '16_growth_theme',
  checksum: '16_growth_theme_v1',
  up: async (connection) => {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_theme_preference (
        student_id INT PRIMARY KEY,
        theme_id VARCHAR(32) NOT NULL DEFAULT 'default',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
  }
};
