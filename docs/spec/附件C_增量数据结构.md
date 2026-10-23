# 附件C｜数据库表结构清单与关键约束规范

**配套主说明书**：[学生学期综合素质评价系统_SPEC_V1.0.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/spec/学生学期综合素质评价系统_SPEC_V1.0.md)  
**配套SQL脚本**：[sql/00_full_schema.sql](file:///Users/quanta/Downloads/task/六育学生评价系统v2/sql/00_full_schema.sql)  
**数据库基准**：MySQL 8.0.16+ / InnoDB / utf8mb4 / utf8mb4_0900_ai_ci  

---

## 1. 16 张核心业务数据表清单

系统彻底摒弃冗余表（已剔除学期生命周期表 `term_workflow`、导入暂存表 `import_batch/import_row`、异议申诉表 `appeal_case`），由以下 **16 张逻辑表** 构建高内聚、不可篡改、强一致的业务闭环：

| 序号 | 表名 | 表分类 | 核心业务字段（省略通用 id、时间及 school_id） |
| :---: | :--- | :---: | :--- |
| **1** | `academic_year` | 基础主体 | academic_year, semester, start_date, end_date, is_current, active, effective_at |
| **2** | `users` | 基础主体 | username, password, real_name, role, grade, class_no, classes, status |
| **3** | `edu_evaluation_category` | 业务字典 | parent_id, category_level, category_code, category_name, score, status, sort_order, version |
| **4** | `card_quota_rule` | 资产规则 | term_id, month_key, teacher_id, quota_n, allocation_json, config_version |
| **5** | `reward_card` | 资产流水 | term_id, teacher_id, month_key, serial_no, category_id, token_hash, valid_from, valid_until, status, used_student_id, used_at |
| **6** | `card_claim` | 审核单据 | card_id, student_id, status, claimed_at, reviewer_id, reviewed_at, reject_reason, request_key |
| **7** | `score_record` | 记账总账 | term_id, student_id, class_snapshot, dimension_code, category_id, source, delta, card_claim_id, original_id, operator_id, request_key, remark |
| **8** | `honor_record` | 成果认定 | student_id, term_id, event_key, event_name, award_level, prize_level, honor_points, status, reviewer_id, reviewed_at, material_version |
| **9** | `story_submission` | 月度任务 | student_id, term_id, month_key, status, current_version, teacher_score, reviewer_id, reviewed_at |
| **10** | `material_revision` | 版本存证 | owner_type, owner_id, version_no, text_content, file_ref, content_hash, llm_suggestion, created_by |
| **11** | `student_dimension_score` | 结果成绩 | student_id, term_id, dimension_code, score_100, status, batch_no, version, confirmed_by |
| **12** | `subject_score` | 学科成绩 | student_id, term_id, subject_code, raw_score, full_score, grade_label, absence_type, batch_no, version |
| **13** | `comprehensive_score_rule` | 规则配置 | term_id, rule_version, six_weight, process_weight, honor_weight, process_target, honor_target, rule_status |
| **14** | `term_report` | 期末报告 | student_id, term_id, version, rule_version, snapshot_json, teacher_comment, student_statement, family_message, family_source, status, published_at |
| **15** | `operation_audit` | 安全审计 | actor_user_id, actor_role, target_type, target_id, action, old_summary, new_summary, request_id, client_ip |
| **16** | `notification_outbox` | 可靠消息 | recipient_id, message_type, business_key, payload_json, state, attempts, last_error, scheduled_at, sent_at |

---

## 2. 关键业务唯一键约束（防重与幂等底线）

1. **账户唯一性**：`users(school_id, username)`，同一学校内登录账号全局唯一。
2. **学期唯一性**：`academic_year(academic_year, semester)`，同校学年学期全局唯一。
3. **指标唯一性**：`edu_evaluation_category(category_code, version)`，指标编码在版本内唯一。
4. **配卡规则唯一性**：`card_quota_rule(school_id, term_id, month_key, teacher_id)`，教师单月配额规则唯一。
5. **实体卡防重防伪**：
   - `reward_card.uk_card_token_hash(token_hash)` 全局防撞；
   - `reward_card.uk_card_month_serial(school_id, term_id, teacher_id, month_key, serial_no)` 保证教师月内流水号单调递增。
6. **扫码单据唯一性**：
   - `card_claim.uk_claim_card(card_id)` 确保**一张实体卡有且仅有一条有效申领单**；
   - `card_claim.uk_claim_request_key(request_key)` 客户端幂等防重。
7. **过程积分总账唯一性**：
   - `score_record.uk_score_request_key(request_key)` 写入幂等防重；
   - `score_record.uk_score_card_claim(card_claim_id)` 杜绝B模式单据二次发分；
   - `score_record.uk_score_reversal_original(original_id)` 保证**一笔原始+1流水至多只能冲销一次**。
8. **赛事成果去重**：`honor_record.uk_honor_event(student_id, term_id, event_key)`，同学生同赛事届次仅认最高奖。
9. **生活故事月度唯一**：`story_submission.uk_story_student_term_month(school_id, student_id, term_id, month_key)`。
10. **佐证材料版本递增**：`material_revision.uk_material_owner_version(owner_type, owner_id, version_no)`。
11. **期末报告版本唯一**：`term_report.uk_term_report_version(school_id, student_id, term_id, version)`。
12. **可靠消息业务幂等**：`notification_outbox.uk_outbox_business_key(recipient_id, message_type, business_key)`。
