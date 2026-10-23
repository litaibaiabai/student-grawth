-- 六育（德智体美劳故事）+ A/B日常+奖状 综合得分扩展表
-- MySQL 8.0.16+ / utf8mb4
-- 依赖：六育积分系统V3（student, app_user, school_term, score_record）
-- 不修改 reward_card 和 score_record 的业务语义
USE student_growth;

-- 1. 每名学生每学期六个正式百分制成绩
CREATE TABLE IF NOT EXISTS grade (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  dimension_code ENUM('D','Z','T','M','L','G') NOT NULL
    COMMENT 'D德 Z智 T体 M美 L劳 G故事',
  grade DECIMAL(5,2) NOT NULL COMMENT '六育原始正式分0~100，不包含A/B及奖状加成',
  grade_status ENUM('DRAFT','CONFIRMED') NOT NULL DEFAULT 'DRAFT',
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_dimension_grade (student_id,term_id,dimension_code),
  KEY idx_dimension_grade_term (term_id, dimension_code),
  CONSTRAINT fk_sdg_student FOREIGN KEY(student_id) REFERENCES student(id),
  CONSTRAINT fk_sdg_term FOREIGN KEY(term_id) REFERENCES school_term(id),
  CONSTRAINT fk_sdg_reviewer FOREIGN KEY(confirmed_by) REFERENCES app_user(id),
  CONSTRAINT ck_sdg_grade CHECK (grade >= 0 AND grade <= 100),
  CONSTRAINT ck_sdg_confirm CHECK (
    grade_status <> 'CONFIRMED'
    OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='六育含故事的百分制正式成绩';

-- 2. 奖状认定。一个学生一个学期同一项成果只保留一条当前认定。
-- 历史修改如需审计，使用学校已有审计表或追加更正历史。
CREATE TABLE IF NOT EXISTS honor (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  event_key VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
    COMMENT '同一活动届次+成果的稳定去重键，不是文件名或奖状图片hash',
  title VARCHAR(200) NOT NULL COMMENT '比赛/成果名称',
  award_level ENUM('DISTRICT','CITY','PROVINCE') NOT NULL,
  award_rank ENUM('FIRST','SECOND','THIRD') NOT NULL,
  honor_points TINYINT GENERATED ALWAYS AS (
    CASE
      WHEN award_level='PROVINCE' AND award_rank='FIRST' THEN 9
      WHEN award_level='PROVINCE' AND award_rank='SECOND' THEN 8
      WHEN award_level='PROVINCE' AND award_rank='THIRD' THEN 7
      WHEN award_level='CITY' AND award_rank='FIRST' THEN 6
      WHEN award_level='CITY' AND award_rank='SECOND' THEN 5
      WHEN award_level='CITY' AND award_rank='THIRD' THEN 4
      WHEN award_level='DISTRICT' AND award_rank='FIRST' THEN 3
      WHEN award_level='DISTRICT' AND award_rank='SECOND' THEN 2
      WHEN award_level='DISTRICT' AND award_rank='THIRD' THEN 1
      ELSE 0
    END
  ) STORED COMMENT '1~9的内部荣誉积分；不是A/B日常积分',
  review_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(6) NULL,
  award_date DATE NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_honor_event (student_id,term_id,event_key),
  KEY idx_honor_approved (student_id,term_id,review_status),
  CONSTRAINT fk_hc_student FOREIGN KEY(student_id) REFERENCES student(id),
  CONSTRAINT fk_hc_term FOREIGN KEY(term_id) REFERENCES school_term(id),
  CONSTRAINT fk_hc_reviewer FOREIGN KEY(reviewed_by) REFERENCES app_user(id),
  CONSTRAINT ck_honor_review CHECK (
    review_status <> 'APPROVED'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='省市区一二三等奖审核表';

-- 3. 学期计算规则：参数需由校方审批并在学期内固定，变更应建立新版本和结果快照
CREATE TABLE IF NOT EXISTS score_rule (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  term_id BIGINT UNSIGNED NOT NULL,
  base_weight DECIMAL(5,4) NOT NULL DEFAULT 0.8000,
  process_weight DECIMAL(5,4) NOT NULL DEFAULT 0.1500,
  honor_weight DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
  process_full_points INT UNSIGNED NOT NULL DEFAULT 20
    COMMENT '本学期多少条A/B净加分达到过程分满分',
  honor_full_points INT UNSIGNED NOT NULL DEFAULT 12
    COMMENT '本学期多少荣誉积分达到荣誉分满分',
  rule_version VARCHAR(30) NOT NULL DEFAULT 'V1',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_rule_term (term_id),
  CONSTRAINT fk_csr_term FOREIGN KEY(term_id) REFERENCES school_term(id),
  CONSTRAINT ck_score_weights CHECK (
    base_weight >= 0 AND process_weight >= 0 AND honor_weight >= 0
    AND base_weight + process_weight + honor_weight = 1.0000
  ),
  CONSTRAINT ck_score_targets CHECK (
    process_full_points > 0 AND honor_full_points > 0
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='综合得分权重及封顶规则';

-- 启用某学期（将1替换为真实term_id）
-- INSERT INTO score_rule(term_id, base_weight, process_weight, honor_weight,
--   process_full_points, honor_full_points, rule_version)
-- VALUES (1,0.8000,0.1500,0.0500,20,12,'V1');
