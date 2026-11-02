const {
  chromium
} = require(process.env.PLAYWRIGHT_MODULE || '/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {
  seedAdminClosureDemo
} = require('../../backend/scripts/seedAdminClosureDemo');
const {
  runAdminClosureDemo
} = require('../../backend/scripts/runAdminClosureDemo');
const {
  createDbPool
} = require('../../backend/db');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  XLSX = require('../node_modules/xlsx');
(async () => {
  let runtime, browser, manifest;
  const originalConsoleError = console.error;
  let expectedConflictLog = 0;
  const database = `liuyu_report_test_admin_demo_ui_${Date.now()}`,
    dir = path.resolve('output/report-core/admin-closure-ui');
  await fs.mkdir(dir, {
    recursive: true
  });
  try {
    manifest = await seedAdminClosureDemo({
      database,
      outputDir: path.join(dir, database)
    });
    runtime = await runAdminClosureDemo({
      manifestFile: path.join(manifest.outputDir, 'manifest.json'),
      apiPort: 19590,
      webPort: 19591
    });
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome'
    });
    const page = await browser.newPage({
        viewport: {
          width: 1440,
          height: 1000
        }
      }),
      errors = [];
    let expectedConflict = false;
    console.error = (...args) => {
      if (expectedConflict && args.length === 1 && args[0] === '[Error] AppError: 班级配置已变化') {
        expectedConflictLog++;
        return;
      }
      originalConsoleError(...args);
    };
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      if (r.status() >= 400 && !(expectedConflict && r.status() === 409)) errors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    const login = async username => {
      await page.goto(runtime.session.url);
      await page.getByLabel('账号', {
        exact: true
      }).fill(username);
      await page.getByLabel('密码', {
        exact: true
      }).fill('Demo-pass-2026');
      await page.getByRole('button', {
        name: '登录',
        exact: true
      }).click();
      await page.locator('.adult-navigation').waitFor();
    };
    page.setDefaultTimeout(10000);
    const capture = async options => {
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo({
          top: 0,
          behavior: 'instant'
        });
      });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      return page.screenshot(options);
    };
    const nav = name => page.locator('.adult-navigation').getByRole('button', {
      name,
      exact: true
    }).click();
    const post = async (pattern, action) => {
      const r = page.waitForResponse(r => r.url().includes(pattern) && r.request().method() === 'POST');
      await action();
      const result = await r;
      assert.equal(result.status(), 200, await result.text());
      return result;
    };
    const upload = async (label, file) => page.getByLabel(label, {
      exact: true
    }).setInputFiles(file);
    await login('admin');
    await page.getByText('待导入学生', {
      exact: true
    }).waitFor();
    assert.equal(await page.getByRole('button', {
      name: '准备全校报告',
      exact: true
    }).isDisabled(), true);
    assert.deepEqual(await page.locator('.adult-navigation button').allTextContents(), ['发布中心', '学籍与账号', '班级管理', '月度卡额度', '数据统计', '学期配置', '操作记录']);
    await nav('学籍与账号');
    await page.getByRole('button', {
      name: '教师账号',
      exact: true
    }).click();
    await upload('学籍账号文件', manifest.files.teachers);
    await post('/imports/preview', () => page.getByRole('button', {
      name: '预览导入',
      exact: true
    }).click());
    await post('/commit', () => page.getByRole('button', {
      name: '确认导入',
      exact: true
    }).click());
    await page.getByRole('cell', {
      name: '林知行',
      exact: true
    }).waitFor();
    await nav('班级管理');
    assert.equal(await page.getByRole('button', {
      name: '新建班级',
      exact: true
    }).count(), 0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', {
      name: '下载班级模板',
      exact: true
    }).click();
    const book = XLSX.readFile(await (await download).path());
    assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
      header: 1
    })[0], ['年级', '班级', '班级名称', '班主任账号']);
    await upload('班级导入文件', manifest.files.classes);
    await post('/classes/imports/preview', () => page.getByRole('button', {
      name: '预览班级导入',
      exact: true
    }).click());
    await post('/commit', () => page.getByRole('button', {
      name: '确认班级导入',
      exact: true
    }).click());
    await page.getByRole('button', {
      name: '查看四年级1班',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '教师配置',
      exact: true
    }).click();
    const responsible = page.getByLabel('负责教师', {
      exact: true
    });
    const options = await responsible.locator('option').evaluateAll(nodes => nodes.map(n => ({
      value: n.value,
      text: n.textContent
    })));
    const lin = options.find(o => o.text.includes('林知行')).value,
      xu = options.find(o => o.text.includes('徐晨')).value;
    await responsible.selectOption(lin);
    await page.getByLabel('语文任课教师', {
      exact: true
    }).selectOption(lin);
    await page.getByLabel('数学任课教师', {
      exact: true
    }).selectOption(xu);
    await post('/teachers/preview', () => page.getByRole('button', {
      name: '预览教师配置',
      exact: true
    }).click());
    await page.getByLabel('语文任课教师', {
      exact: true
    }).selectOption('');
    assert.equal(await page.getByRole('button', {
      name: '确认教师配置',
      exact: true
    }).isDisabled(), true);
    await page.getByLabel('语文任课教师', {
      exact: true
    }).selectOption(lin);
    await post('/teachers/preview', () => page.getByRole('button', {
      name: '预览教师配置',
      exact: true
    }).click());
    page.once('dialog', dialog => dialog.dismiss());
    await nav('月度卡额度');
    assert.equal(await page.locator('h1').innerText(), '班级管理');
    const conflictPool = createDbPool({
      database
    });
    try {
      await conflictPool.query('UPDATE school_class SET revision=revision+1 WHERE school_id=1 AND term_id=? AND grade=4 AND class_no=1', [manifest.termId]);
    } finally {
      await conflictPool.end();
    }
    expectedConflict = true;
    const staleResponse = page.waitForResponse(r => r.url().includes('/teachers/previews/') && r.url().includes('/commit'));
    await page.getByRole('button', {
      name: '确认教师配置',
      exact: true
    }).click();
    assert.equal((await staleResponse).status(), 409);
    expectedConflict = false;
    assert.equal(expectedConflictLog, 1);
    assert.equal(await page.getByLabel('语文任课教师', {
      exact: true
    }).inputValue(), lin);
    await page.getByRole('button', {
      name: '刷新班级版本，保留配置',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '刷新班级版本，保留配置',
      exact: true
    }).waitFor({
      state: 'hidden'
    });
    await post('/teachers/preview', () => page.getByRole('button', {
      name: '预览教师配置',
      exact: true
    }).click());
    await post('/commit', () => page.getByRole('button', {
      name: '确认教师配置',
      exact: true
    }).click());
    await page.getByRole('status').filter({
      hasText: '教师配置已保存'
    }).waitFor();
    await capture({
      path: path.join(dir, 'classes-desktop.png'),
      fullPage: true
    });
    await nav('学籍与账号');
    await upload('学籍账号文件', manifest.files.students);
    await post('/imports/preview', () => page.getByRole('button', {
      name: '预览导入',
      exact: true
    }).click());
    await post('/commit', () => page.getByRole('button', {
      name: '确认导入',
      exact: true
    }).click());
    const studentRow = page.getByRole('row').filter({
      has: page.getByRole('cell', {
        name: '20260401',
        exact: true
      })
    });
    await studentRow.getByRole('button', {
      name: '维护账号',
      exact: true
    }).click();
    await page.getByLabel('账号维护原因', {
      exact: true
    }).fill('测试停用与恢复');
    await post('/status', () => page.getByRole('button', {
      name: '停用账号',
      exact: true
    }).click());
    await page.getByRole('status').filter({
      hasText: '账号维护已保存'
    }).waitFor();
    await studentRow.getByRole('button', {
      name: '维护账号',
      exact: true
    }).click();
    await page.getByLabel('账号维护原因', {
      exact: true
    }).fill('测试恢复');
    await post('/status', () => page.getByRole('button', {
      name: '启用账号',
      exact: true
    }).click());
    await page.getByRole('status').filter({
      hasText: '账号维护已保存'
    }).waitFor();
    await studentRow.getByRole('button', {
      name: '维护账号',
      exact: true
    }).click();
    await page.getByLabel('账号维护原因', {
      exact: true
    }).fill('测试重置');
    await page.getByLabel('新密码', {
      exact: true
    }).fill('Changed-pass-2026');
    await post('/password', () => page.getByRole('button', {
      name: '重置密码',
      exact: true
    }).click());
    await studentRow.getByRole('button', {
      name: '调班',
      exact: true
    }).click();
    await page.getByLabel('目标班级', {
      exact: true
    }).selectOption({
      label: '四年级2班'
    });
    await page.getByLabel('调班原因', {
      exact: true
    }).fill('测试学籍更正');
    await post('/transfers/preview', () => page.getByRole('button', {
      name: '预览调班影响',
      exact: true
    }).click());
    await page.getByText(/原始评价保留/).first().waitFor();
    await post('/commit', () => page.getByRole('button', {
      name: '确认调班',
      exact: true
    }).click());
    await studentRow.getByRole('cell', {
      name: '4年级2班',
      exact: true
    }).waitFor();
    await nav('月度卡额度');
    assert.equal(await page.getByLabel('默认每班月额度', {
      exact: true
    }).inputValue(), '100');
    for (const [subject, n] of [['语文', '60'], ['数学', '70'], ['英语', '75']]) await page.getByLabel(subject + '每班月额度', {
      exact: true
    }).fill(n);
    await page.getByRole('button', {
      name: '保存学科额度',
      exact: true
    }).click();
    await page.getByText('学科月额度已保存', {
      exact: true
    }).waitFor();
    await page.reload();
    assert.equal(await page.getByLabel('语文每班月额度', {
      exact: true
    }).inputValue(), '60');
    await nav('数据统计');
    for (const name of ['卡片与奖励', '自我评价', '荣誉上传', '故事参与']) {
      await page.getByRole('tab', {
        name: new RegExp('^' + name)
      }).click();
      await page.getByRole('tab', {
        name: new RegExp('^' + name)
      }).getAttribute('aria-selected').then(x => assert.equal(x, 'true'));
    }
    await nav('发布中心');
    await page.getByRole('heading', {
      name: '按班级核对缺项',
      exact: true
    }).waitFor();
    await page.getByRole('button', {
      name: '核对四年级2班',
      exact: true
    }).click();
    await page.getByText('林小禾', {
      exact: true
    }).first().waitFor();
    await page.locator('.admin-progress-missing summary').first().click();
    await page.locator('.admin-progress-field-list').first().getByText(/有礼貌/).first().waitFor();
    const progressDownload = page.waitForEvent('download');
    await page.getByRole('button', {
      name: '导出完整性清单',
      exact: true
    }).click();
    assert.equal((await progressDownload).suggestedFilename(), 'completion-progress.csv');
    await nav('操作记录');
    await page.getByRole('cell').filter({
      hasText: 'CLASS_TRANSFER'
    }).first().waitFor();
    const auditDownload = page.waitForEvent('download');
    await page.getByRole('button', {
      name: '导出操作记录',
      exact: true
    }).click();
    assert.equal((await auditDownload).suggestedFilename(), 'operation-audits.csv');
    for (const name of ['发布中心', '学籍与账号', '班级管理', '月度卡额度', '数据统计', '学期配置', '操作记录']) {
      await page.setViewportSize({
        width: 390,
        height: 844
      });
      await nav(name);
      await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), name + ' overflow');
      await capture({
        path: path.join(dir, 'mobile-' + name + '.png'),
        fullPage: true
      });
    }
    await page.setViewportSize({
      width: 1440,
      height: 1000
    });
    await nav('学期配置');
    assert.equal(await page.getByRole('button', {
      name: '任教与班主任',
      exact: true
    }).count(), 0);
    await page.getByRole('button', {
      name: '评价规则',
      exact: true
    }).click();
    assert.equal(await page.getByLabel('卡达标分', {
      exact: true
    }).count(), 0);
    await page.getByLabel('新学期名称', {
      exact: true
    }).fill('2026–2027 第二学期');
    await page.getByLabel('新学年', {
      exact: true
    }).fill('2026-2027');
    await page.getByLabel('新学期序号', {
      exact: true
    }).selectOption('2');
    await page.getByLabel('新学期开始日期', {
      exact: true
    }).fill('2027-02-22');
    await page.getByLabel('新学期结束日期', {
      exact: true
    }).fill('2027-07-15');
    await page.getByLabel('新学期采集截止日期', {
      exact: true
    }).fill('2027-07-01');
    await post('/terms/create', () => page.getByRole('button', {
      name: '创建空白新学期',
      exact: true
    }).click());
    await page.getByRole('status').filter({
      hasText: '新学期已创建'
    }).waitFor();
    const termSelect = page.getByLabel('当前学期', {
      exact: true
    });
    await termSelect.locator('option').filter({
      hasText: '2026–2027 第二学期'
    }).waitFor({
      state: 'attached'
    });
    const newTermId = await termSelect.locator('option').filter({
      hasText: '2026–2027 第二学期'
    }).getAttribute('value');
    assert.equal(await termSelect.inputValue(), String(manifest.termId));
    await termSelect.selectOption(newTermId);
    await nav('班级管理');
    await page.getByText('本学期还没有班级，请先导入班级模板。', {
      exact: true
    }).waitFor();
    await nav('月度卡额度');
    await page.getByLabel('默认每班月额度', {
      exact: true
    }).waitFor();
    assert.equal(await page.getByLabel('默认每班月额度', {
      exact: true
    }).inputValue(), '100');
    await nav('学期配置');
    await post('/current', () => page.getByRole('button', {
      name: '设为当前学期',
      exact: true
    }).click());
    await page.getByRole('button', {
      name: '设为当前学期',
      exact: true
    }).waitFor({
      state: 'hidden'
    });
    await termSelect.selectOption(String(manifest.termId));
    await page.getByRole('button', {
      name: '设为当前学期',
      exact: true
    }).waitFor();
    await post('/current', () => page.getByRole('button', {
      name: '设为当前学期',
      exact: true
    }).click());
    await page.getByRole('button', {
      name: '设为当前学期',
      exact: true
    }).waitFor({
      state: 'hidden'
    });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', {
      name: '退出登录',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '登录',
      exact: true
    }).waitFor();
    await login('teacher_lin');
    await nav('六育综合情况');
    await page.getByRole('button', {
      name: '采集结算',
      exact: true
    }).click();
    await page.getByRole('heading', {
      name: '采集结算',
      exact: true,
      level: 2
    }).waitFor();
    await page.getByRole('button', {
      name: '返回六育综合情况',
      exact: true
    }).click();
    await page.getByRole('heading', {
      name: '从你的班级开始',
      exact: true
    }).waitFor();
    assert.equal(await page.locator('.adult-navigation button').count(), 6);
    assert.deepEqual(errors, []);
    console.log('PASS administrator seven modules, imports, teacher CAS, accounts, transfer, quotas, existing statistics, audit, new term, teacher settlement entry and 390px');
  } finally {
    console.error = originalConsoleError;
    await browser?.close();
    await runtime?.close();
    if (manifest) {
      const pool = createDbPool({
        database: undefined
      });
      try {
        await pool.query(`DROP DATABASE \`${database}\``);
      } finally {
        await pool.end();
      }
    }
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
