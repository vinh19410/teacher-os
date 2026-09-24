-- Blank email ở row trùng (giữ row created_at, id cũ nhất) — non-destructive.
-- Tie-break id UUID là arbitrary khi created_at trùng ms: chấp nhận vì legacy
-- dupes vốn fail-closed (không ai login được) và cả 2 row vẫn hiện trong
-- danh sách admin để đối soát tay (red-team #12).
UPDATE student SET email = ''
 WHERE id IN (
   SELECT id FROM (
     SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(trim(email)) ORDER BY created_at, id) AS rn
     FROM student WHERE trim(email) != ''
   ) WHERE rn > 1
 );
--> statement-breakpoint
-- Normalize email còn lại về lower(trim) khớp expression index + luật tra cứu bridge
UPDATE student SET email = lower(trim(email)) WHERE trim(email) != '';
--> statement-breakpoint
CREATE UNIQUE INDEX `student_email_uq` ON `student` (lower(trim("email"))) WHERE trim("student"."email") != '';