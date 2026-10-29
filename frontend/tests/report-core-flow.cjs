const { createRequire } = require("node:module");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const runtime =
  "/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || runtime);
const {
  createCoreTestDb,
} = require("../../backend/__tests__/helpers/reportCoreDb");
(async () => {
  const cleanups = [];
  const uploadDir=await fs.mkdtemp('/tmp/report-ui-uploads-');process.env.REPORT_FILES_DIR=uploadDir;cleanups.push(()=>fs.rm(uploadDir,{recursive:true,force:true}));
  const db = await createCoreTestDb({ after: (fn) => cleanups.push(fn) });
  let vite, server, browser;
  try {
    await db.seedBase();
    const [[seedUser]] = await db.pool.query(
      "SELECT password FROM users WHERE id=3",
    );
    for (let id = 5; id <= 10; id++) {
      const cls = id <= 6 ? 1 : 2;
      await db.pool.query(
        "INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no) VALUES(?,1,?,?,?,'student',4,?)",
        [id, "student" + (id - 2), seedUser.password, "学生" + id, cls],
      );
      await db.pool.query(
        "INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(1,1,?,?,4,?,'CORE_V1','1')",
        [id, "学生" + id, cls],
      );
    }
    await db.pool.query(
      "INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher) SELECT school_id,term_id,teacher_id,grade,2,subject_code,is_head_teacher FROM teacher_teaching_assignment WHERE class_no=1",
    );
    server = require("../../backend/app")
      .createApp({ pool: db.pool, schoolId: "1" })
      .listen(19371);
    vite = spawn(
      process.execPath,
      [
        path.join(root, "frontend/node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "19372",
        "--strictPort",
      ],
      {
        cwd: path.join(root, "frontend"),
        env: { ...process.env, VITE_API_TARGET: "http://127.0.0.1:19371" },
        stdio: "ignore",
      },
    );
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch("http://127.0.0.1:19372")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const page = await browser.newPage();
    const errors = [];
    const capture=async options=>{await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return page.screenshot(options);};

    const reflowChecks=[];
    const checkReflow=async role=>{
      for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),role+' at '+width);}
      const cdp=await page.context().newCDPSession(page);try{await cdp.send('Emulation.setDeviceMetricsOverride',{width:720,height:500,deviceScaleFactor:2,mobile:false});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),role+' equivalent 200% reflow');assert.equal(await page.evaluate(()=>devicePixelRatio),2);}finally{await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();await page.setViewportSize({width:1439,height:1000});await page.setViewportSize({width:1440,height:1000});}
      reflowChecks.push({role,widths:[390,768,1440],equivalentZoom:{cssWidth:720,devicePixelRatio:2,physicalWidth:1440}});
    };
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:19372");
    await page
      .getByRole("heading", { name: /让每一份成长/ })
      .waitFor({ timeout: 8000 });
    await page.getByLabel("账号").fill("student");
    await page.getByLabel("密码", { exact: true }).fill("Test-pass-2026");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: "开始自我评价 →", exact: true }).click();
    try { await page.getByRole("radio", { name: "有礼貌·自评 2星", exact: true }).waitFor({timeout:8000}); } catch(e) { console.error('SELF_DIAGNOSTIC', await page.locator('body').innerText(), errors); throw e; }
    await page.getByRole("radio", { name: "有礼貌·自评 2星", exact: true }).check();
    await page.route('**/api/v1/report-core/forms/3', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message:'登录已过期' }) }), { times: 1 });
    await page.getByRole('button', { name:'保存评价', exact:true }).click();
    await page.getByRole('dialog', { name:'重新登录' }).waitFor();
    await page.getByLabel('重新登录密码').fill('Test-pass-2026');
    await page.getByRole('button', { name:'重新登录', exact:true }).click();
    await page.getByRole('dialog', { name:'重新登录' }).waitFor({ state:'hidden' });
    assert.equal(await page.getByRole('radio', { name:'有礼貌·自评 2星', exact:true }).isChecked(), true);
    for (const width of [390,768,1440]) {
      await page.setViewportSize({ width, height:900 });
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.activeElement !== document.body));
    }
    await page.getByRole("button", { name: "保存评价", exact: true }).click();
    await page.getByText("评价已保存", { exact: true }).waitFor();
    await page.getByRole('button',{name:'清除有礼貌·自评',exact:true}).click();
    await page.getByRole('button',{name:'保存评价',exact:true}).click();
    await page.waitForFunction(() => { const b=document.querySelector('.self-save button'); return b?.disabled === true && b?.textContent === '保存评价'; });
    await page.reload();
    await page.getByRole('radio',{name:'有礼貌·自评 1星',exact:true}).waitFor();
    assert.equal(await page.getByRole('radio',{name:'有礼貌·自评 2星',exact:true}).isChecked(),false);
    await page.getByRole('radio',{name:'有礼貌·自评 2星',exact:true}).check();
    await db.pool.query('UPDATE student_term_evaluation SET conduct_politeness_self_star=1,revision=revision+1 WHERE student_id=3');
    await page.getByRole('button',{name:'保存评价',exact:true}).click();
    await page.getByRole('button',{name:'保留我的填写',exact:true}).waitFor();
    assert.equal(await page.getByRole('radio',{name:'有礼貌·自评 2星',exact:true}).isChecked(),true);
    await page.getByRole('button',{name:'保留我的填写',exact:true}).click();
    await page.getByRole('button',{name:'保存评价',exact:true}).click();
    await page.waitForFunction(() => { const b=document.querySelector('.self-save button'); return b?.disabled === true && b?.textContent === '保存评价'; });
    assert.deepEqual(errors, []);
    const screenshotDir = path.join(root, "output/report-core");
    await fs.mkdir(screenshotDir, { recursive: true });
    const nav = async (name) => {
      if(['自我评价','扫码领取','上传奖状','我的期末报告'].includes(name)){
        await page.locator('.student-topnav').getByRole('button',{name:['自我评价','我的期末报告'].includes(name)?'我的档案':'首页',exact:true}).click();
        const target={'自我评价':'学期自我评价','扫码领取':'领取积分卡','我的期末报告':'查看期末报告','上传奖状':'上传奖状'}[name];
        await page.getByRole('button',{name:new RegExp(target)}).click();
      }else if(['无卡直评','学业导入','材料认定','采集结算'].includes(name)){
        if(!await page.locator('.evaluation-tabs').count())await page.getByRole('button',{name:'评价录入',exact:true}).click();
        await page.locator('.evaluation-tabs').getByRole('button',{name:{'无卡直评':'快速直评','学业导入':'学业水平'}[name]||name,exact:true}).click();
      }else await page.locator('.adult-navigation,.student-topnav').getByRole('button',{name:name==='全校发布'?'发布中心':name,exact:true}).click();
      await page.locator('.panel').first().waitFor();
    };
    const toast = async (text) =>
      page
        .getByRole("status")
        .filter({ hasText: text })
        .waitFor({ timeout: 15000 });
    const login = async (user) => {
      if(await page.locator('.student-account').count())await page.locator('.student-account > summary').click();
      if (
        await page
          .getByRole("button", { name: "退出登录", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "退出登录", exact: true })
          .click();
      await page.getByLabel("账号", { exact: true }).fill(user);
      await page.getByLabel("密码", { exact: true }).fill("Test-pass-2026");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await page.locator(".adult-navigation,.student-topnav").waitFor();
      await page.waitForTimeout(200);
    };
    const students = Array.from({ length: 8 }, (_, i) => ({
      id: String(i + 3),
      username: i ? "student" + (i + 1) : "student",
    }));
    const catalog = require("../../backend/config/reportCorePolicy.json");
    await checkReflow('student-self');
    const beforeSkip=page.url();await page.locator('.skip-link').focus();await page.keyboard.press('Enter');await page.waitForTimeout(100);
    assert.equal(page.url(),beforeSkip,'keyboard skip link must focus content without changing hash route');
    assert.equal(await page.locator('main').evaluate(el=>el===document.activeElement),true);
    await page.locator('body').click({position:{x:2,y:2}});await capture({path:path.join(screenshotDir,'student-self-new-ui.png'),fullPage:true});
    await nav('首页');await capture({path:path.join(screenshotDir,'student-home-new-ui.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.core-app').count(),1);await capture({path:path.join(screenshotDir,'student-home-new-ui-mobile.png'),fullPage:false,animations:'disabled'});await page.setViewportSize({width:1440,height:1000});
    await login("admin");
    await checkReflow('admin-release');
    await capture({path:path.join(screenshotDir,'admin-new-ui.png'),fullPage:true});
    await nav("月度卡额度");
    await page.getByLabel('选择额度教师2',{exact:true}).check();
    await page.getByLabel('统一月总额',{exact:true}).fill('100');
    await page.getByRole('button',{name:'应用到已选教师',exact:true}).click();
    await page.getByRole('button',{name:'预览下发',exact:true}).click();
    await page.getByRole('button',{name:'确认批量下发',exact:true}).click();
    await toast('批量额度已下发');
    await login("teacher");
    await nav("卡片管理");
    await page.getByRole("tab",{name:"制卡打印",exact:true}).click();
    await page
      .getByRole("button", { name: "管理此计划", exact: true })
      .first()
      .click();
    await page.getByLabel("计划张数0-0", { exact: true }).fill("100");
    await page.getByLabel("班级总量0",{exact:true}).fill("100");
    await page.getByLabel("计划方向0-0",{exact:true}).selectOption("CONDUCT_POLITENESS_OTHER_STAR");
    await page.getByRole("button", { name: "保存分班计划", exact: true }).click();
    await toast("分班计划已保存");

    await page
      .getByRole("button", { name: "生成全部班级卡片", exact: true })
      .click();
    await toast("卡片已生成");

    const zipDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "下载分班 PDF 压缩包", exact: true })
      .click();
    const zip = await zipDownload;
    assert.ok(
      (await zip.suggestedFilename()).endsWith(".zip"),
      "100-card quota remains printable through actual UI",
    );

    // Use the same original credential that was delivered in the authorized card PDF.
    const [[printedCard]]=await db.pool.query("SELECT id FROM evaluation_source_record WHERE record_kind='CARD' ORDER BY id LIMIT 1");
    const cardToken=await require('../../backend/services/reportCoreCards').cardToken({pool:db.pool,actor:{id:'2',schoolId:'1',role:'teacher'},sourceId:String(printedCard.id)});
    await nav("无卡直评");
    for (const name of ['学生3','学生4']) await page.locator('.student-checks label').filter({hasText:name}).locator('input').check();
    await page.getByRole('button',{name:'德美少年',exact:true}).click();
    await page.getByRole('button',{name:'日常行为',exact:true}).click();
    await page.getByRole('button',{name:'有礼貌',exact:true}).click();
    await checkReflow('teacher-direct');
    await capture({path:path.join(screenshotDir,'teacher-direct-new-ui.png'),fullPage:true});
    await page.getByRole('button',{name:'为2名学生各记1分',exact:true}).click();
    await toast('已为2名学生各记1分');
    for (const name of ['学生3','学生4']) await page.locator('.student-checks label').filter({hasText:name}).locator('input').check();
    await page.getByRole('button',{name:'德美少年',exact:true}).click();
    await page.getByRole('button',{name:'日常行为',exact:true}).click();
    await page.getByRole('button',{name:'有礼貌',exact:true}).click();
    await page.getByRole('button',{name:'为2名学生各记1分',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.direct-board input[type="checkbox"]:checked'));
    const [intentCounts]=await db.pool.query("SELECT student_id,COUNT(*) n FROM evaluation_source_record WHERE record_kind='DIRECT' GROUP BY student_id");
    assert.deepEqual(intentCounts.map(r=>[String(r.student_id),Number(r.n)]),[['3',2],['4',2]]);
    await page
      .getByRole("button", { name: "加载更多材料与记录", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "加载更多材料与记录", exact: true })
      .click();

    for (const student of students) {
      await login(student.username);
      if (student.id === "4") {
        await nav("扫码领取");
        await page.getByLabel("卡片凭证").fill(cardToken);
        await page
          .getByRole("button", { name: "读取卡片", exact: true })
          .click();
        await page
          .getByRole("button", { name: "确认领取", exact: true })
          .click();
        await toast("领取成功");
      }
      await nav("自我评价");
      for (const [section,label] of [['conduct','1 · 日常行为'],['health','2 · 健康与体育特长'],['art','3 · 艺术与艺术特长']]) {
        await page.getByRole('button',{name:label,exact:true}).click();
        for (const f of catalog.fields.filter(f=>!f.jsonPath&&f.sourceType==='SELF'&&f.section===section)) await page.getByRole('radio',{name:`${f.label} 3星`,exact:true}).check();
      }
      await page.getByRole('button',{name:'4 · 七段小记录，留下这个学期的自己',exact:true}).click();
      for (const name of [
        "品行美自述",
        "智慧美自述",
        "健康美自述",
        "艺术美自述",
        "劳动美自述",
        "本学期最大收获与活动",
        "下学期努力目标",
      ]) {
        const panel=page.locator('.self-text-panel').filter({has:page.getByLabel(name,{exact:true})});
        if(await panel.count()&&!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
        await page
          .getByLabel(name, { exact: true })
          .fill("本学期认真参与，下一学期继续努力。");
      }
      await page.getByRole("button", { name: "保存评价", exact: true }).click();
      await toast("评价已保存");
      await nav("月度故事");
      await page.getByLabel("故事月份").fill("2026-10");
      for (const label of ["我爱读故事1", "我爱听故事1", "我爱讲故事1"]) {
        await page.getByRole("tab", {name:new RegExp(label.slice(0,-1))}).click();
        await page
          .getByLabel(label, { exact: true })
          .fill(
            "虚构的学习材料。我读懂了小马过河的故事，明白要听取建议，也要独立思考。",
          );
      }
      if (student.id === '3') {
        await page.getByRole('tab',{name:/我爱读故事/}).click();
        const original=await page.getByLabel('我爱读故事1',{exact:true}).inputValue();
        await page.getByLabel('我爱读故事文本文件',{exact:true}).setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from([255])});
        assert.equal(await page.getByLabel('我爱读故事1',{exact:true}).inputValue(),original);
        await page.getByLabel('我爱读故事文本文件',{exact:true}).setInputFiles({name:'large.txt',mimeType:'text/plain',buffer:Buffer.alloc(65537)});
        assert.equal(await page.getByLabel('我爱读故事1',{exact:true}).inputValue(),original);
        await page.evaluate(()=>{const original=File.prototype.arrayBuffer;window.restoreStoryFileRead=()=>{File.prototype.arrayBuffer=original;};File.prototype.arrayBuffer=function(){const file=this;return new Promise(resolve=>{window.finishStoryFileRead=()=>original.call(file).then(resolve);});};});
        await page.getByLabel('我爱读故事文本文件',{exact:true}).setInputFiles({name:'delayed.txt',mimeType:'text/plain',buffer:Buffer.from('延迟载入的旧文件')});
        await page.waitForFunction(()=>!!window.finishStoryFileRead);await page.getByLabel('我爱读故事1',{exact:true}).fill(original+'新编辑');
        await page.evaluate(async()=>{await window.finishStoryFileRead();window.restoreStoryFileRead();});await page.waitForTimeout(100);
        assert.equal(await page.getByLabel('我爱读故事1',{exact:true}).inputValue(),original+'新编辑','late TXT read must not overwrite subsequent typing');
        await page.getByLabel('我爱读故事1',{exact:true}).fill(original);
        await page.getByLabel('故事月份').fill('2026-11');
        await page.getByLabel('故事月份').fill('2026-10');
        await page.getByLabel('我爱读故事1',{exact:true}).waitFor();
        assert.equal(await page.getByLabel('我爱读故事1',{exact:true}).inputValue(),original);
        await page.getByRole('button',{name:'保存草稿',exact:true}).click();
        await toast('草稿已保存');
        const stories=require('../../backend/services/reportCoreStories');
        const [[u]]=await db.pool.query('SELECT token_version FROM users WHERE id=3');
        const storyArgs={pool:db.pool,actor:{id:'3',schoolId:'1',role:'student',tokenVersion:u.token_version},termId:'1',monthKey:'2026-10'};
        const current=(await stories.getStudentStoryMonth(storyArgs)).latestBatch;
        await stories.saveStoryDraft({...storyArgs,expectedBatchId:current.batchId,expectedVersion:current.version,expectedRevision:current.revision,articles:['READ','LISTEN','TELL'].map(category=>({category,text:'另一窗口保存的故事。'})),command:{requestKey:'browser-other-tab',payloadHash:'e'.repeat(64)}});
        await page.getByLabel('我爱读故事1',{exact:true}).fill(original+'我的新填写。');
        await page.getByRole('button',{name:'保存草稿',exact:true}).click();
        await page.getByText('服务器已有新版本，本次文字已保留。核对后可保存为新草稿。',{exact:true}).waitFor();
        assert.equal(await page.getByLabel('我爱读故事1',{exact:true}).inputValue(),original+'我的新填写。');
      }
      if(student.id==='3')await capture({path:path.join(screenshotDir,'student-story-new-ui.png'),fullPage:true});
      await page
        .getByRole("button", { name: "提交本月三类故事", exact: true })
        .click();
      await toast("整月故事已提交");
      if (student.id === "3") {
        await nav("上传奖状");
        await page.getByLabel("奖状文件").setInputFiles({
          name: "fictional-award.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOEsAAAAASUVORK5CYII=",
            "base64",
          ),
        });
        await page.getByAltText('待提交奖状预览').waitFor();
        await capture({path:path.join(screenshotDir,'student-award-new-ui.png'),fullPage:true});
        await page
          .getByRole("button", { name: "提交奖状", exact: true })
          .click();
        await toast("奖状已提交");
      }
    }
    await login("teacher");
    await page.getByRole('button',{name:'奖状',exact:true}).click();
    await page.getByRole('button',{name:'前往处理 →',exact:true}).first().click();
    await page.locator('.review-box').waitFor();
    assert.equal(await page.getByRole('heading',{name:/材料 #/}).count(),1);
    await capture({path:path.join(screenshotDir,'teacher-review-new-ui.png'),fullPage:true});
    await nav("材料认定");
    await page.getByRole('button',{name:'全部材料',exact:true}).click();
    let reviewButtons = page.getByRole("button", {
      name: "查看与处理",
      exact: true,
    });
    await reviewButtons.first().waitFor();
    // Every queued story is manually exception-reviewed because provider account is in arrears; no fake auto scorer.
    for (let i = 0; i < 25; i++) {
      const rows = page
        .locator(".source-row")
        .filter({ hasText: /排队中|处理中|待认定|处理失败/ });
      if (!(await rows.count())) break;
      await rows
        .first()
        .getByRole("button", { name: "查看与处理", exact: true })
        .click();
      const isStory = await page
        .getByLabel("内容完整性", { exact: true })
        .count();
      if (isStory) {
        for (const label of [
          "内容完整性",
          "类别相关性",
          "表达条理",
          "个人理解与感受",
        ])
          await page.getByLabel(label, { exact: true }).fill("22");
      } else {
        await page.getByLabel("成果归属").selectOption("labor_outcome_grade");
        await page.getByLabel("成果认定值").selectOption("A");
      }
      await page
        .getByLabel("审核依据")
        .fill("联调虚构材料，教师依据文本或奖状事实确认。");
      const reviewReload = page.waitForResponse(r => r.url().includes("/report-core/sources?"));
      await page.getByRole("button", { name: "保存认定", exact: true }).click();
      await (await reviewReload).json();
      await toast("认定已保存");
      await page.waitForTimeout(100);
    }
    await nav("学业导入");
    await page.getByLabel("学业录入班级").selectOption('');
    await page.getByLabel("学业录入科目").selectOption('');
    const academic = catalog.fields.filter(
      (f) =>
        !f.jsonPath &&
        f.sourceType === "IMPORT" &&
        ![
          "height_cm",
          "weight_kg",
          "vision_left",
          "vision_right",
          "jump_rope_1min",
        ].includes(f.column),
    );
    for (const student of students) for(const f of academic) await page.getByLabel(`${student.id} · ${f.label}`,{exact:true}).fill(f.valueType==='star'?'3':'A');
    await page.getByRole('button',{name:'预览导入',exact:true}).click();await toast('预览完成');
    await page.getByRole('button',{name:'确认导入',exact:true}).click();await toast('导入已提交');
    await login("admin");
    await nav("体测原始值");
    for(const student of students)for(const [label,value] of [['身高','141'],['体重','35'],['左视力','5.0'],['右视力','5.0'],['1分钟跳绳','160']])await page.getByLabel(`${student.id} · ${label}`,{exact:true}).fill(value);
    await page.getByRole('button',{name:'预览导入',exact:true}).click();
    await toast('预览完成');
    await page.getByRole('button',{name:'确认导入',exact:true}).click();
    await toast('导入已提交');
    await login("teacher");
    await nav("采集结算");
    for (const cls of ["4:1", "4:2"]) {
      await page.getByLabel("结算班级").selectOption(cls);
      for (const content of ["CARD_CLOSED", "NO_AWARD"]) {
        await page.getByLabel("结算内容").selectOption(content);
        await page
          .getByRole("button", { name: "确认结算", exact: true })
          .click();
        await toast("采集结算已完成");
        await page.waitForTimeout(100);
      }
    }
    console.log("UI all six sources collected/settled");
    await nav("班级报告");
    for (const student of students) {
      console.log("UI confirm student", student.id);
      await page.getByRole('button',{name:`学生${student.id} · 查看报告`,exact:true}).click();
      await page.getByRole('button',{name:'完整报告',exact:true}).click();
      await page.getByLabel('学期寄语',{exact:true}).fill('认真学习，勇于尝试，继续保持。');
      await page.getByRole('button',{name:'保存学期寄语',exact:true}).click();await toast('学期寄语已保存');
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='确认本份报告'&&!b.disabled));
      await page.getByRole('button',{name:'确认本份报告',exact:true}).click();await toast('班主任确认已保存');
      await page.getByRole('button',{name:'返回班级列表',exact:true}).click();
    }
    await login("admin");
    await nav("全校发布");
    await page
      .getByRole("button", { name: "准备全校报告", exact: true })
      .click();
    await toast("全校报告准备完成");
    await page.reload();
    await page.getByRole('heading',{name:'全校发布进度',exact:true}).waitFor();
    await page.getByRole('button',{name:'统一发布',exact:true}).waitFor();
    await page.reload();
    await page.getByRole('heading',{name:'全校发布进度',exact:true}).waitFor();
    await page.getByRole("button", { name: "统一发布", exact: true }).click();
    await toast("全校报告已统一发布");
    await capture({
      path: path.join(screenshotDir, "admin-release.png"),
      fullPage: true,
    });
    await login("student");
    await nav("我的期末报告");
    const frame = page.frameLocator('iframe[title="六育评价报告"]');
    await frame
      .getByRole("heading", { name: "六育评价明细表", exact: true })
      .waitFor();
    assert.equal(await frame.locator("[data-view]").count(), 109);
    const reportHtml = await page
      .locator('iframe[title="六育评价报告"]')
      .getAttribute("srcdoc");
    const printPage = await browser.newPage();
    await printPage.setContent(reportHtml);
    await printPage.pdf({
      path: path.join(screenshotDir, "report-print.pdf"),
      printBackground: true,
      preferCSSPageSize: true,
    });
    await printPage.close();
    await capture({
      path: path.join(screenshotDir, "student-report-desktop.png"),
      fullPage: true,
    });
    for (const width of [375, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.ok(
        await page
          .locator('iframe[title="六育评价报告"]')
          .evaluate(
            (el) => el.clientHeight >= el.contentDocument.body.scrollHeight,
          ),
        `iframe must grow to show all report sections at width ${width}: ${JSON.stringify(await page.locator('iframe[title="六育评价报告"]').evaluate(el=>({frame:el.clientHeight,body:el.contentDocument.body.scrollHeight,bounds:el.contentDocument.body.getBoundingClientRect().toJSON()})))}`,
      );
      await capture({
        path: path.join(screenshotDir, `student-report-${width}.png`),
        fullPage: true,
      });
    }
    await fs.writeFile(path.join(screenshotDir,'responsive-new-ui.json'),JSON.stringify(reflowChecks,null,2));
    const [[count]] = await db.pool.query(
      "SELECT COUNT(*) n FROM term_report WHERE status='PUBLISHED'",
    );
    assert.equal(Number(count.n), 8);
    const [sourceCounts] = await db.pool.query(
      "SELECT source_type,COUNT(*) n FROM evaluation_source_record WHERE source_type IS NOT NULL GROUP BY source_type",
    );
    assert.equal(sourceCounts.length, 6);
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(screenshotDir, "verification.json"),
      JSON.stringify(
        {
          students: 8,
          classes: 2,
          publishedReports: 8,
          displayPositions: 109,
          sourceCounts,
          mobileWidths: [375, 390, 430],
          scoring:
            "TEACHER_REVIEW because Dashscope Arrearage; real automatic acceptance pending",
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS actual browser six-source / three-role / two-class / eight-student whole-school report flow",
    );
  } finally {
    if(browser){const p=browser.contexts()[0]?.pages()[0];if(p&&await p.locator('.report-detail-header').count())console.error('REPORT_DETAIL_STATE',await p.locator('.report-detail-header').innerText(),await p.locator('.report-toolbar').innerText());if(p&&await p.locator('.card-plan').count())console.error('FINAL_CARD_PLAN_STATE',await p.locator('.card-plan').innerText(),await p.locator('.card-plan input,.card-plan select').evaluateAll(es=>es.map(e=>({label:e.ariaLabel,value:e.value,disabled:e.disabled}))));await browser.close();}
    if (vite) vite.kill();
    if (server) await new Promise((r) => server.close(r));
    for (const f of cleanups.reverse()) await f();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
