export function ratingDistribution(counts, keys) {
  const total = keys.reduce((sum, key) => sum + (counts?.[key] || 0), 0);
  return {
    total,
    items: keys.map(key => ({
      key,
      count: counts?.[key] || 0,
      percent: total ? Math.round((counts?.[key] || 0) / total * 100) : 0,
    })),
  };
}
