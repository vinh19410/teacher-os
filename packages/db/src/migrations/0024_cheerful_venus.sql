ALTER TABLE `user` ADD `role` text DEFAULT 'student';
--> statement-breakpoint
-- Backfill "nguồn sử dụng ĐẦU TIÊN thắng" (plan #260 D2): tài khoản dùng app nào
-- trước thì mang role app đó. SQLite ADD COLUMN ... DEFAULT 'student' điền
-- 'student' vào mọi row hiện hữu ngay trong statement đầu, nên backfill chỉ cần
-- GÁN 'teacher' cho nhóm dùng teacher app trước — tất cả row còn lại (student
-- row trước, chỉ student row, không dấu vết) giữ 'student' từ default.
-- Thứ tự statement là ràng buộc tất định — không đổi.
-- Bước 1 (overlap do lỗ hổng bootstrap cũ): có cả membership và student row,
-- membership sinh TRƯỚC (hoặc cùng lúc — tie-break) student row sớm nhất →
-- teacher. Giáo viên dùng app trước rồi mới test portal.
UPDATE `user` SET `role` = 'teacher'
 WHERE trim(`email`) != ''
   AND `id` IN (SELECT `user_id` FROM `membership`)
   AND EXISTS (SELECT 1 FROM `student` s
                WHERE lower(trim(s.`email`)) = lower(trim(`user`.`email`)))
   AND (SELECT MIN(m2.`created_at`) FROM `membership` m2
         WHERE m2.`user_id` = `user`.`id`)
       <= (SELECT MIN(s2.`created_at`) FROM `student` s2
            WHERE lower(trim(s2.`email`)) = lower(trim(`user`.`email`)));
--> statement-breakpoint
-- Bước 2: chỉ có membership (chưa từng có hồ sơ học viên khớp email) → teacher
UPDATE `user` SET `role` = 'teacher'
 WHERE `id` IN (SELECT `user_id` FROM `membership`)
   AND `id` NOT IN (
     SELECT u.`id` FROM `user` u
     WHERE trim(u.`email`) != ''
       AND EXISTS (SELECT 1 FROM `student` s
                    WHERE lower(trim(s.`email`)) = lower(trim(u.`email`)))
   );
