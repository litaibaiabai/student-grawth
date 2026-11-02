import {test} from 'node:test';import assert from 'node:assert/strict';
import {currentReviewRoute} from './reportReview.js';
test('head teacher can open current data from a published report without losing student scope',()=>{
 const route={studentId:'4',classKey:'4:1',reportVersion:'published',reportScope:'full'};
 assert.deepEqual(currentReviewRoute(route,{viewVersion:'published',permissions:{canReadFull:true}}),{...route,reportVersion:'current',reportScope:'full',reportSection:undefined});
 assert.equal(currentReviewRoute(route,{viewVersion:'published',permissions:{canReadFull:false}}),null);
 assert.equal(currentReviewRoute(route,{viewVersion:'current',permissions:{canReadFull:true}}),null);
});
