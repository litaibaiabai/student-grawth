/**
 * excelScoreParser.js
 * 前端 Excel 解析、标准模板生成与异常数据导出工具库
 */

import * as XLSX from "xlsx";

export const SUBJECT_HEADER_MAP = {
  语文: "CHINESE",
  数学: "MATH",
  英语: "ENGLISH",
  物理: "PHYSICS",
  化学: "CHEMISTRY",
  生物: "BIOLOGY",
  道德与法治: "MORALITY",
  政治: "MORALITY",
  历史: "HISTORY",
  地理: "GEOGRAPHY",
  体育: "PE",
  音乐: "MUSIC",
  美术: "ART",
  信息技术: "IT"
};

export const DIMENSION_HEADER_MAP = {
  德育: "D",
  智育: "Z",
  体育: "T",
  美育: "M",
  劳育: "L",
  生活故事: "G",
  D: "D",
  Z: "Z",
  T: "T",
  M: "M",
  L: "L",
  G: "G"
};

/**
 * 将工作表数据解析为规范化的学生成绩行列表
 */
export function parseScoreWorkbook(workbook, type = "SUBJECT") {
  const normType = (type || "SUBJECT").toUpperCase();
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return { rows: [], headers: [] };
  }

  // 以二维数组方式提取所有行
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  if (rawRows.length < 2) {
    return { rows: [], headers: [] };
  }

  const rawHeaders = rawRows[0].map((h) => String(h || "").trim());
  const headerMap = {};

  // 识别元数据列与学科列
  let usernameColIdx = -1;
  let realNameColIdx = -1;
  let gradeColIdx = -1;
  let classNoColIdx = -1;

  rawHeaders.forEach((header, idx) => {
    const cleanHeader = header.toLowerCase();
    if (["学号", "账号", "student_no", "username", "学籍号"].includes(cleanHeader)) {
      usernameColIdx = idx;
    } else if (["姓名", "学生姓名", "real_name", "name"].includes(cleanHeader)) {
      realNameColIdx = idx;
    } else if (["年级", "grade"].includes(cleanHeader)) {
      gradeColIdx = idx;
    } else if (["班级", "class", "class_no"].includes(cleanHeader)) {
      classNoColIdx = idx;
    } else {
      // 检查是否为学科或六育列
      if (normType === "SUBJECT") {
        for (const [key, code] of Object.entries(SUBJECT_HEADER_MAP)) {
          if (header.includes(key)) {
            headerMap[idx] = { code, name: key };
            break;
          }
        }
      } else {
        for (const [key, code] of Object.entries(DIMENSION_HEADER_MAP)) {
          if (header.includes(key)) {
            headerMap[idx] = { code, name: key };
            break;
          }
        }
      }
    }
  });

  const parsedRows = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    // 空白行过滤
    if (!row || row.every((c) => c === "" || c === null || c === undefined)) {
      continue;
    }

    const username = usernameColIdx !== -1 && row[usernameColIdx] !== undefined
      ? String(row[usernameColIdx]).trim()
      : "";
    const realName = realNameColIdx !== -1 ? String(row[realNameColIdx] || "").trim() : "";
    const grade = gradeColIdx !== -1 ? String(row[gradeColIdx] || "").trim() : "";
    const classNo = classNoColIdx !== -1 ? String(row[classNoColIdx] || "").trim() : "";

    const scores = {};

    Object.entries(headerMap).forEach(([idxStr, info]) => {
      const idx = Number(idxStr);
      const val = row[idx];
      if (val !== "" && val !== null && val !== undefined && val !== "-") {
        scores[info.code] = typeof val === "number" ? val : String(val).trim();
      }
    });

    parsedRows.push({
      rowNum: r + 1,
      username,
      realName,
      grade,
      classNo,
      scores
    });
  }

  return {
    rows: parsedRows,
    headers: rawHeaders
  };
}

/**
 * 客户端读取 File 对象并解析
 */
export async function parseScoreExcel(file, type = "SUBJECT") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const result = parseScoreWorkbook(workbook, type);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 构造标准成绩模板 Workbook
 */
export function buildScoreTemplateWorkbook(type = "SUBJECT") {
  const normType = (type || "SUBJECT").toUpperCase();
  const wb = XLSX.utils.book_new();

  if (normType === "SUBJECT") {
    const wsData = [
      ["学号", "姓名", "年级", "班级", "语文", "数学", "英语", "物理", "化学", "生物", "道德与法治", "历史", "地理", "体育"],
      ["20240101", "张小明", "初一", "1班", 92.5, 98.0, 95.0, 88.0, 90.5, 89.0, 94.0, 91.0, 93.0, 96.0],
      ["20240102", "李小华", "初一", "1班", 85.0, 92.0, 89.5, 84.0, 86.0, 90.0, 92.5, 88.0, 87.5, 95.0],
      ["20240103", "王大伟", "初一", "2班", 90.0, 85.5, 91.0, 80.0, "", 85.0, 89.0, 86.0, 84.0, 92.0]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "学科成绩录入表");
  } else {
    const wsData = [
      ["学号", "姓名", "年级", "班级", "德育(D)", "智育(Z)", "体育(T)", "美育(M)", "劳育(L)", "生活故事(G)"],
      ["20240101", "张小明", "初一", "1班", 95.0, 92.0, 88.5, 90.0, 94.0, 96.0],
      ["20240102", "李小华", "初一", "1班", 90.0, 95.0, 92.0, 89.0, 91.0, 93.0]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "六育维度评分表");
  }

  return wb;
}

/**
 * 触发标准模板文件下载
 */
export function downloadScoreTemplate(type = "SUBJECT") {
  const normType = (type || "SUBJECT").toUpperCase();
  const wb = buildScoreTemplateWorkbook(normType);
  const filename = normType === "SUBJECT" ? "全校学生期末学科成绩导入模板.xlsx" : "全校学生六育终测评分导入模板.xlsx";
  XLSX.writeFile(wb, filename);
}

/**
 * 生成包含错误诊断原因的异常名单 Workbook
 */
export function buildErrorRecordsWorkbook(errors = [], originalRows = [], type = "SUBJECT") {
  const errorMap = new Map();
  errors.forEach((err) => {
    errorMap.set(Number(err.rowNum), err.reason);
  });

  const exportData = [];

  originalRows.forEach((row) => {
    if (errorMap.has(Number(row.rowNum))) {
      const item = {
        Excel行号: `第 ${row.rowNum} 行`,
        学号: row.username,
        姓名: row.realName,
        年级: row.grade,
        班级: row.classNo
      };

      if (row.scores) {
        Object.entries(row.scores).forEach(([code, val]) => {
          item[code] = val;
        });
      }

      item["错误诊断原因"] = errorMap.get(Number(row.rowNum)) || "格式异常";
      exportData.push(item);
    }
  });

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "异常成绩明细");
  return wb;
}

/**
 * 触发异常名单 Excel 下载
 */
export function exportErrorReportExcel(errors = [], originalRows = [], type = "SUBJECT") {
  const wb = buildErrorRecordsWorkbook(errors, originalRows, type);
  const filename = `成绩导入异常数据名单_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, filename);
}
