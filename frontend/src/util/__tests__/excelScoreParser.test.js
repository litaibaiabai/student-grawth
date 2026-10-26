import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  parseScoreWorkbook,
  buildScoreTemplateWorkbook,
  buildErrorRecordsWorkbook
} from "../excelScoreParser.js";

describe("Excel Score Parser Utilities", () => {
  test("Step 1: parseScoreWorkbook parses workbook into normalized rows and scores", () => {
    // 构造测试数据工作表
    const wsData = [
      ["学号", "姓名", "年级", "班级", "语文", "数学", "英语"],
      ["20240101", "张三", "初一", "1班", 95, 98.5, 90],
      ["20240102", "李四", "初一", "1班", 88, "", 92] // 数学缺考留空
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "成绩表");

    const result = parseScoreWorkbook(wb, "SUBJECT");

    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].username, "20240101");
    assert.equal(result.rows[0].realName, "张三");
    assert.equal(result.rows[0].scores.CHINESE, 95);
    assert.equal(result.rows[0].scores.MATH, 98.5);
    assert.equal(result.rows[0].scores.ENGLISH, 90);

    // 缺考空值不应包含在 scores 中
    assert.equal(result.rows[1].username, "20240102");
    assert.equal(result.rows[1].scores.CHINESE, 88);
    assert.equal(result.rows[1].scores.MATH, undefined);
    assert.equal(result.rows[1].scores.ENGLISH, 92);
  });

  test("Step 2: buildScoreTemplateWorkbook produces valid template sheet with headers and sample data", () => {
    const wb = buildScoreTemplateWorkbook("SUBJECT");
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    assert.ok(rows.length >= 2, "模板应包含表头和至少一行示例数据");
    const headers = rows[0];
    assert.ok(headers.includes("学号"));
    assert.ok(headers.includes("姓名"));
    assert.ok(headers.includes("语文"));
    assert.ok(headers.includes("数学"));
  });

  test("Step 3: buildErrorRecordsWorkbook appends error diagnostics column to original data", () => {
    const rawRows = [
      {
        rowNum: 2,
        username: "20240999",
        realName: "王五",
        grade: "初一",
        classNo: "1班",
        scores: { CHINESE: 150 }
      }
    ];
    const errors = [
      {
        rowNum: 2,
        username: "20240999",
        realName: "王五",
        reason: "分值必须在 0 ~ 100 之间，实际填写为: 150"
      }
    ];

    const wb = buildErrorRecordsWorkbook(errors, rawRows, "SUBJECT");
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    assert.equal(data.length, 1);
    assert.equal(data[0]["学号"], "20240999");
    assert.equal(data[0]["姓名"], "王五");
    assert.equal(data[0]["错误诊断原因"], "分值必须在 0 ~ 100 之间，实际填写为: 150");
  });
});
