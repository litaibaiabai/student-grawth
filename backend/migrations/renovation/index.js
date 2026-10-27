/**
 * backend/migrations/renovation/index.js
 *
 * 改造工程迁移注册入口
 * 各开发票通过此文件或向 migrationRunner 注册独立的增量迁移步骤
 */
const { registerMigration } = require('../../services/migrationRunner');

// 20A 基础迁移：确保迁移登记表及隔离前缀兼容
registerMigration({
  id: '20A_migration_registry_baseline',
  checksum: '20a_baseline_v1',
  up: async (connection) => {
    await connection.query('SELECT 1');
  }
});

// 01 任教授权与学期状态迁移
const authMigration = require('./01_authorization');
registerMigration(authMigration);

module.exports = {
  initialized: true
};

