---
phase: 1
title: "Phase 1: Remove ClassInfoCard footer and dead code (TDD)"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Remove ClassInfoCard footer and dead code (TDD)

## Overview

Gỡ bỏ thanh footer `border-t` (thời lượng tháng, khung giờ lặp, dòng `Buổi tới: ...`) khỏi `ClassInfoCard` trên trang chi tiết lớp học viên `/student/classes/$classId`, thu gọn chữ ký prop (`detail`, `held`, `totalSessions`) và dọn sạch toàn bộ hàm/import không còn được sử dụng theo chu trình TDD (viết/cập nhật test thất bại thật trước, sau đó chỉnh sửa mã nguồn và cập nhật cả hai caller cho tới khi xanh).

## Files to Modify

- Modify: `apps/student/src/components/class/class-info-card.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx`
- Modify: `apps/student/test/class-detail.test.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.test.tsx`

## Requirements

- [x] Gỡ bỏ khối JSX `{hasFooter && (...)}` (`apps/student/src/components/class/class-info-card.tsx:169-191`) và các tính toán liên quan (`isPaused`, `nextId`, `nextLesson`, `months`, `parsedSchedule`, `scheduleTimeMatch`, `timeRange`, `hasFooter`, dòng `100-117`).
- [x] Gỡ bỏ hàm/hằng số chết chỉ dùng cho footer (`ISO_DATE_RE`, `parseISODateUTC`, `computeCourseMonths`, dòng `25-56`) và các import không còn dùng (`StudentClassLesson`, `parseSchedule`, `CalendarClock`, `Clock`, `Hourglass`, `findNextLessonId`, `lessonDayLabel`).
- [x] Thu gọn props của `ClassInfoCard` từ `{ detail, todayISO, now, held, totalSessions }` còn `{ detail, held, totalSessions }` và cập nhật **cả hai caller**: production caller tại `apps/student/src/components/class/class-detail-view.tsx:347-353` và test caller tại `apps/student/test/class-detail.test.tsx:406-431`. <!-- Updated: Red Team Session 2026-11-26 - account for both production and test callers -->
- [x] Bảo toàn nguyên vẹn toàn bộ lưới `<dl>` (`Khoá`, `Lịch`, `Hình thức`, `Giáo viên` + `mailto:`, `Số buổi đã học`, `Khai giảng`) và hành vi của `ClassLessonList`, `JourneyNextStopHero`, `ClassCard` (overview).

## Test Matrix (TDD)

<!-- Updated: Red Team Session 2026-11-26 - tightened timeRange count, JSON schedule, empty/legacy edge cases, and accurate JourneyNextStopHero assertions -->
1. **`ClassInfoCard` omits redundant footer for active class with legacy or structured JSON schedule, `startDate`, and upcoming lessons** (`apps/student/test/class-detail.test.tsx`):
   - Assert `<dl>` metadata vẫn hiện đủ (`Band 6.5`, `T3 & T6 · 19:00–20:30` hoặc lịch JSON `'{"days":[1,4],"start":"19:00","end":"20:30"}'` format thành `T3 & T6 · 19:00–20:30`, `Online`, `Cô Lan`, `lan@example.com`, `2/5 buổi`, `Chủ Nhật, 01/03/2099`).
   - Assert không render `Buổi tới:`, không render `/\d+\s*tháng/`, không render khối `border-t`, và khung giờ `19:00–20:30` chỉ xuất hiện **đúng 1 lần** (`html.match(/19:00–20:30/g)` có độ dài `1`, nằm trong mục `Lịch` của `<dl>`).
2. **`ClassInfoCard` renders gracefully when optional fields are empty, teacher is missing, or lessons are legacy undated (`date: null`)** (`apps/student/test/class-detail.test.tsx`):
   - Assert với `level: ""`, `schedule: ""`, `mode: ""`, `startDate: ""`, `teacher: null`, `lessons` có `date: null`: hiển thị `"Chưa có thông tin giáo viên."` và `"0/0 buổi"`, ẩn các mục rỗng, không render footer hay lỗi.
