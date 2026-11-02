import {test} from 'node:test';import assert from 'node:assert/strict';
import {registryQuery,changeRegistryFilters} from './registryModel.js';
test('relation filters bind the term and reset obsolete pagination',()=>{const state=changeRegistryFilters({view:'students',q:'旧',cursor:'old'}, {q:'00123'});assert.equal(state.cursor,null);const q=new URLSearchParams(registryQuery({termId:'2',...state}));assert.equal(q.get('termId'),'2');assert.equal(q.get('q'),'00123');assert.equal(q.has('cursor'),false);});
