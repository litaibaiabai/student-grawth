# 六育系统改造开发票

发布于 2026-10-27。用户在审阅20票拆分后回复“继续”，本次据此正式发布；这是对拆分与发布的确认，不代替学校业务规则答案。

- 父规格：[六育学生评价系统减负与成长报告改造规格](../../docs/wayfinder/system-renovation/spec.md)
- 业务决策：[六育系统减负与成长报告改造地图](../../docs/wayfinder/system-renovation/map.md)
- 审阅来源：[开发票拆分提案](../../docs/wayfinder/system-renovation/ticket-breakdown-proposal.md)；此历史提案保持原样，已发布票以本目录独立文件为准。

## 票据索引

23个开发实施节点按开发依赖顺序编号，一票一文件。下表只列直接开发依赖；完整业务决策依赖、条件依赖、用户故事与验收项在各票中。

| 开发票 | 直接开发阻塞 | 说明 |
| --- | --- | --- |
| [兼容迁移与隔离验收入口](issues/20A-migration-isolation.md) | **无前置阻塞** | 基础设施与隔离环境防护，可率先启动 |
| [任教授权与受限成绩](issues/01-teaching-scope.md) | [兼容迁移与隔离验收入口](issues/20A-migration-isolation.md) | 基础授权与C1/C2学期状态协议 |
| [预分类制卡与打印](issues/02-classified-card-printing.md) | [兼容迁移与隔离验收入口](issues/20A-migration-isolation.md) | 学校奖励分类树与AUTO_V2卡 |
| [教师纠错与直评](issues/04-teacher-score-corrections.md) | [任教授权与受限成绩](issues/01-teaching-scope.md) | 统一追加账本C3与更正链 |
| [扫码即时入账](issues/03-instant-card-redemption.md) | [预分类制卡与打印](issues/02-classified-card-printing.md)、[教师纠错与直评](issues/04-teacher-score-corrections.md) | 消费C3追加账本 |
| [荣誉认定与奖励](issues/05-honor-awards.md) | [教师纠错与直评](issues/04-teacher-score-corrections.md) | 消费C3追加账本与T/M/L认定 |
| [故事建议与终审](issues/06-story-review.md) | [任教授权与受限成绩](issues/01-teaching-scope.md) | 故事有效月版本与终审 |
| [年级指标与教师评价](issues/07-grade-indicators.md) | [任教授权与受限成绩](issues/01-teaching-scope.md) | 年级指标字典与状态 |
| [学科成绩导入](issues/08-subject-score-import.md) | [年级指标与教师评价](issues/07-grade-indicators.md) | 服务端批次与重验授权 |
| [体测与健康导入](issues/09-health-import.md) | [年级指标与教师评价](issues/07-grade-indicators.md) | 健康范围隔离导入 |
| [自动六育评价](issues/10-six-dimension-evaluation.md) | [荣誉认定与奖励](issues/05-honor-awards.md)、[故事建议与终审](issues/06-story-review.md)、[年级指标与教师评价](issues/07-grade-indicators.md) | C5自动六育快照 |
| [报告草稿与教师确认](issues/11-report-draft-confirmation.md) | [自动六育评价](issues/10-six-dimension-evaluation.md) | C6草稿与确认指纹 |
| [AI寄语](issues/12-ai-comments.md) | [报告草稿与教师确认](issues/11-report-draft-confirmation.md) | 真实模型适配与CAS回写 |
| [家长寄语](issues/13-family-comments.md) | [报告草稿与教师确认](issues/11-report-draft-confirmation.md) | 家长渠道与受限凭证 |
| [状态发布与版本冻结](issues/14-report-publishing.md) | [报告草稿与教师确认](issues/11-report-draft-confirmation.md) | C8发布原子事务与冻结 |
| [报告阅读与A4打印](issues/15-report-reading-printing.md) | [状态发布与版本冻结](issues/14-report-publishing.md) | C9发布版阅读与打印 |
| [学生成长首页与主题](issues/16-student-growth-theme.md) | [扫码即时入账](issues/03-instant-card-redemption.md)、[自动六育评价](issues/10-six-dimension-evaluation.md) | 学生端成长足迹 |
| [学籍表导入](issues/17-student-roster-import.md) | [任教授权与受限成绩](issues/01-teaching-scope.md) | 学生学籍与基础账号 |
| [公共设备身份与受限会话](issues/18A-device-session.md) | [任教授权与受限成绩](issues/01-teaching-scope.md) | C10短效受限兑换会话 |
| [公共设备兑换展示与切人清屏](issues/18B-device-redemption-screen.md) | [扫码即时入账](issues/03-instant-card-redemption.md)、[公共设备身份与受限会话](issues/18A-device-session.md) | 兑换清屏与切人隔离 |
| [钉钉身份预留](issues/19-dingtalk-identity-reservation.md) | [任教授权与受限成绩](issues/01-teaching-scope.md) | 外部身份受控关联 |
| [P0试点与回退演练](issues/20B-pilot-p0.md) | [扫码即时入账](issues/03-instant-card-redemption.md)、[教师纠错与直评](issues/04-teacher-score-corrections.md) | P0阶段独立验收放行门 |
| [P1全链路试点与历史对账](issues/20C-pilot-p1.md) | [学科成绩导入](issues/08-subject-score-import.md)、[AI寄语](issues/12-ai-comments.md)、[家长寄语](issues/13-family-comments.md)、[报告阅读与A4打印](issues/15-report-reading-printing.md)、[学生成长首页与主题](issues/16-student-growth-theme.md)、[P0试点与回退演练](issues/20B-pilot-p0.md) | P1全链路试点与历史对账 |

