const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { generatePreclassifiedCards, getAvailableRewardLeaves } = require('../services/rewardCategoryService');

describe('Task 02: 预分类制卡与打印', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_cards_' + Date.now();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${testDbName}\``);

    // 载入基础 schema
    const root = path.resolve(__dirname, '../..');
    const fullSchema = fs.readFileSync(path.join(root, 'sql/00_full_schema.sql'), 'utf8')
      .replaceAll('`student_growth`', '`' + testDbName + '`');
    await connection.query(fullSchema);

    // 应用改造迁移
    const { applyRegisteredMigrations } = require('../services/migrationRunner');
    require('../migrations/renovation');
    await applyRegisteredMigrations({ connection, databaseName: testDbName });

    // 初始化基础学期、教师与指标
    await connection.query(`
      INSERT INTO academic_year (id, school_id, academic_year, semester, start_date, end_date, is_current, active)
      VALUES (1, 1, '2026-2027', 1, '2026-09-01', '2027-01-31', 1, 1);
      INSERT INTO users (id, school_id, username, password, real_name, role, status)
      VALUES (101, 1, 'teacher_demo_a', 'hash123', '张老师', 'teacher', 0);
      INSERT INTO edu_evaluation_category (id, parent_id, category_level, category_code, category_name, score, status, version)
      VALUES 
        (1, 0, 1, 'D', '德育', 0, 1, 'V2'),
        (2, 1, 2, 'D01', '日常品德', 0, 1, 'V2'),
        (3, 2, 3, 'D01-01', '尊敬师长', 1, 1, 'V2'),
        (4, 0, 1, 'Z', '智育', 0, 1, 'V2'),
        (5, 4, 2, 'Z01', '学习探究', 0, 1, 'V2'),
        (6, 5, 3, 'Z01-01', '主动探究', 1, 1, 'V2');
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('日常卡仅限德育 D 和智育 Z，且绑定具体三级指标', async () => {
    const leaves = await getAvailableRewardLeaves(connection, ['D', 'Z']);
    assert.ok(leaves.length >= 2, '应存在 D 和 Z 的三级指标');
    assert.ok(leaves.every(l => l.category_code.startsWith('D') || l.category_code.startsWith('Z')));
  });

  test('generatePreclassifiedCards 成功生成 AUTO_V2 卡片，固定+1分且幂等', async () => {
    const monthKey = '2026-11';
    // 首次生成
    const res1 = await generatePreclassifiedCards({
      schoolId: 1,
      monthKey,
      conn: connection,
      countPerTeacher: 10
    });
    assert.equal(res1.createdCount, 10, '首次生成应有 10 张卡片');

    // 再次生成触发幂等
    const res2 = await generatePreclassifiedCards({
      schoolId: 1,
      monthKey,
      conn: connection,
      countPerTeacher: 10
    });
    assert.equal(res2.createdCount, 0, '二次生成应被幂等拦截');
    assert.equal(res2.idempotentSkipped, true, '应标记幂等跳过');

    // 验证生成的卡片属性
    const [cards] = await connection.query(
      "SELECT dimension_code, category_id, category_name, points, batch_code FROM reward_card WHERE school_id = 1 AND month_key = ? AND batch_code = 'AUTO_V2'",
      [monthKey]
    );
    assert.equal(cards.length, 10);
    assert.ok(cards.every(c => c.dimension_code === 'D' || c.dimension_code === 'Z'));
    assert.ok(cards.every(c => c.category_id > 0));
    assert.ok(cards.every(c => Boolean(c.category_name)));
    assert.ok(cards.every(c => Number(c.points) === 1));
  });
});