3. **`ClassDetailView` default render & active/paused states** (`apps/student/test/class-detail.test.tsx`, `apps/student/src/components/class/class-detail-view.test.tsx`):
   - Assert vùng `region[name="Thông tin lớp học"]` không chứa `Buổi tới` hay `/\d+\s*tháng/`.
   - Assert khi lớp `active`: `screen.getByTestId("journey-next-hero")` hiển thị `"Buổi tiếp theo"` và `ClassLessonList` hiển thị đúng 1 badge `"Buổi tới"`.
   - Assert khi lớp `paused`: ẩn `journey-next-hero`, `screen.queryByText(/Buổi tới/)` là `null`, và cập nhật tên test ở `class-detail-view.test.tsx:103` bỏ nhắc `ClassInfoCard`.

## Implementation Steps

<!-- Updated: Red Team Session 2026-11-26 - separate Red/Green prop signature change to avoid JS undefined comparison false-pass and preserve ClassAssignmentTable tests -->
1. **Red (TDD):**
   - Trong `apps/student/test/class-detail.test.tsx`: gỡ import `computeCourseMonths` (dòng `36`), chỉ xoá test `computeCourseMonths` (dòng `443-455`) và đổi tên dòng `442` thành `describe("ClassAssignmentTable", ...)` (giữ nguyên toàn bộ 2 test của `ClassAssignmentTable` ở dòng `457-541`). Cập nhật assertion dòng `282-283` và khối `describe("ClassInfoCard")` (dòng `406-431`) — **tạm giữ `todayISO={TODAY} now={NOW}` trên các lời gọi `<ClassInfoCard>` trong pha Red** để component chưa sửa vẫn tính đủ 3 mục footer và mọi assertion phủ định (`not.toContain("Buổi tới:")`, `not.toMatch(/\d+\s*tháng/)`, số lần `19:00–20:30` === 1) fail thật.
   - Trong `apps/student/src/components/class/class-detail-view.test.tsx` (dòng `103-133`): cập nhật mô tả test dòng `103`, thêm assertion `within(screen.getByRole("region", { name: "Thông tin lớp học" }))` không chứa `Buổi tới` hoặc `tháng`, và khẳng định `journey-next-hero` (`"Buổi tiếp theo"`) + badge `"Buổi tới"` đúng theo trạng thái `active`/`paused`.
   - Chạy `pnpm --filter student test test/class-detail.test.tsx src/components/class/class-detail-view.test.tsx` xác nhận test mới fail đúng lý do (footer vẫn đang render).
2. **Green:**
   - Chỉnh `apps/student/src/components/class/class-info-card.tsx`: gỡ footer (`169-191`), biến tính footer (`100-117`), dead helpers (`25-56`), unused imports (`3,5,8,11,13,20,21`), prop `todayISO`/`now` (`85-86, 91-92`), và cập nhật JSDoc (`78-82`).
   - Cập nhật **cả hai caller** bỏ `todayISO` và `now`: `apps/student/src/components/class/class-detail-view.tsx:347-353` và các lời gọi `<ClassInfoCard>` trong `apps/student/test/class-detail.test.tsx`.
3. **Verify:** Chạy `pnpm --filter student test`, `pnpm exec biome check apps/student`, `pnpm --filter student check-types` đảm bảo xanh hoàn toàn.

## Todo

- [x] Update tests first (Red) in `class-detail.test.tsx` (keeping `todayISO`/`now` temporarily and preserving `ClassAssignmentTable` tests) and `class-detail-view.test.tsx`
- [x] Remove footer, dead helpers, unused imports, and unused props from `class-info-card.tsx`
- [x] Remove `todayISO`/`now` at both callers (`class-detail-view.tsx` and `class-detail.test.tsx`)
- [x] Run student unit tests, typecheck, and biome check (Green)

## Success Criteria

- `pnpm --filter student test`, `pnpm --filter student check-types` và `pnpm exec biome check apps/student` pass 100%.
- Toàn bộ test xác minh footer (`{months} tháng`, khung giờ lặp, `Buổi tới: ...`) đã biến mất khỏi `ClassInfoCard` trong khi `JourneyNextStopHero` (`"Buổi tiếp theo"`), badge `"Buổi tới"` trong `ClassLessonList` và 2 test của `ClassAssignmentTable` vẫn pass nguyên vẹn.
- Không còn symbol hoặc import chết nào liên quan tới footer trong `apps/student`.
