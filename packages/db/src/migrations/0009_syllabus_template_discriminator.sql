ALTER TABLE `syllabus` ADD `class_id` text;--> statement-breakpoint
-- Logical FK: SQLite cannot ALTER TABLE ADD a table-level FK; source_template_id
-- provenance is enforced by the import handler (templates only, class_id IS NULL).
ALTER TABLE `syllabus` ADD `source_template_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `syllabus_class_unique` ON `syllabus` (`class_id`) WHERE class_id IS NOT NULL;--> statement-breakpoint
-- ===== Backfill copy-on-import (issue #79, plan 260825-1915 phase 2) =====
-- Mỗi class có pointer cùng org nhận một deep copy riêng (preserve status/position);
-- cây template gốc reset 'upcoming'. Idempotent mọi điểm ngắt: mọi copy resolve
-- qua (source_template_id, org) KHÔNG qua class pointer, guard NOT EXISTS theo
-- (copy syllabus, position) — position là khóa duy nhất per syllabus/module do
-- runtime gán max+1. Replay sau partial-fail tự heal; không cần helper table.
INSERT INTO `syllabus` (`id`, `org_id`, `name`, `level`, `type`, `skills`, `description`, `total_lessons`, `created_at`, `class_id`, `source_template_id`)
SELECT printf('%s-%s-%s-%s-%s', lower(hex(randomblob(4))), lower(hex(randomblob(2))), lower(hex(randomblob(2))), lower(hex(randomblob(2))), lower(hex(randomblob(6)))), s.`org_id`, s.`name`, s.`level`, s.`type`, s.`skills`, s.`description`, s.`total_lessons`, s.`created_at`, c.`id`, s.`id`
FROM `class` c
JOIN `syllabus` s ON s.`id` = c.`syllabus_id` AND s.`org_id` = c.`org_id` AND s.`class_id` IS NULL
WHERE c.`syllabus_id` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `syllabus` s2 WHERE s2.`class_id` = c.`id`);--> statement-breakpoint
-- copy modules (position preserve)
INSERT INTO `syllabus_module` (`id`, `org_id`, `syllabus_id`, `title`, `description`, `position`, `created_at`)
SELECT printf('%s-%s-%s-%s-%s', lower(hex(randomblob(4))), lower(hex(randomblob(2))), lower(hex(randomblob(2))), lower(hex(randomblob(2))), lower(hex(randomblob(6)))), m.`org_id`, s2.`id`, m.`title`, m.`description`, m.`position`, m.`created_at`
FROM `syllabus_module` m
JOIN `syllabus` s1 ON s1.`id` = m.`syllabus_id`
JOIN `syllabus` s2 ON s2.`source_template_id` = s1.`id` AND s2.`org_id` = s1.`org_id` AND s2.`class_id` IS NOT NULL
WHERE NOT EXISTS (SELECT 1 FROM `syllabus_module` m2 WHERE m2.`syllabus_id` = s2.`id` AND m2.`position` = m.`position`);--> statement-breakpoint
-- copy lessons — PRESERVE status (tiến độ hiện có của lớp); module copy resolve theo (copy syllabus, position)
INSERT INTO `syllabus_lesson` (`id`, `org_id`, `module_id`, `title`, `objectives`, `materials`, `status`, `position`, `created_at`)
SELECT printf('%s-%s-%s-%s-%s', lower(hex(randomblob(4))), lower(hex(randomblob(2))), lower(hex(randomblob(2))), lower(hex(randomblob(2))), lower(hex(randomblob(6)))), l.`org_id`, cm.`id`, l.`title`, l.`objectives`, l.`materials`, l.`status`, l.`position`, l.`created_at`
FROM `syllabus_lesson` l
JOIN `syllabus_module` m ON m.`id` = l.`module_id`
JOIN `syllabus` s1 ON s1.`id` = m.`syllabus_id`
JOIN `syllabus` s2 ON s2.`source_template_id` = s1.`id` AND s2.`org_id` = s1.`org_id` AND s2.`class_id` IS NOT NULL
JOIN `syllabus_module` cm ON cm.`syllabus_id` = s2.`id` AND cm.`position` = m.`position`
WHERE NOT EXISTS (SELECT 1 FROM `syllabus_lesson` l2 WHERE l2.`module_id` = cm.`id` AND l2.`position` = l.`position`);--> statement-breakpoint
-- reset status cây template gốc → upcoming (status là tiến độ lớp, không phải nội dung template — D2.3)
UPDATE `syllabus_lesson` SET `status` = 'upcoming'
WHERE `module_id` IN (SELECT `id` FROM `syllabus_module` WHERE `syllabus_id` IN (SELECT `id` FROM `syllabus` WHERE `class_id` IS NULL));--> statement-breakpoint
-- pointer trỏ copy — CHỈ class có copy tương ứng (không NULL hóa pointer mồ côi/lệch org)
UPDATE `class` SET `syllabus_id` = (
  SELECT s2.`id` FROM `syllabus` s2 WHERE s2.`class_id` = `class`.`id` AND s2.`source_template_id` = `class`.`syllabus_id`
) WHERE `syllabus_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `syllabus` s3 WHERE s3.`class_id` = `class`.`id` AND s3.`source_template_id` = `class`.`syllabus_id`);
