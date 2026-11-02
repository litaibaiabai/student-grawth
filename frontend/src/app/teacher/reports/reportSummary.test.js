import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingDistribution } from './reportSummary.js';

test('star proportions use rated items only, retain zero groups and display three to one stars', () => {
  const result = ratingDistribution({ 1: 0, 2: 2, 3: 6, missing: 12 }, [3, 2, 1]);
  assert.deepEqual(result, { total: 8, items: [
    { key: 3, count: 6, percent: 75 },
    { key: 2, count: 2, percent: 25 },
    { key: 1, count: 0, percent: 0 },
  ] });
});

test('ABCD proportions exclude missing and unsupported grade buckets', () => {
  const result = ratingDistribution({ A: 2, B: 1, C: 1, D: 0, missing: 4, E: 2 }, ['A', 'B', 'C', 'D']);
  assert.equal(result.total, 4);
  assert.deepEqual(result.items.map(item => item.percent), [50, 25, 25, 0]);
});

test('unrated students have an empty distribution with no NaN or Infinity', () => {
  const result = ratingDistribution(undefined, [3, 2, 1]);
  assert.equal(result.total, 0);
  assert.deepEqual(result.items.map(item => item.percent), [0, 0, 0]);
});
