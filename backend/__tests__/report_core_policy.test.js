const { test } = require("node:test");
const assert = require("node:assert/strict");
test("settled card thresholds and month-equal story means preserve boundaries", () => {
  const {
    cardStars,
    storyStars,
    storyMean,
  } = require("../services/reportCorePolicy");
  assert.deepEqual(
    [0, 4, 5, 9, 10].map((points) =>
      cardStars({ points, target: 10, settled: true }),
    ),
    [1, 1, 2, 2, 3],
  );
  assert.equal(cardStars({ points: 0, target: 10, settled: false }), null);
  assert.throws(() => cardStars({ points: -1, target: 10, settled: true }));
  assert.equal(storyStars(storyMean([[80, 90, 100], [80]])), 3);
  assert.equal(storyStars(84.999), 2);
});
