---
title: "Phase 1: Migration user.role + backfill phân loại tài khoản hiện hữu"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Migration `user.role` + backfill phân loại tài khoản hiện hữu

## Goal

Thêm cột `role` (`"teacher"` | `"student"`) vào bảng `user` kèm migration 0024 backfill toàn bộ user hiện hữu theo quy tắc phân loại tất định, sao cho **không user teacher nào bị khoá** và **không user nào tự nhận workspace teacher mới sau khi plan sống**.

## Context Links

- [researcher-better-auth-hooks.md](./reports/researcher-better-auth-hooks.md) — cơ chế hook better-auth 1.6 (Phase 2 phụ thuộc)
- [reports/scout-report.md](./reports/scout-report.md) — hiện trạng auth/role
- Plan nền `260923-0758-students-from-portal-registration` — provisioning portal + unique index `student_email_uq`
- `apps/server/src/student-email-unique-migration.test.ts` — pattern test migration áp dụng file SQL thật

## Key Insights

- Bảng `user` (`packages/db/src/schema/auth.ts:4-19`) hiện **không có** khái niệm role; role duy nhất từng tồn tại là `membership.role` (org-scoped, default `"teacher"`, `packages/db/src/schema/membership.ts:22`).
- `bootstrapMiddleware` (`apps/server/src/app.ts:69-82`) hôm nay tự cấp org + membership `teacher` cho **mọi** user đã login chưa có membership → học viên portal đăng ký xong mở teacher app là có workspace. Đây là lỗ hổng plan này vá.
- **Membership là dữ liệu BỊ LỖ HỎNG NÀY làm bẩn**: nhóm user có VỪA membership VỪA khớp student row gồm cả (a) giáo viên chủ từng test portal (membership sinh trước — muốn giữ teacher) và (b) học viên từng mở nhầm `app.<domain>` (student row sinh trước — muốn về student). Vì vậy backfill dùng luật **"nguồn sử dụng ĐẦU TIÊN thắng"** theo `created_at`, kèm audit trước deploy + runbook flip sau deploy (Red-team Critical #1/#2, user chốt 2026-09-24).
- Quy ước "persist-vs-derive" (`docs/code-standards.md`): role là fact được viết bởi hành động user "đăng ký tại app X" → cột thật + docblock, không derive lúc render.

## Requirements

- Cột `user.role`: `text`, `DEFAULT 'student'` (least-privilege: sign-up rơi vào cửa sổ deploy thiếu hook cũng mặc định student, không bao giờ tự nhận teacher) + docblock. Backfill 4 bước cố định thứ tự:
  1. Chỉ có membership (không student row) → `'teacher'`.
  2. Có CẢ membership và student row (nhóm overlap do lỗ hổng cũ): membership `created_at` **sớm hơn** student row sớm nhất (hoặc trầy thời điểm — tie) → `'teacher'`; student row sớm hơn membership → `'student'` (nguồn dùng đầu tiên thắng).
  3. Chỉ có student row khớp `lower(trim(email))` (cùng luật với bridge/provisioning, index `student_email_uq`) → `'student'`.
  4. Còn NULL (chưa từng dùng app nào) → `'student'`.
- Server-side đối xử NULL như `"teacher"` (phòng thủ cho row ngoài luồng, không phải đường chính).
- Migration chạy được cả D1 (prod) lẫn libsql (test/e2e) — SQL thuần.
- **Audit bắt buộc TRƯỚC deploy** (runbook): đếm + liệt kê nhóm overlap để operator biết chính xác ai bị phân loại thế nào; **runbook sau deploy**: SQL flip cho trường hợp heuristic sai (hiếm).

## Files to Create / Modify

- Modify: `packages/db/src/schema/auth.ts` — thêm cột `role` + docblock vào bảng `user`.
- Create: `packages/db/src/migrations/0024_<auto>.sql` — do `drizzle-kit generate` sinh (ALTER TABLE) rồi append 3 statement backfill bằng `--> statement-breakpoint` (đúng pattern 0023).
- Modify: `packages/db/src/migrations/meta/_journal.json` + `meta/0024_snapshot.json` — do drizzle-kit sinh, không tay.
- Create: `apps/server/src/user-role-backfill-migration.test.ts` — test migration theo pattern `student-email-unique-migration.test.ts`.

## Implementation Steps

1. Sửa `packages/db/src/schema/auth.ts`: thêm vào bảng `user`:
   ```ts
   /**
    * Auth app-role: "teacher" (teacher app) | "student" (student portal).
    * Gán MỘT LẦN lúc tạo tài khoản theo app nguồn của request sign-up
    * (origin classification, Phase 2). Default "student" = least privilege
    * cho row sinh ngoài luồng hook; legacy được backfill theo
    * "nguồn sử dụng đầu tiên thắng" (migration 0024). Không client API nào
    * được ghi (better-auth additionalFields input:false).
    */
   role: text("role").default("student"),
   ```
2. Chạy `pnpm --filter @teacher-os/db exec drizzle-kit generate` → sinh `0024_*.sql` (ALTER TABLE `user` ADD `role` text DEFAULT 'student') + snapshot + journal.
3. Append vào `0024_*.sql` (mỗi khối cách nhau `--> statement-breakpoint`), kèm comment giải thích luật "nguồn dùng đầu tiên thắng":
   ```sql
   -- Bước 1: chỉ có membership (chưa từng có hồ sơ học viên khớp email) → teacher
   UPDATE `user` SET `role` = 'teacher'
    WHERE `id` IN (SELECT `user_id` FROM `membership`)
      AND `id` NOT IN (
        SELECT u.`id` FROM `user` u
        WHERE trim(u.`email`) != ''
          AND EXISTS (SELECT 1 FROM `student` s
                       WHERE lower(trim(s.`email`)) = lower(trim(u.`email`)))
      );
   --> statement-breakpoint
   -- Bước 2 (overlap do lỗ hổng cũ): membership sinh TRƯỚC (hoặc cùng lúc với)
   -- student row sớm nhất → teacher. Giáo viên dùng app trước rồi mới test portal.
   UPDATE `user` SET `role` = 'teacher'
    WHERE `role` IS NULL AND trim(`email`) != ''
      AND EXISTS (SELECT 1 FROM `student` s
                   WHERE lower(trim(s.`email`)) = lower(trim(`user`.`email`)))
      AND `id` IN (SELECT `user_id` FROM `membership`)
      AND (SELECT MIN(m2.`created_at`) FROM `membership` m2
            WHERE m2.`user_id` = `user`.`id`)
          <= (SELECT MIN(s2.`created_at`) FROM `student` s2
               WHERE lower(trim(s2.`email`)) = lower(trim(`user`.`email`)));
   --> statement-breakpoint
   -- Bước 3: còn lại mà có student row → student
   -- (overlap: student row sinh trước membership — học viên đăng ký portal
   -- trước, mở nhầm teacher app sau; và user chỉ có student row)
   UPDATE `user` SET `role` = 'student'
    WHERE `role` IS NULL AND trim(`email`) != ''
      AND `id` IN (
        SELECT u.`id` FROM `user` u
        WHERE EXISTS (SELECT 1 FROM `student` s
                       WHERE lower(trim(s.`email`)) = lower(trim(u.`email`)))
      );
   --> statement-breakpoint
   -- Bước 4: chưa từng dùng app nào → student (least privilege)
   UPDATE `user` SET `role` = 'student' WHERE `role` IS NULL;
   ```
4. Viết `apps/server/src/user-role-backfill-migration.test.ts` (libsql in-memory, apply toàn bộ migrations thật) seed trực tiếp, 6 case:
   - Chỉ membership → `'teacher'`.
   - Overlap membership sinh trước student row → `'teacher'` (giáo viên chủ test portal).
   - Overlap student row sinh trước membership → `'student'` (học viên mở nhầm teacher app).
   - Overlap trầy `created_at` (cùng ms) → `'teacher'` (tie-break tất định).
   - Chỉ student row / không dấu vết → `'student'`.
   - Sau migration: `SELECT count(*) FROM user WHERE role IS NULL` = 0.
5. Runbook audit (ghi vào phase này, operator chạy trên prod TRƯỚC deploy):
   ```sql
   -- Nhóm overlap: ai, membership sinh khi nào, student row sinh khi nào
   SELECT u.id, u.email, u.role,
          (SELECT MIN(m.created_at) FROM membership m WHERE m.user_id = u.id) AS membership_at,
          (SELECT MIN(s.created_at) FROM student s WHERE lower(trim(s.email)) = lower(trim(u.email))) AS student_at
   FROM user u
   WHERE EXISTS (SELECT 1 FROM membership m WHERE m.user_id = u.id)
     AND EXISTS (SELECT 1 FROM student s WHERE lower(trim(s.email)) = lower(trim(u.email)) AND trim(u.email) != '');
   ```
   Sau deploy, nếu heuristic phân loại sai cá nhân nào: `UPDATE user SET role = '<đúng>' WHERE id = '<id>';` (kèm xoá org/membership rác nếu cần).
6. Chạy regression: `pnpm check`, `pnpm check-types`, `pnpm test`.

## Todo

- [ ] Thêm cột `role` (default `'student'`) + docblock vào `packages/db/src/schema/auth.ts`
- [ ] `drizzle-kit generate` → 0024 + snapshot + journal
- [ ] Append 4 statement backfill theo luật "nguồn dùng đầu tiên thắng"
- [ ] Test migration 6 case + assert 0 row NULL
- [ ] Runbook audit prod (query overlap) ghi trong phase
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test` xanh

## Success Criteria

- Migration 0024 apply sạch trên D1 lẫn libsql; backfill tất định, không mất/đổi row user nào ngoài cột `role`.
- Sau migration: 0 row `role IS NULL`; giáo viên hiện hữu (membership sinh trước student row hoặc không có student row) 100% giữ `'teacher'`; học viên overlap (student row sinh trước) được về `'student'`.
- Test migration xanh gồm cả 2 chiều overlap + tie-break.

## Risk Assessment

- **Heuristic `created_at` phân loại sai cá nhân** (ví dụ giáo viên mới đăng ký mà login portal trước cả teacher app): phát hiện qua audit query sau deploy; remediation = flip `role` tay theo runbook bước 5. Nhóm này nhỏ (portal mới sống < 1 ngày).
- **Cửa sổ deploy giữa Phase 1 và Phase 2** sinh user mới không qua hook: cột `DEFAULT 'student'` khiến họ rơi về student (least privilege) — không bao giờ tự nhận teacher; ràng buộc ship 1 release ở plan.md loại trừ cửa sổ này.
- **Ổn định thứ tự statement**: sai thứ tự sẽ misclassify — được khoá bằng test case overlap 2 chiều + tie-break.

## Security Considerations

- Không có secret/log nhạy cảm trong migration; SQL thuần, idempotent theo nghĩa chỉ chạy 1 lần bởi drizzle migrator.
