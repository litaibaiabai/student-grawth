import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSelfGroups,getSelfProgress,mergeSelfDraft } from './selfEvaluationModel.js';
const catalog=createRequire(import.meta.url)('../../../../../backend/config/reportCorePolicy.json');

test('13 fixed stars form 8/1/4 groups and seven required texts exclude family', () => {
  const view = { applicableSelfFields: catalog.fields.filter(f => f.sourceType === 'SELF').map(f => f.column), values: {} };
  const groups = buildSelfGroups(view, catalog);
  assert.deepEqual(groups.map(g => g.fields.length), [8, 1, 4, 7]);
  assert.equal(getSelfProgress(view, catalog).total, 20);
});

test('three-way merge preserves null clears, flags same-cell conflicts and uses stable specialty ids', () => {
  const base = { values: { fitness_self_star: 2 }, sportsSpecialties: [{ id: 's1', self_star: 1 }] };
  const remote = { values: { fitness_self_star: 3 }, sportsSpecialties: [{ id: 's1', self_star: 2 }] };
  const merged = mergeSelfDraft({ base, local: { fitness_self_star: null }, remote, specialtyChanges: [{ id: 's1', collection: 'sports', changes: { self_star: 3 } }] });
  assert.equal(merged.conflicts.length, 2);
  assert.equal(merged.merged.fitness_self_star, null);
});
