-- 学校期末报告核心数据库 V1；设计文件，未执行。
-- 目标：MySQL 8.0.21+；仅在已明确选择的空目标库执行，禁止在原44表库直接运行。
-- 六张核心业务表。无 DROP、ALTER、USE、CREATE DATABASE、演示账号或生产密钥。
-- session 使用 UTC；month_key、报到日期及界面日期按 Asia/Shanghai 业务时区计算。
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(64) NOT NULL,
  password VARCHAR(255) NOT NULL COMMENT '沿用bcrypt哈希，禁止明文',
  real_name VARCHAR(64) NOT NULL,
  role ENUM('manager','teacher','student') NOT NULL,
  grade SMALLINT UNSIGNED NULL,
  class_no SMALLINT UNSIGNED NULL,
  status TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0启用，1停用；注销不物理删除',
  token_version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '账号级JWT撤销版本',
  legacy_info JSON NULL COMMENT '仅迁移保留原身份引用，不作为任教授权来源',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_school_id (school_id,id),
  UNIQUE KEY uk_user_school_username (school_id,username),
  KEY idx_user_school_role_class (school_id,role,status,grade,class_no),
  CONSTRAINT ck_user_status CHECK (status IN (0,1)),
  CONSTRAINT ck_user_class CHECK ((grade IS NULL OR grade>0) AND (class_no IS NULL OR class_no>0))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账号与基础身份';

CREATE TABLE academic_year (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  term_name VARCHAR(80) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current TINYINT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_term_registration_date DATE NULL,
  evaluation_config JSON NOT NULL COMMENT 'APP_CORE_V1配置：适用项、37卡目录阈值、故事月份、奖状映射、允许等级、文本上限',
  config_version VARCHAR(32) NOT NULL,
  template_version VARCHAR(32) NOT NULL,
  rule_version VARCHAR(32) NOT NULL,
  current_school BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_current=1 THEN school_id ELSE NULL END) STORED,
  active_release_version INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0用于迁入历史归档，新批次从1开始',
  release_status ENUM('IDLE','PREPARING','READY','FAILED') NOT NULL DEFAULT 'IDLE',
  release_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  release_target_version INT UNSIGNED NULL,
  release_fence BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '每次开始、恢复、取消发布推进，拒绝旧worker',
  release_manifest JSON NULL COMMENT '冻结学生名单、revision、指纹、模板与配置内容摘要',
  release_state JSON NULL COMMENT '可恢复的准备进度、错误、执行者及租约',
  released_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_term_school_id (school_id,id),
  UNIQUE KEY uk_term_identity (school_id,academic_year,semester),
  UNIQUE KEY uk_term_current_school (current_school),
  KEY idx_term_current (school_id,is_current,active),
  KEY idx_term_release (school_id,release_status),
  CONSTRAINT ck_term_dates CHECK (start_date<=end_date),
  CONSTRAINT ck_term_semester CHECK (semester IN (1,2)),
  CONSTRAINT ck_term_flags CHECK (is_current IN (0,1) AND active IN (0,1)),
  CONSTRAINT ck_term_config CHECK (JSON_TYPE(evaluation_config)='OBJECT'),
  CONSTRAINT ck_term_preparing CHECK (release_status NOT IN ('PREPARING','READY') OR (release_key IS NOT NULL AND release_target_version IS NOT NULL AND release_manifest IS NOT NULL))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学期、规则和学校发布控制';

