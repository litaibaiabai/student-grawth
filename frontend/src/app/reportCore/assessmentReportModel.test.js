import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {reportSections,fieldPresentation} from '../../component/StudentAssessmentReport/model.js';
const catalog=createRequire(import.meta.url)('../../../../backend/config/reportCoreV2Policy.json');
const currentCatalog=createRequire(import.meta.url)('../../../../backend/config/reportCorePolicy.json');

test('current-term specialty paths and every current catalog field remain available in the same template',()=>{
 assert.equal(reportSections(currentCatalog).flatMap(s=>s.fields).length,currentCatalog.fields.length);
 const specialty=currentCatalog.fields.find(f=>f.jsonPath==='$[0].name');
 assert.equal(fieldPresentation({values:{[specialty.column]:[{name:'游泳'}]}},specialty).text,'游泳');
});

test('the reusable report contains every catalog field and upload filtering removes only the story section',()=>{
 const full=reportSections(catalog);
 assert.deepEqual(full.map(s=>s.id),['conduct','wisdom','health','art','labor','story']);
 assert.equal(full.flatMap(s=>s.fields).length,catalog.fields.length);
 const upload=reportSections(catalog,['conduct','wisdom','health','art','labor']);
 assert.equal(upload.flatMap(s=>s.fields).length,catalog.fields.filter(f=>f.section!=='story').length);
 assert.equal(reportSections(catalog).at(-1).id,'story');
});

test('only this upload is teacher-colored; system/self and existing teacher values stay gray',()=>{
 const record={values:{math_regular_grade:'B',math_process_star:3,fitness_self_star:2},uploadedFields:['math_process_star','fitness_self_star']};
 for(const column of ['math_regular_grade','math_process_star','fitness_self_star'])assert.equal(fieldPresentation(record,catalog.fields.find(f=>f.column===column)).source,'prefill');
 record.uploadedFields.push('math_regular_grade');
 assert.equal(fieldPresentation(record,catalog.fields.find(f=>f.column==='math_regular_grade')).source,'teacher');
});

test('zero, nested story JSON, invalid values and field-specific error reasons survive presentation',()=>{
 const record={values:{jump_rope_1min:0,story_summary:JSON.stringify({WRITE:{rank:1,value:0}}),math_regular_grade:'Z'},uploadedFields:['jump_rope_1min','math_regular_grade'],errors:[{field:'math_regular_grade',reason:'等级值不合法'}]};
 assert.equal(fieldPresentation(record,catalog.fields.find(f=>f.column==='jump_rope_1min')).text,'0');
 assert.equal(fieldPresentation(record,catalog.fields.find(f=>f.jsonPath==='WRITE.value')).text,'0');
 const grade=fieldPresentation(record,catalog.fields.find(f=>f.column==='math_regular_grade'));
 assert.equal(grade.text,'Z');assert.equal(grade.error,'等级值不合法');
});
