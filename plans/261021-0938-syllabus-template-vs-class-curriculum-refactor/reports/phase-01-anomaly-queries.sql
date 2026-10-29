-- Truy vấn đo dữ liệu lệch con trỏ lớp ↔ giáo trình (chỉ SELECT, an toàn chạy trên staging và prod).
-- Cách chạy (user thực hiện, agent không chạy):
--   wrangler d1 execute <staging-name> --remote --json --command "<SQL>"
--   rồi lặp lại với `teacher-os-db` (prod) sau khi staging đã chạy được.
-- Tên staging lấy trong docs/production-release-runbook.md mục Provision staging.
-- Q1a lớp có con trỏ mồ côi (id không tồn tại trong syllabus)
SELECT COUNT(*) AS q1a FROM class c WHERE c.syllabus_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM syllabus s WHERE s.id = c.syllabus_id);
-- Q1b lớp có con trỏ trỏ sang syllabus của org khác (tham chiếu chéo tenant, chặn xoá do FK)
SELECT COUNT(*) AS q1b FROM class c JOIN syllabus s ON s.id = c.syllabus_id WHERE s.org_id <> c.org_id;
-- Q1c lớp có con trỏ trỏ vào syllabus cùng org nhưng không phải bản copy của chính nó
SELECT COUNT(*) AS q1c FROM class c JOIN syllabus s ON s.id = c.syllabus_id WHERE s.org_id = c.org_id AND (s.class_id IS NULL OR s.class_id <> c.id);
-- Q2 lớp có bản copy nhưng con trỏ null hoặc khác copy
SELECT COUNT(*) AS q2 FROM class c JOIN syllabus s ON s.class_id = c.id AND s.org_id = c.org_id WHERE c.syllabus_id IS NULL OR c.syllabus_id <> s.id;
-- Q3 bản copy có class_id không khớp lớp nào cùng org
SELECT COUNT(*) AS q3 FROM syllabus s WHERE s.class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM class c WHERE c.id = s.class_id AND c.org_id = s.org_id);
-- Q4 bản copy mất nguồn template (source_template_id null)
SELECT COUNT(*) AS q4 FROM syllabus WHERE class_id IS NOT NULL AND source_template_id IS NULL;
-- Q5 tổng quan
SELECT (SELECT COUNT(*) FROM class) AS classes, (SELECT COUNT(*) FROM syllabus WHERE class_id IS NULL) AS templates, (SELECT COUNT(*) FROM syllabus WHERE class_id IS NOT NULL) AS copies;
-- Q6 kích thước cây lớn nhất (module + lesson) của một syllabus, để đối chiếu MAX_IMPORT_NODES = 500
SELECT MAX(n) AS q6 FROM (SELECT s.id, (SELECT COUNT(*) FROM syllabus_module m WHERE m.syllabus_id = s.id) + (SELECT COUNT(*) FROM syllabus_lesson l JOIN syllabus_module m2 ON m2.id = l.module_id WHERE m2.syllabus_id = s.id) AS n FROM syllabus s);
