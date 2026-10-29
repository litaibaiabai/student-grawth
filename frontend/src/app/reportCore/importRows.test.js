import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeImportRows } from "./importRows.js";
test("Excel star glyphs and vision strings survive parsing without turning into null clears", () => {
  assert.deepEqual(
    normalizeImportRows(
      [{ username: "s1", labor_academic_star: "★★★", vision_left: "5.0" }],
      [
        { column: "labor_academic_star", valueType: "star" },
        { column: "vision_left", valueType: "number" },
      ],
    ),
    [
      {
        username: "s1",
        values: { labor_academic_star: "★★★", vision_left: "5.0" },
      },
    ],
  );
});
test("invalid numeric spreadsheet cells fail before JSON can silently replace NaN with null", () => {
  assert.throws(
    () =>
      normalizeImportRows(
        [{ studentId: 3, height_cm: "not a number" }],
        [{ column: "height_cm", valueType: "number" }],
      ),
    /height_cm/,
  );
});
test('whitespace spreadsheet cells keep old numeric and grade values',()=>{
 assert.deepEqual(normalizeImportRows([{studentId:'3',height_cm:'  ',math_basic_knowledge_grade:'   '}],[{column:'height_cm',valueType:'number'},{column:'math_basic_knowledge_grade',valueType:'grade'}]),[{studentId:'3',values:{}}]);
});
