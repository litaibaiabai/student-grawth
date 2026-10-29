import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {eligibleCardCodes,buildCardTree,updateCardPath} from './cardModel.js';
const catalog=createRequire(import.meta.url)('../../../../backend/config/reportCorePolicy.json');
test('37 unique leaves map to 8 conduct, 20 wisdom, 3 health and 6 art, without labor/story cards',()=>{
 const tree=buildCardTree(catalog,catalog.cardCatalog.map(c=>c.code));
 assert.deepEqual(tree.map(s=>s.children.flatMap(p=>p.children).length),[8,20,3,6]);assert.equal(new Set(tree.flatMap(s=>s.children.flatMap(p=>p.children.map(x=>x.id)))).size,37);
 assert.equal(tree[0].children[0].label,'日常行为');
});
test('multiple students use class-specific subject permission intersection',()=>{
 const studentRows=[{student_id:'3',grade_snapshot:4,class_no_snapshot:1},{student_id:'4',grade_snapshot:4,class_no_snapshot:2}];
 const assignments=[{grade:4,class_no:1,subject_code:'MATH'},{grade:4,class_no:2,subject_code:'SCIENCE'}];
 assert.equal(eligibleCardCodes({catalog,assignments,studentRows,selectedStudentIds:[]}).length,0);
 assert.equal(eligibleCardCodes({catalog,assignments,studentRows,selectedStudentIds:['3']}).length,12);
 assert.equal(eligibleCardCodes({catalog,assignments,studentRows,selectedStudentIds:['3','4']}).length,8);
 assert.equal(eligibleCardCodes({catalog,assignments,studentRows,selectedStudentIds:['99']}).length,0);
});
test('same parent click retains leaf, real parent or selected students change clears descendants',()=>{
 const p={section:'wisdom',primary:'数学',categoryCode:'MATH_HABIT_STAR',studentIds:['3']};
 assert.equal(updateCardPath(p,'primary','数学'),p);assert.equal(updateCardPath(p,'section','wisdom'),p);
 assert.equal(updateCardPath(p,'primary','科学').categoryCode,'');assert.equal(updateCardPath(p,'studentIds',['4']).section,'');
});
