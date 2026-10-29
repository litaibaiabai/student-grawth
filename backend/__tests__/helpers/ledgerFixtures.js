const { createCoreTestDb } = require('./reportCoreDb');
const { recordUtcCutover } = require('../../scripts/runCoreMigrations');
const { normalizeLedgerQuery } = require('../../services/reportCoreLedger');
const teacher = { id: '2', schoolId: '1', role: 'teacher', tokenVersion: 1 };
const manager = { ...teacher, id: '1', role: 'manager' };
let sequence = 0;
const command = () => ({ requestKey: 'ledger-export-' + ++sequence, payloadHash: String(sequence).padStart(64, '0') });
async function fixture(t, count = 0) {
  const db = await createCoreTestDb(t); await db.seedBase();
  const c = await db.pool.getConnection();
  try { await recordUtcCutover({ connection: c, targetDb: db.name, schoolId: '1', verifiedLegacyOffsetMinutes: 0 }); } finally { c.release(); }
  await db.pool.query('UPDATE users SET real_name=? WHERE id=2', ['陈老师, "引号"\n下一行']);
  await db.pool.query("UPDATE users SET username='0012' WHERE id=3");
  await db.pool.query("UPDATE student_term_evaluation SET student_name_snapshot='=1+1' WHERE student_id=3");
  for (let start = 0; start < count; start += 1000) {
    const rows = Array.from({ length: Math.min(1000, count - start) }, (_, i) => [1, 1, 3, 'CARD', 'DIRECT', 2, 'conduct_politeness_other_star', (start + i).toString(16).padStart(64, '0'), 'a'.repeat(64), 'CONFIRMED', 1, JSON.stringify({ categoryCode: 'CONDUCT_POLITENESS_OTHER_STAR', reason: '@x\n<script>alert(1)</script>', occurredAt: '2026-10-15T00:00:00.000Z' })]);
    await db.pool.query('INSERT INTO evaluation_source_record(school_id,term_id,student_id,source_type,record_kind,actor_id,target_key,business_key,payload_hash,status,delta,payload_json) VALUES ?', [rows]);
  }
  return { ...db, teacher, manager, command, filters: normalizeLedgerQuery({ termId: '1', monthFrom: '2026-10', monthTo: '2026-10' }, teacher) };
}
const bytes = async stream => { const chunks = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); };
module.exports = { fixture, teacher, manager, command, bytes };
