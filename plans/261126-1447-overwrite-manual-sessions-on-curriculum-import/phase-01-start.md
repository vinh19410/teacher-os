---
phase: 1
title: "Phase 1: Shared Contracts & Curriculum Overlap Helper"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Shared Contracts & Curriculum Overlap Helper

## Goal

Mở rộng schema `importSyllabusSchema` (`.strict()`, thêm `overwriteManualSessions` & `overwriteHash`) và xây dựng pure helper dùng chung trong `@teacher-os/api` để tính ngày dạy hiệu lực của giáo trình (có xét kỳ nghỉ lễ và bắt lỗi `SCAN_CAP_DAYS`), phân loại buổi thủ công trùng ngày / khác ngày, và kiểm tra buổi đã điểm danh/hoàn thành.

## Files to Create / Modify

- Create: `packages/api/src/curriculum-overwrite.ts`
- Create: `packages/api/src/curriculum-overwrite.test.ts`
- Modify: `packages/api/src/contracts.ts` (`importSyllabusSchema`, hằng mã lỗi `CURRICULUM_IMPORT_ERROR_CODES`)

## Tests Before (TDD)

Viết trước `packages/api/src/curriculum-overwrite.test.ts` phủ các ca:
1. `projectCurriculumDates`: lịch chuẩn (`Mon/Wed`, `startDate`, `K = 3`) trả `{ ok: true, activeDates: [3 ngày tăng dần], inactiveDates: [] }`.
2. `projectCurriculumDates` có kỳ nghỉ lễ `mode: "shift"` trùng buổi 1: trả `{ ok: true, activeDates: [buổi 2, buổi 3, ngày bù cuối khóa], inactiveDates: [buổi 1] }` — tách rõ ngày dạy hiệu lực khỏi ngày `holiday` đã dời (<!-- Red Team RT-4 -->).
3. `projectCurriculumDates` có kỳ nghỉ lễ `mode: "cancel"` trùng buổi 2: trả `{ ok: true, activeDates: [buổi 1, buổi 3], inactiveDates: [buổi 2] }` (<!-- Red Team RT-4 -->).
4. `projectCurriculumDates` với lỗi đầu vào & biên kỳ nghỉ (<!-- Red Team RT-5, RT-6 -->):
   - Lịch `schedule` legacy không parse được → `{ ok: false, reason: "invalid-schedule" }`.
   - `startDate` rỗng hoặc phi-ISO (`"01/09"`, `"2026-02-30"`) → `{ ok: false, reason: "invalid-start-date" }`.
   - `lessonCount <= 0` hoặc `> 52` → `{ ok: false, reason: "invalid-lesson-count" }`.
   - Kỳ nghỉ lễ phủ kín 364 ngày khiến `planHolidayShift` vượt `SCAN_CAP_DAYS` → bắt lỗi sạch, trả `{ ok: false, reason: "holiday-scan-cap" }` (không throw).
5. `classifyManualSessionDates`: tách chính xác `conflictingDates` (thuộc `activeDates`) và `otherManualDates` (không thuộc `activeDates`), dedupe + sort tăng dần.
6. `isManualLessonSettled`: trả `true` cho `status === "completed"`, `status === "absent"`, `attendance !== null`, hoặc `attendanceNote` khác rỗng; trả `false` cho `status === "upcoming"` và `status === "cancelled"` không có điểm danh/ghi chú.
7. `importSyllabusSchema` (<!-- Red Team RT-3, RT-11 -->):
   - Parse thành công `{ templateId: "t1" }`, `{ templateId: "t1", overwriteManualSessions: false }`, `{ templateId: "t1", overwriteManualSessions: true, overwriteHash: "abc123" }`.
   - Từ chối kiểu không hợp lệ (`overwriteManualSessions: "yes"`, `overwriteHash: ""`) và từ chối field lạ / sai chính tả (`.strict()`, vd `{ templateId: "t1", overwriteManualSession: true }`).

## Refactor / Implementation

