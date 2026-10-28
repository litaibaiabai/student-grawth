const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const {
  renderPrintableA4,
} = require("../../backend/services/reportRenderService");
const policy = require("../../backend/config/reportCorePolicy.json");
(async () => {
  const b = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await b.newPage();
    const model = {
      schemaVersion: "CORE_V1",
      student: { name: "虚构校样", grade: 4, classNo: 1 },
      term: { academicYear: "2026-2027", semester: 1 },
      values: Object.fromEntries(
        policy.fields
          .filter((f) => !f.jsonPath)
          .map((f) => [
            f.column,
            f.valueType === "star"
              ? 3
              : f.valueType === "grade"
                ? "A"
                : f.column === "height_cm"
                  ? 141
                  : f.column === "weight_kg"
                    ? 35
                    : f.column === "jump_rope_1min"
                      ? 160
                      : f.column.startsWith("vision_")
                        ? "5.0"
                        : f.sourceType === "STORY"
                          ? "认真参与阅读，对故事提出自己的理解。"
                          : "积极参与实践活动。",
          ]),
      ),
      sportsSpecialties: [],
      artSpecialties: [],
      narratives: Object.fromEntries(
        [
          "self_conduct_text",
          "self_wisdom_text",
          "self_health_text",
          "self_art_text",
          "self_labor_text",
          "semester_highlights",
          "next_term_goals",
          "teacher_comment",
          "family_message",
        ].map((k) => [k, "认真参与本学期的学习和活动。"]),
      ),
    };
    await page.setContent(renderPrintableA4({ reportData: model }));
    for (const width of [375, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator("[data-view]").count(), 109);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    const dir = path.resolve(__dirname, "../../output/report-core");
    await fs.mkdir(dir, { recursive: true });
    const pdf = path.join(dir, "layout-sample.pdf");
    await page.pdf({
      path: pdf,
      preferCSSPageSize: true,
      printBackground: true,
    });
    const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
    assert.match(
      info,
      /Pages:\s+2\b/,
      "normal school sample must fit exactly two A4 faces",
    );
    model.narratives.self_conduct_text = "长文本".repeat(650);
    await page.setContent(renderPrintableA4({ reportData: model }));
    await page.emulateMedia({ media: "print" });
    assert.equal(
      await page.evaluate(() => {
        const p = document.querySelector("[data-print-page]");
        return p.scrollHeight > p.clientHeight;
      }),
      true,
      "long text must be detected rather than clipped",
    );
    console.log(
      "PASS 109 positions, mobile widths, two A4 faces and long-text overflow detection",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
