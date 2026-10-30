const {test}=require('node:test'),assert=require('node:assert/strict');
const {renderPrintableA4}=require('../services/reportRenderService');
const policy=require('../config/reportCorePolicy.json');
function model(){return {schemaVersion:'CORE_V1',student:{id:'3',name:'续页校样',grade:4,classNo:1},term:{id:'1',academicYear:'2026-2027',semester:1},values:Object.fromEntries(policy.fields.filter(f=>!f.jsonPath).map(f=>[f.column,null])),narratives:{self_conduct_text:'开始'+('成长\n'.repeat(600))+'结束',self_wisdom_text:'智慧美',self_health_text:'健康美',self_art_text:'艺术美',self_labor_text:'劳动美',semester_highlights:'收获',next_term_goals:'目标',teacher_comment:'寄语',family_message:''},sportsSpecialties:[],artSpecialties:Array.from({length:9},(_,i)=>({id:'art-'+i,name:'项目'+i,outcome:'成果'.repeat(240)+'TAIL_'+i,self_star:2,teacher_star:3}))};}
test('legal long narratives and extra specialties retain the double-sided main report and point to named continuation pages',()=>{
 const html=renderPrintableA4({reportData:model()});assert.ok(html.includes('report-continuation'));assert.ok(html.includes('全文见第'));assert.ok(html.includes('其余项目见第'));assert.ok(html.includes('续页校样'));assert.ok(html.includes('共'));assert.equal((html.match(/data-view=/g)||[]).length,109);
 for(let i=0;i<9;i++)assert.ok(html.includes('TAIL_'+i));
 const detail=renderPrintableA4({reportData:model(),renderScope:'DETAIL_ONLY'});assert.ok(!detail.includes('开始'));assert.ok(!detail.includes('narrative:self_conduct_text'));assert.ok(detail.includes('TAIL_8'));
});

test('continuation chunks preserve every Unicode character and newline exactly',()=>{const {splitText,normalize}=require('../services/reportPagination');const text=('😀文\t字\n'.repeat(600))+'终点';const parts=splitText(text);assert.equal(parts.map(p=>p.text).join(''),normalize(text));assert.ok(parts.every(p=>p.lines<=24));for(let i=1;i<parts.length;i++)assert.equal(parts[i].start,parts[i-1].start+parts[i-1].text.length);});


test('full report starts with six-board detail, then summary, then continuations; frozen reports retain their published layout',()=>{
 const m=model(),html=renderPrintableA4({reportData:m});
 const pages=[...html.matchAll(/<article[^>]*class="paper ([^"]+)"[^>]*data-print-page/g)].map(x=>x[1]);
 assert.deepEqual(pages.slice(0,2),['report-detail','report-front']);
 assert.ok(pages.slice(2).every(type=>type==='report-continuation'));
 const detail=renderPrintableA4({reportData:m,renderScope:'DETAIL_ONLY'});
 assert.ok(!detail.includes('<article class="paper report-front"'));
 assert.equal(renderPrintableA4({reportData:{...m,renderedHtml:'FROZEN_PUBLISHED_LAYOUT'}}),'FROZEN_PUBLISHED_LAYOUT');
});
