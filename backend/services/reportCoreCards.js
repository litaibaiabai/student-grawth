const crypto = require("node:crypto");
const { PassThrough } = require("node:stream");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const yazl = require("yazl");
const { encryptToken, decryptToken, tokenHash } = require("./cardCredentials");
const { withMutation, addSource, parse } = require("./reportCoreStore");
const { fail, catalog, subjectFor, getSchoolMonthBounds, schoolDayStart, collectionCutoff } = require("./reportCorePolicy");
const { assertScope, assignments } = require("./authorizationService");
async function source(pool, actor, id) {
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND id=?",
    [actor.schoolId, id],
  );
  if (!s) fail(404, "记录不存在");
  s.payload = parse(s.payload_json);
  return s;
}
function owner(actor, s) {
  if (actor.role !== "teacher" || String(s.owner_teacher_id) !== actor.id)
    fail(403, "仅本人可管理卡计划");
}
function validatePlans(plans, teaching, quotaTotal) {
  if (!Array.isArray(plans)) fail(422, '班级计划格式不合法');
  let total = 0;
  const classes = new Set();
  for (const p of plans) {
    const key = `${p.grade}:${p.classNo}`;
    if (classes.has(key)) fail(422, '班级重复');
    classes.add(key);
    if (!Number.isInteger(p.grade) || p.grade < 1 || !Number.isInteger(p.classNo) || p.classNo < 1 || !Number.isInteger(p.classTotal) || p.classTotal < 0 || !Array.isArray(p.items)) fail(422, '班卡量不合法');
    let subtotal = 0;
    for (const item of p.items) {
      const category = catalog.cardCatalog.find(x => x.code === item.categoryCode);
      if (!category || !Number.isInteger(item.count) || item.count < 0) fail(422, '卡类别或数量不合法');
      if (!teaching.some(a => a.grade === p.grade && a.class_no === p.classNo && (category.group === '德美' || a.subject_code === subjectFor(category.targetColumn)))) fail(403, '不在任教范围');
      subtotal += item.count;
    }
    if (subtotal !== p.classTotal) fail(422, '班级明细与总量不符');
    total += subtotal;
  }
  if (total > quotaTotal) fail(422, '超过管理员总额度');
  return total;
}
async function saveQuotaInTransaction(c, { actor, termId, teacherId, monthKey, total, command }) {
  if (actor.role !== 'manager') fail(403, '仅管理员下发额度');
  if (!Number.isInteger(total) || total < 0 || total > 10000 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) fail(422, '卡额度或月份不合法');
  const [[u]] = await c.query("SELECT id FROM users WHERE id=? AND school_id=? AND role='teacher' AND status=0", [teacherId, actor.schoolId]);
  if (!u) fail(422, '教师不存在');
  const [[existing]] = await c.query("SELECT * FROM evaluation_source_record WHERE school_id=? AND record_kind='QUOTA' AND term_id=? AND owner_teacher_id=? AND month_key=? FOR UPDATE", [actor.schoolId, termId, teacherId, monthKey]);
  let quotaId, revision = '1', oldTotal = 0;
  if (existing) {
    const p = parse(existing.payload_json);
    const [[count]] = await c.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE parent_id=? AND record_kind='CARD'", [existing.id]);
    const planned = (p.plans || []).reduce((n, row) => n + row.classTotal, 0);
    if (total < Math.max(planned, Number(count.n))) fail(422, '不得少于已分配或已生成卡量');
    quotaId = String(existing.id); revision = String(existing.revision); oldTotal = p.quotaTotal;
    if (oldTotal === total) return { quotaId, revision, changed: false };
    p.quotaTotal = total;
    await c.query('UPDATE evaluation_source_record SET payload_json=?,revision=revision+1 WHERE id=?', [JSON.stringify(p), existing.id]);
    revision = String(BigInt(revision) + 1n);
  } else {
    quotaId = await addSource(c, { schoolId: actor.schoolId, termId, ownerId: teacherId, actorId: actor.id, sourceType: 'CARD', kind: 'QUOTA', monthKey, status: 'DRAFT', payload: { quotaTotal: total, planVersion: 0, plans: [] }, key: ['QUOTA', actor.schoolId, termId, teacherId, monthKey] });
  }
  await addSource(c, { schoolId: actor.schoolId, termId, parentId: quotaId, ownerId: teacherId, actorId: actor.id, kind: 'AUDIT', monthKey, status: 'COMMITTED', key: ['QUOTA_CHANGE', actor.id, command.requestKey, teacherId, monthKey], payload: { action: 'QUOTA_CHANGE', quotaId, monthKey, oldTotal, newTotal: total, delta: total - oldTotal } });
  return { quotaId, revision, changed: true };
}
async function saveQuota({
  pool,
  actor,
  termId,
  teacherId,
  monthKey,
  total,
  command,
}) {
  if (actor.role !== "manager") fail(403, "仅管理员下发额度");
  if (
    !Number.isInteger(total) ||
    total < 0 ||
    total > 10000 ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)
  )
    fail(422, "卡额度或月份不合法");
  return withMutation(
    { pool, actor, termId, command, action: "quota" },
    async c => ({ result: await saveQuotaInTransaction(c, { actor, termId, teacherId, monthKey, total, command }) }),
  );
}
async function savePlan({
  pool,
  actor,
  quotaId,
  expectedRevision,
  plans,
  command,
}) {
  const q = await source(pool, actor, quotaId);
  owner(actor, q);
  if (q.record_kind !== 'QUOTA' || q.source_type !== 'CARD') fail(422, '需要教师月度额度记录');
  return withMutation(
    { pool, actor, termId: q.term_id, command, action: "card-plan" },
    async (c) => {
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [quotaId],
      );
      if (String(row.revision) !== String(expectedRevision))
        fail(409, "额度已变化");
      const a = await assignments(actor, q.term_id, c);
      validatePlans(plans, a, parse(row.payload_json).quotaTotal);
      const [[generated]] = await c.query(
        "SELECT COUNT(*) n FROM evaluation_source_record WHERE parent_id=? AND record_kind='CARD'",
        [quotaId],
      );
      if (Number(generated.n))
        fail(409, "已生成计划不可改；增补新计划请联系管理员");
      const payload = {
        ...parse(row.payload_json),
        plans,
        planVersion: parse(row.payload_json).planVersion + 1,
      };
      await c.query(
        "UPDATE evaluation_source_record SET payload_json=?,revision=revision+1,status='CONFIRMED' WHERE id=?",
        [JSON.stringify(payload), quotaId],
      );
      await addSource(c, { schoolId: actor.schoolId, termId: q.term_id, parentId: quotaId, ownerId: actor.id, actorId: actor.id, kind: 'AUDIT', monthKey: q.month_key, status: 'COMMITTED', key: ['PLAN_SAVE', quotaId, command.requestKey], payload: { action: 'PLAN_SAVE', quotaId, planVersion: payload.planVersion, previousPlans: parse(row.payload_json).plans, plans } });
      return {
        result: { quotaId, revision: String(BigInt(row.revision) + 1n) },
      };
    },
  );
}
async function generateCards({
  pool,
  actor,
  quotaId,
  expectedRevision,
  command,
}) {
  const q = await source(pool, actor, quotaId);
  owner(actor, q);
  if (q.record_kind !== 'QUOTA' || q.source_type !== 'CARD') fail(422, '需要教师月度额度记录');
  return withMutation(
    { pool, actor, termId: q.term_id, command, action: "generate-cards" },
    async (c, term) => {
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [quotaId],
      );
      if (String(row.revision) !== String(expectedRevision))
        fail(409, "计划已改变");
      const p = parse(row.payload_json);
      if (row.status !== "CONFIRMED" || !p.plans.length)
        fail(422, "先确认分班计划");
      validatePlans(p.plans, await assignments(actor, q.term_id, c), p.quotaTotal);
      const [[old]] = await c.query(
        "SELECT COUNT(*) n FROM evaluation_source_record WHERE parent_id=? AND record_kind='CARD'",
        [quotaId],
      );
      if (Number(old.n)) fail(409, "该计划已生成");
      const cardIds = [];
      let serial = 0;
      const bounds = getSchoolMonthBounds(q.month_key);
      const start = new Date(Math.max(+bounds.startInclusive, +schoolDayStart(term.start_date)));
      const end = new Date(Math.min(+bounds.endExclusive, +collectionCutoff(term)));
      if (start >= end) fail(422, "卡有效期不合法");
      for (const plan of p.plans)
        for (const item of plan.items) {
          const category = catalog.cardCatalog.find(
            (x) => x.code === item.categoryCode,
          );
          for (let i = 0; i < item.count; i++) {
            serial++;
            const token = crypto.randomBytes(32).toString("base64url");
            cardIds.push(
              await addSource(c, {
                schoolId: actor.schoolId,
                termId: q.term_id,
                sourceType: "CARD",
                kind: "CARD",
                parentId: quotaId,
                ownerId: actor.id,
                actorId: actor.id,
                monthKey: q.month_key,
                target: category.targetColumn,
                ordinal: serial,
                status: "UNUSED",
                delta: 1,
                tokenHash: tokenHash(token),
                tokenCipher: encryptToken(
                  token,
                  `CORE_V1:${actor.schoolId}:${quotaId}:${serial}`,
                ),
                validFrom: start,
                validUntil: end,
                key: ["CARD", quotaId, serial],
                payload: {
                  quotaId,
                  planVersion: p.planVersion,
                  grade: plan.grade,
                  classNo: plan.classNo,
                  categoryCode: category.code,
                  serial,
                },
              }),
            );
          }
        }
      await c.query(
        "UPDATE evaluation_source_record SET revision=revision+1 WHERE id=?",
        [quotaId],
      );
      await addSource(c, { schoolId: actor.schoolId, termId: q.term_id, parentId: quotaId, ownerId: actor.id, actorId: actor.id, kind: 'AUDIT', monthKey: q.month_key, status: 'COMMITTED', key: ['CARD_GENERATE', quotaId, command.requestKey], payload: { action: 'CARD_GENERATE', quotaId, planVersion: p.planVersion, generated: serial, classes: p.plans.map(plan => ({ grade: plan.grade, classNo: plan.classNo, count: plan.classTotal })) } });
      return { result: { cardIds, counts: serial } };
    },
  );
}
async function listCards({ pool, actor, termId, kind, offset = 0 }) {
  if (actor.role === "student") fail(403, "无卡管理权限");
  const load = async (type) =>
    (
      await pool.query(
        "SELECT id,parent_id,student_id,owner_teacher_id,record_kind,month_key,target_key,status,payload_json,revision FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind=? AND (?='manager' OR owner_teacher_id=?) ORDER BY id DESC LIMIT 100 OFFSET ?",
        [
          actor.schoolId,
          termId,
          type,
          actor.role,
          actor.id,
          Math.max(0, Math.floor(Number(offset) || 0)),
        ],
      )
    )[0];
  const rows =
    kind === "QUOTA"
      ? await load("QUOTA")
      : kind === "CARD"
        ? await load("CARD")
        : [...(await load("QUOTA")), ...(await load("CARD"))];
  return rows.map((r) => ({
    ...r,
    payload: parse(r.payload_json),
    payload_json: undefined,
  }));
}
async function cardToken({ pool, actor, sourceId, now = new Date() }) {
  const s = await source(pool, actor, sourceId);
  owner(actor, s);
  if (s.record_kind !== "CARD") fail(422, "不是卡片");
  if (!printable(s, now)) fail(409, "卡片已领取、作废或失效");
  return decryptToken(
    s.token_ciphertext,
    `CORE_V1:${s.school_id}:${s.parent_id}:${s.record_ordinal}`,
  );
}
async function previewCard({ pool, actor, token }) {
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE token_hash=? AND school_id=? AND record_kind='CARD'",
    [tokenHash(token), actor.schoolId],
  );
  if (!s) fail(404, "卡片不存在");
  await assertScope(
    {
      actor,
      studentKey: {
        schoolId: actor.schoolId,
        termId: s.term_id,
        studentId: actor.id,
      },
      action: "read",
    },
    pool,
  );
  const p = parse(s.payload_json);
  return {
    id: String(s.id),
    termId: String(s.term_id),
    category: p.categoryCode,
    grade: p.grade,
    classNo: p.classNo,
    status: s.status,
  };
}
async function redeemCard({ pool, actor, token, command, now = new Date() }) {
  if (actor.role !== "student") fail(403, "学生本人扫码");
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND token_hash=? AND record_kind='CARD'",
    [actor.schoolId, tokenHash(token)],
  );
  if (!s) fail(404, "卡片不存在");
  return withMutation(
    {
      pool,
      actor,
      termId: s.term_id,
      studentIds: [actor.id],
      command,
      action: "redeem-card",
    },
    async (c) => {
      const { evaluation: e } = await assertScope(
        {
          actor,
          studentKey: {
            schoolId: actor.schoolId,
            termId: s.term_id,
            studentId: actor.id,
          },
        },
        c,
      );
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [s.id],
      );
      const p = parse(row.payload_json);
      if (e.grade_snapshot !== p.grade || e.class_no_snapshot !== p.classNo)
        fail(403, "非发行班级");
      if (row.status !== "UNUSED") fail(409, "卡片已领取或失效");
      if (now < row.valid_from || now >= row.valid_until)
        fail(422, "不在有效期");
      p.usedAt = now.toISOString();
      await c.query(
        "UPDATE evaluation_source_record SET status='USED',student_id=?,payload_json=?,revision=revision+1 WHERE id=?",
        [actor.id, JSON.stringify(p), s.id],
      );
      return {
        result: { sourceId: String(s.id), pointsCredited: 1 },
        changedTargetsByStudent: { [actor.id]: [s.target_key] },
      };
    },
  );
}
async function directScore({
  pool,
  actor,
  termId,
  studentIds,
  categoryCode,
  reason,
  command,
  now = new Date(),
}) {
  const category = catalog.cardCatalog.find((x) => x.code === categoryCode);
  if (reason !== undefined && reason !== null && typeof reason !== 'string') fail(422, '评价说明需为文字');
  reason = reason?.trim() || '';
  if (
    !category ||
    !Array.isArray(studentIds) ||
    !studentIds.length ||
    studentIds.length > 100
  )
    fail(422, "评价信息不完整");
  if (actor.role !== "teacher") fail(403, "仅教师直评");
  return withMutation(
    { pool, actor, termId, studentIds, command, action: "direct-score" },
    async (c, term) => {
      if (now >= collectionCutoff(term))
        fail(422, "采集已截止");
      const changed = {};
      for (const id of new Set(studentIds)) {
        await assertScope(
          {
            actor,
            studentKey: { schoolId: actor.schoolId, termId, studentId: id },
            action: "score",
            fields: [category.targetColumn],
          },
          c,
        );
        await addSource(c, {
          schoolId: actor.schoolId,
          termId,
          studentId: id,
          actorId: actor.id,
          sourceType: "CARD",
          kind: "DIRECT",
          target: category.targetColumn,
          status: "CONFIRMED",
          delta: 1,
          payload: { reason, categoryCode, occurredAt: now.toISOString() },
          key: ["DIRECT", actor.id, command.requestKey, id, categoryCode],
        });
        changed[id] = [category.targetColumn];
      }
      return {
        result: { count: studentIds.length },
        changedTargetsByStudent: changed,
      };
    },
  );
}
async function voidCard({ pool, actor, sourceId, expectedRevision, reason, command }) {
  const s = await source(pool, actor, sourceId);
  owner(actor, s);
  if (s.record_kind !== 'CARD' || s.source_type !== 'CARD') fail(422, '只能作废原卡');
  if (typeof reason !== 'string' || !reason.trim()) fail(422, '作废需填写原因');
  return withMutation({ pool, actor, termId: s.term_id, command, action: 'void-card' }, async c => {
    const [[row]] = await c.query('SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE', [sourceId]);
    if (row.status !== 'UNUSED' || String(row.revision) !== String(expectedRevision)) fail(409, '卡片已领取或状态已变化');
    const payload = { ...parse(row.payload_json), voidReason: reason.trim(), voidedAt: new Date().toISOString() };
    await c.query("UPDATE evaluation_source_record SET status='VOID',revision=revision+1,payload_json=? WHERE id=?", [JSON.stringify(payload), sourceId]);
    await addSource(c, { schoolId: actor.schoolId, termId: s.term_id, parentId: sourceId, ownerId: actor.id, actorId: actor.id, kind: 'AUDIT', monthKey: s.month_key, status: 'COMMITTED', key: ['CARD_VOID', sourceId, command.requestKey], payload: { action: 'CARD_VOID', sourceId, previousStatus: row.status, status: 'VOID', reason: reason.trim() } });
    return { result: { sourceId: String(sourceId), revision: String(BigInt(row.revision) + 1n) } };
  });
}
async function reverseSource({ pool, actor, sourceId, reason, command }) {
  if (actor.role !== "teacher" || !reason?.trim())
    fail(403, "需教师填写更正原因");
  const s = await source(pool, actor, sourceId);
  if (
    s.source_type !== "CARD" ||
    !["DIRECT", "CARD"].includes(s.record_kind) ||
    !s.student_id ||
    !["USED", "CONFIRMED"].includes(s.status)
  )
    fail(422, "不能冲销该记录");
  return withMutation(
    {
      pool,
      actor,
      termId: s.term_id,
      studentIds: [s.student_id],
      command,
      action: "reverse",
    },
    async (c) => {
      await assertScope(
        {
          actor,
          studentKey: {
            schoolId: actor.schoolId,
            termId: s.term_id,
            studentId: s.student_id,
          },
          action: "score",
          fields: [s.target_key],
        },
        c,
      );
      const [[old]] = await c.query(
        "SELECT id FROM evaluation_source_record WHERE original_id=? AND record_kind='REVERSAL'",
        [sourceId],
      );
      if (old) fail(409, "已冲销");
      await addSource(c, {
        schoolId: actor.schoolId,
        termId: s.term_id,
        studentId: s.student_id,
        actorId: actor.id,
        sourceType: "CARD",
        kind: "REVERSAL",
        originalId: sourceId,
        target: s.target_key,
        status: "CONFIRMED",
        delta: -1,
        key: ["REVERSE", sourceId],
        payload: { reason },
      });
      return {
        result: { reversed: true },
        changedTargetsByStudent: { [s.student_id]: [s.target_key] },
      };
    },
  );
}
function printable(s, now = new Date()) {
  return s.record_kind === 'CARD' && s.status === 'UNUSED' && +s.valid_from <= +now && +now < +s.valid_until;
}
async function printSelection(c, actor, quotaId, { grade, classNo, cardIds, now = new Date(), strict = false } = {}) {
  if ((grade === undefined) !== (classNo === undefined)) fail(422, '请选择完整班级');
  if (grade !== undefined && (!Number.isInteger(Number(grade)) || !Number.isInteger(Number(classNo)) || Number(grade) < 1 || Number(classNo) < 1)) fail(422, '班级不合法');
  if (cardIds !== undefined && (!Array.isArray(cardIds) || !cardIds.length || cardIds.length > 50000 || cardIds.some(v => !/^[1-9]\d*$/.test(String(v))) || new Set(cardIds.map(String)).size !== cardIds.length)) fail(422, '卡片范围不合法');
  const [rows] = await c.query("SELECT s.*,u.real_name teacher_name FROM evaluation_source_record s JOIN users u ON u.id=s.owner_teacher_id AND u.school_id=s.school_id WHERE s.school_id=? AND s.parent_id=? AND s.record_kind='CARD' AND s.owner_teacher_id=? ORDER BY s.record_ordinal", [actor.schoolId, quotaId, actor.id]);
  const selected = rows.filter(s => {
    const p = parse(s.payload_json);
    return (grade === undefined || p.grade === Number(grade) && p.classNo === Number(classNo)) && (!cardIds || cardIds.map(String).includes(String(s.id)));
  });
  if (cardIds && selected.length !== cardIds.length) fail(409, '卡片范围已变化，请刷新后重试');
  if ((strict || cardIds) && selected.some(s => !printable(s, now))) fail(409, '卡片已领取、作废或失效，请刷新范围');
  const eligible = selected.filter(s => printable(s, now));
  if (!eligible.length) fail(422, '当前范围没有可领取卡片');
  return eligible;
}
async function createCardPrintRequest({ pool, actor, quotaId, grade, classNo, cardIds, command, now = new Date() }) {
  const q = await source(pool, actor, quotaId); owner(actor, q);
  if (q.record_kind !== 'QUOTA') fail(422, '不是卡额度');
  return withMutation({ pool, actor, termId: q.term_id, command, action: 'CARD_PRINT_REQUEST' }, async c => {
    await c.query('SELECT id FROM evaluation_source_record WHERE school_id=? AND id=? FOR UPDATE', [actor.schoolId, quotaId]);
    const rows = await printSelection(c, actor, quotaId, { grade, classNo, cardIds, now });
    const payload = { action: 'PRINT_REQUEST', quotaId: String(quotaId), cardIds: rows.map(s => String(s.id)), format: grade === undefined ? 'ZIP' : 'PDF', grade: grade ?? null, classNo: classNo ?? null, requestedAt: now.toISOString() };
    const requestId = await addSource(c, { schoolId: actor.schoolId, termId: q.term_id, parentId: quotaId, ownerId: actor.id, actorId: actor.id, kind: 'AUDIT', monthKey: q.month_key, status: 'COMMITTED', key: ['PRINT_REQUEST', actor.id, command.requestKey], payload });
    return { result: { requestId, downloadUrl: `/api/v1/report-core/card-print-requests/${requestId}/file`, cardCount: rows.length }, changedTargetsByStudent: {} };
  });
}
function cardPdf(rows) {
  const doc = new PDFDocument({ size: 'A4', margin: 25 });
  // Start after the caller has attached its error handler / ZIP consumer.
  setImmediate(async () => {
    try {
      doc.font(require('node:path').join(__dirname, '../assets/fonts/NotoSansCJKsc-Regular.otf'));
      for (let i = 0; i < rows.length; i++) {
        if (i && i % 8 === 0) doc.addPage();
        const s = rows[i], p = parse(s.payload_json), y = 25 + (i % 8) * 95;
        const token = decryptToken(s.token_ciphertext, `CORE_V1:${s.school_id}:${s.parent_id}:${s.record_ordinal}`);
        const category = catalog.cardCatalog.find(v => v.code === p.categoryCode);
        doc.image(await QRCode.toBuffer(`${process.env.PUBLIC_WEB_URL || 'http://localhost:5173'}/#/student/materials?card=${token}`), 25, y, { width: 80 });
        doc.fontSize(11).text(`${p.grade}年级${p.classNo}班 · ${s.teacher_name}\n${category?.group || ''} · ${category?.item || p.categoryCode}\n卡号 ${s.id} · 每卡1分`, 115, y + 8, { width: 440, height: 80 });
      }
      doc.end();
    } catch (error) { doc.destroy(error); }
  });
  return doc;
}
function zippedCards(rows) {
  const zip = new yazl.ZipFile();
  for (const [cls, cards] of Object.entries(Object.groupBy(rows, s => { const p = parse(s.payload_json); return `${p.grade}年级${p.classNo}班`; }))) {
    zip.addReadStreamLazy(`${cls}.pdf`, {}, cb => cb(null, cardPdf(cards)));
  }
  zip.end(); return zip.outputStream;
}
async function buildCardPrintFile({ pool, actor, requestId, now = new Date() }) {
  const request = await source(pool, actor, requestId); owner(actor, request);
  if (request.record_kind !== 'AUDIT' || request.payload.action !== 'PRINT_REQUEST') fail(404, '打印请求不存在');
  const rows = await printSelection(pool, actor, request.payload.quotaId, { cardIds: request.payload.cardIds, now, strict: true });
  const pdf = request.payload.format === 'PDF';
  return { mimeType: pdf ? 'application/pdf' : 'application/zip', filename: pdf ? '班级积分卡.pdf' : '按班积分卡.zip', stream: pdf ? cardPdf(rows) : zippedCards(rows) };
}
async function buildClassPrintZip({ pool, actor, quotaId, now = new Date() }) {
  const q = await source(pool, actor, quotaId); owner(actor, q);
  if (q.record_kind !== 'QUOTA') fail(422, '不是卡额度');
  return zippedCards(await printSelection(pool, actor, quotaId, { now }));
}

module.exports = {
  saveQuota,
  saveQuotaInTransaction,
  savePlan,
  generateCards,
  redeemCard,
  directScore,
  reverseSource,
  listCards,
  cardToken,
  previewCard,
  buildClassPrintZip,
  createCardPrintRequest,
  buildCardPrintFile,
  voidCard,
};
