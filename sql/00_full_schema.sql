-- ==============================================================================
-- 学生学期综合素质评价系统 - 完整数据库建表脚本 (MySQL 8.0.16+)
-- 规范依据：《学生学期综合素质评价系统 SPEC V1.0》及《需求分析与完善建议》
-- 字符集：utf8mb4 / 排序规则：utf8mb4_0900_ai_ci / 存储引擎：InnoDB
-- 表数量：共 16 张逻辑表（含 2 张基础主体表 + 14 张核心业务与闭环控制表）
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `student_growth` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `student_growth`;

-- ------------------------------------------------------------------------------
-- 1. 基础学年学期表 (academic_year)
-- 作用：管理学校学年与学期字典，提供全局与各业务表引用的 term_id
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `academic_year` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '学期主键ID (term_id)',
  `school_id` BIGINT UNSIGNED NULL COMMENT '所属学校ID (多校支持，NULL表示全局基线)',
  `academic_year` VARCHAR(20) NOT NULL COMMENT '学年标识 (如 2026-2027)',
  `semester` TINYINT NOT NULL COMMENT '学期：1上学期, 2下学期',
  `start_date` DATE NOT NULL COMMENT '学期开始日期',
  `end_date` DATE NOT NULL COMMENT '学期结束日期',
  `is_current` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为当前默认展示学期 (1是0否，不代表可操作状态)',
  `active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用 (1启用0停用)',
  `effective_at` DATETIME NULL COMMENT '业务生效时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_school_year_semester` (`academic_year`, `semester`),
  KEY `idx_school_current` (`school_id`, `is_current`, `active`),
  CONSTRAINT `chk_semester_valid` CHECK (`semester` IN (1, 2)),
  CONSTRAINT `chk_term_dates` CHECK (`end_date` >= `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学年学期字典表';

-- ------------------------------------------------------------------------------
-- 2. 基础用户表 (users)
-- 作用：系统用户基础信息（学生、教师、校级管理员），支持钉钉及家校主数据映射
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `username` VARCHAR(64) NOT NULL COMMENT '稳定登录账号 / 统一身份标识',
  `password` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '密码 (单点登录时可为空)',
  `real_name` VARCHAR(64) NOT NULL COMMENT '用户真实姓名',
  `role` ENUM('student', 'teacher', 'manager') NOT NULL COMMENT '系统主角色：student学生, teacher教师, manager管理员',
  `grade` INT NULL COMMENT '学生当前就读年级 (1~12，教师/管理员为NULL)',
  `class_no` INT NULL COMMENT '学生当前就读班级号 (教师/管理员为NULL)',
  `classes` JSON NULL COMMENT '教师任教班级授权JSON，格式：[{"grade":4,"class_no":1}]',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '账号状态：0正常, 1休学/停用, 2离校/离职',
  `external_id` VARCHAR(128) NULL COMMENT '外部同步标识 (如钉钉unionId/userId)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_school_username` (`school_id`, `username`),
  KEY `idx_school_role_status` (`school_id`, `role`, `status`),
  KEY `idx_student_grade_class` (`school_id`, `grade`, `class_no`),
  KEY `idx_user_external_id` (`external_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户基础表';

-- ------------------------------------------------------------------------------
-- 3. 六育三级评价分类指标表 (edu_evaluation_category)
-- 作用：存储德智体美劳故事六育体系的三级树状结构，三级分类固定分值为+1
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `edu_evaluation_category` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `parent_id` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父节点ID (根节点为0)',
  `category_level` TINYINT NOT NULL COMMENT '分类层级：1一级育别(D/Z/T/M/L/G), 2二级子项, 3三级加分类',
  `category_code` VARCHAR(30) NOT NULL COMMENT '分类代码 (如 D, D01, D01-01)',
  `category_name` VARCHAR(100) NOT NULL COMMENT '分类名称',
  `score` TINYINT NOT NULL DEFAULT 0 COMMENT '赋分值：1级和2级为0，3级固定为1',
  `description` VARCHAR(500) NULL COMMENT '指标详细描述与评分指引',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '显示排序权重',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1启用, 0停用',
  `version` VARCHAR(30) NOT NULL DEFAULT 'V1' COMMENT '指标配置版本号',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_category_code_version` (`category_code`, `version`),
  KEY `idx_category_parent` (`parent_id`),
  KEY `idx_category_level_status` (`category_level`, `status`, `sort_order`),
  CONSTRAINT `chk_category_level` CHECK (`category_level` IN (1, 2, 3)),
  CONSTRAINT `chk_category_score` CHECK ((`category_level` IN (1, 2) AND `score` = 0) OR (`category_level` = 3 AND `score` = 1)),
  CONSTRAINT `chk_category_status` CHECK (`status` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='六育评价指标三级分类表';

-- ------------------------------------------------------------------------------
-- 4. 教师月度发卡配额与分配规则表 (card_quota_rule)
-- 作用：管理员按月为教师配置发卡总数 N 及在三级加分类间的数量分布，月初自动任务依据此规则制卡
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `card_quota_rule` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '关联学期ID',
  `month_key` VARCHAR(7) NOT NULL COMMENT '生效自然月 (格式 YYYY-MM，如 2026-10)',
  `teacher_id` BIGINT UNSIGNED NOT NULL COMMENT '被授权教师ID (users.id)',
  `quota_n` INT UNSIGNED NOT NULL COMMENT '当月配卡总数N (非负整数)',
  `allocation_json` JSON NOT NULL COMMENT '三级指标分布JSON，例如 {"D01-01":5, "Z01-01":5}，其和必须等于quota_n',
  `config_version` VARCHAR(30) NOT NULL DEFAULT 'V1' COMMENT '配置版本号',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '配置管理员ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_quota_school_term_month_teacher` (`school_id`, `term_id`, `month_key`, `teacher_id`),
  KEY `idx_quota_teacher` (`teacher_id`, `month_key`),
  CONSTRAINT `fk_quota_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_quota_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_quota_positive` CHECK (`quota_n` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='教师月度发卡配额规则表';

-- ------------------------------------------------------------------------------
-- 5. 实体评价卡资产表 (reward_card)
-- 作用：存储每月印刷/生成的实体评价卡，卡号与高熵二维码令牌绑定，卡归属于教师账户，不预绑学生
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reward_card` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID (卡资产ID)',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学期ID',
  `teacher_id` BIGINT UNSIGNED NOT NULL COMMENT '发卡责任教师ID (users.id)',
  `month_key` VARCHAR(7) NOT NULL COMMENT '所属月份 (YYYY-MM)',
  `serial_no` INT UNSIGNED NOT NULL COMMENT '当月当教师序号 (1..N)',
  `category_id` BIGINT UNSIGNED NOT NULL COMMENT '绑定的固定三级评价指标ID (edu_evaluation_category.id)',
  `token_hash` CHAR(64) NOT NULL COMMENT '不可逆、高熵二维码随机令牌SHA256哈希 (防暴力猜测)',
  `valid_from` DATETIME NOT NULL COMMENT '卡片生效时间 (月初 00:00:00)',
  `valid_until` DATETIME NOT NULL COMMENT '卡片扫码申领截止时间 (月末 23:59:59)',
  `status` ENUM('UNUSED', 'PENDING', 'USED', 'EXPIRED', 'VOID') NOT NULL DEFAULT 'UNUSED'
    COMMENT '卡片状态：UNUSED未扫码, PENDING已扫码待审, USED已审批入账(终态), EXPIRED已过期(终态), VOID已作废(终态)',
  `used_student_id` BIGINT UNSIGNED NULL COMMENT '最终成功领取并入账的学生ID (users.id)',
  `used_at` DATETIME(6) NULL COMMENT '审核通过并入账时间',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '制卡时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_card_token_hash` (`token_hash`),
  UNIQUE KEY `uk_card_month_serial` (`school_id`, `term_id`, `teacher_id`, `month_key`, `serial_no`),
  KEY `idx_card_teacher_month_status` (`teacher_id`, `month_key`, `status`),
  KEY `idx_card_student_used` (`used_student_id`, `status`),
  CONSTRAINT `fk_card_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_card_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_card_category` FOREIGN KEY (`category_id`) REFERENCES `edu_evaluation_category` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_card_used_consistency` CHECK (
    (`status` = 'USED' AND `used_student_id` IS NOT NULL AND `used_at` IS NOT NULL) OR
    (`status` <> 'USED')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='实体评价卡资产表';

-- ------------------------------------------------------------------------------
-- 6. 学生扫卡申领记录表 (card_claim)
-- 作用：B模式下学生扫码后创建待审申领单，一卡严格对应一条有效申领链，教师审批通过后入账
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `card_claim` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID (申领流水ID)',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `card_id` BIGINT UNSIGNED NOT NULL COMMENT '关联实体卡ID (reward_card.id)',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT '扫码申领学生ID (users.id)',
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING'
    COMMENT '申领状态：PENDING待教师审核, APPROVED审核通过入账, REJECTED审核驳回, EXPIRED超时失效',
  `claimed_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '学生扫码确认时间',
  `reviewer_id` BIGINT UNSIGNED NULL COMMENT '实际审核教师ID (users.id)',
  `reviewed_at` DATETIME(6) NULL COMMENT '审核处理时间',
  `reject_reason` VARCHAR(255) NULL COMMENT '驳回原因说明',
  `request_key` VARCHAR(64) NOT NULL COMMENT '防重复扫码提交幂等键 (UUID/请求唯一标识)',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '记录创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_claim_card` (`card_id`),
  UNIQUE KEY `uk_claim_request_key` (`request_key`),
  KEY `idx_claim_reviewer_status` (`reviewer_id`, `status`),
  KEY `idx_claim_student_status` (`student_id`, `status`),
  CONSTRAINT `fk_claim_card` FOREIGN KEY (`card_id`) REFERENCES `reward_card` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_claim_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_claim_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_claim_review_decision` CHECK (
    (`status` IN ('APPROVED', 'REJECTED') AND `reviewer_id` IS NOT NULL AND `reviewed_at` IS NOT NULL) OR
    (`status` NOT IN ('APPROVED', 'REJECTED'))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学生扫卡申领记录表';

-- ------------------------------------------------------------------------------
-- 7. 六育过程积分流水账表 (score_record)
-- 作用：核心不可篡改积分账，记录 A直评(+1)、B卡审批(+1)、纠错冲销(-1)，只追加不物理修改
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `score_record` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID (积分记账流水ID)',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '记账学期ID',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT '学生ID (users.id)',
  `class_snapshot` JSON NOT NULL COMMENT '事件发生时学生班级快照，例如 {"grade":4, "class_no":1}',
  `dimension_code` ENUM('D','Z','T','M','L','G') NOT NULL COMMENT '一级育别代码：D德 Z智 T体 M美 L劳 G故事',
  `category_id` BIGINT UNSIGNED NOT NULL COMMENT '三级评价指标ID (edu_evaluation_category.id)',
  `source` ENUM('A_DIRECT', 'B_CARD', 'REVERSAL') NOT NULL
    COMMENT '记账来源：A_DIRECT教师无卡直评, B_CARD实体卡审批入账, REVERSAL授权纠错冲销',
  `delta` TINYINT NOT NULL COMMENT '变动积分值：正常奖励为+1，纠错冲销为-1',
  `card_claim_id` BIGINT UNSIGNED NULL COMMENT 'B模式关联的申领单ID (card_claim.id，A模式为NULL)',
  `original_id` BIGINT UNSIGNED NULL COMMENT 'REVERSAL冲销时关联的原 score_record.id (正常奖励为NULL)',
  `operator_id` BIGINT UNSIGNED NOT NULL COMMENT '操作人ID (发放教师或审批更正管理员)',
  `request_key` VARCHAR(64) NOT NULL COMMENT '全局业务防重幂等键',
  `remark` VARCHAR(255) NULL COMMENT '业务事由备注 / 冲销原因说明',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '记账生效时间 (只追加不可变)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_score_request_key` (`request_key`),
  UNIQUE KEY `uk_score_card_claim` (`card_claim_id`),
  UNIQUE KEY `uk_score_reversal_original` (`original_id`),
  KEY `idx_score_student_term_dim` (`student_id`, `term_id`, `dimension_code`),
  KEY `idx_score_term_source` (`term_id`, `source`),
  KEY `idx_score_operator` (`operator_id`),
  CONSTRAINT `fk_score_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_score_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_score_category` FOREIGN KEY (`category_id`) REFERENCES `edu_evaluation_category` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_score_card_claim` FOREIGN KEY (`card_claim_id`) REFERENCES `card_claim` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_score_reversal_original` FOREIGN KEY (`original_id`) REFERENCES `score_record` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_score_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_score_delta_range` CHECK (`delta` IN (1, -1)),
  CONSTRAINT `chk_score_source_delta` CHECK (
    (`source` IN ('A_DIRECT', 'B_CARD') AND `delta` = 1 AND `original_id` IS NULL) OR
    (`source` = 'REVERSAL' AND `delta` = -1 AND `original_id` IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='六育过程积分流水账表';

-- ------------------------------------------------------------------------------
-- 8. 学生荣誉奖项申报与认定表 (honor_record)
-- 作用：记录学生申报的省/市/区级一二三等奖，按成果组去重，计算1~9内部荣誉分，不混入A/B积分账
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `honor_record` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT '申报学生ID (users.id)',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '认定学期ID',
  `event_key` VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
    COMMENT '同一活动届次+成果稳定去重键 (由活动名称拼音/编号规则生成)',
  `title` VARCHAR(200) NOT NULL COMMENT '获奖成果 / 比赛项目名称',
  `award_level` ENUM('DISTRICT', 'CITY', 'PROVINCE') NOT NULL COMMENT '奖项级别：DISTRICT区级, CITY市级, PROVINCE省级',
  `prize_level` ENUM('FIRST', 'SECOND', 'THIRD') NOT NULL COMMENT '获奖等次：FIRST一等奖, SECOND二等奖, THIRD三等奖',
  `honor_points` TINYINT GENERATED ALWAYS AS (
    CASE
      WHEN `award_level` = 'PROVINCE' AND `prize_level` = 'FIRST' THEN 9
      WHEN `award_level` = 'PROVINCE' AND `prize_level` = 'SECOND' THEN 8
      WHEN `award_level` = 'PROVINCE' AND `prize_level` = 'THIRD' THEN 7
      WHEN `award_level` = 'CITY' AND `prize_level` = 'FIRST' THEN 6
      WHEN `award_level` = 'CITY' AND `prize_level` = 'SECOND' THEN 5
      WHEN `award_level` = 'CITY' AND `prize_level` = 'THIRD' THEN 4
      WHEN `award_level` = 'DISTRICT' AND `prize_level` = 'FIRST' THEN 3
      WHEN `award_level` = 'DISTRICT' AND `prize_level` = 'SECOND' THEN 2
      WHEN `award_level` = 'DISTRICT' AND `prize_level` = 'THIRD' THEN 1
      ELSE 0
    END
  ) STORED COMMENT '自动计算的内部荣誉积分 (1~9分)',
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING'
    COMMENT '审核状态：PENDING待审核, APPROVED已认定, REJECTED已退回',
  `reviewer_id` BIGINT UNSIGNED NULL COMMENT '审核教师ID (users.id)',
  `reviewed_at` DATETIME(6) NULL COMMENT '审核时间',
  `award_date` DATE NULL COMMENT '获奖证书颁发日期',
  `material_version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '当前生效的佐证材料版本号',
  `reject_reason` VARCHAR(255) NULL COMMENT '退回原因说明',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '申报时间',
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_honor_event` (`student_id`, `term_id`, `event_key`),
  KEY `idx_honor_reviewer_status` (`reviewer_id`, `status`),
  KEY `idx_honor_student_term_status` (`student_id`, `term_id`, `status`),
  CONSTRAINT `fk_honor_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_honor_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_honor_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_honor_review_decision` CHECK (
    (`status` = 'APPROVED' AND `reviewer_id` IS NOT NULL AND `reviewed_at` IS NOT NULL) OR
    (`status` <> 'APPROVED')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学生荣誉奖项申报与认定表';

-- ------------------------------------------------------------------------------
-- 9. 月度生活故事作品提交与评分表 (story_submission)
-- 作用：管理学生每月提交的生活故事作品，LLM提供辅助评分与建议，教师人工终审打分
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `story_submission` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT '学生ID (users.id)',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '学期ID',
  `month_key` VARCHAR(7) NOT NULL COMMENT '所属月份 (YYYY-MM)',
  `status` ENUM('DRAFT', 'SUBMITTED', 'REVIEWED') NOT NULL DEFAULT 'DRAFT'
    COMMENT '状态：DRAFT草稿, SUBMITTED已提交待审, REVIEWED已评定',
  `current_version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '当前作品材料版本号',
  `teacher_score` DECIMAL(5,2) NULL COMMENT '教师正式确认分 (0~100分)',
  `teacher_comment` TEXT NULL COMMENT '教师审定评语',
  `reviewer_id` BIGINT UNSIGNED NULL COMMENT '评分教师ID (users.id)',
  `reviewed_at` DATETIME(6) NULL COMMENT '评分确认时间',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_story_student_term_month` (`school_id`, `student_id`, `term_id`, `month_key`),
  KEY `idx_story_reviewer_status` (`reviewer_id`, `status`),
  KEY `idx_story_term_status` (`term_id`, `status`),
  CONSTRAINT `fk_story_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_story_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_story_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_story_score_range` CHECK (`teacher_score` IS NULL OR (`teacher_score` >= 0 AND `teacher_score` <= 100)),
  CONSTRAINT `chk_story_review_decision` CHECK (
    (`status` = 'REVIEWED' AND `teacher_score` IS NOT NULL AND `reviewer_id` IS NOT NULL AND `reviewed_at` IS NOT NULL) OR
    (`status` <> 'REVIEWED')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='月度生活故事提交与评分表';

-- ------------------------------------------------------------------------------
-- 10. 佐证材料多版本留痕表 (material_revision)
-- 作用：荣誉证书、故事作品等提交材料的物理版本留存，包含原文、图文哈希、LLM预处理建议
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `material_revision` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `owner_type` ENUM('HONOR', 'STORY', 'GROWTH_TASK') NOT NULL COMMENT '材料所属业务类型：HONOR荣誉, STORY故事, GROWTH_TASK成长任务',
  `owner_id` BIGINT UNSIGNED NOT NULL COMMENT '关联主表记录ID (honor_record.id / story_submission.id)',
  `version_no` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '版本递增号 (1, 2, 3...)',
  `text_content` MEDIUMTEXT NULL COMMENT '文本内容 (故事正文/自述文字)',
  `file_ref` VARCHAR(500) NULL COMMENT '对象存储安全访问Key/路径 (证书原图/音视频文件)',
  `content_hash` CHAR(64) NULL COMMENT '文件或文本SHA256哈希 (用于防重复检测)',
  `llm_suggestion` JSON NULL COMMENT 'LLM预提取字段、评分建议与证据引用片段JSON留痕',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '提交人用户ID (学生或代办家长)',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '版本提交时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_material_owner_version` (`owner_type`, `owner_id`, `version_no`),
  KEY `idx_material_creator` (`created_by`),
  KEY `idx_material_hash` (`content_hash`),
  CONSTRAINT `fk_material_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='佐证材料多版本留痕表';

-- ------------------------------------------------------------------------------
-- 11. 学生六育正式百分制成绩表 (student_dimension_score)
-- 作用：存储德智体美劳故事六个维度的正式百分制基准分（0~100），带有版本控制，与日常过程积分分离
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_dimension_score` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT '学生ID (users.id)',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '学期ID',
  `dimension_code` ENUM('D','Z','T','M','L','G') NOT NULL COMMENT '维度代码：D德 Z智 T体 M美 L劳 G故事',
  `score_100` DECIMAL(5,2) NOT NULL COMMENT '六育正式百分制成绩 (0~100分，不含A/B加成)',
  `status` ENUM('DRAFT', 'CONFIRMED') NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT草稿, CONFIRMED正式已审定',
  `batch_no` VARCHAR(64) NULL COMMENT '导入批次流水号/来源批次标识 (可选)',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '成绩版本号 (更正时递增)',
  `confirmed_by` BIGINT UNSIGNED NULL COMMENT '确认责任人ID (users.id)',
  `confirmed_at` DATETIME(6) NULL COMMENT '审定生效时间',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_dim_score_version` (`school_id`, `student_id`, `term_id`, `dimension_code`, `version`),
  KEY `idx_dim_score_term_code` (`term_id`, `dimension_code`),
  KEY `idx_dim_score_batch` (`batch_no`),
  CONSTRAINT `fk_dim_score_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_dim_score_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_dim_score_confirmer` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_dim_score_range` CHECK (`score_100` >= 0 AND `score_100` <= 100),
  CONSTRAINT `chk_dim_score_confirm` CHECK (
    (`status` = 'CONFIRMED' AND `confirmed_by` IS NOT NULL AND `confirmed_at` IS NOT NULL) OR
    (`status` <> 'CONFIRMED')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学生六育正式百分制成绩表';

-- ------------------------------------------------------------------------------
-- 12. 学生学科课程原始成绩表 (subject_score)
-- 作用：独立保存国家课程/学科考试原始分与等级，支持缺考免考标记，绝不与德育/过程积分混算
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subject_score` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT '学生ID (users.id)',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '学期ID',
  `subject_code` VARCHAR(30) NOT NULL COMMENT '学科代码 (如 CHINESE, MATH, ENGLISH, SCIENCE)',
  `subject_name` VARCHAR(60) NOT NULL COMMENT '学科中文名称 (如 语文, 数学, 英语)',
  `raw_score` DECIMAL(5,2) NULL COMMENT '原始考核分 (缺考/免考时为NULL)',
  `full_score` DECIMAL(5,2) NOT NULL DEFAULT 100.00 COMMENT '满分基准分 (如 100或120)',
  `grade_label` VARCHAR(20) NULL COMMENT '等级评定 (如 优秀, 良好, 及格, A, B, C)',
  `absence_type` ENUM('NORMAL', 'ABSENT', 'EXEMPT', 'POSTPONED') NOT NULL DEFAULT 'NORMAL'
    COMMENT '考核状态：NORMAL正常参考, ABSENT缺考, EXEMPT免考, POSTPONED缓考',
  `batch_no` VARCHAR(64) NULL COMMENT '导入批次流水号/来源批次标识 (可选)',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '版本号 (成绩复核更正递增)',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '录入时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subject_score_version` (`student_id`, `term_id`, `subject_code`, `version`),
  KEY `idx_subject_term_code` (`term_id`, `subject_code`),
  KEY `idx_subject_score_batch` (`batch_no`),
  CONSTRAINT `fk_subject_score_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_subject_score_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_subject_score_range` CHECK (`raw_score` IS NULL OR (`raw_score` >= 0 AND `raw_score` <= `full_score`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学生学科课程原始成绩表';

-- ------------------------------------------------------------------------------
-- 13. 学期综合评价权重与封顶规则表 (comprehensive_score_rule)
-- 作用：管理校方批准的综合评定算法参数（如六育80%、过程15%、荣誉5%、满分目标线），版本化固化
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `comprehensive_score_rule` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '学期ID',
  `rule_version` VARCHAR(30) NOT NULL DEFAULT 'V1' COMMENT '规则版本代号 (如 V1, V2026_FALL)',
  `six_weight` DECIMAL(5,4) NOT NULL DEFAULT 0.8000 COMMENT '六育百分制权重 (默认0.8000，即80%)',
  `process_weight` DECIMAL(5,4) NOT NULL DEFAULT 0.1500 COMMENT '过程积分权重 (默认0.1500，即15%)',
  `honor_weight` DECIMAL(5,4) NOT NULL DEFAULT 0.0500 COMMENT '荣誉积分权重 (默认0.0500，即5%)',
  `process_target` INT UNSIGNED NOT NULL DEFAULT 20 COMMENT '过程分达到100分所需净积分 (默认20分)',
  `honor_target` INT UNSIGNED NOT NULL DEFAULT 12 COMMENT '荣誉分达到100分所需荣誉积分 (默认12分)',
  `rule_status` ENUM('DRAFT', 'ACTIVE', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT'
    COMMENT '规则状态：DRAFT草案, ACTIVE正式启用, SUPERSEDED已被新版替代',
  `approved_by` BIGINT UNSIGNED NULL COMMENT '审批校领导/业务主管ID (users.id)',
  `approved_at` DATETIME(6) NULL COMMENT '批准生效时间',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_comp_rule_version` (`school_id`, `term_id`, `rule_version`),
  KEY `idx_comp_rule_term_status` (`term_id`, `rule_status`),
  CONSTRAINT `fk_comp_rule_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_rule_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_comp_weights_sum` CHECK (
    `six_weight` >= 0 AND `process_weight` >= 0 AND `honor_weight` >= 0 AND
    (`six_weight` + `process_weight` + `honor_weight` = 1.0000)
  ),
  CONSTRAINT `chk_comp_targets_positive` CHECK (`process_target` > 0 AND `honor_target` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学期综合评价计算与权重规则表';

-- ------------------------------------------------------------------------------
-- 14. 学生学期综合素质发展报告表 (term_report)
-- 作用：存储期末综合评价报告全貌与只读快照，包含评语、自述、家长寄语、综合分及版本替代状态
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `term_report` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID (报告ID)',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT '学生ID (users.id)',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT '学期ID',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '报告版本号 (第1版, 更正后出第2版)',
  `rule_version` VARCHAR(30) NOT NULL COMMENT '生成本报告时依据的计算规则版本号',
  `snapshot_json` JSON NOT NULL COMMENT '生成时数据全景快照 (六育分、A/B积分明细、荣誉奖项、学科成绩、班级快照)',
  `comprehensive_score` DECIMAL(5,2) NULL COMMENT '综合评价计算总得分 (0~100分)',
  `comprehensive_grade` VARCHAR(20) NULL COMMENT '综合素质等级 (优秀/良好/合格)',
  `teacher_comment` TEXT NULL COMMENT '教师正式审定评语',
  `teacher_comment_draft` TEXT NULL COMMENT 'LLM原始生成的评语草稿 (辅助留痕)',
  `teacher_id` BIGINT UNSIGNED NULL COMMENT '撰写与确认评语的班主任ID (users.id)',
  `student_statement` TEXT NULL COMMENT '学生学期自述与期末反思',
  `family_message` TEXT NULL COMMENT '家长寄语文字',
  `family_source` ENUM('STUDENT_TRANSCRIBED', 'PARENT_DIRECT') NOT NULL DEFAULT 'STUDENT_TRANSCRIBED'
    COMMENT '家长寄语来源：STUDENT_TRANSCRIBED学生代录, PARENT_DIRECT监护人实名提交',
  `status` ENUM('DRAFT', 'CONFIRMED', 'PUBLISHED', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT'
    COMMENT '报告状态：DRAFT草稿, CONFIRMED班主任已确认, PUBLISHED已定向发布, SUPERSEDED已被新版替代',
  `published_at` DATETIME(6) NULL COMMENT '正式向学生发布时间',
  `read_at` DATETIME(6) NULL COMMENT '学生首次查阅时间',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '报告生成时间',
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_term_report_version` (`school_id`, `student_id`, `term_id`, `version`),
  KEY `idx_report_student_status` (`student_id`, `status`),
  KEY `idx_report_term_status` (`term_id`, `status`),
  CONSTRAINT `fk_report_term` FOREIGN KEY (`term_id`) REFERENCES `academic_year` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_report_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_report_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学生学期综合素质发展报告表';

-- ------------------------------------------------------------------------------
-- 15. 系统核心操作审计日志表 (operation_audit)
-- 作用：记录高风险业务操作（批量发分、B卡审核通过、冲销更正、学期冻结、报告发布、敏感导出）
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `operation_audit` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `actor_user_id` BIGINT UNSIGNED NOT NULL COMMENT '操作人用户ID (users.id)',
  `actor_role` VARCHAR(30) NOT NULL COMMENT '操作人当时角色 (student/teacher/manager)',
  `target_type` VARCHAR(50) NOT NULL COMMENT '操作对象类型 (如 SCORE_RECORD, REWARD_CARD, TERM_REPORT)',
  `target_id` BIGINT UNSIGNED NULL COMMENT '操作对象主键ID',
  `action` VARCHAR(50) NOT NULL COMMENT '业务操作动作 (如 CLAIM_APPROVE, DIRECT_SCORE, FREEZE_TERM, PUBLISH_REPORT)',
  `old_summary` JSON NULL COMMENT '变更前摘要快照 (JSON)',
  `new_summary` JSON NULL COMMENT '变更后摘要快照 (JSON)',
  `request_id` VARCHAR(64) NOT NULL COMMENT '全局请求链路追踪ID (TraceID / RequestKey)',
  `client_ip` VARCHAR(45) NULL COMMENT '客户端IP地址',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '操作时间戳',
  PRIMARY KEY (`id`),
  KEY `idx_audit_actor_time` (`actor_user_id`, `created_at`),
  KEY `idx_audit_target` (`target_type`, `target_id`),
  KEY `idx_audit_request_id` (`request_id`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统核心操作审计日志表';

-- ------------------------------------------------------------------------------
-- 16. 消息通知可靠外发箱表 (notification_outbox)
-- 作用：以本地消息表模式实现可靠待办通知发送（如扫码待审通知教师、审核结果通知学生），异步投递
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notification_outbox` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` BIGINT UNSIGNED NOT NULL COMMENT '所属学校ID',
  `recipient_id` BIGINT UNSIGNED NOT NULL COMMENT '接收人用户ID (users.id)',
  `message_type` ENUM('CLAIM_PENDING', 'CLAIM_RESULT', 'HONOR_RESULT', 'REPORT_PUBLISHED') NOT NULL
    COMMENT '消息通知类型：CLAIM_PENDING扫卡待审通知, CLAIM_RESULT扫卡结果, HONOR_RESULT荣誉结果, REPORT_PUBLISHED报告发布',
  `business_key` VARCHAR(64) NOT NULL COMMENT '业务实体去重键 (例如 CLAIM_501001, REPORT_10203)',
  `payload_json` JSON NOT NULL COMMENT '通知消息载荷 (标题、内容、跳转链接等)',
  `state` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING'
    COMMENT '发送状态：PENDING待发送, SENT已发送成功, FAILED重试超限失败',
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试投递次数 (最大5次)',
  `last_error` VARCHAR(500) NULL COMMENT '最后一次失败原因描述',
  `scheduled_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '计划发送时间',
  `sent_at` DATETIME(6) NULL COMMENT '实际发送成功时间',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '消息创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_outbox_business_key` (`recipient_id`, `message_type`, `business_key`),
  KEY `idx_outbox_state_schedule` (`state`, `scheduled_at`),
  CONSTRAINT `fk_outbox_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息通知可靠外发箱表';

-- ------------------------------------------------------------------------------
-- 17. 用户 Token 注销黑名单表 (token_blacklist)
-- 作用：存储用户主动登出或强制下线的 JWT Token SHA-256 散列及过期时间
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `token_blacklist` (
  `token_hash` VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'Token SHA-256 散列',
  `expires_at` DATETIME(3) NOT NULL COMMENT 'Token 过期时间',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '加入黑名单时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Token注销黑名单表';
