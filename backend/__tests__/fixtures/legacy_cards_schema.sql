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
