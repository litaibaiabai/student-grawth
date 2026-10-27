/**
 * runMigrations.js — 数据库建表与初始数据迁移脚本
 *
 * 1. 确保 MySQL 目标数据库存在
 * 2. 依次加载并执行 SQL 建表脚本 (00_full_schema.sql 等)
 * 3. 运行基础数据初始化 (init_db_data.js)
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const fs = require("fs");
const mysql = require("mysql2/promise");
const { migrateSubjectCards } = require('../migrations/20261026_subject_cards');
const { applyRegisteredMigrations } = require('../services/migrationRunner');
require('../migrations/renovation');

async function run() {
  const dbName = process.env.DB_NAME || "student_growth";
  console.log(`🚀 开始执行数据库迁移与初始化 [数据库: ${dbName}]...`);

  const connectionConfig = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  };

  let conn;
  try {
    conn = await mysql.createConnection(connectionConfig);
    console.log(`✅ 已连接到 MySQL 服务器 (${connectionConfig.host}:${connectionConfig.port})`);

    // 1. 创建数据库
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
    );
    console.log(`✅ 数据库 \`${dbName}\` 已就绪`);

    await conn.query(`USE \`${dbName}\`;`);

    // 2. 查找并执行 sql/00_full_schema.sql
    const candidateSqlPaths = [
      path.join(__dirname, "../../sql/00_full_schema.sql"),
      path.join(__dirname, "../sql/00_full_schema.sql"),
      path.join(process.cwd(), "sql/00_full_schema.sql"),
      path.join(process.cwd(), "../sql/00_full_schema.sql"),
    ];

    let fullSchemaPath = candidateSqlPaths.find((p) => fs.existsSync(p));
    if (fullSchemaPath) {
      console.log(`📄 正在执行建表脚本: ${fullSchemaPath}`);
      const sqlContent = fs.readFileSync(fullSchemaPath, "utf-8").replace(/`student_growth`/g, '`' + dbName.replace(/`/g, '``') + '`');
      await conn.query(sqlContent);
      console.log(`✅ 建表脚本执行完成`);
    } else {
      console.log(`ℹ️ 未找到 00_full_schema.sql 文件，跳过 SQL 脚本执行`);
    }

    await migrateSubjectCards(conn);
    await applyRegisteredMigrations({ connection: conn, databaseName: dbName });
    console.log(`✅ 增量注册迁移已应用`);

    // 3. 确保 token_blacklist 表存在
    await conn.query(`
      CREATE TABLE IF NOT EXISTS token_blacklist (
        token_hash VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'Token SHA-256 散列',
        expires_at DATETIME(3) NOT NULL COMMENT 'Token 过期时间',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '加入黑名单时间'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Token注销黑名单表';
    `);

    // 4. 检查是否需要执行基础数据初始化
    const [userRows] = await conn.query("SELECT COUNT(*) as cnt FROM users");
    if (!userRows[0] || userRows[0].cnt === 0) {
      console.log(`🌱 检测到 users 表无数据，正在调用 init_db_data.js 进行数据填充...`);
      // 关闭当前连接，让 init_db_data 使用其自身的连接池
      await conn.end();
      conn = null;
      require("./init_db_data");
      return;
    } else {
      console.log(`✅ users 表已存在 ${userRows[0].cnt} 条记录，基础数据已初始化`);
    }

    console.log(`\n🎉 数据库迁移及检查完成！`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ 数据库迁移失败:`, err.message);
    process.exit(1);
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch (e) {
        // ignore
      }
    }
  }
}

run();
