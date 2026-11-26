---
phase: 1
title: "Phase 1: Shared Domain Contracts & Pure Helpers"
status: done
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Shared Domain Contracts & Pure Helpers

## Goal

Cung cấp nguồn chân lý thuần duy nhất trong `@teacher-os/api` để xác định lớp đã bắt đầu / có được sửa `startDate` hay không (đồng bộ 100% Web ↔ Server, bao gồm kiểm tra `sessionsTotal <= 52`, topological unwind shift dây chuyền và độ nhất quán giữa các enrollment), tính kế hoạch dời ngày 1-1 an toàn cho cả `materialized` và `projected`, và khai báo mã lỗi `CLASS_ERROR_CODES.START_DATE_LOCKED`.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (`CLASS_ERROR_CODES`)
- Modify: `packages/api/src/class-update-schema.test.ts` (assert `CLASS_ERROR_CODES.START_DATE_LOCKED`)
- Create: `packages/api/src/class-start-date.ts` (`evaluateClassStartDateEditability`, `topologicalUnwindShifts`, `planUnstartedStartDateShift`, `chunkDateMappings`, `LESSON_REMAP_CHUNK`, `DATE_ONLY_REMAP_CHUNK`, `SHIFT_DATE_PREFIX`, types) <!-- Updated: Red-Team RT-1, RT-2, RT-7, RT-10 -->
- Create: `packages/api/src/class-start-date.test.ts` (comprehensive TDD unit tests)

## Tasks & Steps

### Task 1.1 — Add `CLASS_ERROR_CODES.START_DATE_LOCKED` contract (TDD)

- **Goal:** Bổ sung mã lỗi `START_DATE_LOCKED: "CLASS_START_DATE_LOCKED"` vào `CLASS_ERROR_CODES` trong `@teacher-os/api/contracts` mà không phá mã `SCHEDULE_LOCKED` hiện có.
- **Target files:** `packages/api/src/class-update-schema.test.ts`, `packages/api/src/contracts.ts` (`CLASS_ERROR_CODES`, lines 221–230).
- **Steps:**
  1. (Red) Trong `packages/api/src/class-update-schema.test.ts`, bổ sung assertion `expect(CLASS_ERROR_CODES.START_DATE_LOCKED).toBe("CLASS_START_DATE_LOCKED")`.
  2. Chạy test để xác nhận fail (red phase).
  3. (Green) Trong `packages/api/src/contracts.ts`, thêm `START_DATE_LOCKED: "CLASS_START_DATE_LOCKED"` vào `CLASS_ERROR_CODES` với JSDoc rõ ràng (lớp đã bắt đầu học hoặc lịch không thể tính lại ngày khai giảng). Cập nhật comment của `SCHEDULE_LOCKED` nêu rõ khóa `schedule`/`sessionsTotal` khi đã có buổi học thực tế.
  4. Chạy lại test để xác nhận pass.
- **Success criteria:** `CLASS_ERROR_CODES.START_DATE_LOCKED === "CLASS_START_DATE_LOCKED"` và `CLASS_ERROR_CODES.SCHEDULE_LOCKED === "CLASS_SCHEDULE_LOCKED"`.
- **Verify:**
  - Red check: `pnpm --filter @teacher-os/api test -- src/class-update-schema.test.ts` exits non-zero with assertion/type failure; passing test before edit is a failure.
  - Green check: `pnpm --filter @teacher-os/api test -- src/class-update-schema.test.ts` exits 0 and passes all tests.

### Task 1.2 — Write TDD unit tests for `class-start-date.ts` (Red)

