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
    // 20A 仅保证基础兼容，不提前创建后续业务表
    await connection.query('SELECT 1');
  }
});

module.exports = {
  initialized: true
};
