/**
 * 数据库初始化脚本
 * 创建数据库、表、并插入测试用户
 *
 * 使用方法: node scripts/seed.js
 */

const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
require("dotenv").config();

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  multipleStatements: true
};

const DB_NAME = process.env.DB_NAME || "template_db";

async function run() {
  let conn;
  try {
    // 连接 MySQL（不指定数据库，先创建）
    conn = await mysql.createConnection(DB_CONFIG);
    console.log(`✅ 已连接到 MySQL (${DB_CONFIG.host}:${DB_CONFIG.port})`);

    // 创建数据库
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARSET utf8mb4`
    );
    console.log(`✅ 数据库 "${DB_NAME}" 已就绪`);

    // 使用数据库
    await conn.query(`USE \`${DB_NAME}\``);

    // 创建用户表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          INT PRIMARY KEY AUTO_INCREMENT,
        username    VARCHAR(50)  NOT NULL UNIQUE,
        password    VARCHAR(100) NOT NULL,
        role        VARCHAR(20)  NOT NULL DEFAULT 'user',
        real_name   VARCHAR(50)  DEFAULT NULL,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ 表 "users" 已就绪');

    // 创建 token_blacklist 表（token 注销黑名单）
    await conn.query(`
      CREATE TABLE IF NOT EXISTS token_blacklist (
        token_hash  VARCHAR(64)  PRIMARY KEY,
        expires_at  DATETIME(3)  NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ 表 "token_blacklist" 已就绪');

    // 插入测试用户（存在则跳过）
    const testUsers = [
      { username: "admin", password: "admin123", role: "admin", real_name: "管理员" },
      { username: "user1", password: "123456", role: "user", real_name: "张三" }
    ];

    for (const u of testUsers) {
      const hashedPassword = bcrypt.hashSync(u.password, 10);
      await conn.query(
        `INSERT IGNORE INTO users (username, password, role, real_name) VALUES (?, ?, ?, ?)`,
        [u.username, hashedPassword, u.role, u.real_name]
      );
      console.log(`  👤 测试用户 "${u.username}" (${u.role}) 已就绪`);
    }

    console.log(`\n🎉 数据库初始化完成！`);
    console.log(`\n📋 测试账号:`);
    console.log(`   管理员: admin / admin123`);
    console.log(`   普通用户: user1 / 123456`);

  } catch (err) {
    console.error("❌ 初始化失败:", err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

run();
