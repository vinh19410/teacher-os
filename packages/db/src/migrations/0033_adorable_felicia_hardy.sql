-- Điểm giáo viên chấm bài Writing/Speaking (quiz_attempt.grade_*).
-- DEPLOY ORDER (bắt buộc): chạy `db:migrate:deploy` TRƯỚC khi deploy worker —
-- snapshot giáo viên và summary học viên select cột grade_*, thiếu cột thì
-- mọi trang giáo viên và màn kết quả học viên trả 500 (/readyz không kiểm cột).
ALTER TABLE `quiz_attempt` ADD `grade_scores` text;--> statement-breakpoint
ALTER TABLE `quiz_attempt` ADD `grade_feedback` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_attempt` ADD `graded_at` integer;