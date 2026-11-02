const {test}=require('node:test'),assert=require('node:assert/strict');
test('import_to_daily_records_to_published_six_education_report',async()=>{
 const result=await require('../scripts/verifyAdminSimplification').verifyAdminSimplification();
 assert.equal(result.generatedTotal,1515);
 assert.equal(result.reportCellCount,94);
 assert.equal(result.reportPageCount,2);
 assert.equal(result.unchangedStoredRows,true);
 assert.ok(result.checks.includes('four-statistics-tabs'));
});
