const crypto = require("node:crypto");
const { PassThrough } = require("node:stream");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const yazl = require("yazl");
const { encryptToken, decryptToken, tokenHash } = require("./cardCredentials");
const { withMutation, addSource, parse } = require("./reportCoreStore");
const { fail, catalog } = require("./reportCorePolicy");
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
    async (c) => {
      const [[u]] = await c.query(
        "SELECT id FROM users WHERE id=? AND school_id=? AND role='teacher' AND status=0",
        [teacherId, actor.schoolId],
      );
      if (!u) fail(422, "教师不存在");
      const key = ["QUOTA", actor.schoolId, termId, teacherId, monthKey];
      const [[existing]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE school_id=? AND record_kind='QUOTA' AND term_id=? AND owner_teacher_id=? AND month_key=? FOR UPDATE",
        [actor.schoolId, termId, teacherId, monthKey],
      );
      let quotaId;
      if (existing) {
        const p = parse(existing.payload_json);
        const [[count]] = await c.query(
          "SELECT COUNT(*) n FROM evaluation_source_record WHERE parent_id=? AND record_kind='CARD'",
          [existing.id],
        );
        if (total < count.n) fail(422, "不得少于已生成卡量");
        p.quotaTotal = total;
        await c.query(
          "UPDATE evaluation_source_record SET payload_json=?,revision=revision+1 WHERE id=?",
          [JSON.stringify(p), existing.id],
        );
        quotaId = String(existing.id);
      } else
        quotaId = await addSource(c, {
          schoolId: actor.schoolId,
          termId,
          ownerId: teacherId,
          actorId: actor.id,
          sourceType: "CARD",
          kind: "QUOTA",
          monthKey,
          status: "DRAFT",
          payload: { quotaTotal: total, planVersion: 0, plans: [] },
          key,
        });
      return { result: { quotaId } };
    },
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
      let total = 0;
      const seen = new Set();
      for (const p of plans) {
        const cls = `${p.grade}:${p.classNo}`;
        if (seen.has(cls)) fail(422, "班级重复");
        seen.add(cls);
        if (
          !Number.isInteger(p.classTotal) ||
          p.classTotal < 0 ||
          !Array.isArray(p.items)
        )
          fail(422, "班卡量不合法");
        let subtotal = 0;
        for (const item of p.items) {
          const category = catalog.cardCatalog.find(
            (x) => x.code === item.categoryCode,
          );
          if (!category || !Number.isInteger(item.count) || item.count < 0)
            fail(422, "卡类别或数量不合法");
          const { subjectFor } = require("./reportCorePolicy");
          if (
            !a.some(
              (x) =>
                x.grade === p.grade &&
                x.class_no === p.classNo &&
                (category.group === "德美" ||
                  x.subject_code === subjectFor(category.targetColumn)),
            )
          )
            fail(403, "不在任教范围");
          subtotal += item.count;
        }
        if (subtotal !== p.classTotal) fail(422, "班级明细与总量不符");
        total += subtotal;
      }
      if (total > parse(row.payload_json).quotaTotal)
        fail(422, "超过管理员总额度");
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
      const [[old]] = await c.query(
        "SELECT COUNT(*) n FROM evaluation_source_record WHERE parent_id=? AND record_kind='CARD'",
        [quotaId],
      );
      if (Number(old.n)) fail(409, "该计划已生成");
      const cardIds = [];
      let serial = 0;
      const validFrom = new Date(`${q.month_key}-01T00:00:00+08:00`);
      const validUntil = new Date(validFrom);
      validUntil.setUTCMonth(validUntil.getUTCMonth() + 1);
      const start = new Date(Math.max(+validFrom, +new Date(term.start_date)));
      const end = new Date(
        Math.min(
          +validUntil,
          +new Date(term.evaluation_config.collectionDeadline || term.end_date),
        ),
      );
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
      return { result: { cardIds, counts: serial } };
    },
  );
}
async function listCards({ pool, actor, termId }) {
  if (actor.role === "student") fail(403, "无卡管理权限");
  const [rows] = await pool.query(
    "SELECT id,parent_id,student_id,owner_teacher_id,record_kind,month_key,target_key,status,payload_json,revision FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind IN ('CARD','QUOTA') AND (?='manager' OR owner_teacher_id=?) ORDER BY id DESC LIMIT 100",
    [actor.schoolId, termId, actor.role, actor.id],
  );
  return rows.map((r) => ({
    ...r,
    payload: parse(r.payload_json),
    payload_json: undefined,
  }));
}
async function cardToken({ pool, actor, sourceId }) {
  const s = await source(pool, actor, sourceId);
  owner(actor, s);
  if (s.record_kind !== "CARD") fail(422, "不是卡片");
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
}) {
  const category = catalog.cardCatalog.find((x) => x.code === categoryCode);
  if (
    !category ||
    !reason?.trim() ||
    !Array.isArray(studentIds) ||
    !studentIds.length ||
    studentIds.length > 100
  )
    fail(422, "评价信息不完整");
  if (actor.role !== "teacher") fail(403, "仅教师直评");
  return withMutation(
    { pool, actor, termId, studentIds, command, action: "direct-score" },
    async (c, term) => {
      if (
        new Date() >
        new Date(term.evaluation_config.collectionDeadline || term.end_date)
      )
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
          payload: { reason, categoryCode },
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
async function buildClassPrintZip({ pool, actor, quotaId }) {
  const q = await source(pool, actor, quotaId);
  owner(actor, q);
  const [rows] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE parent_id=? AND record_kind='CARD' ORDER BY record_ordinal",
    [quotaId],
  );
  const groups = Object.groupBy(
    rows,
    (s) => `${parse(s.payload_json).grade}-${parse(s.payload_json).classNo}`,
  );
  const zip = new yazl.ZipFile();
  for (const [cls, cards] of Object.entries(groups))
    zip.addReadStreamLazy(`${cls}.pdf`, {}, (cb) => {
      const doc = new PDFDocument({ size: "A4", margin: 25 });
      cb(null, doc);
      (async () => {
        for (let i = 0; i < cards.length; i++) {
          if (i && i % 8 === 0) doc.addPage();
          const s = cards[i],
            p = parse(s.payload_json),
            y = 25 + (i % 8) * 95;
          const token = decryptToken(
            s.token_ciphertext,
            `CORE_V1:${s.school_id}:${quotaId}:${s.record_ordinal}`,
          );
          doc.image(
            await QRCode.toBuffer(
              `${process.env.PUBLIC_WEB_URL || "http://localhost:5173"}/#/student/materials?card=${token}`,
            ),
            25,
            y,
            { width: 80 },
          );
          doc
            .fontSize(11)
            .text(
              `Class ${cls} | ${p.categoryCode}\nCard ${p.serial} | +1`,
              115,
              y + 12,
            );
        }
        doc.end();
      })().catch((e) => doc.destroy(e));
    });
  zip.end();
  return zip.outputStream;
}
module.exports = {
  saveQuota,
  savePlan,
  generateCards,
  redeemCard,
  directScore,
  reverseSource,
  listCards,
  cardToken,
  previewCard,
  buildClassPrintZip,
};
