> 历史交付存档：本页描述旧系统与当时演示。旧执行脚本已退役，当前运行/验收方式以仓库README及role-ux交付记录为准；历史链接与证据不代表当前可执行命令。

# 完整自动演示交付索引

当前交付为独立的一键自动演示脚本。双击项目根目录的 **完整系统自动演示.command**，或执行：

```bash
node scripts/full-system-demo/run.cjs
```

自动创建新演示库、生成素材、启动专用服务、打开可见Chrome，并完成管理员、教师、学生的全部业务主线。默认每个可见动作完成后停留2.5秒，结束后保留学生报告页面；在启动终端按Ctrl+C关闭本次资源。每次运行保留之前的数据与证据。

- [一键启动入口](../../../完整系统自动演示.command)
- [参数、环境及使用说明](../../../scripts/full-system-demo/README.md)
- [设计](../../superpowers/specs/2026-10-26-one-click-autonomous-demo-design.md) / [实施计划](../../superpowers/plans/2026-10-26-one-click-autonomous-demo.md)
- [验证与修复记录](自动演示验证与修复.md)

## 已通过的自动运行

最新完整运行 **20261027_cc4fb4**：退出码0，13章PASS、23个角色菜单、8名学生独立对账全部一致。200张打印卡号均唯一，包含林老师和陈老师两个分组；实际二维码已从下载PDF中识别并用于学生申领。

- [完整运行报告](../../../output/full-system-demo/20261027_cc4fb4/report.html) / [机器可读状态](../../../output/full-system-demo/20261027_cc4fb4/report.json)
- [演示讲稿PDF](../../../output/full-system-demo/20261027_cc4fb4/演示手册.pdf) / [可编辑讲稿](../../../output/full-system-demo/20261027_cc4fb4/演示手册.md)
- [三角色流程图HTML](../../../output/full-system-demo/20261027_cc4fb4/三角色流程图.html) / [SVG](../../../output/full-system-demo/20261027_cc4fb4/三角色流程图.svg)
- [全部输入资料](../../../output/full-system-demo/20261027_cc4fb4/inputs/) / [故事与评语](../../../output/full-system-demo/20261027_cc4fb4/stories/)
- [真实200张卡片PDF](../../../output/full-system-demo/20261027_cc4fb4/downloads/月度评价卡.pdf)
- [真实期末报告PDF](../../../output/full-system-demo/20261027_cc4fb4/downloads/期末报告.pdf) / [系统打印HTML](../../../output/full-system-demo/20261027_cc4fb4/downloads/期末报告.html)
- [浏览器下载的成绩错误名单](../../../output/full-system-demo/20261027_cc4fb4/downloads/成绩错误名单.xlsx)
- [完整主窗口录像](../../../output/full-system-demo/20261027_cc4fb4/video/page@791d20762bb9ca0c8d602e3c03723a1b.webm)
- [截图](../../../output/full-system-demo/20261027_cc4fb4/screenshots/) / [8人独立核对](../../../output/full-system-demo/20261027_cc4fb4/independent-check.json) / [文件核验](../../../output/full-system-demo/20261027_cc4fb4/artifact-check.json)

较早完整成功运行20261026_a70c38同样为13章、23菜单PASS。开发失败运行均保留FAIL，未混入本次成功结果。最新试跑使用`--speed 6 --exit`，验证后自动关闭本次浏览器与服务；重新双击入口即可开始一轮可观看的完整演示。

## 历史MCP资料

[全系统演示资料与实测证据.zip](全系统演示资料与实测证据.zip)、旧[MCP测试报告](MCP测试报告.md)为先前手工MCP演示存档，保留当时PDF保存受阻的真实记录。当前自动脚本已经实际导出并核验PDF。旧存档内的启动路径不作为当前入口；原demo_materials目录已删除，未恢复。

运行目录只含虚构师生资料，但录像、trace和二维码包含本机演示凭证，仅供本机核验。原业务库及backend/.env未改写。
