-- Custom SQL migration file, put your code below! --
-- Chữa con trỏ lớp ↔ giáo trình: syllabus.class_id là nguồn sự thật. Lớp có bản copy cùng org
-- mà con trỏ null hoặc trỏ chỗ khác thì trỏ về copy. Không xoá dòng nào; con trỏ mồ côi
-- (không có copy) được giữ nguyên vì code mới không đọc con trỏ để tìm giáo trình.
UPDATE `class` SET `syllabus_id` = (
  SELECT s.`id` FROM `syllabus` s WHERE s.`class_id` = `class`.`id` AND s.`org_id` = `class`.`org_id`
)
WHERE EXISTS (
  SELECT 1 FROM `syllabus` s WHERE s.`class_id` = `class`.`id` AND s.`org_id` = `class`.`org_id`
)
AND (`syllabus_id` IS NULL OR `syllabus_id` <> (
  SELECT s.`id` FROM `syllabus` s WHERE s.`class_id` = `class`.`id` AND s.`org_id` = `class`.`org_id`
));
