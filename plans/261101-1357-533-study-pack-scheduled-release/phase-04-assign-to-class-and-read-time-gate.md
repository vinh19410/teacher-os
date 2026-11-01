---
phase: 4
title: "Phase 4: Gán vào lớp, lọc lúc đọc, gỡ cron #526"
status: pending
priority: P1
effort: "4h"
dependencies: [1, 3]
---

# Phase 4: Gán vào lớp, lọc lúc đọc, gỡ cron #526

## Goal

Gán bộ đề vào lớp tạo sẵn toàn bộ bài kèm `available_at`; mọi đường đọc phía học viên lọc theo `now`; gỡ hoàn toàn cron và module plan #526.

## Files (đã xác minh tồn tại, trừ file tạo mới)

- Create: `apps/server/src/lib/study-pack-assign.ts` (+ test), `apps/server/src/lib/assignment-visibility.ts` (helper `visibleAssignmentFilter(now)`)
- Modify (lọc lúc đọc): `apps/server/src/routes/student-class.ts` (`loadClassAssignmentItems`), `apps/server/src/routes/student.ts` (GET quiz ~1167, start/submit ~1299, ~1824, ~1851), `apps/server/src/routes/student-history.ts` (~242), `apps/server/src/routes/dashboard-reminders.ts`
- Modify (cô lập phía giáo viên): `apps/server/src/routes/snapshot.ts` (3 truy vấn bài giao, danh sách học viên nhận bài và lượt nộp), `apps/server/src/routes/kernel.ts` (đếm trần 200) — đổi điều kiện `plan_item_id IS NULL` thành `class_study_pack_id IS NULL`
- Delete: `apps/server/src/lib/self-study-plan.ts` + test, `apps/server/src/routes/self-study-plan.ts` + test, `apps/e2e/specs/self-study-plan.spec.ts`, `apps/web/src/components/classes/self-study-plan-section.tsx` + test, `apps/web/src/lib/repos/self-study-plan.ts` (UI mới thay ở phase 5)
- Modify (gỡ cron): `apps/server/src/index.ts` (bỏ `scheduled`), `packages/infra/alchemy.run.ts` (bỏ `crons`), `apps/server/package.json` (export), `apps/e2e/src/boot.ts` (endpoint tick), `packages/api/src/contracts.ts` + `apps/web/src/routes/_auth/notifications/index.tsx` + `apps/server/src/lib/notifications/templates.ts` (`self_study_released`), `apps/server/src/routes/holidays.ts` & `kernel.ts` (chỉ phần #526 đã thêm — đọc diff `5b4bfba4` để gỡ đúng)

## Tasks

1. **Assign**: `POST /api/classes/:classId/study-packs` → kiểm quyền/org/lớp, pack `ready`; tính ngày theo lịch bỏ ngày nghỉ (tái dùng loader holiday của `holidays.ts`); gọi `materializePrompts` cho item thư viện; tạo `class_study_pack`, `class_assignment` (id tất định `ca_pk_<classPackId>_<itemId>`, `available_at` = `date` + `release_time` VN, `due_at` = `date` + `due_time`, `due` = ISO date) và các dòng nhận bài cho học viên `active` — chunk theo hằng `D1_*`, `onConflictDoNothing`, chạy lại an toàn.
2. **Huỷ**: `DELETE /api/classes/:classId/study-packs/:id` → `status='cancelled'`; xoá bài `available_at > now` chưa có attempt (cascade), giữ bài đã mở.
3. **Lọc lúc đọc**: một helper SQL duy nhất `available_at IS NULL OR available_at <= now`; áp ở **mọi** đường học viên nêu trên. Test truy cập trực tiếp bài chưa mở → 404 ở GET quiz, tạo attempt và nộp.
4. **Học viên vào lớp sau**: tìm luồng chuyển enrollment sang `active` (không phải `enrollment-activation.ts` — file đó sinh buổi học theo lịch nghỉ; scout `student-invitation` và `kernel.ts`), thêm bước idempotent tạo dòng nhận bài cho pack active có `due_at > now`.
5. **Gỡ #526**: xoá code/spec/endpoint/cron/thông báo nêu trên; `rg "self_study|selfStudy|plan_item|runSelfStudyPlanTick"` phải sạch; xoá `schema/self-study-plan.ts` và export tương ứng.
6. **Giữ nguyên**: cô lập snapshot và trần 200 vẫn đúng với bài pack (test hồi quy chuyển từ #526).

## Tests

Lịch + ngày nghỉ (bỏ ngày nghỉ, dịch ngày sau), assign 2 lần idempotent, lớp 0 học viên, học viên vào muộn, mốc `now` trước/đúng/sau `available_at` ở từng đường đọc (truyền `now` qua tham số, không phụ thuộc giờ máy), huỷ giữ bài đã mở, cô lập snapshot/200.

## Verify

`pnpm --filter server test`, `pnpm check-types`, `rg` sạch tham chiếu #526, `pnpm exec biome check .`.

## Risk / rollback

Bỏ sót một đường đọc = lộ bài sớm → kiểm kê bằng `rg "classAssignment\b" apps/server/src/routes` đối chiếu danh sách file ở trên. Rollback: revert PR (migration 0060 cần backup ở phase 1).
