-- V2 target-clone upgrade only. Use the resumable JS migrator after preflight.
ALTER TABLE `academic_year` ADD COLUMN `business_phase` VARCHAR(16) NOT NULL DEFAULT 'COLLECTING';

ALTER TABLE `academic_year` ADD COLUMN `data_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE `academic_year` ADD COLUMN `roster_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE `student_term_evaluation` ADD COLUMN `conduct_process_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `moral_regular_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `moral_final_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `moral_overall_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `chinese_regular_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `chinese_final_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `chinese_overall_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `math_regular_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `math_final_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `math_overall_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `science_regular_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `science_final_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `science_overall_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `english_regular_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `english_final_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `english_overall_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `information_technology_interest_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `information_technology_habit_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `information_technology_method_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `information_technology_regular_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `information_technology_final_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `information_technology_overall_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `information_technology_process_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `music_regular_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `music_overall_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `fine_art_regular_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `fine_art_overall_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `labor_literacy_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `labor_process_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `integrated_practice_literacy_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `integrated_practice_process_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `local_course_literacy_grade` VARCHAR(8) NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `local_course_process_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `story_write_star` TINYINT UNSIGNED NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `story_summary` JSON NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `process_summary` JSON NULL;

ALTER TABLE `student_term_evaluation` ADD COLUMN `honor_summary` JSON NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `schema_version` VARCHAR(16) NOT NULL DEFAULT 'CORE_V1';

ALTER TABLE `evaluation_source_record` ADD COLUMN `event_type` VARCHAR(32) NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `dimension_code` VARCHAR(16) NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `subject_code` VARCHAR(32) NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `effect_key` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `submitted_at` DATETIME(6) NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `effective_at` DATETIME(6) NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `numeric_value` DECIMAL(8,2) NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `story_content_id` BIGINT UNSIGNED NULL;

ALTER TABLE `evaluation_source_record` ADD COLUMN `current_version_id` BIGINT UNSIGNED NULL;

ALTER TABLE `teacher_teaching_assignment` ADD COLUMN `active_head_class` VARCHAR(32) GENERATED ALWAYS AS (CASE WHEN enabled=1 AND is_head_teacher=1 THEN CONCAT(grade,':',class_no) ELSE NULL END) STORED;

ALTER TABLE `teacher_teaching_assignment` ADD UNIQUE INDEX `uk_v2_head` (school_id,term_id,active_head_class);

ALTER TABLE `evaluation_source_record` ADD UNIQUE INDEX `uk_v2_effect` (school_id,effect_key);

ALTER TABLE `evaluation_source_record` ADD INDEX `idx_v2_event` (school_id,term_id,event_type,status,student_id,effective_at);

ALTER TABLE `evaluation_source_record` ADD INDEX `idx_v2_process` (school_id,term_id,dimension_code,subject_code,student_id,status);

ALTER TABLE `evaluation_source_record` ADD CONSTRAINT `fk_v2_current` FOREIGN KEY (school_id,current_version_id) REFERENCES evaluation_source_record(school_id,id) ON DELETE RESTRICT;

ALTER TABLE `student_term_evaluation` ADD CONSTRAINT `ck_v2_stars` CHECK ((`conduct_process_star` IS NULL OR `conduct_process_star` BETWEEN 1 AND 3) AND (`information_technology_interest_star` IS NULL OR `information_technology_interest_star` BETWEEN 1 AND 3) AND (`information_technology_habit_star` IS NULL OR `information_technology_habit_star` BETWEEN 1 AND 3) AND (`information_technology_method_star` IS NULL OR `information_technology_method_star` BETWEEN 1 AND 3) AND (`information_technology_process_star` IS NULL OR `information_technology_process_star` BETWEEN 1 AND 3) AND (`labor_process_star` IS NULL OR `labor_process_star` BETWEEN 1 AND 3) AND (`integrated_practice_process_star` IS NULL OR `integrated_practice_process_star` BETWEEN 1 AND 3) AND (`local_course_process_star` IS NULL OR `local_course_process_star` BETWEEN 1 AND 3) AND (`story_write_star` IS NULL OR `story_write_star` BETWEEN 1 AND 3));

ALTER TABLE `academic_year` ADD CONSTRAINT `ck_v2_phase` CHECK (business_phase IN ('COLLECTING','RECONCILING','FROZEN','ARCHIVED'));

CREATE TABLE story_content (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 school_id BIGINT UNSIGNED NOT NULL,
 kind ENUM('BUILTIN','CLASSIC') NOT NULL,
 stable_code VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 title VARCHAR(200) NOT NULL,
 text_ref VARCHAR(512) NULL,
 text_content MEDIUMTEXT NULL,
 audio_ref VARCHAR(512) NULL,
 audio_duration_ms INT UNSIGNED NULL,
 asset_hashes JSON NOT NULL,
 suitable_grades JSON NULL,
 origin_record_id BIGINT UNSIGNED NULL,
 origin_version INT UNSIGNED NULL,
 display_author VARCHAR(100) NULL,
 display_class VARCHAR(100) NULL,
 authorization_ref VARCHAR(255) NULL,
 status ENUM('DRAFT','REVIEWED','PUBLISHED','WITHDRAWN') NOT NULL DEFAULT 'DRAFT',
 featured_term_id BIGINT UNSIGNED NULL,
 published_at DATETIME(6) NULL,
 withdrawn_at DATETIME(6) NULL,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id),
 UNIQUE KEY uk_story_school(school_id,id),
 UNIQUE KEY uk_story_version(school_id,kind,stable_code,version),
 UNIQUE KEY uk_story_origin(school_id,origin_record_id,origin_version),
 KEY idx_story_display(school_id,kind,status,featured_term_id),
 CONSTRAINT fk_story_origin FOREIGN KEY(school_id,origin_record_id) REFERENCES evaluation_source_record(school_id,id) ON DELETE RESTRICT,
 CONSTRAINT fk_story_featured FOREIGN KEY(school_id,featured_term_id) REFERENCES academic_year(school_id,id) ON DELETE RESTRICT,
 CONSTRAINT ck_story_assets CHECK(JSON_TYPE(asset_hashes)='OBJECT'),
 CONSTRAINT ck_story_builtin CHECK(kind<>'BUILTIN' OR (audio_ref IS NOT NULL AND audio_duration_ms>0 AND (text_ref IS NOT NULL OR text_content IS NOT NULL))),
 CONSTRAINT ck_story_classic CHECK(kind<>'CLASSIC' OR (origin_record_id IS NOT NULL AND origin_version IS NOT NULL)),
 CONSTRAINT ck_story_public CHECK(status<>'PUBLISHED' OR (published_at IS NOT NULL AND (kind='BUILTIN' OR authorization_ref IS NOT NULL)))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `evaluation_source_record` ADD CONSTRAINT `fk_v2_story` FOREIGN KEY (school_id,story_content_id) REFERENCES story_content(school_id,id) ON DELETE RESTRICT;

ALTER TABLE term_report MODIFY schema_version ENUM('LEGACY_V1','CORE_V1','CORE_V2') NOT NULL;

ALTER TABLE evaluation_source_record DROP CHECK ck_source_status, ADD CONSTRAINT ck_source_status CHECK (status IN ('DRAFT','PREVIEW','SUBMITTED','UNUSED','USED','QUEUED','PROCESSING','SCORED','CONFIRMED','APPROVED','REJECTED','FAILED','REVOKED','SUPERSEDED','VOID','EXPIRED','CANCELLED','CLOSED','COMMITTED','OPEN','COMPLETED','REVIEW_REQUIRED'));