CREATE TABLE teacher_teaching_assignment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  teacher_id BIGINT UNSIGNED NOT NULL,
  grade SMALLINT UNSIGNED NOT NULL,
  class_no SMALLINT UNSIGNED NOT NULL,
  subject_code VARCHAR(30) NOT NULL COMMENT '稳定学科代码，班主任职责沿用is_head_teacher',
  is_head_teacher TINYINT UNSIGNED NOT NULL DEFAULT 0,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_assignment (school_id,term_id,teacher_id,grade,class_no,subject_code),
  KEY idx_assignment_class (school_id,term_id,grade,class_no,is_head_teacher,enabled),
  CONSTRAINT fk_assignment_term FOREIGN KEY (school_id,term_id) REFERENCES academic_year(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_teacher FOREIGN KEY (school_id,teacher_id) REFERENCES users(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT ck_assignment_flags CHECK (is_head_teacher IN (0,1) AND enabled IN (0,1)),
  CONSTRAINT ck_assignment_class CHECK (grade>0 AND class_no>0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='当前学期任教授权';

CREATE TABLE student_term_evaluation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  student_name_snapshot VARCHAR(64) NOT NULL,
  grade_snapshot SMALLINT UNSIGNED NOT NULL,
  class_no_snapshot SMALLINT UNSIGNED NOT NULL,

  -- 德美：8项自评与他评
  conduct_politeness_self_star TINYINT UNSIGNED NULL COMMENT '有礼貌·自评；来源 SELF',
  conduct_politeness_other_star TINYINT UNSIGNED NULL COMMENT '有礼貌·他评；来源 CARD',
  conduct_civility_self_star TINYINT UNSIGNED NULL COMMENT '讲文明·自评；来源 SELF',
  conduct_civility_other_star TINYINT UNSIGNED NULL COMMENT '讲文明·他评；来源 CARD',
  conduct_integrity_self_star TINYINT UNSIGNED NULL COMMENT '讲信用·自评；来源 SELF',
  conduct_integrity_other_star TINYINT UNSIGNED NULL COMMENT '讲信用·他评；来源 CARD',
  conduct_responsibility_self_star TINYINT UNSIGNED NULL COMMENT '负责任·自评；来源 SELF',
  conduct_responsibility_other_star TINYINT UNSIGNED NULL COMMENT '负责任·他评；来源 CARD',
  conduct_kindness_self_star TINYINT UNSIGNED NULL COMMENT '有爱心·自评；来源 SELF',
  conduct_kindness_other_star TINYINT UNSIGNED NULL COMMENT '有爱心·他评；来源 CARD',
  conduct_rules_self_star TINYINT UNSIGNED NULL COMMENT '守规则·自评；来源 SELF',
  conduct_rules_other_star TINYINT UNSIGNED NULL COMMENT '守规则·他评；来源 CARD',
  conduct_communication_self_star TINYINT UNSIGNED NULL COMMENT '善交流·自评；来源 SELF',
  conduct_communication_other_star TINYINT UNSIGNED NULL COMMENT '善交流·他评；来源 CARD',
  conduct_cooperation_self_star TINYINT UNSIGNED NULL COMMENT '会合作·自评；来源 SELF',
  conduct_cooperation_other_star TINYINT UNSIGNED NULL COMMENT '会合作·他评；来源 CARD',

  -- 智美：五科学习过程及能力分项
  moral_interest_star TINYINT UNSIGNED NULL COMMENT '道德与法治·学习兴趣；来源 CARD',
  moral_habit_star TINYINT UNSIGNED NULL COMMENT '道德与法治·学习习惯；来源 CARD',
  moral_method_star TINYINT UNSIGNED NULL COMMENT '道德与法治·学习方法；来源 CARD',
  moral_cognition_grade VARCHAR(8) NULL COMMENT '道德与法治·认知水平；来源 IMPORT',
  moral_practice_grade VARCHAR(8) NULL COMMENT '道德与法治·实践能力；来源 IMPORT',
  moral_process_star TINYINT UNSIGNED NULL COMMENT '道德与法治·过程表现；来源 CARD',
  chinese_interest_star TINYINT UNSIGNED NULL COMMENT '语文·学习兴趣；来源 CARD',
  chinese_habit_star TINYINT UNSIGNED NULL COMMENT '语文·学习习惯；来源 CARD',
  chinese_method_star TINYINT UNSIGNED NULL COMMENT '语文·学习方法；来源 CARD',
  chinese_accumulation_application_grade VARCHAR(8) NULL COMMENT '语文·积累与运用；来源 IMPORT',
  chinese_reading_appreciation_grade VARCHAR(8) NULL COMMENT '语文·阅读与鉴赏；来源 IMPORT',
  chinese_expression_communication_grade VARCHAR(8) NULL COMMENT '语文·表达与交流；来源 IMPORT',
  chinese_organization_inquiry_grade VARCHAR(8) NULL COMMENT '语文·梳理与探究；来源 IMPORT',
  chinese_handwriting_grade VARCHAR(8) NULL COMMENT '语文·书写；来源 IMPORT',
  chinese_process_star TINYINT UNSIGNED NULL COMMENT '语文·过程表现；来源 CARD',
  math_interest_star TINYINT UNSIGNED NULL COMMENT '数学·学习兴趣；来源 CARD',
  math_habit_star TINYINT UNSIGNED NULL COMMENT '数学·学习习惯；来源 CARD',
  math_method_star TINYINT UNSIGNED NULL COMMENT '数学·学习方法；来源 CARD',
  math_basic_knowledge_grade VARCHAR(8) NULL COMMENT '数学·基础知识；来源 IMPORT',
  math_thinking_grade VARCHAR(8) NULL COMMENT '数学·数学思维；来源 IMPORT',
  math_information_extraction_grade VARCHAR(8) NULL COMMENT '数学·信息提取；来源 IMPORT',
  math_problem_solving_grade VARCHAR(8) NULL COMMENT '数学·解决问题；来源 IMPORT',
  math_process_star TINYINT UNSIGNED NULL COMMENT '数学·过程表现；来源 CARD',
  science_interest_star TINYINT UNSIGNED NULL COMMENT '科学·学习兴趣；来源 CARD',
  science_habit_star TINYINT UNSIGNED NULL COMMENT '科学·学习习惯；来源 CARD',
  science_method_star TINYINT UNSIGNED NULL COMMENT '科学·学习方法；来源 CARD',
  science_concepts_grade VARCHAR(8) NULL COMMENT '科学·科学观念；来源 IMPORT',
  science_thinking_grade VARCHAR(8) NULL COMMENT '科学·科学思维；来源 IMPORT',
  science_inquiry_practice_grade VARCHAR(8) NULL COMMENT '科学·探究实践；来源 IMPORT',
  science_process_star TINYINT UNSIGNED NULL COMMENT '科学·过程表现；来源 CARD',
  english_interest_star TINYINT UNSIGNED NULL COMMENT '英语·学习兴趣；来源 CARD',
  english_habit_star TINYINT UNSIGNED NULL COMMENT '英语·学习习惯；来源 CARD',
  english_method_star TINYINT UNSIGNED NULL COMMENT '英语·学习方法；来源 CARD',
  english_listening_grade VARCHAR(8) NULL COMMENT '英语·听力素养；来源 IMPORT',
  english_speaking_grade VARCHAR(8) NULL COMMENT '英语·口语素养；来源 IMPORT',
  english_writing_grade VARCHAR(8) NULL COMMENT '英语·书面表达；来源 IMPORT',
  english_reading_grade VARCHAR(8) NULL COMMENT '英语·阅读能力；来源 IMPORT',
  english_process_star TINYINT UNSIGNED NULL COMMENT '英语·过程表现；来源 CARD',

  -- 健美：原始测量与体育/体测评价
  height_cm DECIMAL(5,1) NULL COMMENT '身高；来源 IMPORT',
  weight_kg DECIMAL(5,1) NULL COMMENT '体重；来源 IMPORT',
  vision_left VARCHAR(16) NULL COMMENT '视力 · 左；来源 IMPORT',
  vision_right VARCHAR(16) NULL COMMENT '视力 · 右；来源 IMPORT',
  jump_rope_1min INT UNSIGNED NULL COMMENT '1 分钟跳绳；来源 IMPORT',
  pe_academic_grade VARCHAR(8) NULL COMMENT '体育与健康·学业水平；来源 IMPORT',
  pe_process_star TINYINT UNSIGNED NULL COMMENT '体育与健康·过程表现；来源 CARD',
  fitness_self_star TINYINT UNSIGNED NULL COMMENT '体质健康测试·自我评价；来源 SELF',
  fitness_level_star TINYINT UNSIGNED NULL COMMENT '体质健康测试·体测水平；来源 CARD',
  fitness_process_star TINYINT UNSIGNED NULL COMMENT '体质健康测试·过程表现；来源 CARD',
  health_tested_at DATE NULL,
  vision_standard VARCHAR(32) NULL,
  extra_health JSON NULL COMMENT '保留原库肺活量等当前报告外数据',
  sports_specialties JSON NULL COMMENT '数组{id,name,self_star,teacher_star,outcome,sourceIds}',

  -- 艺美：音美自评、教师评价、学业
  music_learning_self_star TINYINT UNSIGNED NULL COMMENT '音乐·学习过程·自我评价；来源 SELF',
  music_learning_teacher_star TINYINT UNSIGNED NULL COMMENT '音乐·学习过程·教师评价；来源 CARD',
  music_academic_grade VARCHAR(8) NULL COMMENT '音乐·学业水平；来源 IMPORT',
  music_process_star TINYINT UNSIGNED NULL COMMENT '音乐·过程表现；来源 CARD',
  music_skill_self_star TINYINT UNSIGNED NULL COMMENT '音乐·艺术技能·自我评价；来源 SELF',
  music_skill_teacher_star TINYINT UNSIGNED NULL COMMENT '音乐·艺术技能·教师评价；来源 CARD',
  fine_art_learning_self_star TINYINT UNSIGNED NULL COMMENT '美术·学习过程·自我评价；来源 SELF',
  fine_art_learning_teacher_star TINYINT UNSIGNED NULL COMMENT '美术·学习过程·教师评价；来源 CARD',
  fine_art_academic_grade VARCHAR(8) NULL COMMENT '美术·学业水平；来源 IMPORT',
  fine_art_process_star TINYINT UNSIGNED NULL COMMENT '美术·过程表现；来源 CARD',
  fine_art_skill_self_star TINYINT UNSIGNED NULL COMMENT '美术·艺术技能·自我评价；来源 SELF',
  fine_art_skill_teacher_star TINYINT UNSIGNED NULL COMMENT '美术·艺术技能·教师评价；来源 CARD',
  art_specialties JSON NULL COMMENT '数组{id,name,self_star,teacher_star,outcome,sourceIds}',

  -- 劳美：教师导入学业，奖状生成成果，禁止发卡
  information_technology_academic_star TINYINT UNSIGNED NULL COMMENT '信息科技·学业水平；来源 IMPORT',
  information_technology_experience TEXT NULL COMMENT '信息科技·成果作品、实践经历与表现；来源 CERTIFICATE',
  labor_academic_star TINYINT UNSIGNED NULL COMMENT '劳动·学业水平；来源 IMPORT',
  labor_experience TEXT NULL COMMENT '劳动·成果作品、实践经历与表现；来源 CERTIFICATE',
  integrated_practice_academic_star TINYINT UNSIGNED NULL COMMENT '综合实践活动·学业水平；来源 IMPORT',
  integrated_practice_experience TEXT NULL COMMENT '综合实践活动·成果作品、实践经历与表现；来源 CERTIFICATE',
  local_course_academic_star TINYINT UNSIGNED NULL COMMENT '地方课程·学业水平；来源 IMPORT',
  local_course_experience TEXT NULL COMMENT '地方课程·成果作品、实践经历与表现；来源 CERTIFICATE',
  information_technology_outcome_grade VARCHAR(8) NULL COMMENT '信息科技·成果表现；来源 CERTIFICATE',
  labor_outcome_grade VARCHAR(8) NULL COMMENT '劳动·成果表现；来源 CERTIFICATE',
  integrated_practice_outcome_grade VARCHAR(8) NULL COMMENT '综合实践活动·成果表现；来源 CERTIFICATE',
  local_course_outcome_grade VARCHAR(8) NULL COMMENT '地方课程·成果表现；来源 CERTIFICATE',

  -- 故事美：三类文本学业、奖状成果及实践文字
  story_read_star TINYINT UNSIGNED NULL COMMENT '我爱读故事·分项评价；来源 STORY',
  story_read_experience TEXT NULL COMMENT '我爱读故事·实践经历与表现；来源 STORY',
  story_listen_star TINYINT UNSIGNED NULL COMMENT '我爱听故事·分项评价；来源 STORY',
  story_listen_experience TEXT NULL COMMENT '我爱听故事·实践经历与表现；来源 STORY',
  story_tell_star TINYINT UNSIGNED NULL COMMENT '我爱讲故事·分项评价；来源 STORY',
  story_tell_experience TEXT NULL COMMENT '我爱讲故事·实践经历与表现；来源 STORY',
  story_read_outcome_star TINYINT UNSIGNED NULL COMMENT '我爱读故事·成果表现；来源 CERTIFICATE',
  story_listen_outcome_star TINYINT UNSIGNED NULL COMMENT '我爱听故事·成果表现；来源 CERTIFICATE',
  story_tell_outcome_star TINYINT UNSIGNED NULL COMMENT '我爱讲故事·成果表现；来源 CERTIFICATE',

  -- 报告正面文字
  self_conduct_text TEXT NULL COMMENT '品行美自述',
  self_wisdom_text TEXT NULL COMMENT '智慧美自述',
  self_health_text TEXT NULL COMMENT '健康美自述',
  self_art_text TEXT NULL COMMENT '艺术美自述',
  self_labor_text TEXT NULL COMMENT '劳动美自述',
  semester_highlights TEXT NULL COMMENT '本学期收获与活动',
  next_term_goals TEXT NULL COMMENT '下学期目标',
  teacher_comment TEXT NULL COMMENT '学期寄语',
  family_message TEXT NULL COMMENT '家长寄语',

  field_sources JSON NULL COMMENT '按字段记录sourceId、源版本、规则版本、原始分及已结算/无成果/不适用状态',
  section_meta JSON NULL COMMENT '各学科、故事月份及自评完成情况，含布局预览确认',
  template_version VARCHAR(32) NOT NULL,
  rule_version VARCHAR(32) NOT NULL,
  status ENUM('DRAFT','CONFIRMED') NOT NULL DEFAULT 'DRAFT',
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  confirmed_revision BIGINT UNSIGNED NULL,
  approval_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME(6) NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_eval_school_id (school_id,id),
  UNIQUE KEY uk_eval_student_term (school_id,term_id,student_id),
  KEY idx_eval_class (school_id,term_id,grade_snapshot,class_no_snapshot,status),
  KEY idx_eval_readiness (school_id,term_id,status),
  CONSTRAINT fk_eval_term FOREIGN KEY (school_id,term_id) REFERENCES academic_year(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_eval_student FOREIGN KEY (school_id,student_id) REFERENCES users(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_eval_confirmer FOREIGN KEY (school_id,confirmed_by) REFERENCES users(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_eval_updater FOREIGN KEY (school_id,updated_by) REFERENCES users(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT ck_eval_confirmed CHECK (status<>'CONFIRMED' OR (confirmed_revision IS NOT NULL AND confirmed_revision=revision AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND approval_fingerprint IS NOT NULL)),
  CONSTRAINT ck_eval_specialties CHECK ((sports_specialties IS NULL OR JSON_TYPE(sports_specialties)='ARRAY') AND (art_specialties IS NULL OR JSON_TYPE(art_specialties)='ARRAY')),
  CONSTRAINT ck_eval_sources CHECK ((field_sources IS NULL OR JSON_TYPE(field_sources)='OBJECT') AND (section_meta IS NULL OR JSON_TYPE(section_meta)='OBJECT')),
  CONSTRAINT ck_eval_stars CHECK (
    (conduct_politeness_self_star IS NULL OR conduct_politeness_self_star BETWEEN 1 AND 3) AND
    (conduct_politeness_other_star IS NULL OR conduct_politeness_other_star BETWEEN 1 AND 3) AND
    (conduct_civility_self_star IS NULL OR conduct_civility_self_star BETWEEN 1 AND 3) AND
    (conduct_civility_other_star IS NULL OR conduct_civility_other_star BETWEEN 1 AND 3) AND
    (conduct_integrity_self_star IS NULL OR conduct_integrity_self_star BETWEEN 1 AND 3) AND
    (conduct_integrity_other_star IS NULL OR conduct_integrity_other_star BETWEEN 1 AND 3) AND
    (conduct_responsibility_self_star IS NULL OR conduct_responsibility_self_star BETWEEN 1 AND 3) AND
    (conduct_responsibility_other_star IS NULL OR conduct_responsibility_other_star BETWEEN 1 AND 3) AND
    (conduct_kindness_self_star IS NULL OR conduct_kindness_self_star BETWEEN 1 AND 3) AND
    (conduct_kindness_other_star IS NULL OR conduct_kindness_other_star BETWEEN 1 AND 3) AND
    (conduct_rules_self_star IS NULL OR conduct_rules_self_star BETWEEN 1 AND 3) AND
    (conduct_rules_other_star IS NULL OR conduct_rules_other_star BETWEEN 1 AND 3) AND
    (conduct_communication_self_star IS NULL OR conduct_communication_self_star BETWEEN 1 AND 3) AND
    (conduct_communication_other_star IS NULL OR conduct_communication_other_star BETWEEN 1 AND 3) AND
    (conduct_cooperation_self_star IS NULL OR conduct_cooperation_self_star BETWEEN 1 AND 3) AND
    (conduct_cooperation_other_star IS NULL OR conduct_cooperation_other_star BETWEEN 1 AND 3) AND
    (moral_interest_star IS NULL OR moral_interest_star BETWEEN 1 AND 3) AND
    (moral_habit_star IS NULL OR moral_habit_star BETWEEN 1 AND 3) AND
    (moral_method_star IS NULL OR moral_method_star BETWEEN 1 AND 3) AND
    (moral_process_star IS NULL OR moral_process_star BETWEEN 1 AND 3) AND
    (chinese_interest_star IS NULL OR chinese_interest_star BETWEEN 1 AND 3) AND
    (chinese_habit_star IS NULL OR chinese_habit_star BETWEEN 1 AND 3) AND
    (chinese_method_star IS NULL OR chinese_method_star BETWEEN 1 AND 3) AND
    (chinese_process_star IS NULL OR chinese_process_star BETWEEN 1 AND 3) AND
    (math_interest_star IS NULL OR math_interest_star BETWEEN 1 AND 3) AND
    (math_habit_star IS NULL OR math_habit_star BETWEEN 1 AND 3) AND
    (math_method_star IS NULL OR math_method_star BETWEEN 1 AND 3) AND
    (math_process_star IS NULL OR math_process_star BETWEEN 1 AND 3) AND
    (science_interest_star IS NULL OR science_interest_star BETWEEN 1 AND 3) AND
    (science_habit_star IS NULL OR science_habit_star BETWEEN 1 AND 3) AND
    (science_method_star IS NULL OR science_method_star BETWEEN 1 AND 3) AND
    (science_process_star IS NULL OR science_process_star BETWEEN 1 AND 3) AND
    (english_interest_star IS NULL OR english_interest_star BETWEEN 1 AND 3) AND
    (english_habit_star IS NULL OR english_habit_star BETWEEN 1 AND 3) AND
    (english_method_star IS NULL OR english_method_star BETWEEN 1 AND 3) AND
    (english_process_star IS NULL OR english_process_star BETWEEN 1 AND 3) AND
    (pe_process_star IS NULL OR pe_process_star BETWEEN 1 AND 3) AND
    (fitness_self_star IS NULL OR fitness_self_star BETWEEN 1 AND 3) AND
    (fitness_level_star IS NULL OR fitness_level_star BETWEEN 1 AND 3) AND
    (fitness_process_star IS NULL OR fitness_process_star BETWEEN 1 AND 3) AND
    (music_learning_self_star IS NULL OR music_learning_self_star BETWEEN 1 AND 3) AND
    (music_learning_teacher_star IS NULL OR music_learning_teacher_star BETWEEN 1 AND 3) AND
    (music_process_star IS NULL OR music_process_star BETWEEN 1 AND 3) AND
    (music_skill_self_star IS NULL OR music_skill_self_star BETWEEN 1 AND 3) AND
    (music_skill_teacher_star IS NULL OR music_skill_teacher_star BETWEEN 1 AND 3) AND
    (fine_art_learning_self_star IS NULL OR fine_art_learning_self_star BETWEEN 1 AND 3) AND
    (fine_art_learning_teacher_star IS NULL OR fine_art_learning_teacher_star BETWEEN 1 AND 3) AND
    (fine_art_process_star IS NULL OR fine_art_process_star BETWEEN 1 AND 3) AND
    (fine_art_skill_self_star IS NULL OR fine_art_skill_self_star BETWEEN 1 AND 3) AND
    (fine_art_skill_teacher_star IS NULL OR fine_art_skill_teacher_star BETWEEN 1 AND 3) AND
    (information_technology_academic_star IS NULL OR information_technology_academic_star BETWEEN 1 AND 3) AND
    (labor_academic_star IS NULL OR labor_academic_star BETWEEN 1 AND 3) AND
    (integrated_practice_academic_star IS NULL OR integrated_practice_academic_star BETWEEN 1 AND 3) AND
    (local_course_academic_star IS NULL OR local_course_academic_star BETWEEN 1 AND 3) AND
    (story_read_star IS NULL OR story_read_star BETWEEN 1 AND 3) AND
    (story_listen_star IS NULL OR story_listen_star BETWEEN 1 AND 3) AND
    (story_tell_star IS NULL OR story_tell_star BETWEEN 1 AND 3) AND
    (story_read_outcome_star IS NULL OR story_read_outcome_star BETWEEN 1 AND 3) AND
    (story_listen_outcome_star IS NULL OR story_listen_outcome_star BETWEEN 1 AND 3) AND
    (story_tell_outcome_star IS NULL OR story_tell_outcome_star BETWEEN 1 AND 3)
  )
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='每学生每学期一行的完整评价与当前草稿';

CREATE TABLE evaluation_source_record (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NULL,
  source_type ENUM('CARD','IMPORT','CERTIFICATE','SELF','TEACHER','STORY') NULL,
  record_kind ENUM('QUOTA','CARD','DIRECT','BATCH','ITEM','FORM','REVERSAL','AUDIT') NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  original_id BIGINT UNSIGNED NULL,
  owner_teacher_id BIGINT UNSIGNED NULL,
  actor_id BIGINT UNSIGNED NULL,
  month_key CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NULL,
  target_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NULL,
  group_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  record_ordinal INT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '正文/批次业务版本，提交后正文不可原地改写',
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '本记录并发修订号，评分租约不改变业务version',
  business_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '服务端规范化业务键SHA256',
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  response_json JSON NULL COMMENT '归属操作者的幂等响应，不包含明文卡凭证',
  status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  delta SMALLINT NULL,
  payload_json JSON NOT NULL COMMENT '类型化私有材料/导入行/评分结果，按source_type+record_kind验证',
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  token_ciphertext TEXT NULL,
  valid_from DATETIME(6) NULL,
  valid_until DATETIME(6) NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(6) NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  locked_until DATETIME(6) NULL,
  ledger_occurred_utc CHAR(24) COLLATE utf8mb4_bin GENERATED ALWAYS AS (CASE WHEN record_kind='DIRECT' AND JSON_TYPE(JSON_EXTRACT(payload_json,'$.occurredAt'))='STRING' AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.occurredAt')))=24 THEN JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.occurredAt')) ELSE NULL END) STORED,
  reversal_of BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN record_kind='REVERSAL' THEN original_id ELSE NULL END) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_source_school_id (school_id,id),
  UNIQUE KEY uk_source_business (school_id,business_key),
  UNIQUE KEY uk_source_token (token_hash),
  UNIQUE KEY uk_source_parent_slot (school_id,parent_id,record_kind,version,record_ordinal),
  UNIQUE KEY uk_source_reversal_once (school_id,reversal_of),
  KEY idx_source_student_target (school_id,term_id,student_id,source_type,target_key,status),
  KEY idx_source_group_version (school_id,term_id,source_type,group_key,version),
  KEY idx_source_owner_month (school_id,term_id,owner_teacher_id,month_key,record_kind,status),
  KEY idx_source_ledger_direct (school_id,term_id,actor_id,source_type,record_kind,student_id,target_key,ledger_occurred_utc,created_at),
  KEY idx_source_job (source_type,record_kind,status,next_attempt_at,locked_until,id),
  CONSTRAINT fk_source_term FOREIGN KEY (school_id,term_id) REFERENCES academic_year(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_source_student FOREIGN KEY (school_id,student_id) REFERENCES users(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_source_parent FOREIGN KEY (school_id,parent_id) REFERENCES evaluation_source_record(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_source_original FOREIGN KEY (school_id,original_id) REFERENCES evaluation_source_record(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_source_owner FOREIGN KEY (school_id,owner_teacher_id) REFERENCES users(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_source_actor FOREIGN KEY (school_id,actor_id) REFERENCES users(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT ck_source_payload CHECK (JSON_TYPE(payload_json)='OBJECT'),
  CONSTRAINT ck_source_management CHECK ((record_kind='AUDIT' AND source_type IS NULL) OR (record_kind<>'AUDIT' AND source_type IS NOT NULL)),
  CONSTRAINT ck_source_delta CHECK ((record_kind IN ('CARD','DIRECT') AND source_type='CARD' AND delta IS NOT NULL AND delta=1) OR (record_kind='REVERSAL' AND source_type='CARD' AND delta IS NOT NULL AND delta=-1) OR (record_kind NOT IN ('CARD','DIRECT','REVERSAL') AND delta IS NULL)),
  CONSTRAINT ck_source_kind CHECK ((source_type IS NULL AND record_kind='AUDIT') OR (source_type='CARD' AND record_kind IN ('QUOTA','CARD','DIRECT','REVERSAL')) OR (source_type='IMPORT' AND record_kind IN ('BATCH','ITEM')) OR (source_type='CERTIFICATE' AND record_kind='ITEM') OR (source_type IN ('SELF','TEACHER') AND record_kind='FORM') OR (source_type='STORY' AND record_kind IN ('BATCH','ITEM'))),
  CONSTRAINT ck_source_reversal CHECK (record_kind<>'REVERSAL' OR (original_id IS NOT NULL AND student_id IS NOT NULL)),
  CONSTRAINT ck_source_card CHECK (record_kind<>'CARD' OR (source_type='CARD' AND parent_id IS NOT NULL AND record_ordinal IS NOT NULL AND token_hash IS NOT NULL AND token_ciphertext IS NOT NULL AND valid_from IS NOT NULL AND valid_until IS NOT NULL AND valid_from<valid_until)),
  CONSTRAINT ck_source_used CHECK (record_kind<>'CARD' OR status<>'USED' OR student_id IS NOT NULL),
  CONSTRAINT ck_source_lease CHECK (status<>'PROCESSING' OR (lease_token IS NOT NULL AND locked_until IS NOT NULL)),
  CONSTRAINT ck_source_status CHECK (status IN ('DRAFT','PREVIEW','SUBMITTED','UNUSED','USED','QUEUED','PROCESSING','SCORED','CONFIRMED','APPROVED','REJECTED','FAILED','REVOKED','SUPERSEDED','VOID','EXPIRED','CANCELLED','CLOSED','COMMITTED'))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='六种来源、批次、明细及私有更正留痕';

CREATE TABLE term_report (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL COMMENT '该学生该学期的报告版本',
  release_version INT UNSIGNED NOT NULL COMMENT '全校批次版本，0仅用于历史迁移',
  release_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  schema_version ENUM('LEGACY_V1','CORE_V1') NOT NULL,
  template_version VARCHAR(32) NOT NULL,
  rule_version VARCHAR(32) NULL,
  source_revision BIGINT UNSIGNED NOT NULL,
  approval_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  snapshot_json JSON NOT NULL COMMENT '完整冻结内容、配置快照及来源版本；正文不再读实时宽表',
  snapshot_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('PREPARED','PUBLISHED') NOT NULL DEFAULT 'PREPARED',
  prepared_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  published_at DATETIME(6) NULL,
  read_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_report_version (school_id,term_id,student_id,version),
  UNIQUE KEY uk_report_release_student (school_id,term_id,release_key,student_id),
  KEY idx_report_current (school_id,term_id,release_version,status,student_id),
  KEY idx_report_student (school_id,term_id,student_id,status,version),
  CONSTRAINT fk_report_term FOREIGN KEY (school_id,term_id) REFERENCES academic_year(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_student FOREIGN KEY (school_id,student_id) REFERENCES users(school_id,id) ON DELETE RESTRICT,
  CONSTRAINT ck_report_snapshot CHECK (JSON_TYPE(snapshot_json)='OBJECT'),
  CONSTRAINT ck_report_published CHECK (status<>'PUBLISHED' OR published_at IS NOT NULL),
  CONSTRAINT ck_report_core CHECK (schema_version<>'CORE_V1' OR (approval_fingerprint IS NOT NULL AND source_revision>0 AND release_version>0))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='历史和新发布报告的冻结归档';
