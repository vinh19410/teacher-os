-- Phase-02 option bank (assignment_prompt.option_bank).
-- DEPLOY ORDER (bắt buộc): chạy `db:migrate:deploy` TRƯỚC khi deploy worker —
-- worker mới insert `option_bank` vào DB chưa có cột sẽ 500 mọi lần tạo đề.
-- Rollback an toàn sau khi migration đã chạy: cột có DEFAULT '[]', code cũ
-- không đụng tới cột này.
ALTER TABLE `assignment_prompt` ADD `option_bank` text DEFAULT '[]' NOT NULL;
