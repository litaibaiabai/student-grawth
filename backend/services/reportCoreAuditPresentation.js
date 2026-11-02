const labels = require('../config/reportCoreAuditLabels.json');
const labelFor = (group, key) => Object.hasOwn(labels[group], key) ? labels[group][key] : undefined;
const stateFields = new Set(['status', 'businessPhase', 'releaseStatus', 'section']);
const value = (v, field) => {
  if (v === null) return '空';
  if (v === true) return '是';
  if (v === false) return '否';
  if (field === 'status' && [0, 1].includes(v)) return v === 0 ? '启用' : '停用';
  return (stateFields.has(field) && labelFor('states', v)) || String(v ?? '—');
};
function presentAudit(row) {
  return {
    type: labelFor('actions', row.type) || `其他操作（${row.type}）`,
    status: labelFor('states', row.status) || `未知状态（${row.status}）`,
    diffs: row.diffs.map(d => [d.studentId && `学生 #${d.studentId}`, d.classId && `班级 #${d.classId}`, d.subjectCode && (labelFor('subjects', d.subjectCode) || d.subjectCode), `${labelFor('fields', d.field) || `其他字段（${d.field}）`}：${value(d.before, d.field)} → ${value(d.after, d.field)}`].filter(Boolean).join(' · ')),
    metadata: Object.entries(row.metadata).map(([key, v]) => `${labelFor('fields', key) || `其他字段（${key}）`}：${value(v, key)}`),
  };
}
module.exports = { presentAudit };
