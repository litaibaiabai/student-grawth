// Present both historical and C5 frozen snapshots without recalculating grades.
function normalizeReportSnapshot(snapshot = {}) {
  const raw = snapshot.evaluation || snapshot.evaluationSnapshot || {};
  const dimensions = Object.fromEntries(Object.entries(raw.dimensions || raw.sixDimensions || {}).map(([key, value]) => [
    key, value && typeof value === 'object' ? (value.status === 'MISSING' ? null : value.score ?? null) : value
  ]));
  return {
    ...snapshot,
    evaluation: { ...raw, dimensions },
    subjects: (snapshot.subjects || []).map(subject => ({ ...subject, score: subject.score ?? subject.raw_score ?? null }))
  };
}
module.exports = { normalizeReportSnapshot };