- **Goal:** Viết bộ unit tests đầy đủ trước khi cài đặt `packages/api/src/class-start-date.ts`, phủ toàn bộ quy tắc nghiệp vụ đã chốt và mọi phát hiện Red-Team.
- **Target files:** `packages/api/src/class-start-date.test.ts`.
- **Steps:**
  1. Tạo `packages/api/src/class-start-date.test.ts` import `evaluateClassStartDateEditability`, `topologicalUnwindShifts`, `planUnstartedStartDateShift`, `chunkDateMappings`, `LESSON_REMAP_CHUNK`, `DATE_ONLY_REMAP_CHUNK` từ `./class-start-date`.
  2. Viết test cho `evaluateClassStartDateEditability`:
     - Lớp 0 lesson, 0 classSession -> `{ editable: true, reason: null }`.
     - Lớp `auto` có `lesson` tất cả `upcoming` (dated), kể cả `startDate < today` hoặc `min(lesson.date) <= today` -> `{ editable: true, reason: null }`.
     - Lớp `auto` có `lesson` `status = 'holiday'` kèm shift khớp `holidayShifts` và buổi bù `upcoming` -> `{ editable: true, reason: null }`.
     - Lớp `auto` có `lesson` `status = 'cancelled'` khớp ngày trong `holidayCancelDates` (kể cả khi ngày đó đồng thời là `makeupDate` của một shift trước đó!) -> `{ editable: true, reason: null }`.
     - Lớp có bất kỳ `lesson` nào `status = 'completed'`, hoặc `status = 'absent'`, hoặc `attendance !== null`, hoặc `attendanceNote` non-empty, hoặc `status = 'cancelled'` KHÔNG nằm trong `holidayCancelDates` -> `{ editable: false, reason: "class-started" }`.
     - Lớp `manual` (`isManual: true`) có `class_session` nhưng chưa có `lesson` đã bắt đầu -> `{ editable: true, reason: null }`; nếu có `lesson` đã bắt đầu -> `{ editable: false, reason: "class-started" }`.
     - Lớp có `lesson.date === null` (legacy undated) -> `{ editable: false, reason: "legacy-undated" }`.
     - <!-- Updated: Validation Session 1 & Red-Team RT-7 --> Lớp `auto` có `lesson` nhưng `schedule` không parse được, hoặc `sessionsTotal <= 0`, hoặc `sessionsTotal > 52`, hoặc có dòng `holiday` mồ côi (không thuộc `holidayShifts`), hoặc số ngày gốc sau unwind khác `sessionsTotal`, hoặc 2 enrollment (hoặc `sid`) có tập ngày khác nhau (sau `moveDate` xen kẽ kích hoạt), hoặc đồ thị `holidayShifts` có chu trình -> `{ editable: false, reason: "invalid-schedule" }`.
  3. Viết test cho `topologicalUnwindShifts`: <!-- Updated: Red-Team RT-2 -->
     - Chuỗi dây chuyền `A → B` và `B → C` bất kể thứ tự đầu vào `[(B→C), (A→B)]` hay `[(A→B), (B→C)]` luôn trả đúng thứ tự tháo `[B→C, A→B]`.
     - Chuỗi 3 cấp `A → B → C → D` tháo đúng `[C→D, B→C, A→B]`.
     - Chu trình `A → B` và `B → A` trả `{ ok: false }`.
  4. Viết test cho `planUnstartedStartDateShift`:
     - Chế độ `materialized` không trùng ngày (`[2026-12-01, 2026-12-03]` → `[2026-12-15, 2026-12-17]`): trả về cặp `mappings` tăng dần + `newDay` (1–7 Mon-first).
     - Chế độ `materialized` gối ngày (`[2026-12-01, 2026-12-03, 2026-12-08]` → `[2026-12-03, 2026-12-08, 2026-12-10]`): bijection 1-1 chính xác.
     - Chế độ `materialized` có shift dây chuyền `A → B → C` (kể cả khi `C` bị `holidayCancelDates` hủy) đưa vào theo thứ tự ngẫu nhiên: `unwindShiftsDesc` tháo đúng `[B→C, A→B]` và khôi phục đúng `sessionsTotal` ngày gốc không dư buổi ma.
     - <!-- Updated: Red-Team RT-5 --> Chế độ `projected` (0 lessons): nhận riêng `(oldSchedule, oldStartDate, oldSessionsTotal)` và `(newSchedule, newStartDate, newSessionsTotal)`:
       - Đổi chỉ `startDate`: map 1-1 đủ số buổi.
       - Đổi đồng thời `schedule` + `sessionsTotal` (tăng 6 → 10 hoặc giảm 6 → 3): map `min(old, new)` cặp đầu + đưa phần dư cũ vào `surplusOldDates`.
       - Xóa rỗng `newStartDate: ""` (hoặc `newSchedule` không parse được): trả `{ ok: true, mode: "projected", mappings: [], surplusOldDates: oldProjected }`.
     - <!-- Updated: Red-Team RT-1 --> `chunkDateMappings`: với `LESSON_REMAP_CHUNK = 18` chia 52 cặp ra `[18, 18, 16]` (mỗi chunk `5k + 2 <= 92 <= 100` binds); với `DATE_ONLY_REMAP_CHUNK = 30` chia 52 cặp ra `[30, 22]` (mỗi chunk `3k + 2 <= 92 <= 100` binds).
  5. Chạy vitest để xác nhận fail (red phase).
