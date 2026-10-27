const {test}=require('node:test'),assert=require('node:assert/strict');
const {pace}=require('./pacing.cjs');
test('每次可见操作完成后停留2.5秒，查询和断言不额外停留',async()=>{
 const events=[],locator={getByRole(){return this},filter(){return this},async click(){events.push('click')},async fill(){events.push('fill')},async waitFor(){events.push('wait')}};
 const page=pace(locator,1,async ms=>events.push(ms));
 await page.getByRole('button').filter({hasText:'保存'}).click();await page.fill('内容');await page.waitFor();
 assert.deepEqual(events,['click',2500,'fill',2500,'wait']);
});
test('加速参数仅用于显式加速，弹页和文件选择同样保留动作停顿',async()=>{
 const events=[],chooser={async setFiles(){events.push('file')}},context={async waitForEvent(){return chooser}};
 await (await pace(context,2,async ms=>events.push(ms)).waitForEvent('filechooser')).setFiles('a.xlsx');
 assert.deepEqual(events,['file',1250]);
});
