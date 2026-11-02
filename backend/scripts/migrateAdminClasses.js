const fs = require('node:fs');
const path = require('node:path');
const schema = require('../../docs/database/admin-closure.schema.json');
const {
  safeTarget
} = require('./migrateSixEducationV2');
async function inspectRegistry(connection, targetDb) {
  const conflicts = [];
  const [cols] = await connection.query('SHOW COLUMNS FROM school_class');
  const actual = new Map(cols.map(c => [c.Field, c]));
  for (const [name, type] of Object.entries(schema.columns)) if (actual.get(name)?.Type !== type || actual.get(name)?.Null !== (['display_name', 'responsible_teacher_id', 'created_by', 'updated_by'].includes(name) ? 'YES' : 'NO')) conflicts.push({
    kind: 'COLUMN_DEFINITION',
    table: 'school_class',
    column: name,
    actual: actual.get(name)?.Type,
    expected: type
  });
  if (!/\bauto_increment\b/i.test(actual.get('id')?.Extra || '')) conflicts.push({kind:'COLUMN_EXTRA',table:'school_class',column:'id',expected:'auto_increment',actual:actual.get('id')?.Extra});
  for (const [column, expected] of Object.entries({revision:'1',created_at:'current_timestamp(6)',updated_at:'current_timestamp(6)'})) {
    const value=actual.get(column)?.Default;
    if (String(value).toLowerCase()!==expected) conflicts.push({kind:'COLUMN_DEFAULT',table:'school_class',column,expected,actual:value});
  }
  if (!/on update current_timestamp\(6\)/i.test(actual.get('updated_at')?.Extra || '')) conflicts.push({kind:'COLUMN_EXTRA',table:'school_class',column:'updated_at',expected:'on update CURRENT_TIMESTAMP(6)',actual:actual.get('updated_at')?.Extra});
  for (const name of actual.keys()) if (!Object.hasOwn(schema.columns, name)) conflicts.push({
    kind: 'UNKNOWN_COLUMN',
    column: name
  });
  const [idx] = await connection.query('SHOW INDEX FROM school_class');
  for (const [key, columns] of Object.entries({
    PRIMARY: ['id'],
    uk_class_school_id: ['school_id', 'id'],
    uk_class_identity: ['school_id', 'term_id', 'grade', 'class_no']
  })) {
    const found = idx.filter(i => i.Key_name === key).sort((a, b) => a.Seq_in_index - b.Seq_in_index);
    if (found.length !== columns.length || found.some((i, n) => i.Column_name !== columns[n] || i.Non_unique !== 0 || i.Sub_part !== null)) conflicts.push({
      kind: 'INDEX',
      name: key
    });
  }
  const [constraints] = await connection.query('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME=\'school_class\'', [targetDb]);
  for (const key of schema.constraints) if (!constraints.some(c => c.CONSTRAINT_NAME === key)) conflicts.push({
    kind: 'CONSTRAINT',
    name: key
  });
  const [checks] = await connection.query("SELECT tc.CONSTRAINT_NAME,cc.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_SCHEMA=? AND tc.TABLE_NAME='school_class'", [targetDb]);
  for (const [key, expected] of Object.entries({
    ck_class_identity: 'grade>0andclass_no>0',
    ck_class_revision: 'revision>0'
  })) {
    const clause = checks.find(c => c.CONSTRAINT_NAME === key)?.CHECK_CLAUSE?.toLowerCase().replace(/[\s`()]/g, '');
    if (clause !== expected) conflicts.push({
      kind: 'CHECK_DEFINITION',
      name: key
    });
  }
  const [fks] = await connection.query("SELECT CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME='school_class' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY ORDINAL_POSITION", [targetDb]);
  for (const [name, table, col] of [['fk_class_term', 'academic_year', 'term_id'], ['fk_class_responsible', 'users', 'responsible_teacher_id'], ['fk_class_created', 'users', 'created_by'], ['fk_class_updated', 'users', 'updated_by']]) {
    const rows = fks.filter(r => r.CONSTRAINT_NAME === name);
    if (rows.length !== 2 || !rows.some(r => r.COLUMN_NAME === 'school_id' && r.REFERENCED_COLUMN_NAME === 'school_id' && r.REFERENCED_TABLE_NAME === table) || !rows.some(r => r.COLUMN_NAME === col && r.REFERENCED_COLUMN_NAME === 'id' && r.REFERENCED_TABLE_NAME === table)) conflicts.push({
      kind: 'FOREIGN_KEY',
      name
    });
  }
  return conflicts;
}
async function migrateAdminClasses({
  connection,
  targetDb,
  mode = 'check'
}) {
  if (!safeTarget(targetDb) || !['check', 'apply'].includes(mode)) throw Error('Unsafe target database or mode');
  const [[current]] = await connection.query('SELECT DATABASE() db');
  if (current.db !== targetDb) throw Error('Connection target mismatch');
  const [tables] = await connection.query('SHOW TABLES');
  const names = tables.map(r => Object.values(r)[0]);
  if (names.length < 7 || names.length > 8 || schema.tables.slice(0, 7).some(n => !names.includes(n)) || names.some(n => !schema.tables.includes(n))) throw Error('Unknown or partial schema: verified V2 seven-table clone required');
  const base = await require('./migrateSixEducationV2').migrateSixEducationV2({
    connection,
    targetDb
  });
  const conflicts = [...base.conflicts];
  if (base.pending.length) conflicts.push({
    kind: 'V2_PENDING',
    pending: base.pending
  });
  if (names.includes('school_class')) conflicts.push(...(await inspectRegistry(connection, targetDb)));
  const [heads] = await connection.query('SELECT school_id,term_id,grade,class_no,COUNT(DISTINCT teacher_id) total FROM teacher_teaching_assignment WHERE enabled=1 AND is_head_teacher=1 GROUP BY school_id,term_id,grade,class_no HAVING COUNT(DISTINCT teacher_id)>1');
  for (const row of heads) conflicts.push({
    kind: 'DUPLICATE_HEAD',
    ...row
  });
  const [terms] = await connection.query("SELECT id FROM academic_year WHERE COALESCE(JSON_EXTRACT(evaluation_config,'$.adminClassRegistryVersion'),0)<>1");
  const pending = [...(!names.includes('school_class') ? ['table:school_class'] : []), ...(terms.length ? ['backfill:classes', 'config:adminClassRegistryVersion'] : [])];
  const applied = [];
  let backfilled = 0;
  if (mode === 'apply') {
    if (conflicts.length) throw Object.assign(Error('班级注册表结构或负责人冲突'), {
      conflicts
    });
    if (!names.includes('school_class')) {
      await connection.query(fs.readFileSync(path.join(__dirname, '../../sql/07_admin_class_registry.sql'), 'utf8').replace(/^--.*$/mg, ''));
      applied.push('table:school_class');
    }
    if (terms.length) {
      const [r] = await connection.query(`INSERT INTO school_class(school_id,term_id,grade,class_no,responsible_teacher_id) SELECT x.school_id,x.term_id,x.grade,x.class_no,(SELECT MIN(a.teacher_id) FROM teacher_teaching_assignment a WHERE a.school_id=x.school_id AND a.term_id=x.term_id AND a.grade=x.grade AND a.class_no=x.class_no AND a.enabled=1 AND a.is_head_teacher=1) FROM (SELECT school_id,term_id,grade_snapshot grade,class_no_snapshot class_no FROM student_term_evaluation UNION SELECT school_id,term_id,grade,class_no FROM teacher_teaching_assignment WHERE enabled=1) x JOIN academic_year t ON t.school_id=x.school_id AND t.id=x.term_id WHERE COALESCE(JSON_EXTRACT(t.evaluation_config,'$.adminClassRegistryVersion'),0)<>1 ON DUPLICATE KEY UPDATE id=school_class.id`);
      backfilled = r.affectedRows;
      await connection.query("UPDATE academic_year SET evaluation_config=JSON_SET(evaluation_config,'$.adminClassRegistryVersion',1) WHERE COALESCE(JSON_EXTRACT(evaluation_config,'$.adminClassRegistryVersion'),0)<>1");
      applied.push('backfill:classes', 'config:adminClassRegistryVersion');
    }
  }
  return {
    ready: !conflicts.length && (mode === 'apply' || !pending.length),
    mode,
    pending,
    conflicts,
    applied,
    backfilled
  };
}
if (require.main === module) {
  const targetDb = process.env.REPORT_DB_NAME;
  const pool = require('../db').createDbPool({
    database: targetDb
  });
  migrateAdminClasses({
    connection: pool,
    targetDb,
    mode: process.argv.includes('--apply') ? 'apply' : 'check'
  }).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => {
    console.error(e);
    process.exitCode = 1;
  }).finally(() => pool.end());
}
module.exports = {
  migrateAdminClasses,
  inspectRegistry
};
