---
phase: 4
title: "Coi lesson.status = holiday là buổi không diễn ra ở mọi nơi đọc"
status: completed
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
| `apps/server/src/routes/kernel.ts` | Check-in/cancel/attendance đã chặn mọi status khác `upcoming` → `holiday` tự bị 409. Rà `ne(lesson.status, "cancelled")` ở PUT attendance (`:1137`, `:1178`, `:1194`): thêm `holiday` để roster guard không đếm dòng nghỉ. Thống kê `:714` không đổi. **Edit route (C2 — red-team):** `POST /classes/:id/sessions/:date/edit` (`occurrenceUpdate(..., false)` `:986`) và `/lessons/:id/edit` (`:860-871`) hiện **không lọc trạng thái** → nhóm buổi có dòng `holiday` phải trả 409 `holiday-locked` (chặn `moveDate` buổi gốc đã dời); khi `moveDate` một nhóm là `makeupDate`, cùng batch cập nhật `UPDATE holiday_session_shift SET makeup_date=? WHERE class_id=? AND makeup_date=?` (giữ nhãn + D6 đúng). Test cho cả hai trường hợp. |
| `apps/server/src/routes/dashboard-reminders.ts` | Chỉ đếm `upcoming` → không đổi, thêm test xác nhận buổi `holiday` không thành nhắc việc. |
| `apps/server/src/routes/student-class.ts`, `snapshot.ts` | Chỉ chiếu `status` → kiểm tra không lọc mất dòng `holiday` (cổng học viên cần thấy buổi nghỉ). |
| `apps/web/src/lib/class-sessions.ts` | Rollup (`:361`, `:387`, `:619`, `:699`, `:782`): `holiday` đếm như "không diễn ra", có bộ đếm riêng `holiday` để hiển thị nhãn. **I4:** `buildClassSessionsV2` (`:320`) **không cấp `index` cho nhóm `holiday`** — nếu cấp, buổi nghỉ chiếm bài giáo trình, các buổi sau lệch 1, buổi bù mất bài; `sessionOrdinal` của planner dùng cùng định nghĩa index này để preview và tab Lịch học khớp. |
| `apps/web/src/lib/schedule-week.ts` | `:89` thêm trạng thái tổng `holiday` khi mọi dòng là `holiday`; `:228` không chiếm slot; `:251` không đổi. |
| `apps/web/src/lib/dashboard-from-kernel.ts` | `:16`, `:93` bỏ `holiday` như `cancelled`. |
| `apps/student/src/components/class/class-detail-view.tsx` | **I4:** `:95` `totalSessions: detail.lessons.length` phải loại dòng `holiday` (nếu không hiện 25/24 sau dời); topic progress `:160-185` loại `holiday`. |
| `apps/web/src/components/schedule/class-session-modal.tsx`, `lesson-modal.tsx`, `class-detail/class-sessions-section.tsx`, `session-attendance-modal.tsx` | Nhãn "Nghỉ lễ — Đã dời lịch" (Badge tone `warn`), ẩn CTA điểm danh/huỷ/sửa. |
| `apps/web/src/lib/data-store-reducer.ts`, `apps/web/src/lib/mock-data.ts` | Kiểu `LessonStatus` thêm `holiday`. |
| `apps/student/src/components/class/class-lesson-list.tsx` | `:180` hiển thị "Nghỉ lễ — Đã dời lịch" cho `holiday`; `:56`, `:72` chỉ lấy `upcoming` nên buổi bù tự hiện là buổi sắp tới. |
| `apps/server/src/backfill-dump.ts`, `packages/api/src/skeleton.ts:245` | Chỉ áp cho lớp `date IS NULL`; thêm comment `holiday` không xuất hiện ở lớp legacy, không đổi logic. |
| `apps/server/src/routes/daily-attendance.ts` | **M5:** thay `lessonWeekdayOf` nội bộ (`:30`) bằng helper dùng chung `isoToLessonWeekday` từ `@teacher-os/api/skeleton` (không sinh bản thứ tư). |

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
