-- Explicit V2 class registry upgrade. Apply through migrateAdminClasses.js only.
CREATE TABLE school_class (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 school_id BIGINT UNSIGNED NOT NULL,
 term_id BIGINT UNSIGNED NOT NULL,
 grade SMALLINT UNSIGNED NOT NULL,
 class_no SMALLINT UNSIGNED NOT NULL,
 display_name VARCHAR(100) NULL,
 responsible_teacher_id BIGINT UNSIGNED NULL,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 created_by BIGINT UNSIGNED NULL,
 updated_by BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id),
 UNIQUE KEY uk_class_school_id(school_id,id),
 UNIQUE KEY uk_class_identity(school_id,term_id,grade,class_no),
 CONSTRAINT fk_class_term FOREIGN KEY(school_id,term_id) REFERENCES academic_year(school_id,id) ON DELETE RESTRICT,
 CONSTRAINT fk_class_responsible FOREIGN KEY(school_id,responsible_teacher_id) REFERENCES users(school_id,id) ON DELETE RESTRICT,
 CONSTRAINT fk_class_created FOREIGN KEY(school_id,created_by) REFERENCES users(school_id,id) ON DELETE RESTRICT,
 CONSTRAINT fk_class_updated FOREIGN KEY(school_id,updated_by) REFERENCES users(school_id,id) ON DELETE RESTRICT,
 CONSTRAINT ck_class_identity CHECK(grade>0 AND class_no>0),
 CONSTRAINT ck_class_revision CHECK(revision>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
