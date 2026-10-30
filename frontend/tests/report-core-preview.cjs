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
    assert.deepEqual(await page.locator('[data-print-page]').evaluateAll(pages=>pages.slice(0,2).map(p=>p.className)),['paper report-detail','paper report-front']);
    assert.equal(
      await page
        .locator('section[data-section="conduct"] table thead th')
        .count(),
      6,
      "PDF conduct table has two behavior/self/other groups",
    );
    assert.equal(
      (await page
        .locator('section[data-section="wisdom"] td[rowspan="5"]')
        .count()) > 0,
      true,
      "PDF Chinese subject shares learning columns across five ability rows",
    );
    assert.equal(
      (await page.locator('section[data-section="art"] thead tr').count()) >= 3,
      true,
      "PDF art table uses multi-level academic/art-skill headings",
    );
    assert.deepEqual(
      await page
        .locator('section[data-section="labor"] thead th')
        .allTextContents(),
      ["课程", "成果表现", "学业水平", "成果作品、实践经历与表现"],
    );
    assert.deepEqual(
      await page
        .locator('section[data-section="story"] thead th')
        .allTextContents(),
      ["故事实践活动", "学业水平", "成果表现", "实践经历与表现"],
    );
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
    assert.deepEqual(await page.locator('[data-print-page]').evaluateAll(pages=>pages.slice(0,2).map(p=>p.className)),['paper report-detail','paper report-front']);
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator('[data-print-page]').evaluateAll(pages=>pages.filter(p=>p.scrollHeight>Math.ceil(p.getBoundingClientRect().height)+2).length),0,'legal long text must use complete continuation pages');
    assert.ok(await page.locator('.report-continuation').count()>0);
    assert.equal((await page.locator('[data-content-id="narrative:self_conduct_text"]').allTextContents()).join(''),model.narratives.self_conduct_text);
    const count=await page.locator('[data-print-page]').count(),longPdf=path.join(dir,'long-layout-sample.pdf');await page.pdf({path:longPdf,preferCSSPageSize:true,printBackground:true});assert.equal(Number(execFileSync('pdfinfo',[longPdf],{encoding:'utf8'}).match(/Pages:\s+(\d+)/)[1]),count);
    await page.locator('[data-print-page]').first().evaluate(p=>{p.style.height='10px';});
    assert.equal(await page.locator('[data-print-page]').first().evaluate(p=>p.scrollHeight>p.clientHeight+2),true,'an actual malformed page must still fail overflow checks');
    console.log(
      "PASS 109 positions, mobile widths, two A4 faces, complete continuations and true overflow detection",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
