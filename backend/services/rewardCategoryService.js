/**
 * rewardCategoryService.js — 任务 02 预分类制卡与固定分值服务
 *
 * 核心规范：
 * 1. 日常卡仅保留德育 D 和智育 Z 两个维度，严禁生成 T/M/L/G；
 * 2. 每张卡片预先绑定具体的三级指标 (category_id, category_name) 与版本；
 * 3. 固定分值 points = 1；
 * 4. 批次号 batch_code = 'AUTO_V2'；
 * 5. 幂等发卡：同月份重复触发不产生增量卡片。
 */
const crypto = require('crypto');
const { encryptToken, credentialContext, tokenHash } = require('./cardCredentials');

/**
 * 获取可用于日常预分类卡片的三级指标叶子节点 (仅限 D 和 Z)
 */
async function getAvailableRewardLeaves(conn, dimensions = ['D', 'Z']) {
  const whereClauses = dimensions.map(d => `category_code LIKE '${d}%'`).join(' OR ');
  const [rows] = await conn.query(
    `SELECT id, category_code, category_name, version 
     FROM edu_evaluation_category 
     WHERE category_level = 3 AND status = 1 AND (${whereClauses})
     ORDER BY category_code ASC`
  );
  return rows || [];
}

/**
 * 为指定学校和月份生成预分类卡片 (AUTO_V2)
 */
async function generatePreclassifiedCards({ schoolId = 1, monthKey = '2026-10', conn, teacherId = null, countPerTeacher = 20 }) {
  if (!conn) {
    throw new Error('数据库连接必须提供');
  }

  // 1. 幂等性检查：如果当月已存在 AUTO_V2 卡片，直接返回统计结果
  const [existingCards] = await conn.query(
    "SELECT COUNT(*) as cnt FROM reward_card WHERE school_id = ? AND month_key = ? AND batch_code = 'AUTO_V2'",
    [schoolId, monthKey]
  );
  if (existingCards[0].cnt > 0 && !teacherId) {
    return {
      schoolId,
      monthKey,
      createdCount: 0,
      existingCount: existingCards[0].cnt,
      idempotentSkipped: true
    };
  }

  function formatSqlDate(val) {
    if (!val) return '2027-01-31';
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(val).slice(0, 10);
  }

  // 2. 获取有效学期
  const [termRows] = await conn.query(
    'SELECT id, start_date, end_date FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1',
    [schoolId]
  );
  const termId = termRows.length ? termRows[0].id : 1;
  const validUntil = `${formatSqlDate(termRows[0]?.end_date)} 23:59:59`;

  // 3. 获取目标教师
  let teacherQuery = "SELECT id, real_name, username FROM users WHERE school_id = ? AND role = 'teacher' AND status = 0";
  const teacherParams = [schoolId];
  if (teacherId) {
    teacherQuery += ' AND id = ?';
    teacherParams.push(teacherId);
  }
  const [teachers] = await conn.query(teacherQuery, teacherParams);
  if (!teachers.length) {
    return { schoolId, monthKey, createdCount: 0, message: '未找到在职教师' };
  }

  // 4. 获取 D 和 Z 三级叶子节点
  const leaves = await getAvailableRewardLeaves(conn, ['D', 'Z']);
  const dLeaves = leaves.filter(l => l.category_code.startsWith('D'));
  const zLeaves = leaves.filter(l => l.category_code.startsWith('Z'));

  if (!dLeaves.length || !zLeaves.length) {
    throw new Error('系统尚未初始化德育(D)或智育(Z)三级指标分类');
  }

  const values = [];
  let totalSerial = 0;

  for (const teacher of teachers) {
    // 检查此教师是否已有卡片
    const [teacherExisting] = await conn.query(
      "SELECT COUNT(*) as cnt FROM reward_card WHERE school_id = ? AND teacher_id = ? AND month_key = ? AND batch_code = 'AUTO_V2'",
      [schoolId, teacher.id, monthKey]
    );
    if (teacherExisting[0].cnt > 0) {
      continue;
    }

    const half = Math.floor(countPerTeacher / 2);
    const validFrom = `${monthKey}-01 00:00:00`;
    // 生成德育 D 卡片
    for (let i = 0; i < half; i++) {
      totalSerial++;
      const leaf = dLeaves[i % dLeaves.length];
      const token = crypto.randomBytes(32).toString('hex');
      const cardContext = { school_id: schoolId, serial_no: totalSerial, batch_code: 'AUTO_V2' };
      values.push([
        schoolId,
        termId,
        teacher.id,
        monthKey,
        totalSerial,
        'D',
        leaf.id,
        leaf.category_name,
        leaf.version || 'V2',
        1, // points 固定 +1
        'AUTO_V2',
        tokenHash(token),
        encryptToken(token, credentialContext(cardContext)),
        'UNUSED',
        0,
        validFrom,
        validUntil
      ]);
    }

    // 生成智育 Z 卡片
    for (let i = 0; i < (countPerTeacher - half); i++) {
      totalSerial++;
      const leaf = zLeaves[i % zLeaves.length];
      const token = crypto.randomBytes(32).toString('hex');
      const cardContext = { school_id: schoolId, serial_no: totalSerial, batch_code: 'AUTO_V2' };
      values.push([
        schoolId,
        termId,
        teacher.id,
        monthKey,
        totalSerial,
        'Z',
        leaf.id,
        leaf.category_name,
        leaf.version || 'V2',
        1, // points 固定 +1
        'AUTO_V2',
        tokenHash(token),
        encryptToken(token, credentialContext(cardContext)),
        'UNUSED',
        0,
        validFrom,
        validUntil
      ]);
    }
  }

  if (values.length > 0) {
    const sql = `
      INSERT INTO reward_card (
        school_id, term_id, teacher_id, month_key, serial_no,
        dimension_code, category_id, category_name, category_version,
        points, batch_code, token_hash, token_ciphertext,
        status, is_legacy_test, valid_from, valid_until
      ) VALUES ?
    `;
    await conn.query(sql, [values]);
  }

  return {
    schoolId,
    monthKey,
    createdCount: values.length,
    teacherCount: teachers.length
  };
}

module.exports = {
  getAvailableRewardLeaves,
  generatePreclassifiedCards
};
