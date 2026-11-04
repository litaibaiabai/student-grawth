const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
test('provider accepts API roots and explicit completion URLs without duplicating the route', async t => {
  const {createProvider}=require('../services/infrastructure/reportCoreProvider');
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url!=='/compatible-mode/v1/chat/completions') {
      res.writeHead(404);res.end(JSON.stringify({error:{code:'WrongPath'}}));return;
    }
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({comment:'继续保持好奇心。'})}}]}));
  }).listen(0);
  t.after(()=>server.close());
  for(const path of ['/compatible-mode/v1','/compatible-mode/v1/','/compatible-mode/v1/chat/completions']) {
    const provider=createProvider({baseUrl:`http://127.0.0.1:${server.address().port}${path}`,apiKey:'fixture',model:'fixture',allowLocal:true});
    assert.equal((await provider.generateTermComment({report:{},fields:[]})).comment,'继续保持好奇心。');
  }
});
test('vendor account failures remain retryable without exposing billing details', async t => {
  const {createProvider}=require('../services/infrastructure/reportCoreProvider');
  const server=http.createServer((req,res)=>{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'Arrearage',message:'Access denied'}}));}).listen(0);
  t.after(()=>server.close());
  const provider=createProvider({baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:'fixture',model:'fixture',allowLocal:true});
  await assert.rejects(provider.generateTermComment({report:{},fields:[]}),{statusCode:503,message:'生成暂时失败，请稍后重试'});
});
test('term comment provider uses full supplied assessment and rejects invalid drafts', async t => {
  const { createProvider } = require('../services/infrastructure/reportCoreProvider');
  let comment = '你在数学学习中保持专注，也在故事表达中展现了想象力。希望你继续保持好奇心，在合作中收获更多成长。';
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(JSON.parse(body).messages[1].content);
    assert.equal(input.report.values.math_overall_grade, 'A');
    assert.equal(input.report.values.story_summary.WRITE.value, 8);
    assert.equal(input.fields.find(f => f.column === 'math_overall_grade').label, '数学总评');
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({comment})}}]}));
  }).listen(0);
  t.after(() => server.close());
  const provider = createProvider({baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:'fixture',model:'fixture',allowLocal:true});
  assert.equal(typeof provider.generateTermComment, 'function');
  const input = {report:{values:{math_overall_grade:'A',story_summary:{WRITE:{value:8}}}},fields:[{column:'math_overall_grade',label:'数学总评'}]};
  assert.equal((await provider.generateTermComment(input)).comment, comment);
  for (const invalid of ['', '   ', '字'.repeat(1001), {text:'不合法'}]) {
    comment = invalid;
    await assert.rejects(provider.generateTermComment(input), {statusCode:502});
  }
});
test("LLM adapter sends actual supplied text and rejects malformed scores rather than fabricating success", async (t) => {
  const { createProvider } = require("../services/infrastructure/reportCoreProvider");
  let invalid = false;
  const s = http
    .createServer(async (req, res) => {
      let body = "";
      for await (const b of req) body += b;
      assert.match(JSON.parse(body).messages[1].content, /虚构故事/);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  invalid
                    ? { total: 100 }
                    : {
                        dimensions: [20, 21, 22, 23],
                        total: 86,
                        evidence: ["虚构故事"],
                        feedback: "表达清楚",
                      },
                ),
              },
            },
          ],
        }),
      );
    })
    .listen(0);
  t.after(() => s.close());
  const provider = createProvider({
    baseUrl: `http://127.0.0.1:${s.address().port}`,
    apiKey: "fixture",
    model: "fixture",
    allowLocal: true,
  });
  const input = {
    text: "虚构故事",
    category: "READ",
    grade: 4,
    ruleVersion: "1",
  };
  assert.equal((await provider.scoreStory(input)).total, 86);
  invalid = true;
  await assert.rejects(provider.scoreStory(input), { statusCode: 502 });
  await assert.rejects(createProvider({}).scoreStory(input), {
    statusCode: 503,
  });
});
