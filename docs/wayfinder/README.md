# 本地 Markdown 问题跟踪器

本仓库未提供问题跟踪器约定。本目录采用 wayfinder 的本地 Markdown 默认方案；不向远程 GitHub 创建问题。

## Wayfinding operations

每份地图与每张决策票都是一个 Markdown issue。文件顶部的元数据是状态的唯一来源：

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定的问题身份，移动文件时仍保留 |
| `title` | 面向读者的名称，引用时用名称包裹链接 |
| `status` | `open` 或 `closed` |
| `labels` | 地图为 `wayfinder:map`；决策票为 `wayfinder:grilling` 等类型 |
| `parent` | 父地图的 `id`，地图本身留空 |
| `assignee` | 空值表示未领取；领取时先写入实际负责人的标识 |
| `blocked_by` | 依赖的决策票 `id` 列表；本地跟踪器不具备原生阻塞关系，采用这一文件约定 |

元数据使用 YAML 风格，但仅使用单行字符串和 JSON 数组，便于用 Python 标准库读取。

- 地图正文只保留目的地、说明、已完成决策索引、尚未明确的范围和范围外事项；不在地图中维护开放票列表。
- 查找地图子票：按 `parent` 查询，按 `id` 排序。
- 当前可领取票：`status: open`、`assignee` 为空，并且 `blocked_by` 对应票全部关闭。
- 领取票：开始处理之前填写 `assignee`。建图阶段不领取或关闭票。
- 记录决定：在该票的 `## Resolution comments` 下追加日期、参与者、答案与依据，再关闭该票；地图的 `Decisions so far` 只追加一句摘要和该票链接。
- HITL 票必须经过用户实际参与的交流；建议不等于已决定。
- 新票先创建，再更新 `blocked_by`，避免依赖指向尚不存在的问题。

以下命令查询一张地图的全部子票及当前可领取票；从仓库根目录执行：

```bash
python3 - <<'PY'
import json
from pathlib import Path

map_id = 'WF-MAP-20261026-CARDS'
issues = {}
for path in Path('docs/wayfinder').rglob('*.md'):
    text = path.read_text()
    if not text.startswith('---\n'):
        continue
    meta = {}
    for line in text.split('---', 2)[1].strip().splitlines():
        key, value = line.split(':', 1)
        value = value.strip()
        meta[key] = json.loads(value) if value.startswith('[') else value
    meta['path'] = str(path)
    issues[meta['id']] = meta

for issue in sorted(issues.values(), key=lambda item: item['id']):
    if issue.get('parent') != map_id:
        continue
    blockers = issue.get('blocked_by', [])
    frontier = (issue['status'] == 'open' and not issue['assignee']
                and all(issues[bid]['status'] == 'closed' for bid in blockers))
    state = '可领取' if frontier else issue['status']
    print(f"{state}\t{issue['title']}\t{issue['path']}")
PY
```

## 地图入口

- [按学科自动配卡与审核归类改造地图](subject-card-issuance/map.md) — 已完成规划，含开发交接规格。
