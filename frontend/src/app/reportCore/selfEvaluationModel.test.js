import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSelfGroups,getSelfProgress,mergeSelfDraft } from './selfEvaluationModel.js';
const catalog=createRequire(import.meta.url)('../../../../backend/config/reportCorePolicy.json');
test('13 fixed stars form 8/1/4 groups and seven required texts exclude family',()=>{
 const applicableSelfFields=catalog.fields.filter(f=>f.sourceType==='SELF'&&!f.jsonPath).map(f=>f.column);
 const view={applicableSelfFields,values:{},sportsSpecialties:[],artSpecialties:[]};
 const groups=buildSelfGroups(view,catalog);assert.deepEqual(groups.map(g=>g.fields.length),[8,1,4,7]);
 assert.deepEqual(getSelfProgress(view,catalog),{total:20,complete:0});
 assert.equal(getSelfProgress({...view,applicableSelfFields:[applicableSelfFields[0]]},catalog).total,8);
});
test('three-way merge preserves null clears, flags same-cell conflicts and uses stable specialty ids',()=>{
 const base={values:{a:1,b:1},sportsSpecialties:[{id:'x',self_star:1},{id:'y',self_star:2}],artSpecialties:[]};
 const remote={values:{a:2,b:1},sportsSpecialties:[{id:'y',self_star:2}],artSpecialties:[]};
 const r=mergeSelfDraft({base,local:{a:3,b:null},remote,specialtyChanges:[{collection:'sports',id:'x',changes:{self_star:3}},{collection:'sports',id:'y',changes:{self_star:1}}]});
 assert.equal(r.merged.b,null);assert.equal(r.conflicts[0].field,'a');assert.deepEqual(r.removedSpecialtyIds,['x']);assert.equal(r.specialtyChanges[0].id,'y');
});
