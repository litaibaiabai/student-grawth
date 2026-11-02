import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildSelfGroups,getSelfProgress} from '../student/self/selfEvaluationModel.js';
import {buildCardTree,eligibleCardCodes} from '../teacher/cards/cardModel.js';

const require=createRequire(import.meta.url),catalog=require('../../../../backend/config/reportCoreV2Policy.json');

test('V2 student form exposes exactly eleven self ratings and no legacy narratives',()=>{
 const fields=catalog.fields.filter(f=>f.sourceType==='SELF').map(f=>f.column),view={schemaVersion:'SIX_EDU_V2',applicableSelfFields:fields,values:{}};
 assert.equal(buildSelfGroups(view,catalog).flatMap(g=>g.fields).length,11);
 assert.equal(getSelfProgress(view,catalog).total,11);assert.equal(catalog.cardCatalog.length,14);
});

test('V2 all fourteen card targets can be selected with matching assignments',()=>{
 const assignments=['MORAL','CHINESE','MATH','SCIENCE','ENGLISH','INFORMATION_TECHNOLOGY','PE','MUSIC','FINE_ART','LABOR','INTEGRATED_PRACTICE','LOCAL_COURSE'].map(subject_code=>({grade:4,class_no:1,subject_code,enabled:1}));
 const allowed=eligibleCardCodes({catalog,assignments,studentRows:[{student_id:'3',grade_snapshot:4,class_no_snapshot:1}],selectedStudentIds:['3']});
 assert.equal(allowed.length,14);assert.equal(buildCardTree(catalog,allowed).flatMap(s=>s.children.flatMap(g=>g.children)).length,14);
});
