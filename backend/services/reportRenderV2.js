const {catalog}=require('./reportCoreV2Policy');
const {splitText}=require('./reportPagination');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=new Map(catalog.fields.filter(f=>!f.jsonPath).map(f=>[f.column,f]));
function renderV2({model:m,renderScope='FULL',draftLabel}) {
 const source=m.sourceSummary||{},values=m.values||{},student=m.student||{},term=m.term||{},used=new Set();
 const cell=key=>{
  const field=typeof key==='object'?key:fields.get(key);
  if(!field)throw Error(`Unknown V2 report field: ${key}`);
  used.add(field.viewCode);let value=values[field.column];
  if(field.jsonPath)value=field.jsonPath.split('.').reduce((v,k)=>v?.[k],value);
  const notApplicable=source[field.column]?.notApplicable===true;
  const text=notApplicable?'不适用':value===null||value===undefined||value===''?'—':field.valueType==='star'&&[1,2,3].includes(Number(value))?'★'.repeat(Number(value)):String(value);
  return `<td data-view="${escape(field.viewCode)}" class="${notApplicable?'blank':field.valueType}">${escape(text)}</td>`;
 };
 const table=(headers,rows)=>`<table><thead><tr>${headers.map(h=>`<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
 const row=(label,keys,span=1)=>`<tr><th scope="row">${escape(label)}</th>${keys.map(key=>cell(key).replace('<td ',span>1?`<td colspan="${span}" `:'<td ')).join('')}</tr>`;
 const section=(id,n,title,body)=>`<section data-section="${id}"><h2><i>${n}</i>${title}</h2>${body}</section>`;
 const conduct=section('conduct','01','德美少年',table(['日常行为','自评','师评'],['politeness','integrity','kindness','communication','civility','responsibility','rules','cooperation'].map(key=>row(fields.get(`conduct_${key}_self_star`).label.split('·')[0],[`conduct_${key}_self_star`,`conduct_${key}_other_star`])).concat(row('过程表现',['conduct_process_star'],2))));
 const wisdom=section('wisdom','02','智美少年',table(['学科','兴趣','习惯','方法','平时','期末','总评','过程'],['moral','chinese','math','science','english','information_technology'].map(key=>row(fields.get(`${key}_interest_star`).label.split('·')[0],['interest_star','habit_star','method_star','regular_grade','final_grade','overall_grade','process_star'].map(s=>`${key}_${s}`)))));
 const bmiCell=values.bmi!=null?`<td class="bmi-cell"><div style="font-weight:600;font-size:13px;line-height:1.2;">${escape(values.bmi)}</div><div style="font-size:11px;color:#7d5c3e;margin-top:2px;">${escape(values.bmi_label||'—')}</div></td>`:`<td class="blank">—</td>`;
 const health=section('health','03','健美少年',table(['身高 / cm','体重 / kg','BMI','视力左','视力右','跳绳 / 次'],[`<tr>${cell('height_cm')}${cell('weight_kg')}${bmiCell}${cell('vision_left')}${cell('vision_right')}${cell('jump_rope_1min')}</tr>`])+table(['项目','自评 / 学业水平','教师评价 / 过程'],[row('体育与健康',['pe_academic_grade','pe_process_star']),row('体质健康',['fitness_self_star','fitness_level_star']),row('体测过程',['fitness_process_star'],2)])+`<p class="note">BMI：${escape(values.bmi??'—')}${values.bmi_label?`（${escape(values.bmi_label)}）`:''}　测量日期：${escape(source.height_cm?.measurement?.date||'—')}　视力制式：${escape(({DECIMAL:'小数制','5_POINT':'五分制'})[source.vision_left?.measurement?.visionStandard]||'—')}</p>`);
 const art=section('art','04','艺美少年',table(['学科','自评','教师评价','平时','总评','过程'],['music','fine_art'].map(key=>row(key==='music'?'音乐':'美术',['learning_self_star','learning_teacher_star','regular_grade','overall_grade','process_star'].map(s=>`${key}_${s}`)))));
 const labor=section('labor','05','劳美少年',table(['学科','学科素养','过程表现'],[['labor','劳动'],['integrated_practice','综合实践活动'],['local_course','地方课程']].map(([key,label])=>row(label,[`${key}_literacy_grade`,`${key}_process_star`]))));
 const story=section('story','06','故事美少年',table(['活动','数量 / 分数','全校排名','成果表现'],[['LISTEN','听故事'],['WRITE','写故事'],['TELL','讲故事']].map(([key,label])=>row(label,[catalog.fields.find(f=>f.jsonPath===`${key}.value`),catalog.fields.find(f=>f.jsonPath===`${key}.rank`),`story_${key.toLowerCase()}_star`])))+`<p class="note">听、写按有效数量；讲故事按有效最高分。未参与显示“—”。</p>`);
 if(used.size!==catalog.fields.length)throw Error('V2 report catalog mapping is incomplete');
 const identity=`${student.name||''} · ${student.grade||''}年级（${student.classNo||''}）班 · ${term.academicYear||''} 第${term.semester||''}学期`;
 const header=title=>`<header><span class="kicker">云美少年 · 学期成长档案</span><h1>${escape(title)}</h1><p>${escape(identity)}</p></header>`;
 const pages=[{type:'report-detail',body:`${header('六育评价明细表')}<div class="columns"><div>${conduct}${wisdom}</div><div>${health}${art}${labor}${story}</div></div><p class="note">星级、字母等级和原始值分别记录；未采集显示“—”，不适用单独标注。</p>`}];
 if(renderScope==='FULL') {
  const comment=String(m.narratives?.teacher_comment||'—'),honors=m.honors||[];
  const commentParts=splitText(comment,{columns:64,maxLines:24});
  const honorText=honors.map((item,i)=>`${i+1}. ${item.name||'未命名荣誉'} · ${[item.region,item.level].filter(Boolean).join(' · ')||'—'}`).join('\n');
  const honorParts=splitText(honorText,{columns:64,maxLines:24});
  const longComment=commentParts.length>1||[...comment].length>600||comment.includes('\n')&&comment.split('\n').length>12;
  const longHonors=honorParts.length>1||honors.length>10;
  pages.push({type:'report-front',body:`${header('学生综合素质发展报告单')}<section class="narrative"><h2>班主任寄语</h2><p>${longComment?'完整寄语见后续“班主任寄语”续页。':escape(comment)}</p></section><section class="narrative"><h2>本学期荣誉</h2><p>${longHonors?'完整荣誉记录见后续“本学期荣誉”续页。':escape(honorText||'本学期暂无已认定荣誉')}</p></section><p class="registration">下学期报到时间：${escape(term.nextRegistrationDate instanceof Date?term.nextRegistrationDate.toISOString().slice(0,10):term.nextRegistrationDate||'待学校通知')}</p>`});
  for(const [title,parts,needed] of [['班主任寄语',commentParts,longComment],['本学期荣誉',honorParts,longHonors]])if(needed)for(const [i,part] of parts.entries())pages.push({type:'report-continuation',body:`${header(`${title}${i?'（续）':''}`)}<div class="continuation-body"><p>${escape(part.text)}</p></div>`});
 }
 return `<!doctype html><html lang="zh-CN" data-report-schema="CORE_V2"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escape(student.name)} · 六育评价报告</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f1f3ec;color:#43533f;font:12px/1.5 'PingFang SC','Microsoft YaHei',sans-serif}.paper{position:relative;width:400mm;height:277mm;padding:10mm;margin:20px auto;background:#fff;box-shadow:0 4px 20px #23352c10}header{border-bottom:2px solid #788a63;margin-bottom:14px;padding-bottom:8px}.kicker{font-size:10px;letter-spacing:3px;color:#89977d}h1{font:26px 'Songti SC','SimSun',serif;letter-spacing:2px;color:#7d5c3e;margin:5px 0}header p{margin:3px 0;font-size:12px}.columns{display:grid;grid-template-columns:1.15fr 1fr;gap:18px}.columns>div{min-width:0}section{border:1px solid #bdcbae;margin-bottom:12px;break-inside:avoid}h2{font:19px 'Songti SC','SimSun',serif;color:#82613f;margin:0;background:#f5f7ee;border-bottom:1px solid #cbd6bd;padding:5px 10px;letter-spacing:2px}h2 i{font:italic 12px Georgia;color:#aa936c;margin-right:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}table+table{margin-top:4px}th,td{border:1px solid #d2dbc7;padding:6px 4px;text-align:center;font-weight:400;overflow-wrap:anywhere}thead th{background:#f7f9f2;font-size:10px;color:#7e8f73}tbody th{background:#fbfcf8;font-size:11px}td.star{color:#5f774d;font-size:14px;white-space:nowrap;letter-spacing:-1px}td.grade{font:16px Georgia;color:#456a4a}td.blank,.note{color:#89987e}.note{font-size:10px;margin:6px 8px}.narrative{padding-bottom:16px}.narrative p{font-size:16px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;margin:16px 20px}.registration{margin-top:28px}.continuation-body p{font-size:15px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;margin:20px 0}footer{position:absolute;bottom:7mm;left:10mm;right:10mm;border-top:1px solid #d1dbc5;padding-top:5px;font-size:9px;color:#89987e}.draft-label{position:fixed;right:12px;top:4px;font-size:10px;color:#89987e}
 @media screen{.paper{width:min(100%,400mm);height:auto}footer{position:static;margin-top:20px}}
 @media screen and (max-width:900px){body{background:#fff}.paper{width:100%;height:auto;margin:0;padding:16px;box-shadow:none}.columns{display:block}th,td{padding:6px 2px}td.star{font-size:12px}h1{font-size:22px}.narrative p{font-size:14px;margin:12px}footer{position:static;margin-top:20px}.report-front,.report-continuation{border-top:6px solid #eef2e6}}
 @page{size:A3 landscape;margin:10mm}@media print{body{background:white}.paper{width:400mm;height:277mm;margin:0;padding:0;box-shadow:none;break-after:page}.paper:last-child{break-after:auto}footer{position:absolute;bottom:0;left:0;right:0}.draft-label{display:none}}
 </style></head><body>${draftLabel?`<div class="draft-label">${escape(draftLabel)}</div>`:''}${pages.map((page,i)=>`<article class="paper ${page.type}" data-print-page data-page-number="${i+1}">${page.body}<footer>${escape(identity)} · ${escape(m.templateVersion||'CORE_V2')} · 发布版本 ${escape(m.releaseVersion??'草稿')} · 第${i+1}页 / 共${pages.length}页</footer></article>`).join('')}</body></html>`;
}
module.exports={renderV2};
