const { catalog } = require("./reportCorePolicy");
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function renderPrintableA4({ reportData: m }) {
  if (m.renderedHtml) return m.renderedHtml;
  if (m.schemaVersion !== "CORE_V1")
    return `<!doctype html><meta charset="UTF-8"><title>历史报告</title><h1>历史报告</h1><pre>${escape(JSON.stringify(m, null, 2))}</pre>`;
  const sectionNames = {
    conduct: "德美少年",
    wisdom: "智美少年",
    health: "健美少年",
    art: "艺美少年",
    labor: "劳美少年",
    story: "故事美少年",
  };
  const display = (f) => {
    let v = m.values[f.column];
    if (f.jsonPath) {
      const array =
        f.column === "sports_specialties"
          ? m.sportsSpecialties
          : m.artSpecialties;
      const [, index, property] = f.jsonPath.match(/\$\[(\d+)\]\.(\w+)/);
      v = array[Number(index)]?.[property];
    }
    if (v == null || v === "") return '<span class="blank">—</span>';
    if (f.valueType === "star")
      return `<span class="stars">${"★".repeat(Number(v) || 0)}</span>`;
    return escape(v);
  };
  function block(section) {
    const fs = catalog.fields.filter((f) => f.section === section);
    let rows = "";
    for (let i = 0; i < fs.length; i += 2) {
      const pair = fs.slice(i, i + 2);
      rows +=
        "<tr>" +
        pair
          .map(
            (f) =>
              `<th>${escape(f.label)}</th><td data-view="${escape(f.viewCode)}">${display(f)}</td>`,
          )
          .join("") +
        (pair.length === 1 ? "<th></th><td></td>" : "") +
        "</tr>";
    }
    if (["health", "art"].includes(section)) {
      const array =
        section === "health" ? m.sportsSpecialties : m.artSpecialties;
      const base = section === "health" ? 1 : 2;
      for (const item of array.slice(base))
        rows += `<tr><th>${escape(item.name)}</th><td>${escape(item.outcome)}</td><th>自评 / 教师</th><td>${escape(item.self_star)} / ${escape(item.teacher_star)}</td></tr>`;
    }
    return `<section><h2>${sectionNames[section]}</h2><table><tbody>${rows}</tbody></table></section>`;
  }
  const names = {
    self_conduct_text: "品行美",
    self_wisdom_text: "智慧美",
    self_health_text: "健康美",
    self_art_text: "艺术美",
    self_labor_text: "劳动美",
    semester_highlights: "本学期最大收获与活动",
    next_term_goals: "下学期努力目标",
    teacher_comment: "学期寄语",
    family_message: "家长寄语",
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escape(m.student.name)} · 综合素质发展报告</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f1eee7;color:#242c29;font-family:'Songti SC','SimSun',serif}.paper{background:white;width:277mm;min-height:190mm;margin:20px auto;padding:7mm 8mm;box-shadow:0 4px 20px #23352c12}.front{height:190mm}header{border-bottom:2px solid #8c6045;padding-bottom:10px;margin-bottom:10px;display:flex;align-items:end;justify-content:space-between}h1{font-size:23px;letter-spacing:3px;margin:4px 0;color:#75472b}header p{font-size:12px;margin:0}.eyebrow{font-size:10px;letter-spacing:2px;color:#8b6f52}.details{display:grid;grid-template-columns:1fr 1fr;gap:14px}.column{min-width:0}section{margin-bottom:10px;break-inside:avoid}h2{font-size:17px;margin:0 0 5px;color:#875430;letter-spacing:2px}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:9.5px;line-height:1.25}th,td{border:1px solid #b7bdb2;padding:3px 4px;overflow-wrap:anywhere;vertical-align:middle}th{font-weight:400;text-align:left;background:#f8f7f1;width:31%}td{width:19%}.stars{letter-spacing:1px;color:#273e32}.blank{color:#a9afa9}.stories td{white-space:normal}footer{font-size:9px;color:#777;border-top:1px solid #ccc;padding-top:6px;margin-top:8px}.narratives{display:grid;grid-template-columns:1fr 1fr;gap:12px}.narrative{border:1px solid #c4c8bf;padding:10px;min-height:75px}.narrative h3{font-size:13px;margin:0 0 8px;color:#875430}.narrative p{font-size:12px;line-height:1.65;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.narrative.wide{grid-column:1/-1}.front header{margin-bottom:15px}.registration{font-size:12px;margin-top:15px}.detail-paper{height:190mm;min-height:190mm}
 @media screen and (max-width:800px){body{background:white}.paper{width:100%;min-height:auto;height:auto;margin:0;padding:18px;box-shadow:none}.details,.narratives{display:block}.narrative{margin-bottom:10px}header{display:block}header p{margin-top:8px}table{font-size:11px}th,td{padding:7px 4px}h1{font-size:21px}.front{border-bottom:5px solid #f1eee7}}
 @page{size:A4 landscape;margin:10mm}@media print{body{background:white}.paper{margin:0;padding:0;box-shadow:none;width:277mm;height:190mm;min-height:0;break-after:page;overflow:visible}.paper:last-child{break-after:auto}.details{gap:12px}table{font-size:9px;line-height:1.15}th,td{padding:2px 3px}section{margin-bottom:6px}h2{font-size:14px;margin-bottom:3px}header{padding-bottom:6px;margin-bottom:6px}h1{font-size:20px}.narrative{min-height:68px}footer{font-size:8px}}
 </style></head><body><article class="paper front" data-print-page><header><div><span class="eyebrow">云美少年 · 学期成长档案</span><h1>学生综合素质发展报告单</h1></div><p>${escape(m.term.academicYear || "")} · 第${escape(m.term.semester || "")}学期<br>${escape(m.student.grade)}年级 ${escape(m.student.classNo)}班　${escape(m.student.name)}</p></header><div class="narratives">${Object.entries(
   names,
 )
   .map(
     ([key, label]) =>
       `<div class="narrative ${["semester_highlights", "next_term_goals"].includes(key) ? "wide" : ""}"><h3>${label}</h3><p>${escape(m.narratives[key])}</p></div>`,
   )
   .join(
     "",
   )}</div><p class="registration">下学期报到时间：${escape(m.term.nextRegistrationDate ? String(m.term.nextRegistrationDate).slice(0, 10) : "待学校通知")}</p><footer>有故事的学校 · 有温度的教育 · 有精彩的童年</footer></article><article class="paper detail-paper" data-print-page><header><div><span class="eyebrow">学期评价明细</span><h1>六育评价明细表</h1></div><p>${escape(m.student.name)} · ${escape(m.student.grade)}年级${escape(m.student.classNo)}班</p></header><div class="details"><div class="column">${block("conduct")}${block("wisdom")}</div><div class="column">${block("health")}${block("art")}${block("labor")}${block("story")}</div></div><footer>自评、他评分别记录；— 表示无记录或不适用。来源确认指纹：${escape(m.fingerprint || "草稿")}</footer></article></body></html>`;
}
module.exports = { renderPrintableA4, escape };
