const { catalog } = require("./reportCorePolicy");
const {createContinuationPlan,specialtyId,narrativeLabels,normalize}=require("./reportPagination");
const RENDER_VERSION="CORE_LAYOUT_V2_D01";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const byColumn = new Map(
  catalog.fields.filter((f) => !f.jsonPath).map((f) => [f.column, f]),
);
function renderPrintableA4({ reportData: m, renderScope='FULL', draftLabel }) {
  if(!['FULL','DETAIL_ONLY'].includes(renderScope))throw Error('Invalid report scope');
  if(renderScope==='DETAIL_ONLY'&&m.schemaVersion!=='CORE_V1')require('./reportCorePolicy').fail(422,'历史格式不支持安全明细');
  if(renderScope==='FULL'&&m.renderedHtml)return m.renderedHtml;
  if(renderScope==='DETAIL_ONLY'&&m.renderedDetailHtml)return m.renderedDetailHtml;
  if (m.schemaVersion !== "CORE_V1")
    return `<!doctype html><meta charset="UTF-8"><title>历史报告</title><h1>历史报告</h1><pre>${escape(JSON.stringify(m, null, 2))}</pre>`;
  const continuation=createContinuationPlan(m,renderScope);
  const textDisplay=(value,id,preview=8)=>{
    const page=continuation.refs.get(id);if(!page)return escape(value);
    const prefix=[...normalize(value).split('\n')[0]].slice(0,preview).join('');
    return `${escape(prefix)}<a class="continuation-ref" href="#continuation-${page}">（全文见第${page}页）</a>`;
  };
  const formatted = (value, type) =>
    value == null || value === ""
      ? '<span class="blank">—</span>'
      : type === "star"
        ? `<span class="stars">${"★".repeat(Number(value))}</span>`
        : type === "grade"
          ? `<span class="grade">${escape(value)}</span>`
          : escape(value);
  const cell = (column, { rowspan = 1, className = "" } = {}) => {
    const f = byColumn.get(column);
    if (!f) throw Error(`Unknown report column ${column}`);
    const unit = { height_cm: "cm", weight_kg: "kg", jump_rope_1min: "次" }[
      column
    ];
    return `<td data-view="${escape(f.viewCode)}"${rowspan > 1 ? ` rowspan="${rowspan}"` : ""} class="${className}">${continuation.refs.has("field:"+column)?textDisplay(m.values[column],"field:"+column,column.startsWith("vision_")?0:8):formatted(m.values[column], f.valueType)}${unit && m.values[column] != null ? `<span class="unit"> ${unit}</span>` : ""}</td>`;
  };
  const specialCell = (collection, index, property) => {
    const f = catalog.fields.find(
      (f) =>
        f.column === collection && f.jsonPath === `$[${index}].${property}`,
    );
    const array =
      collection === "sports_specialties"
        ? m.sportsSpecialties
        : m.artSpecialties;
    const v = array[index]?.[property];
    return `<td${f ? ` data-view="${f.viewCode}"` : ""} class="${property === "outcome" ? "description" : ""}">${continuation.refs.has(specialtyId(collection,array[index]||{},index,property))?textDisplay(v,specialtyId(collection,array[index]||{},index,property),0):formatted(v, ["self_star", "teacher_star"].includes(property) ? "star" : "text")}</td>`;
  };
  const section = (id, number, title, note, body) =>
    `<section data-section="${id}"><h2><span class="section-number">${number}</span>${title}<small>${note}</small></h2><div class="section-body">${body}</div></section>`;
  function conduct() {
    const pairs = [
      ["politeness", "有礼貌", "civility", "讲文明"],
      ["integrity", "讲信用", "responsibility", "负责任"],
      ["kindness", "有爱心", "rules", "守规则"],
      ["communication", "善交流", "cooperation", "会合作"],
    ];
    return section(
      "conduct",
      "01",
      "德美少年",
      "日常行为 · 自评与他评",
      `<table class="conduct-table"><colgroup><col style="width:20%"><col style="width:13%"><col style="width:17%"><col style="width:20%"><col style="width:13%"><col style="width:17%"></colgroup><thead><tr><th>日常行为</th><th>自评</th><th>他评</th><th>日常行为</th><th>自评</th><th>他评</th></tr></thead><tbody>${pairs.map(([a, al, b, bl]) => `<tr><th scope="row">${al}</th>${cell(`conduct_${a}_self_star`)}${cell(`conduct_${a}_other_star`)}<th scope="row">${bl}</th>${cell(`conduct_${b}_self_star`)}${cell(`conduct_${b}_other_star`)}</tr>`).join("")}</tbody></table>`,
    );
  }
  function wisdom() {
    const subjects = [
      [
        "moral",
        "道德<br>与法治",
        [
          ["cognition", "认知水平"],
          ["practice", "实践能力"],
        ],
      ],
      [
        "chinese",
        "语文",
        [
          ["accumulation_application", "积累与运用"],
          ["reading_appreciation", "阅读与鉴赏"],
          ["expression_communication", "表达与交流"],
          ["organization_inquiry", "梳理与探究"],
          ["handwriting", "书写"],
        ],
      ],
      [
        "math",
        "数学",
        [
          ["basic_knowledge", "基础知识"],
          ["thinking", "数学思维"],
          ["information_extraction", "信息提取"],
          ["problem_solving", "解决问题"],
        ],
      ],
      [
        "science",
        "科学",
        [
          ["concepts", "科学观念"],
          ["thinking", "科学思维"],
          ["inquiry_practice", "探究实践"],
        ],
      ],
      [
        "english",
        "英语",
        [
          ["listening", "听力素养"],
          ["speaking", "口语素养"],
          ["written_expression", "书面表达"],
          ["reading", "阅读能力"],
        ],
      ],
    ];
    const bodies = subjects
      .map(
        ([prefix, label, abilities]) =>
          `<tbody class="subject-group">${abilities.map(([ability, label2], i) => `<tr>${i === 0 ? `<th scope="rowgroup" rowspan="${abilities.length}" class="course">${label}</th>${["interest", "habit", "method"].map((item) => cell(`${prefix}_${item}_star`, { rowspan: abilities.length })).join("")}` : ""}<th scope="row" class="ability">${label2}</th>${cell(prefix === "english" && ability === "written_expression" ? "english_writing_grade" : `${prefix}_${ability}_grade`)}${i === 0 ? cell(`${prefix}_process_star`, { rowspan: abilities.length }) : ""}</tr>`).join("")}</tbody>`,
      )
      .join("");
    return section(
      "wisdom",
      "02",
      "智美少年",
      "学习过程 · 学业水平",
      `<table class="wisdom-table"><colgroup><col style="width:9%"><col style="width:14.5%"><col style="width:14.5%"><col style="width:14.5%"><col style="width:22%"><col style="width:12%"><col style="width:13.5%"></colgroup><thead><tr><th>课程</th><th>学习兴趣</th><th>学习习惯</th><th>学习方法</th><th>分项</th><th>学业<br>水平</th><th>过程<br>表现</th></tr></thead>${bodies}</table>`,
    );
  }
  function specialties(collection, minRows) {
    const array =
      collection === "sports_specialties"
        ? m.sportsSpecialties
        : m.artSpecialties;
    return `<table class="specialty-table"><colgroup><col style="width:31%"><col style="width:22%"><col style="width:22%"><col style="width:25%"></colgroup><thead><tr><th>特长项目</th><th>自我评价</th><th>教师评价</th><th>成果表现</th></tr></thead><tbody>${Array.from({ length: minRows }, (_, i) => `<tr>${["name", "self_star", "teacher_star", "outcome"].map((prop) => specialCell(collection, i, prop)).join("")}</tr>`).join("")}</tbody></table>${array.length>minRows?`<p class="extra-specialties">其余项目见第${continuation.refs.get(specialtyId(collection,array[minRows],minRows,'name'))}页（共${array.length}项）</p>`:''}`;
  }
  function health() {
    return section(
      "health",
      "03",
      "健美少年",
      "健康数据 · 体育与体测",
      `<table class="measure-table"><thead><tr><th>身高</th><th>体重</th><th>视力 · 左</th><th>视力 · 右</th><th>1 分钟跳绳</th></tr></thead><tbody><tr>${["height_cm", "weight_kg", "vision_left", "vision_right", "jump_rope_1min"].map((c) => cell(c, { className: "measurement" })).join("")}</tr></tbody></table><table><colgroup><col style="width:34%"><col style="width:33%"><col style="width:33%"></colgroup><thead><tr><th>课程</th><th>学业水平</th><th>过程表现</th></tr></thead><tbody><tr><th scope="row">体育与健康</th>${cell("pe_academic_grade")}${cell("pe_process_star")}</tr></tbody></table><table><colgroup><col style="width:34%"><col style="width:22%"><col style="width:22%"><col style="width:22%"></colgroup><thead><tr><th>项目</th><th>自我评价</th><th>体测水平</th><th>过程表现</th></tr></thead><tbody><tr><th scope="row">体质健康测试</th>${cell("fitness_self_star")}${cell("fitness_level_star")}${cell("fitness_process_star")}</tr></tbody></table><h3>体育技能特长</h3>${specialties("sports_specialties", 1)}`,
    );
  }
  function art() {
    return section(
      "art",
      "04",
      "艺美少年",
      "学科素养 · 艺术技能",
      `<table class="art-table"><colgroup><col style="width:12%">${'<col style="width:14.67%">'.repeat(6)}</colgroup><thead><tr><th rowspan="3">学科</th><th colspan="4">学科素养</th><th colspan="2">艺术技能</th></tr><tr><th colspan="2">学习过程</th><th rowspan="2">学业<br>水平</th><th rowspan="2">过程<br>表现</th><th rowspan="2">自我<br>评价</th><th rowspan="2">教师<br>评价</th></tr><tr><th>自我评价</th><th>教师评价</th></tr></thead><tbody>${[
        ["music", "音乐"],
        ["fine_art", "美术"],
      ]
        .map(
          ([code, label]) =>
            `<tr><th scope="row">${label}</th>${["learning_self_star", "learning_teacher_star", "academic_grade", "process_star", "skill_self_star", "skill_teacher_star"].map((suffix) => cell(`${code}_${suffix}`)).join("")}</tr>`,
        )
        .join(
          "",
        )}</tbody></table><h3>艺术特长项目</h3>${specialties("art_specialties", 2)}`,
    );
  }
  function labor() {
    return section(
      "labor",
      "05",
      "劳美少年",
      "课程学习 · 实践成果",
      `<table class="labor-table"><colgroup><col style="width:22%"><col style="width:13%"><col style="width:14%"><col style="width:51%"></colgroup><thead><tr><th>课程</th><th>成果表现</th><th>学业水平</th><th>成果作品、实践经历与表现</th></tr></thead><tbody>${[
        ["information_technology", "信息科技"],
        ["labor", "劳动"],
        ["integrated_practice", "综合实践活动"],
        ["local_course", "地方课程"],
      ]
        .map(
          ([code, label]) =>
            `<tr><th scope="row">${label}</th>${cell(`${code}_outcome_grade`)}${cell(`${code}_academic_star`)}${cell(`${code}_experience`, { className: "description" })}</tr>`,
        )
        .join("")}</tbody></table>`,
    );
  }
  function story() {
    return section(
      "story",
      "06",
      "故事美少年",
      "我爱读 · 我爱听 · 我爱讲",
      `<table class="story-table"><colgroup><col style="width:23%"><col style="width:13%"><col style="width:13%"><col style="width:51%"></colgroup><thead><tr><th>故事实践活动</th><th>学业水平</th><th>成果表现</th><th>实践经历与表现</th></tr></thead><tbody>${[
        ["read", "我爱读故事"],
        ["listen", "我爱听故事"],
        ["tell", "我爱讲故事"],
      ]
        .map(
          ([code, label]) =>
            `<tr><th scope="row">${label}</th>${cell(`story_${code}_star`)}${cell(`story_${code}_outcome_star`)}${cell(`story_${code}_experience`, { className: "description" })}</tr>`,
        )
        .join("")}</tbody></table>`,
    );
  }
  const date = m.term.nextRegistrationDate
    ? new Date(m.term.nextRegistrationDate)
    : null;
  const registration = date
    ? `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
    : "待学校通知";
  const meta = `<div class="student-meta"><div><span>学生姓名</span><b>${escape(m.student.name)}</b></div><div><span>所在班级</span><b>${escape(m.student.grade)}年级（${escape(m.student.classNo)}）班</b></div><div><span>学年 / 学期</span><b>${escape(m.term.academicYear || "")} · 第${escape(m.term.semester || "")}学期</b></div><div><span>评价呈现</span><b>星级 · 字母等级 · 原始值</b></div></div>`;
  const continuationHtml=continuation.pages.map(page=>`<article id="continuation-${page.number}" class="paper report-continuation" data-print-page data-page-number="${page.number}"><header class="continuation-header"><h1>综合素质发展报告 · 续页</h1><p>${escape(m.student.name)} · ${escape(m.student.grade)}年级（${escape(m.student.classNo)}）班 · ${escape(m.term.academicYear||'')} 第${escape(m.term.semester||'')}学期</p></header><div class="continuation-body">${page.blocks.map(block=>`<section class="continuation-item"${block.specialtyId?` data-specialty-id="${escape(block.specialtyId)}"`:''}><h3>${escape(block.label)}${block.continued?'（续）':''}</h3><p data-content-id="${escape(block.id)}" data-source-offset="${block.start}">${escape(block.text)}</p></section>`).join('')}</div><footer>${escape(m.student.name)} · ${escape(m.term.academicYear||'')} 第${escape(m.term.semester||'')}学期 · 第${page.number}页 / 共${continuation.pageCount}页</footer></article>`).join('');
  const front=renderScope==='FULL'?`<article class="paper report-front" data-print-page><header><div><span class="kicker">云美少年 · 学期成长档案</span><h1>学生综合素质发展报告单</h1></div><p>${escape(m.student.name)} · ${escape(m.student.grade)}年级（${escape(m.student.classNo)}）班</p></header><div class="narratives">${Object.entries(
   narrativeLabels,
 )
   .map(
     ([key, label]) =>
       `<div class="narrative ${["semester_highlights", "next_term_goals"].includes(key) ? "wide" : ""}"><h3>${label}</h3><p>${textDisplay(m.narratives[key],"narrative:"+key,12)}</p></div>`,
   )
   .join(
     "",
   )}</div><p class="registration">下学期报到时间：${escape(registration)}</p><footer>有故事的学校 · 有温度的教育 · 有精彩的童年</footer></article>`:'';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escape(m.student.name)} · 综合素质发展报告</title><style>
 .draft-label{position:fixed;top:4px;right:20px;font-size:9px;color:#85917b;z-index:10}*{box-sizing:border-box}body{margin:0;background:#f1f3ec;color:#43533f;font-family:'PingFang SC','Microsoft YaHei',sans-serif;font-size:11px;line-height:1.4}.paper{width:277mm;height:190mm;margin:20px auto;padding:7mm;background:white;box-shadow:0 4px 20px #23352c10}.report-front header{display:flex;justify-content:space-between;align-items:end;border-bottom:2px solid #788a63;padding-bottom:12px;margin-bottom:15px}h1{font-family:'Songti SC','SimSun',serif;font-size:23px;font-weight:500;letter-spacing:2px;color:#7d5c3e;margin:3px 0}.kicker{font-size:10px;letter-spacing:2px;color:#8c987d}.student-meta{display:grid;grid-template-columns:1fr 1fr 1.5fr 1.1fr;background:#eaf0e2;border-top:2px solid #7c8f6b;margin-bottom:5px;padding:5px 0}.student-meta>div{padding:1px 9px;border-right:1px solid #d2ddc5}.student-meta>div:last-child{border-right:0}.student-meta span{display:block;color:#89977c;font-size:9px;letter-spacing:1px}.student-meta b{font-size:11px;font-weight:600}.detail-title{font-size:14px;letter-spacing:2px;margin:0 0 4px}.report-columns{display:grid;grid-template-columns:1.02fr 1fr;gap:12px}.report-column{min-width:0}section{margin-bottom:5px;border:1px solid #b9c7aa;break-inside:avoid}h2{position:relative;display:flex;align-items:center;gap:8px;border-bottom:1px solid #d3dcc7;background:#fdfcf7;margin:0;padding:3px 7px;font-family:'Songti SC','SimSun',serif;font-weight:500;color:#836342;font-size:16px;letter-spacing:2px}h2:before{content:'';position:absolute;left:9px;top:-1px;width:25px;border-top:2px solid #947a50}h2 small{margin-left:auto;font-family:'PingFang SC',sans-serif;font-size:8px;color:#929d86;letter-spacing:1px}.section-number{font-size:9px;font-style:italic;color:#a38f61;letter-spacing:0}h3{font-size:9px;font-weight:400;margin:4px 0;color:#8a9878}h3:before{content:'▪';margin-right:6px;color:#9eac8a}.section-body{padding:3px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px;line-height:1.3}th,td{border:1px solid #cfd8c5;padding:3px 4px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}thead th{font-weight:400;color:#7c8c70;background:#f4f7ef}tbody th{font-weight:500;background:#fbfcf8}table+table{margin-top:4px}.stars{font-family:'Songti SC','SimSun',serif;color:#5d754c;font-size:13px;letter-spacing:-.5px;white-space:nowrap}.grade{font-family:Georgia,'Times New Roman',serif;color:#436b4c;font-size:12px}.blank{color:#819073}.unit{font-size:8px;color:#93a184;font-family:inherit}.description{text-align:left;white-space:pre-wrap}.ability{text-align:left;font-weight:400;background:white}.course{font-weight:600}.wisdom-table tbody+tbody{border-top:1.5px solid #b9c7aa}.measure-table thead th{border-bottom:0;background:white;font-size:8px;padding-bottom:0}.measure-table td{border-top:0;color:#557745;padding-top:5px;padding-bottom:5px;font-family:Georgia,'Times New Roman',serif;font-size:14px}.narratives{display:grid;grid-template-columns:1fr 1fr;gap:12px}.narrative{border:1px solid #c6d1bb;padding:9px;min-height:70px}.narrative h3{color:#826240;font-size:12px;margin:0 0 6px}.narrative h3:before{content:none}.narrative p{font-size:12px;line-height:1.6;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.narrative.wide{grid-column:1/-1}.registration{margin-top:14px}footer{font-size:8px;color:#91a080;border-top:1px solid #d4ddca;margin-top:7px;padding-top:5px;overflow-wrap:anywhere}.report-front footer{letter-spacing:2px}
 .continuation-ref{font-size:7px;color:#546b46;text-decoration:underline;white-space:nowrap}.extra-specialties{font-size:7px;margin:2px 0}.paper{position:relative}.report-continuation{padding-bottom:15mm}.continuation-header h1{font-size:18px;margin:0 0 8px}.continuation-header p{font-size:11px;margin:0 0 14px}.continuation-item{border:0;margin:0 0 10px}.continuation-item h3{font-size:12px;line-height:18px;margin:0 0 4px;letter-spacing:0}.continuation-item p{font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2;margin:0}.report-continuation footer{position:absolute;bottom:7mm;left:7mm;right:7mm;font-size:9px}.narrative p{tab-size:2}
 @media screen and (max-width:800px){body{background:white}.paper{width:100%;height:auto;margin:0;padding:14px;box-shadow:none}.report-columns{display:block}.student-meta{grid-template-columns:1fr 1fr;gap:8px 0;padding:9px 0}.student-meta b{font-size:11px}.student-meta>div:nth-child(2){border-right:0}.report-column section{margin-bottom:15px}h2{font-size:18px;padding:8px}h2 small{font-size:8px;letter-spacing:0}.section-body{padding:3px}table{font-size:10px;line-height:1.4}th,td{padding:5px 2px}.stars{font-size:11px;letter-spacing:-1px}.wisdom-table .stars{font-size:10px}.measure-table td{font-size:14px}.report-front{border-bottom:6px solid #eef2e6}.report-front header{display:block}.report-front header p{margin-bottom:0}.narratives{display:block}.narrative{margin-bottom:10px}.detail-title{margin-top:8px}.registration{font-size:12px}.report-continuation{padding-bottom:20px}.report-continuation footer{position:static;margin-top:20px}}
 @media print{.report-continuation footer{bottom:0;left:0;right:0}.report-continuation{padding-bottom:12mm}}
 @page{size:A4 landscape;margin:10mm}@media print{body{background:white}.paper{margin:0;padding:0;width:277mm;height:190mm;box-shadow:none;break-after:page}.paper:last-child{break-after:auto}.student-meta{margin-bottom:3px;padding:3px 0}.student-meta b{font-size:10px}.student-meta span{font-size:8px}.detail-title{font-size:12px;margin-bottom:3px}.report-columns{gap:9px}.section-body{padding:2px}h2{font-size:14px;padding:2px 6px}h2 small{font-size:7px}section{margin-bottom:4px}table{font-size:8.5px;line-height:1.25}th,td{padding:2px 3px}.stars{font-size:12px}.grade{font-size:11px}.measure-table td{font-size:13px;padding:4px}.report-detail footer{display:none}.narrative{min-height:68px}footer{font-size:7px;margin-top:5px}}
 </style></head><body>${draftLabel?`<div class="draft-label">${escape(draftLabel)}</div>`:""}${front}<article class="paper report-detail" data-print-page><h1 class="detail-title">六育评价明细表</h1>${meta}<div class="report-columns"><div class="report-column">${conduct()}${wisdom()}</div><div class="report-column">${health()}${art()}${labor()}${story()}</div></div><footer>自评与他评分别记录；— 表示暂无记录或不适用。来源确认指纹：${escape(m.fingerprint || "草稿")}</footer></article>${continuationHtml}</body></html>`;
}
module.exports = { renderPrintableA4, escape, RENDER_VERSION };