1. Trong `packages/api/src/contracts.ts` (<!-- Red Team RT-3, RT-5, RT-6, RT-11 -->):
   - Mở rộng `importSyllabusSchema` với `.strict()`:
     ```ts
     export const importSyllabusSchema = z
       .object({
         templateId: z.string().min(1),
         overwriteManualSessions: z.boolean().optional(),
         overwriteHash: z.string().min(1).max(128).optional(),
       })
       .strict();
     ```
   - Export `CURRICULUM_IMPORT_ERROR_CODES` dùng chung cho server và web:
     - `MANUAL_SESSIONS_EXIST`
     - `MANUAL_SESSIONS_COMPLETED`
     - `CURRICULUM_EMPTY_TEMPLATE`
     - `CURRICULUM_TOO_MANY_LESSONS`
     - `CURRICULUM_TEMPLATE_TOO_LARGE`
     - `CURRICULUM_ALREADY_EXISTS`
     - `CURRICULUM_MATERIAL_NOT_FOUND`
     - `CURRICULUM_INVALID_CLASS_SCHEDULE`
     - `CURRICULUM_HOLIDAY_SCAN_CAP`
     - `CLASS_STATE_CHANGED`
2. Tạo `packages/api/src/curriculum-overwrite.ts` (<!-- Red Team RT-4, RT-5, RT-6 -->):
   - `isManualLessonSettled(row: { status: string; attendance?: string | null; attendanceNote?: string | null }): boolean`
   - `CurriculumDatesProjectionResult`:
     ```ts
     export type CurriculumDatesProjectionResult =
       | { ok: true; activeDates: string[]; inactiveDates: string[] }
       | {
           ok: false;
           reason:
             | "invalid-schedule"
             | "invalid-start-date"
             | "invalid-lesson-count"
             | "holiday-scan-cap";
         };
     ```
   - `projectCurriculumDates(input: { schedule: string; startDate: string; lessonCount: number; holidays?: ReadonlyArray<{ id: string; name: string; fromDate: string; toDate: string; mode: HolidayMode }>; todayISO?: string }): CurriculumDatesProjectionResult`
     - Validate `parseStoredSchedule(input.schedule)`, `parseStartDateStrict(input.startDate)`, và `Number.isInteger(lessonCount) && lessonCount >= 1 && lessonCount <= 52`.
     - Sinh skeleton bằng `skeletonOf(parsed, startISO, lessonCount)`.
     - Nếu `holidays.length > 0`: mô phỏng đúng vòng lặp `planHolidayShift` từ `enrollment-activation.ts:433-493` bên trong `try/catch`; nếu `planHolidayShift` ném lỗi `SCAN_CAP_DAYS` (hoặc bất kỳ lỗi holiday-shift nào), trả `{ ok: false, reason: "holiday-scan-cap" }`.
     - Phân tách ngày theo trạng thái cuối: `activeDates` (tập ngày `upcoming` duy nhất, tăng dần) và `inactiveDates` (tập ngày `holiday` / `cancelled` không thuộc `activeDates`, duy nhất, tăng dần).
   - `classifyManualSessionDates(manualDates: readonly string[], activeCurriculumDates: readonly string[]): { conflictingDates: string[]; otherManualDates: string[] }`

## Tests After

Chạy bộ test mới + kiểm tra tương thích toàn bộ test hiện có của `@teacher-os/api`:
- Verify mọi test trong `packages/api/src/curriculum-overwrite.test.ts` pass.
- Verify không làm vỡ bất kỳ test nào trong `packages/api`.

## Todo

- [x] Viết unit test `packages/api/src/curriculum-overwrite.test.ts` (red)
- [x] Cập nhật `importSyllabusSchema` (`.strict()`, `overwriteManualSessions`, `overwriteHash`) & `CURRICULUM_IMPORT_ERROR_CODES` trong `packages/api/src/contracts.ts`
- [x] Cài đặt `packages/api/src/curriculum-overwrite.ts` (green)
- [x] Chạy regression gate cho `@teacher-os/api`

## Regression Gate & Verification

```bash
pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types
```

## Risk & Rollback

- **Risk:** Lệch ngày giữa `projectCurriculumDates` và `materializeScheduleForEnrollment` khi có kỳ nghỉ lễ nhiều đợt (chain shift).
- **Mitigation:** Áp dụng đúng vòng lặp `for (const holiday of holidays)` cộng dồn `rows` với `planHolidayShift` + `todayISO = vietnamTodayISO()` giống `apps/server/src/routes/enrollment-activation.ts:433-493`, bọc `try/catch` cho `SCAN_CAP_DAYS`, và kiểm chứng trực tiếp bằng integration test server trong Phase 2.
- **Rollback:** Revert `packages/api/src/curriculum-overwrite.ts` và các trường optional mới trên `importSyllabusSchema`.
