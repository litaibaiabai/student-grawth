// db.js — MySQL 数据库连接池（模板化版本）
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "your_password",
  database: process.env.DB_NAME || "template_db",
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  charset: "utf8mb4",
  waitForConnections: true,
  queueLimit: 0
});

// 测试连接（非测试环境下）
if (process.env.NODE_ENV !== "test") {
  pool
    .getConnection()
    .then(async (conn) => {
      console.log("✅ MySQL 数据库连接池创建成功");
      try {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS token_blacklist (
            token_hash VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'Token SHA-256 散列',
            expires_at DATETIME(3) NOT NULL COMMENT 'Token 过期时间',
            created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '加入黑名单时间'
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Token注销黑名单表';
        `);
      } catch (e) {
        console.warn("⚠️ 自动创建 token_blacklist 表失败:", e.message);
      } finally {
        conn.release();
      }
    })
    .catch((err) => {
      console.error("❌ MySQL 连接错误:", err.message);
    });
}

/**
 * 执行 SQL 查询的便捷方法
 * @param {string} sql  SQL 语句
 * @param {Array} params  参数数组
 * @returns {Promise<Array>} 查询结果
 */
const execute = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

/**
 * 执行 SQL 查询（支持 SELECT 流式结果）
 * @param {string} sql  SQL 语句
 * @param {Array} params  参数数组
 * @returns {Promise<[Array, Array]>} [rows, fields]
 */
const query = async (sql, params = []) => {
  return await pool.query(sql, params);
};

module.exports = { pool, execute, query };
