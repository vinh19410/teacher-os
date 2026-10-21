PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- #378 phase 10: quiz_attempt mở luồng tự luyện (assignment_id nullable +
-- test_id + mode) và thêm CHECK ràng buộc logic mode. Rebuild bảng bằng tay:
-- drizzle-kit sinh SELECT cột mới từ bảng cũ (không tồn tại → lỗi runtime),
-- còn DROP TABLE trên D1 (foreign_keys luôn ON, PRAGMA là no-op) sẽ cascade
-- xoá sạch quiz_attempt_annotation qua FK attempt_id — backup + restore
-- bằng INSERT OR IGNORE ở dưới chống mất dữ liệu chấm bài trong cả hai môi
-- trường (libsql tôn trọng PRAGMA thì restore bị ignore, không trùng lặp).
CREATE TABLE `__new_quiz_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`assignment_id` text,
	`student_id` text NOT NULL,
	`test_id` text,
	`mode` text DEFAULT 'assignment' NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`questions_snapshot` text NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`essay` text DEFAULT '' NOT NULL,
	`media_key` text,
	`media_name` text,
	`media_type` text,
	`media_size` integer,
	`media_uploaded_at` integer,
	`correct_count` integer,
	`grade_scores` text,
	`grade_feedback` text DEFAULT '' NOT NULL,
	`graded_at` integer,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`submitted_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `class_assignment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_id`) REFERENCES `assignment_test`(`id`) ON UPDATE no action ON DELETE set null,
	-- Tên cột KHÔNG định tính bảng: sau RENAME vẫn đúng thứ bảng hiện tại.
	CONSTRAINT "quiz_attempt_mode_assignment_link" CHECK("mode" <> 'assignment' or "assignment_id" is not null),
	CONSTRAINT "quiz_attempt_mode_practice_link" CHECK("mode" <> 'practice' or "test_id" is not null)
);--> statement-breakpoint
-- Dữ liệu cũ: test_id/mode chưa tồn tại trên bảng cũ → NULL + 'assignment'.
INSERT INTO `__new_quiz_attempt`("id", "org_id", "assignment_id", "student_id", "test_id", "mode", "status", "questions_snapshot", "answers", "essay", "media_key", "media_name", "media_type", "media_size", "media_uploaded_at", "correct_count", "grade_scores", "grade_feedback", "graded_at", "started_at", "submitted_at") SELECT "id", "org_id", "assignment_id", "student_id", NULL, 'assignment', "status", "questions_snapshot", "answers", "essay", "media_key", "media_name", "media_type", "media_size", "media_uploaded_at", "correct_count", "grade_scores", "grade_feedback", "graded_at", "started_at", "submitted_at" FROM `quiz_attempt`;--> statement-breakpoint
-- Backup annotation TRƯỚC DROP: nếu FK ON (D1) thì DROP cascade xoá sạch.
CREATE TABLE `quiz_attempt_annotation_mig_backup` AS SELECT * FROM `quiz_attempt_annotation`;--> statement-breakpoint
DROP TABLE `quiz_attempt`;--> statement-breakpoint
ALTER TABLE `__new_quiz_attempt` RENAME TO `quiz_attempt`;--> statement-breakpoint
-- Restore (OR IGNORE: bản chưa bị xoá thì trùng PK và được giữ nguyên).
INSERT OR IGNORE INTO `quiz_attempt_annotation` SELECT * FROM `quiz_attempt_annotation_mig_backup`;--> statement-breakpoint
DROP TABLE `quiz_attempt_annotation_mig_backup`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempt_assignment_student_uq` ON `quiz_attempt` (`assignment_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `quiz_attempt_org_idx` ON `quiz_attempt` (`org_id`);--> statement-breakpoint
CREATE INDEX `quiz_attempt_student_mode_idx` ON `quiz_attempt` (`org_id`,`student_id`,`mode`,`submitted_at`);