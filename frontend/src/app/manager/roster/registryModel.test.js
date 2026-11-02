import {test} from 'node:test';import assert from 'node:assert/strict';
import {registryQuery,changeRegistryFilters} from './registryModel.js';
test('relation filters bind the term and reset obsolete pagination',()=>{const state=changeRegistryFilters({view:'students',q:'旧',cursor:'old'}, {q:'00123'});assert.equal(state.cursor,null);const q=new URLSearchParams(registryQuery({termId:'2',...state}));assert.equal(q.get('termId'),'2');assert.equal(q.get('q'),'00123');assert.equal(q.has('cursor'),false);});
test('a later page cursor cannot cross into another semester query',async()=>{
 const {registryFiltersForTerm}=await import('./registryModel.js');
 const previous={termId:'1',view:'students',q:'',cursor:'signed-for-term-1'};
 const next=registryFiltersForTerm(previous,'2');
 assert.equal(next.cursor,null);assert.equal(new URLSearchParams(registryQuery(next)).get('termId'),'2');assert.equal(new URLSearchParams(registryQuery(next)).has('cursor'),false);
 const page={...next,cursor:'signed-for-term-2'};assert.equal(registryFiltersForTerm(page,'2').cursor,'signed-for-term-2');
});
