const {
  cardStars,
  storyStars,
  storyMean,
  byColumn,
  narratives,
  fail,
} = require("./reportCorePolicy");
const { parse } = require("./reportCoreStore");
async function rebuildEvaluation({ connection, studentKey, targets, config }) {
  const { schoolId, termId, studentId } = studentKey;
  const [[e]] = await connection.query(
    "SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?",
    [schoolId, termId, studentId],
  );
  const fieldSources = parse(e.field_sources),
    sectionMeta = parse(e.section_meta),
    values = {};
  const [records] = await connection.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? ORDER BY id",
    [schoolId, termId, studentId],
  );
  records.forEach((s) => (s.payload = parse(s.payload_json)));
  for (const s of records.filter(
    (s) =>
      s.record_kind === "FORM" && s.status === "CONFIRMED" && s.payload.action,
  )) {
    for (const target of s.payload.targetKeys || []) {
      fieldSources[target] = {
        ...fieldSources[target],
        settled:
          s.payload.action === "SETTLE_CARD_TARGETS"
            ? true
            : fieldSources[target]?.settled,
        noAward:
          s.payload.action === "DECLARE_NO_AWARDS"
            ? true
            : s.payload.action === "INVALIDATE_NO_AWARD" ? false : fieldSources[target]?.noAward,
      };
    }
  }
  for (const target of new Set(targets)) {
    const f = byColumn.get(target);
    if (
      !f &&
      !narratives.includes(target) &&
      !["sports_specialties", "art_specialties"].includes(target)
    )
      fail(422, "未知投射目标");
    let sourceIds = [],
      value = null,
      raw;
    if (f?.sourceType === "CARD") {
      const r = records.filter(
        (s) =>
          s.source_type === "CARD" &&
          s.target_key === target &&
          ((["DIRECT", "REVERSAL"].includes(s.record_kind) &&
            s.status === "CONFIRMED") ||
            (s.record_kind === "CARD" && s.status === "USED")),
      );
      raw = r.reduce((n, s) => n + s.delta, 0);
      sourceIds = r.map((s) => String(s.id));
      value = cardStars({
        points: raw,
        target:
          config.cardTarget ||
          10,
        settled: !!fieldSources[target]?.settled,
      });
    } else if (f?.sourceType === "STORY") {
      const months = config.requiredMonths || [];
      const batches = records.filter(
        (s) =>
          s.source_type === "STORY" &&
          s.record_kind === "BATCH" &&
          ["SUBMITTED", "SCORED"].includes(s.status),
      );
      const category = target.includes("_read_")
        ? "READ"
        : target.includes("_listen_")
          ? "LISTEN"
          : "TELL";
      const series = [];
      const facts = [];
      for (const month of months) {
        const batch = batches.filter((b) => b.month_key === month).at(-1);
        if (!batch || batch.status !== "SCORED") {
          series.length = 0;
          break;
        }
        const items = records.filter(
          (s) =>
            String(s.parent_id) === String(batch.id) &&
            s.payload.category === category &&
            s.status === "SCORED",
        );
        if (!items.length) {
          series.length = 0;
          break;
        }
        series.push(items.map((s) => s.payload.score.total));
        sourceIds.push(...items.map((s) => String(s.id)));
        facts.push(...items.map((s) => s.payload.score.feedback));
      }
      if (series.length === months.length && months.length) {
        raw = storyMean(series);
        value = target.endsWith("_star")
          ? storyStars(raw)
          : facts.join("；").slice(0, 2000);
      }
    } else if (
      f?.sourceType === "CERTIFICATE" ||
      ["sports_specialties", "art_specialties"].includes(target)
    ) {
      const approved = records.filter(
        (s) =>
          s.source_type === "CERTIFICATE" &&
          s.status === "APPROVED" &&
          s.payload.outputs?.[target] !== undefined,
      );
      sourceIds = approved.map((s) => String(s.id));
      if (["sports_specialties", "art_specialties"].includes(target)) {
        const prev = parse(e[target]);
        const array = Array.isArray(prev) ? prev : [];
        value = approved
          .flatMap((s) =>
            s.payload.outputs[target].map((item) => ({
              ...item,
              id: item.id || `award-${s.id}-${item.name}`,
              sourceIds: [String(s.id)],
            })),
          )
          .map((item) => ({
            ...item,
            ...Object.fromEntries(
              ["self_star", "teacher_star"].map((k) => [
                k,
                array.find((p) => p.id === item.id)?.[k] ?? null,
              ]),
            ),
          }));
      } else if (approved.length) {
        const all = approved.map((s) => s.payload.outputs[target]);
        value =
          f.valueType === "star"
            ? Math.max(...all)
            : f.valueType === "grade"
              ? all.sort(
                  (a, b) =>
                    (config.allowedGrades || ["A", "B", "C", "D"]).indexOf(a) -
                    (config.allowedGrades || ["A", "B", "C", "D"]).indexOf(b),
                )[0]
              : all.join("；");
      }
      if (approved.length && fieldSources[target])
        fieldSources[target].noAward = false;
    } else {
      const r = records.filter(
        (s) =>
          ["COMMITTED", "SUBMITTED", "CONFIRMED"].includes(s.status) &&
          s.payload.values &&
          Object.hasOwn(s.payload.values, target),
      );
      const latest = r.at(-1);
      if (latest) {
        value = latest.payload.values[target];
        sourceIds = [String(latest.id)];
      }
    }
    values[target] = value;
    fieldSources[target] = {
      ...fieldSources[target],
      sourceType: f?.sourceType || "FORM",
      sourceIds,
      raw: raw ?? null,
    };
  }
  // Property-scoped self/teacher updates survive regenerated specialty arrays.
  for (const collection of ["sports_specialties", "art_specialties"]) {
    const changes = records.filter((s) => s.payload.specialtyChanges);
    if (!changes.length && !Object.hasOwn(values, collection)) continue;
    let array = values[collection] ?? parse(e[collection]);
    if (!Array.isArray(array)) array = [];
    for (const s of changes)
      for (const item of s.payload.specialtyChanges) {
        if (
          item.collection !==
          (collection === "sports_specialties" ? "sports" : "art")
        )
          continue;
        array = array.map((x) =>
          x.id === item.id ? { ...x, ...item.changes } : x,
        );
      }
    values[collection] = array;
  }
  return { values, fieldSources, sectionMeta };
}
module.exports = { rebuildEvaluation };
