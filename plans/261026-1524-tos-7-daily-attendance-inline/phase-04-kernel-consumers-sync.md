---
phase: 4
title: "Đưa attendance vào kernel snapshot và đồng bộ các màn đang đọc lesson.status"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 4: Đồng bộ các reader hiện có

## Goal

Sau khi màn điểm danh ngày bắt đầu ghi `absent` và `attendance`, các màn khác (lịch tuần, trang lớp, cảnh báo rủi ro dashboard, số buổi gói học phí) hiển thị nhất quán và không hiểu sai dữ liệu mới.

## Files to Create / Modify

- Modify: `apps/server/src/routes/snapshot.ts` — **`lessons: scheduledRows.map(…)` ở `:515-527` (select toàn cột `from(lesson)` ở `:273-276` nên chỉ cần thêm 2 field vào map)**. ⚠️ Đừng nhầm với `lessonsByModule` của **syllabus** ở `:426-441` (bảng curriculum, không có cột attendance).
- Modify: `apps/web/src/lib/mock-data.ts` (`Lesson`) và `apps/web/src/lib/repos/lessons.ts` (`mapLessons`). Mang 2 field mới; giá trị lạ coerce về `null`.
- Modify: `apps/web/src/lib/dashboard-from-kernel.ts`.
  - Risk reason "absent" chỉ áp dụng trong **cửa sổ 14 ngày** (`lesson.date >= today − 14`, so chuỗi ISO) và chỉ cho: `attendance === "unexcused"`, hoặc `status === "absent"` với `attendance == null` (dữ liệu legacy/backfill trong cửa sổ). **Loại trừ `attendance === "excused"`** — vắng có phép là nghỉ hợp lệ, không phải cảnh báo (red-team: `atRiskRows` `:113-142` không cửa sổ thời gian sẽ giữ mọi lần vắng lịch sử ở trạng thái rủi ro vĩnh viễn).
  - Gỡ comment "`absent` has no kernel write path yet" (dòng 110) vì giờ đã có.
- Modify: `apps/web/src/components/schedule/class-session-modal.tsx`. Hiện nhãn trạng thái chi tiết ("Đi muộn", "Vắng không phép"…) khi `attendance` có giá trị, giữ nguyên hành vi cũ khi `NULL`.
- Sửa rõ (red-team bác claim "đã xử lý absent" của bản plan đầu): `sessionAttendanceState` (`class-sessions.ts:613-614`) và `rollupSessionStatus` (`schedule-week.ts:87-93`) hiện coi `absent` là **chưa** xử lý ("legacy parity"), bị 2 test khoá: `class-sessions.test.ts:326-330`, `schedule-week.test.ts:224-229`. Quyết định: **giữ nguyên rollup** (ô tuần không hiển thị ca toàn vắng là "Đã học" — 2 test trên giữ nguyên), chỉ sửa **CTA trang lớp** (`class-sessions-section.tsx:163-173`) dùng `occurrenceSidStates` đã xử lý đúng absent (`class-sessions.ts:692-694`) để dòng `absent` có ngày không render nút "Điểm danh" (nút đó sẽ 409 vì `lessonStatusAction` guard `status !== "upcoming"`, `kernel.ts:770-790`). Thêm test CTA mới, không đổi 2 test rollup.

## Tasks & Steps

1. Test đỏ ở `dashboard-from-kernel.test.ts`: dòng `completed` + `unexcused` hôm qua → lý do `absent`; `completed` + `excused` → **không** có lý do; `absent` + `attendance = NULL` trong 14 ngày → lý do `absent`; dữ liệu vắng cũ hơn 14 ngày → không có lý do nào.
2. Test đỏ ở `class-sessions-section` (CTA): ca có dòng `absent` + dòng `completed` **không còn hiện nút "Điểm danh"**; `rollupSessionStatus` giữ hành vi cũ (absent → upcoming, test hiện có giữ nguyên).
3. Test ở server `kernel.test.ts`: snapshot chứa `attendance` và `attendanceNote`; `pkg.done` của enrollment không tăng sau khi lưu `excused`, tăng 1 sau khi lưu `unexcused`.
4. Sửa code cho test xanh. Cập nhật fixture snapshot bị ảnh hưởng.

## Verification

- `pnpm --filter web test -- dashboard-from-kernel class-sessions schedule-week class-session-modal`
- `pnpm --filter server test -- kernel snapshot`
- `pnpm check-types`
- `pnpm check`

## Rủi ro

- Kiểu `status: … | string` ở `KernelLessonRow` cho phép giá trị lạ lọt qua. Mọi so sánh mới dùng hằng enum từ `packages/api`, không viết chuỗi rời.
