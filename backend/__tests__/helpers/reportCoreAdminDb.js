const {
  createV2TestDb,
  command
} = require('./reportCoreV2Db');
async function createAdminTestDb(t, overrides = {}) {
  const db = await createV2TestDb(t, overrides);
  await require('../../scripts/migrateAdminClasses').migrateAdminClasses({
    connection: db.pool,
    targetDb: db.name,
    mode: 'apply'
  });
  return db;
}
module.exports = {
  createAdminTestDb,
  command
};
