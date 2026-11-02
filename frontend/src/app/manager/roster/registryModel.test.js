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
test('a response is hidden immediately when the relation view or semester changes',async()=>{
 const {registryRelationsForQuery}=await import('./registryModel.js');
 const students=registryQuery({termId:'2',view:'students'}),teachers=registryQuery({termId:'2',view:'teachers'});
 const value={rows:[{id:4,name:'林小禾',courses:[]}],total:1};
 const loaded={query:students,value};
 assert.equal(registryRelationsForQuery(loaded,students),value);
 assert.equal(registryRelationsForQuery(loaded,teachers),null);
 assert.equal(registryRelationsForQuery(loaded,registryQuery({termId:'3',view:'students'})),null);
 assert.equal(registryRelationsForQuery(null,students),null);
});
