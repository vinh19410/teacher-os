---
phase: 4
title: "Coi lesson.status = holiday là buổi không diễn ra ở mọi nơi đọc"
status: pending
priority: P1
effort: "3h"
dependencies: ["phase-01"]
---

# Phase 4: Các nơi đọc `lesson.status`

## Goal

Buổi `holiday` không hiện như buổi cần dạy, cần điểm danh hay buổi sắp tới; hiển thị nhãn "Nghỉ lễ — Đã dời lịch". Không đổi hành vi của `cancelled`.

## Files to Modify (theo grep `"upcoming"|"cancelled"` ngày 2026-10-26)

| File | Việc cần làm |
|---|---|
| `apps/server/src/routes/kernel.ts` | Check-in/cancel/edit/attendance đã chặn mọi status khác `upcoming` → `holiday` tự bị 409. Rà `ne(lesson.status, "cancelled")` ở PUT attendance (`:1137`, `:1178`, `:1194`): thêm `holiday` để roster guard không đếm dòng nghỉ. Thống kê `:714` không đổi. |
| `apps/server/src/routes/dashboard-reminders.ts` | Chỉ đếm `upcoming` → không đổi, thêm test xác nhận buổi `holiday` không thành nhắc việc. |
| `apps/server/src/routes/student-class.ts`, `snapshot.ts` | Chỉ chiếu `status` → kiểm tra không lọc mất dòng `holiday` (cổng học viên cần thấy buổi nghỉ). |
| `apps/web/src/lib/class-sessions.ts` | Rollup (`:361`, `:387`, `:619`, `:699`, `:782`): `holiday` đếm như "không diễn ra", có bộ đếm riêng `holiday` để hiển thị nhãn. |
| `apps/web/src/lib/schedule-week.ts` | `:89` thêm trạng thái tổng `holiday` khi mọi dòng là `holiday`; `:228` không chiếm slot; `:251` không đổi. |
| `apps/web/src/lib/dashboard-from-kernel.ts` | `:16`, `:93` bỏ `holiday` như `cancelled`. |
| `apps/web/src/components/schedule/class-session-modal.tsx`, `lesson-modal.tsx`, `class-detail/class-sessions-section.tsx`, `session-attendance-modal.tsx` | Nhãn "Nghỉ lễ — Đã dời lịch" (Badge tone `warn`), ẩn CTA điểm danh/huỷ/sửa. |
| `apps/web/src/lib/data-store-reducer.ts`, `apps/web/src/lib/mock-data.ts` | Kiểu `LessonStatus` thêm `holiday`. |
| `apps/student/src/components/class/class-lesson-list.tsx` | `:180` hiển thị "Nghỉ lễ — Đã dời lịch" cho `holiday`; `:56`, `:72` chỉ lấy `upcoming` nên buổi bù tự hiện là buổi sắp tới. |
| `apps/server/src/backfill-dump.ts`, `packages/api/src/skeleton.ts:245` | Chỉ áp cho lớp `date IS NULL`; thêm comment `holiday` không xuất hiện ở lớp legacy, không đổi logic. |

Nhãn text dùng chung: thêm `LESSON_STATUS_LABEL` (hoặc mở rộng map nhãn hiện có nếu đã tồn tại) trong `packages/api/src/contracts.ts` để web và student cùng đọc.

## Tasks & Steps

1. Grep lại `status ===`, `status !==`, `eq(lesson.status`, `ne(lesson.status` trên `apps/` và `packages/` để chắc bảng trên đủ.
2. Với mỗi file, viết/cập nhật test đơn vị trước (fixture có dòng `holiday`), rồi sửa.
3. Cập nhật `class-sessions.test.ts`, `schedule-week.test.ts`, `dashboard-from-kernel.test.ts`; tạo `apps/student/src/components/class/class-lesson-list.test.tsx` (chưa có).

## Verification

- `pnpm --filter web test -- class-sessions schedule-week dashboard-from-kernel`
- `pnpm --filter student test -- class-lesson-list`
- `pnpm --filter server test -- dashboard-reminders kernel`
- `pnpm check`, `pnpm check-types`