## 发布与领取状态

- 全部23个实施节点为开放、未领取，分流标签为 ready-for-agent。
- **当前唯一无前置开发阻塞与业务阻塞的节点为：** [兼容迁移与隔离验收入口](issues/20A-migration-isolation.md)。
- 20A 作为基础设施与隔离护栏，必须先于 01 和 02 完成，保证后续所有任务的测试与演示均在严格受控的隔离测试库中执行，不污染现有业务库。

## 条件依赖

- [状态发布与版本冻结](issues/14-report-publishing.md)：若家长寄语必填，[家长寄语](issues/13-family-comments.md)成为实际阻塞；否则不阻塞人工寄语的发布路径。
- [P0试点与回退演练](issues/20B-pilot-p0.md)：[学籍表导入](issues/17-student-roster-import.md)、[公共设备兑换展示与切人清屏](issues/18B-device-redemption-screen.md)仅在纳入本批次时转为实际阻塞。公共设备若一期必需，则必须前移。
- [P1全链路试点与历史对账](issues/20C-pilot-p1.md)：[体测与健康导入](issues/09-health-import.md)仅在体测为必评来源时转为实际阻塞。
- 条件未决的票带 conditional_state: unresolved，即使所有普通 blocked_by 关闭也不能领取。业务范围确认后，先将选中的条件票加入 blocked_by，在该票记录选择依据，再将 conditional_state 改为 resolved；未选分支不加实际阻塞。
- AI和家长反馈仍是完整一期规格要求。若学校明确批准延期，应更新实际发布范围和依赖并标明未交付内容，不把延期记成验收通过。

## 本地票据约定

- YAML元数据中的 status 是生命周期（open/closed），labels 中 ready-for-agent 是分流；正文的 Status 沿用 to-tickets 模板，二者含义不同。
- parent 指向父规格，仅表达归属，不自动继承父规格所有阻塞。
- blocked_by 同时列本地开发票和现有wayfinder业务决策的稳定身份，正文用名称链接展示。
- assignee 为空为未领取；只有普通阻塞全部 closed、条件已解决且未领取的开放票才处在可领取前沿。
- conditional_blocked_by 保存条件候选，实际生效的选择另加入 blocked_by；不要仅改条件状态而漏记选中依赖。
- 开始处理前先写 assignee；关闭开发票须已有验收证据。发布本批开发票不改变父规格或业务决策。

## 查询当前可领取票

从仓库根目录执行，读取状态而不是依赖本索引的发布时快照：

```bash
python3 - <<'PY'
import json
from pathlib import Path

issues = {}
for base in (Path('docs/wayfinder'), Path('.scratch/system-renovation/issues')):
    for path in base.rglob('*.md'):
        text = path.read_text()
        if not text.startswith('---\n'):
            continue
        meta = {}
        for line in text.split('---', 2)[1].strip().splitlines():
            key, value = line.split(':', 1)
            value = value.strip()
            meta[key] = json.loads(value) if value.startswith('[') else value
        if meta['id'] in issues:
            raise ValueError('重复的问题身份')
        meta['path'] = str(path)
        issues[meta['id']] = meta

if not any(item.get('parent') == 'SPEC-20261027-RENOVATION' for item in issues.values()):
    raise ValueError('未找到开发票，请在仓库根目录查询')

count = 0
for item in sorted(issues.values(), key=lambda value: value['id']):
    if item.get('parent') != 'SPEC-20261027-RENOVATION':
        continue
    if item['status'] != 'open' or item.get('assignee'):
        continue
    blockers = item.get('blocked_by', [])
    if any(identity not in issues for identity in blockers):
        raise ValueError('阻塞引用不存在')
    ready = (all(issues[identity]['status'] == 'closed' for identity in blockers)
             and item.get('conditional_state', 'none') in ('none', 'resolved'))
    if ready:
        count += 1
        print(item['title'] + '\t' + item['path'])
print('可领取开发票：' + str(count))
PY
```

## 验收共同边界

遵循用户已经确认的真实三角色浏览器流程及独立测试库。每票的正常行为在真实界面验证；并发、越权、发布事务才补真实API／数据库集成验证。每票自行覆盖用户可见结果，不以最终试点票替代各票验证。

