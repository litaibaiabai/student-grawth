# 附件A｜API契约与错误码规范（V2.0）

**配套说明书**：[学生学期综合素质评价系统_SPEC_V1.0.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/spec/学生学期综合素质评价系统_SPEC_V1.0.md)  
**接口基准**：RESTful 风格 / JSON 报文交互 / 会话鉴权（禁止客户端伪造身份）  

---

## 1. 核心业务 API 清单

| 模块 | 方法 | 路径 | 鉴权角色 | 业务说明 |
| :--- | :---: | :--- | :---: | :--- |
| **基础** | `GET` | `/api/v1/me` | 全部 | 获取当前用户信息、所属学校、角色及任教班级 |
| **学期** | `GET` | `/api/v1/terms/current` | 全部 | 获取当前学期字典、起止日期与当前活动状态 |
| **指标** | `GET` | `/api/v1/evaluation-categories` | 全部 | 获取六育三级指标分类树（固定+1类目） |
| **直评** | `POST` | `/api/v1/teacher/scores/direct-batch` | 教师 | A模式批量为班级学生评价发分（固定+1） |
| **积分** | `GET` | `/api/v1/student/scores` | 学生 | 查阅本人各维度过程积分统计与不可篡改流水 |
| **扫码** | `GET` | `/api/v1/student/cards/preview` | 学生 | 移动端扫描实体卡，展示卡片预览信息（只读） |
| **扫码** | `POST` | `/api/v1/student/card-claims` | 学生 | B模式确认申领实体卡，生成待审单据（不发分） |
| **审核** | `GET` | `/api/v1/teacher/card-claims` | 教师 | 查询当前教师名下分配卡片的待审扫卡清单 |
| **审核** | `POST` | `/api/v1/teacher/card-claims/{id}/decision` | 教师 | 审批申领（`APPROVE` 发分+1 / `REJECT` 驳回作废） |
| **发卡** | `POST` | `/api/v1/admin/card-quotas` | 管理员 | 配置教师月度卡配额N及三级指标分配规则 |
| **发卡** | `POST` | `/api/v1/admin/cards/generate-month` | 管理员 | 幂等批量生成月度实体卡印刷条目及安全令牌 |
| **荣誉** | `POST` | `/api/v1/student/honors` | 学生 | 申报省市县赛事荣誉并上传证书凭据 |
| **荣誉** | `POST` | `/api/v1/student/honors/{id}/resubmit` | 学生 | 退回后补充修改证书，追加新版本 |
| **荣誉** | `POST` | `/api/v1/teacher/honors/{id}/review` | 教师 | 审核赛事真实性与获奖级别（通过/退回） |
| **故事** | `POST` | `/api/v1/student/stories` | 学生 | 提交月度生活故事文稿正文（草稿/正式提交） |
| **故事** | `POST` | `/api/v1/teacher/stories/{id}/review` | 教师 | 人工复核 AI 建议并给出正式得分（0~100） |
| **导入** | `POST` | `/api/v1/import/preview` | 教师/管理员 | 上传数据文件，内存解析比对，返回逐行差异 |
| **导入** | `POST` | `/api/v1/import/commit` | 教师/管理员 | 确认导入，生成 `batch_no`，原子写入正式表 |
| **综合** | `GET` | `/api/v1/student/comprehensive-score` | 学生 | 查阅综合素质折算得分（80/15/5）与封顶状态 |
| **报告** | `GET` | `/api/v1/student/reports/current` | 学生 | 查看本人已发布的期末综合素质发展报告 |
| **报告** | `GET` | `/api/v1/student/reports/{id}/export-pdf` | 学生 | 导出带学生姓名与下载时间水印的防伪 PDF |
| **发布** | `POST` | `/api/v1/admin/reports/publish-batch` | 管理员 | 批量将已审定报告正式发布给学生 |
| **冲销** | `POST` | `/api/v1/admin/scores/reversal` | 管理员 | 授权执行积分纠错冲销 (-1流水)，写入全量审计 |

---

## 2. 关键业务报文示例

### 2.1 学生确认扫码（B模式申请，只创建待审，不加分）

```http
POST /api/v1/student/card-claims
Content-Type: application/json

{
  "token": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  "requestKey": "REQ_CLAIM_20261022_10101"
}
```

**响应报文**：
```json
{
  "code": 200,
  "message": "申领已提交，等待教师审核",
  "data": {
    "claimId": 501001,
    "cardId": 80023,
    "status": "PENDING",
    "cardStatus": "PENDING",
    "category": "德育/文明礼仪/主动礼貌问候",
    "pointsPending": 1,
    "pointsCredited": 0
  }
}
```

### 2.2 教师审核通过（同事务原子发分）

```http
POST /api/v1/teacher/card-claims/501001/decision
Content-Type: application/json

{
  "decision": "APPROVE",
  "requestKey": "REQ_DECISION_501001_APPROVE"
}
```

**响应报文**：
```json
{
  "code": 200,
  "message": "审核通过，积分已正式入账，实体卡已置为失效终态",
  "data": {
    "claimId": 501001,
    "claimStatus": "APPROVED",
    "cardStatus": "USED",
    "scoreRecordId": 9001001,
    "delta": 1,
    "creditedAt": "2026-10-22T21:40:00.123456"
  }
}
```

---

## 3. 系统统一业务错误码

| 错误码 | HTTP 状态 | 触发业务场景与处理指引 |
| :--- | :---: | :--- |
| `AUTH_REQUIRED` | 401 | 用户会话已过期或未提供有效登录凭据 |
| `FORBIDDEN_SCOPE` | 403 | 教师试图操作非任教班级学生，或跨校越权操作 |
| `TERM_CLOSED` | 400 | 学期处于停用状态或已超过有效截止时间 |
| `CARD_EXPIRED` | 400 | 实体卡跨月未扫码已超期，禁止发起新申领 |
| `CARD_PENDING` | 409 | 该实体卡已被其他同学扫码申领，正在审核中 |
| `CARD_USED` | 409 | 该实体卡已审核通过并入账，属于永久失效卡 |
| `CARD_VOID` | 409 | 该实体卡已被作废，不可继续使用 |
| `CLAIM_NOT_PENDING` | 400 | 该扫卡单据已被处理过（已通过或已驳回），不可重复审核 |
| `REVIEW_TIMEOUT` | 400 | 已超过次月配置的审核宽限期，单据自动作废 |
| `DUPLICATE_REQUEST` | 409 | 幂等请求键 `request_key` 重复，直接返回已有处理结果 |
| `REVERSAL_ALREADY_EXISTS` | 409 | 该笔原始正向流水已被冲销过，严禁重复扣减 |
| `SCORE_INCOMPLETE` | 400 | 六育正式百分制成绩存在缺失维度，无法核算综合得分 |
| `IMPORT_CONFLICT` | 400 | 导入数据与已有正式成绩发生版本冲突 |
