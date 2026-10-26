-- 按主教学科自动月配卡。增量字段由 backend/migrations/20261026_subject_cards.js 检查后添加。
CREATE TABLE IF NOT EXISTS card_subject (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT UNSIGNED NOT NULL,
  subject_code VARCHAR(30) NOT NULL,
  subject_name VARCHAR(60) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_card_subject_code (school_id, subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS teacher_subject (
  school_id BIGINT UNSIGNED NOT NULL,
  teacher_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (school_id, teacher_id, subject_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES card_subject(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subject_card_policy (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  effective_month VARCHAR(7) NOT NULL,
  monthly_total INT UNSIGNED NOT NULL,
  ratios_bps_json JSON NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_subject_policy_version (subject_id, version),
  KEY idx_subject_policy_effective (school_id, subject_id, effective_month, version),
  FOREIGN KEY (subject_id) REFERENCES card_subject(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS card_allocation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT UNSIGNED NOT NULL,
  teacher_id BIGINT UNSIGNED NOT NULL,
  month_key VARCHAR(7) NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  policy_version_id BIGINT UNSIGNED NOT NULL,
  teacher_name VARCHAR(64) NOT NULL,
  subject_name VARCHAR(60) NOT NULL,
  monthly_total INT UNSIGNED NOT NULL,
  counts_json JSON NOT NULL,
  category_version VARCHAR(30) NOT NULL DEFAULT 'V1',
  valid_from DATETIME NOT NULL,
  valid_until DATETIME NOT NULL,
  review_deadline_at DATETIME NOT NULL,
  status ENUM('GENERATING','READY','FAILED') NOT NULL DEFAULT 'GENERATING',
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_card_allocation_month (school_id,teacher_id,month_key),
  KEY idx_card_allocation_subject (school_id,subject_id,month_key),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (term_id) REFERENCES academic_year(id),
  FOREIGN KEY (subject_id) REFERENCES card_subject(id),
  FOREIGN KEY (policy_version_id) REFERENCES subject_card_policy(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS card_generation_issue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT UNSIGNED NOT NULL,
  teacher_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  month_key VARCHAR(7) NOT NULL,
  reason_code VARCHAR(40) NOT NULL,
  reason_message VARCHAR(500) NOT NULL,
  resolved TINYINT NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_card_issue (school_id,month_key,teacher_id,reason_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS card_print_pack (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT UNSIGNED NOT NULL,
  month_key VARCHAR(7) NOT NULL,
  manifest_json JSON NOT NULL,
  issues_json JSON NOT NULL,
  manifest_hash CHAR(64) NOT NULL,
  template_version VARCHAR(20) NOT NULL DEFAULT 'V1',
  status ENUM('PENDING','READY','FAILED') NOT NULL DEFAULT 'PENDING',
  file_path VARCHAR(500) NULL,
  file_sha256 CHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_card_print_manifest (school_id,month_key,manifest_hash,template_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
