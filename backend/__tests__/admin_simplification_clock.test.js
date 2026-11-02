const {test}=require('node:test'),assert=require('node:assert/strict');
test('local demo clock is explicit, advances with elapsed time and refuses production',()=>{
 const {localDemoClock}=require('../scripts/localDemoClock');let elapsed=1000;
 const clock=localDemoClock('2027-02-15T00:00:00.000Z',{environment:'development',realNow:()=>elapsed});
 assert.equal(clock().toISOString(),'2027-02-15T00:00:00.000Z');elapsed+=3000;assert.equal(clock().toISOString(),'2027-02-15T00:00:03.000Z');
 assert.equal(localDemoClock(undefined),undefined);
 assert.throws(()=>localDemoClock('2027-02-15',{environment:'production'}),/production/);
 assert.throws(()=>localDemoClock('bad'),/ISO/);
});