- **Success criteria:** Test file tồn tại, bao phủ đủ mọi nhánh biên và fail đúng do module `./class-start-date` chưa tồn tại.
- **Verify:** `pnpm --filter @teacher-os/api test -- src/class-start-date.test.ts` exits non-zero (missing module error); passing test is a failure.

### Task 1.3 — Implement `packages/api/src/class-start-date.ts` (Green)

- **Goal:** Cài đặt toàn bộ pure helpers trong `packages/api/src/class-start-date.ts` tái sử dụng `@teacher-os/api/skeleton`.
- **Target files:** `packages/api/src/class-start-date.ts`.
- **Steps:**
  1. Khai báo hằng số an toàn D1: <!-- Updated: Red-Team RT-1, RT-9 -->
     - `export const SHIFT_DATE_PREFIX = "__shift__:";` (độ dài 10 → SQLite `substr(date, 1, 10) = '__shift__:'` và `substr(date, 11)`).
     - `export const LESSON_REMAP_CHUNK = 18;` (`5 × 18 + 2 = 92 <= 100` binds cho `UPDATE lesson`).
     - `export const DATE_ONLY_REMAP_CHUNK = 30;` (`3 × 30 + 2 = 92 <= 100` binds cho `UPDATE lesson_material` / `class_session_meeting`).
     - `export const MAX_RESCHEDULE_SESSIONS = 52;`
  2. Export `topologicalUnwindShifts<T extends { originalDate: string; makeupDate: string }>(shifts: ReadonlyArray<T>): { ok: true; orderedDesc: T[] } | { ok: false }`: <!-- Updated: Red-Team RT-2 -->
     - Dùng thuật toán peeling lặp: ở mỗi bước, chọn các shift trong `remaining` có `makeupDate` KHÔNG xuất hiện trong tập `originalDate` của `remaining` (tie-break deterministic theo `makeupDate DESC, originalDate DESC`), đẩy vào `orderedDesc` và xóa khỏi `remaining`.
     - Nếu có vòng lặp mà không bóc được shift nào (`peeled.length === 0`) → có chu trình → trả `{ ok: false }`.
  3. Export `evaluateClassStartDateEditability`: <!-- Updated: Validation Session 1 & Red-Team RT-7 -->
     - `StartDateLockReason = "class-started" | "legacy-undated" | "invalid-schedule"`.
     - `ClassStartDateLessonInput`: `{ date: string | null; status: string; enrollmentKey?: string; attendance?: string | null; attendanceNote?: string | null }` (`enrollmentKey` là `enrollmentId` trên server và `sid` trên web snapshot — đều xác định 1 học viên/ghi danh trong lớp).
     - Input gồm `{ schedule: string; sessionsTotal: number; isManual: boolean; lessons: ReadonlyArray<ClassStartDateLessonInput>; holidayCancelDates?: ReadonlySet<string> | ReadonlyArray<string>; holidayShifts?: ReadonlyArray<{ originalDate: string; makeupDate: string }> }`.
     - Nếu `lessons.length === 0`: trả `{ editable: true, reason: null }`.
     - Kiểm tra lớp đã bắt đầu (`status === "completed" || status === "absent" || attendance != null || (attendanceNote != null && attendanceNote !== "")`, hoặc `status === "cancelled"` mà `!l.date || !cancelSet.has(l.date)`) → `{ editable: false, reason: "class-started" }`.
     - Nếu `input.isManual`: trả `{ editable: true, reason: null }`.
     - Nếu bất kỳ dòng nào thiếu `date` (`!l.date || l.date.trim() === ""`) → `{ editable: false, reason: "legacy-undated" }`.
     - Nếu `parseStoredSchedule(input.schedule) === null || !Number.isInteger(input.sessionsTotal) || input.sessionsTotal <= 0 || input.sessionsTotal > MAX_RESCHEDULE_SESSIONS` → `{ editable: false, reason: "invalid-schedule" }`.
     - Kiểm tra nhất quán holiday & enrollment:
       - Chạy `topologicalUnwindShifts(input.holidayShifts ?? [])`; nếu `!ok` → `"invalid-schedule"`.
       - Tập `shiftOrigSet` (mọi `originalDate`), `shiftMakeupSet` (mọi `makeupDate`).
       - Nếu có dòng `status === "holiday"` mà `!shiftOrigSet.has(l.date)` → `"invalid-schedule"` (holiday mồ côi).
       - Kiểm tra mỗi `shift`: mọi dòng `lesson` ở `shift.originalDate` đều là `'holiday'`, và không có dòng nào ở `shift.makeupDate` nằm ngoài `{ 'upcoming', 'holiday', 'cancelled' }` (thực ra đã chặn `completed`/`absent`/non-holiday `cancelled` ở trên; nếu `makeupDate` có `'holiday'` thì phải thuộc `shiftOrigSet`).
       - Tính `baseDateSet` bằng cách lấy tất cả `l.date`, chạy unwind theo `orderedDesc` (xóa `makeupDate`, thêm `originalDate`). Kiểm tra `baseDateSet.size === input.sessionsTotal`. Nếu khác → `"invalid-schedule"`.
       - Nếu các dòng có `enrollmentKey`: nhóm ngày theo từng `enrollmentKey`, với mỗi nhóm thực hiện cùng bước unwind (bỏ `makeupDate`, kiểm tra `originalDate` có trong tập ngày của nhóm) và kiểm tra tập ngày cơ sở của MỌI enrollment bằng đúng `baseDateSet` (cùng size và cùng phần tử). Nếu lệch → `"invalid-schedule"`.
     - Trả `{ editable: true, reason: null }`.
  4. Export `planUnstartedStartDateShift`: <!-- Updated: Red-Team RT-2, RT-5, RT-10 -->
     - Chế độ `projected` (khi `existingLessonDates.length === 0`):
       - Nhận `oldSchedule`, `newSchedule`, `oldStartDate`, `newStartDate`, `oldSessionsTotal`, `newSessionsTotal`.
       - Tính `oldProjected`: nếu `oldSchedule` parse được, `parseStartDateStrict(oldStartDate)` hợp lệ, và `1 <= oldSessionsTotal <= 52`, lấy danh sách ngày sort tăng dần từ `skeletonOf`; ngược lại `[]`.
       - Tính `newProjected`: tương tự với `newSchedule`, `newStartDate`, `newSessionsTotal`; ngược lại `[]`.
       - `pairCount = Math.min(oldProjected.length, newProjected.length)`: tạo `mappings` 1-1 cho `0..pairCount-1` kèm `newDay = isoToLessonWeekday(newDate)`.
       - `surplusOldDates = oldProjected.slice(pairCount)` (chứa các ngày Zoom cũ cần xóa khi thu ngắn `sessionsTotal` hoặc khi xóa rỗng `newStartDate: ""`).
       - Luôn trả `{ ok: true, mode: "projected", unwindShiftsDesc: [], mappings, surplusOldDates, newScheduleParsed }`.
     - Chế độ `materialized` (khi `existingLessonDates.length > 0`):
       - Yêu cầu `parseStoredSchedule(newSchedule)` hợp lệ, `parseStartDateStrict(newStartDate)` hợp lệ, `1 <= newSessionsTotal <= 52`.
       - Chạy `topologicalUnwindShifts(existingShifts)`. Nếu `!ok` → `{ ok: false, reason: "invalid-schedule" }`.
       - Tính `baseDateSet` sau unwind theo `orderedDesc`; kiểm tra `baseDateSet.size === newSessionsTotal`. Nếu khác → `{ ok: false, reason: "invalid-schedule" }`.
       - Tính `newSkeleton = skeletonOf(parsed, newStartISO, newSessionsTotal)`. Sort tăng dần ra `newBaseDates`. Tạo `mappings` 1-1 `oldBaseDates[i] -> newBaseDates[i]` + `newDay`.
       - Trả `{ ok: true, mode: "materialized", unwindShiftsDesc: orderedDesc, oldBaseDates, newBaseDates, mappings, surplusOldDates: [], newScheduleParsed: parsed }`.
  5. Export `chunkDateMappings<T>(items: ReadonlyArray<T>, chunkSize: number): T[][]`.
  6. Chạy unit tests + typecheck của `@teacher-os/api`.
- **Success criteria:** Toàn bộ tests trong `class-start-date.test.ts` và `class-update-schema.test.ts` pass; `tsc -b` xanh.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types` exits 0 with 0 failures.

## Failure Protocol

If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

## Verification

- `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types`
- `pnpm exec biome check packages/api/src/contracts.ts packages/api/src/class-start-date.ts packages/api/src/class-start-date.test.ts packages/api/src/class-update-schema.test.ts`

## Risk & Rollback

- **Risk:** Lệch định nghĩa `attendanceNote` (`""` vs `null`) hoặc `enrollmentKey` (`enrollmentId` vs `sid`) giữa DB và snapshot. Đã kiểm tra `attendanceNote != null && attendanceNote !== ""` và cho phép truyền `enrollmentKey` từ cả 2 tầng.
- **Rollback:** Xóa `packages/api/src/class-start-date*.ts` và bỏ `START_DATE_LOCKED` khỏi `contracts.ts`.
