---
title: "Phase 1: API Email Renderer & Server Route"
status: completed
---

# Phase 1: Start

## Overview

Cập nhật contract và renderer dùng chung tại `@teacher-os/api`, thêm helper tính ngày kết thúc khóa học dự kiến thuần túy (`computeExpectedEndDateFromSchedule`, `resolveClassExpectedEndDate`), và nối qua `templates.ts` + `POST /classes/:id/confirm-opening` trên `apps/server`.

## Requirements

- [ ] Bỏ `level` khỏi `ClassOpeningEmailInput` và `classOpeningConfirmedEvents`.
- [ ] Thêm `expectedEndDate?: string | null` vào `ClassOpeningEmailInput` và `classOpeningConfirmedEvents`:
  - `undefined`: tự suy qua `computeExpectedEndDateFromSchedule` (chặn `Number.isInteger(sessionsTotal) && sessionsTotal > 0 && sessionsTotal <= 52` để tránh CPU DoS / sai số).
  - `null` hoặc chuỗi rỗng/khoảng trắng: ẩn dòng `Ngày kết thúc khóa học dự kiến`.
  - Chuỗi khác: nếu khớp `parseStartDateStrict` thì format qua `formatViWeekdayDate`, ngược lại fallback `formatViDateDisplay || raw`, và luôn bọc qua `sanitizeSingleLine` để chặn `\r`/`\n`/`\0` và ngày rollover như `2026-02-30`.
- [ ] `resolveClassExpectedEndDate` xử lý đầy đủ mọi nhánh:
  - `isManual` (`input.isManual ?? ((input.classSessions?.length ?? 0) > 0)`): hợp nhất các ngày hợp lệ từ `classSessions` và `lessons` (để nhận cả buổi bù nghỉ lễ được tạo ở `lesson`), loại bỏ mọi ngày mà tất cả `lesson` tại ngày đó là `holiday`/`cancelled` hoặc (khi chưa có dòng `lesson` tại ngày đó) thuộc `holidayShiftOriginalDates`/`holidayCancelDates`; trả ngày lớn nhất hoặc `null`.
  - Lớp `auto` đã có ít nhất 1 `lesson` mang `date` hợp lệ (`hasAnyDatedLesson === true`): chỉ lấy `max(date)` trong các dòng không phải `holiday`/`cancelled`; nếu toàn bộ đều `holiday`/`cancelled` thì trả `null` (tuyệt đối không fallback sang `skeletonOf`).
  - Lớp `auto` chưa có `lesson` mang ngày (0 buổi hoặc legacy `date: null`): ước tính bằng `computeExpectedEndDateFromSchedule` (dùng `effectiveSessionsTotal`).
- [ ] `POST /classes/:id/confirm-opening` chỉ đọc `lesson` / `classSession` / `syllabus` / `holiday` SAU khi `applyClassStartDateChange` đã commit (nếu đổi `startDate`) và SAU các nhánh early return / CAS của `new_only`; tính `isManualForEmail` đồng nhất với `isManualClass` và `effectiveSessionsTotal` (fallback `curriculumCopy.totalLessons` khi `sessionsTotal === 0`).

## Files to Modify

- `packages/api/src/class-opening-email.ts`
- `packages/api/src/class-opening-email.test.ts`
- `apps/server/src/lib/notifications/templates.ts`
- `apps/server/src/lib/notifications/templates.test.ts`
- `apps/server/src/routes/kernel.ts`
- `apps/server/src/confirm-opening.test.ts`

## Implementation Steps (TDD)

1. **Test-first ở `@teacher-os/api` (`packages/api/src/class-opening-email.test.ts`):**
   - Cập nhật test `renderClassOpeningEmail`: bỏ `level`, assert HTML & plain-text không chứa `"Trình độ"`, `"Thời lượng"`, `"24 buổi"`, và chứa `"Ngày kết thúc khóa học dự kiến"` + `"Thứ Năm, 03/12/2026"` (`2026-09-15`, T3&T5, 24 buổi).
   - Bổ sung test `expectedEndDate: null` (ẩn dòng), `expectedEndDate` override (ngày bù), XSS payload trong `expectedEndDate`, và toàn bộ edge cases của `computeExpectedEndDateFromSchedule` + `resolveClassExpectedEndDate`.
2. **Implement `@teacher-os/api` (`packages/api/src/class-opening-email.ts`):**
   - Import `parseStartDateStrict`, `parseStoredSchedule`, `skeletonOf` từ `./skeleton`.
   - Export `computeExpectedEndDateFromSchedule`, `ClassSessionDateInput`, `resolveClassExpectedEndDate`.
   - Cập nhật `ClassOpeningEmailInput` và `renderClassOpeningEmail` (cả bảng HTML lẫn `width:44%` cho cột nhãn và `text`).
3. **Test-first & Implement `apps/server/src/lib/notifications/templates.{ts,test.ts}`:**
   - Thay `level` bằng `expectedEndDate?: string | null` trong `classOpeningConfirmedEvents`.
   - Cập nhật assertions `templates.test.ts` + thêm case override & `null`.
4. **Test-first & Implement `apps/server/src/routes/kernel.ts` + `confirm-opening.test.ts`:**
   - Import `resolveClassExpectedEndDate` từ `@teacher-os/api/class-opening-email` và `loadClassCancels`, `loadClassShifts` từ `./enrollment-activation`.
   - Cập nhật happy-path test trong `confirm-opening.test.ts` + bổ sung test lớp `auto` có holiday shift, lớp `auto` đổi `startDate` trước khai giảng, lớp `manual` có/chưa có `class_session`.

## Todo

- [x] Viết/cập nhật test `packages/api/src/class-opening-email.test.ts`
- [x] Cập nhật `packages/api/src/class-opening-email.ts`
- [x] Cập nhật `apps/server/src/lib/notifications/templates.ts` và `templates.test.ts`
- [x] Cập nhật `apps/server/src/routes/kernel.ts` và `apps/server/src/confirm-opening.test.ts`

## Verification

- `pnpm --filter @teacher-os/api test src/class-opening-email.test.ts`
- `pnpm --filter server test src/lib/notifications/templates.test.ts src/lib/notifications/notifications.test.ts src/confirm-opening.test.ts`

## Success Criteria

Tất cả unit & integration tests cho `class-opening-email`, `templates`, `notifications`, và `confirm-opening` pass, không còn `Trình độ` hay `Thời lượng` trong email phát ra từ server.
