---
phase: 1
title: "Phase 1: Helpers giờ VN, contract dueTime & server lưu/xuất dueAt"
status: pending
priority: P1
effort: "1.25h"
dependencies: []
---

# Phase 1: Helpers giờ VN, contract dueTime & server lưu/xuất dueAt

<!-- Updated: Red Team RT-2, RT-4, RT-5, RT-6 -->

## Goal

Cung cấp bộ hàm thuần xử lý ngày/giờ Việt Nam (`dd/mm/yyyy` ↔ ISO `yyyy-mm-dd`, `HH:mm`, định dạng thứ/ngày tiếng Việt, và `evaluateAssignmentDeadline`) trong `@teacher-os/api/vietnam-date`, mở rộng `classAssignmentCreateSchema` + `KernelClassAssignmentRow` trong `@teacher-os/api/contracts`, và cập nhật server (`POST /api/classes/:id/assignments`, `loadSnapshot`, `assignmentPublishedEvents`) để kiểm tra giờ hạn nộp theo múi giờ Việt Nam, ghi/xuất `dueAt` và định dạng thông báo chuẩn tiếng Việt theo quy trình TDD.

## Files to Create / Modify

- Modify:
  - `packages/api/src/vietnam-date.ts`
  - `packages/api/src/vietnam-date.test.ts`
  - `packages/api/src/contracts.ts`
  - `apps/server/src/routes/kernel.ts`
  - `apps/server/src/routes/snapshot.ts`
  - `apps/server/src/lib/notifications/templates.ts`
  - `apps/server/src/lib/notifications/templates.test.ts`
  - `apps/server/src/kernel.test.ts`

## Tasks & Steps

### Task 1.1 — Viết test TDD (Red) cho helpers ngày/giờ Việt Nam, `evaluateAssignmentDeadline` và `classAssignmentCreateSchema`
- **Goal:** Bổ sung bộ unit test kiểm chứng toàn bộ quy tắc parse/format ngày `dd/mm/yyyy`, giờ 24h `HH:mm`, tính quá hạn/nộp trễ tại biên mili-giây theo giờ Việt Nam (kèm cờ `legacyDateLate`), và schema `classAssignmentCreateSchema` trước khi viết code cài đặt.
- **Target files and symbols:**
  - `packages/api/src/vietnam-date.test.ts`
- **Steps:** <!-- Updated: Red Team RT-5 -->
  1. Mở `packages/api/src/vietnam-date.test.ts`, import thêm `parseViDateInput`, `formatViDateDisplay`, `formatViWeekdayDate`, `parseTimeHHMM`, `evaluateAssignmentDeadline` từ `./vietnam-date` và `classAssignmentCreateSchema` từ `./contracts`.
  2. Thêm `describe("parseViDateInput & formatViDateDisplay (#572)")` kiểm tra:
     - `"06/11/2026"` → `"2026-11-06"` (ngày 6 tháng 11, tuyệt đối không đảo thành `"2026-06-11"`).
     - `"6/11/2026"` và `"6/1/2026"` → `"2026-11-06"` và `"2026-01-06"`.
     - Chuỗi liền 8 chữ số `"09112026"` → `"2026-11-09"`.
     - Ngày không tồn tại `"31/02/2026"`, `"29/02/2026"` (năm không nhuận), tháng `"13/13/2026"`, năm ngoài khoảng `2000..2100` (`"06/11/1999"`, `"06/11/2101"`), chuỗi dở dang `"06/11"`, chuỗi ISO `"2026-11-06"` → trả `null`.
     - Năm nhuận `"29/02/2028"` → `"2028-02-29"`.
     - `formatViDateDisplay("2026-11-06")` → `"06/11/2026"`; chuỗi rỗng hoặc legacy `"20/08"` giữ nguyên.
     - `formatViWeekdayDate("2026-11-06")` → `"Thứ Sáu, 06/11/2026"` và `"2026-11-08"` → `"Chủ Nhật, 08/11/2026"` (tính theo UTC date từ `yyyy-mm-dd`, không lệch múi giờ máy chạy test).
  3. Thêm `describe("parseTimeHHMM (#572)")` kiểm tra:
     - `"23:59"` → `"23:59"`, `"9:05"` → `"09:05"`, `"0930"` → `"09:30"`, `"00:00"` → `"00:00"`.
     - Giờ/phút ngoài biên `"24:00"`, `"12:60"`, `"9999"`, `"9"`, `"abc"` → trả `null`.
  4. Thêm `describe("evaluateAssignmentDeadline (#572)")` kiểm tra:
     - Khi `dueAt = "2026-11-06T10:00:00.000Z"` (`17:00` giờ VN ngày `06/11/2026`, `dueAtMs = Date.parse(dueAt)`):
       - Chưa nộp (`submittedAt: null`): tại `nowMs = dueAtMs - 1` → `{ hasDueAt: true, isOverdue: false, isLate: false, dueDateISO: "2026-11-06" }`; tại `nowMs = dueAtMs` → `isOverdue: true`; tại `nowMs = dueAtMs + 1` → `isOverdue: true`.
       - Đã nộp: `submittedAt` tại `dueAtMs` (đúng hạn tới mili-giây) → `{ isOverdue: false, isLate: false }`; `submittedAt` tại `dueAtMs + 1` → `{ isOverdue: false, isLate: true }`.
     - Khi `dueAt: null` (legacy row, `due: "2026-11-06"`):
       - Chưa nộp với `todayISO = "2026-11-06"` → `isOverdue: false`; với `todayISO = "2026-11-07"` → `isOverdue: true`.
       - Đã nộp ngày hôm sau (`"2026-11-06T17:00:00.000Z"` = `00:00` VN ngày `07/11`): với mặc định `legacyDateLate: false` (precedent `apps/student`) → `isLate: false`; với `legacyDateLate: true` (precedent `apps/web`) → `isLate: true` (còn nộp lúc `"2026-11-06T16:59:59.000Z"` = `23:59:59` VN ngày `06/11` → `isLate: false`).
  5. Thêm `describe("classAssignmentCreateSchema (#572)")` kiểm tra:
     - Chấp nhận payload không có `dueTime` (`dueTime` là `undefined`) và payload có `dueTime: "17:30"` hoặc `"23:59"`.
     - Từ chối `dueTime: "24:00"`, `"7:30"`, `"17:30:00"`, `""` và field lạ (`.strict()`).
- **Success criteria:** File test chứa đầy đủ các test case trên và chạy báo đỏ do các hàm/field mới chưa tồn tại.
- **Verify:** `pnpm --filter @teacher-os/api test` exits non-zero with assertion/import failure; passing test is a failure.

### Task 1.2 — Cài đặt helpers trong `vietnam-date.ts` và mở rộng `contracts.ts` (Green)
- **Goal:** Cài đặt các hàm thuần xử lý ngày/giờ Việt Nam, `evaluateAssignmentDeadline`, và cập nhật `classAssignmentCreateSchema` + `KernelClassAssignmentRow` để toàn bộ unit test của `@teacher-os/api` xanh.
- **Target files and symbols:**
  - `packages/api/src/vietnam-date.ts` (`parseViDateInput`, `formatViDateDisplay`, `formatViWeekdayDate`, `parseTimeHHMM`, `evaluateAssignmentDeadline`)
  - `packages/api/src/contracts.ts` (`classAssignmentCreateSchema`, `KernelClassAssignmentRow`)
- **Steps:** <!-- Updated: Red Team RT-5, RT-6 -->
  1. Trong `packages/api/src/vietnam-date.ts`:
     - Cài đặt `parseViDateInput(raw: string): string | null`: trim chuỗi; khớp `^(\d{1,2})\/(\d{1,2})\/(\d{4})$` hoặc chuỗi thuần 8 chữ số `^(\d{2})(\d{2})(\d{4})$`; kiểm tra năm `2000..2100`, tháng `1..12`, ngày `1..31`; tạo chuỗi `iso = ${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` và kiểm tra roundtrip UTC (`new Date(\`${iso}T00:00:00Z\`).toISOString().slice(0, 10) === iso`) để chặn ngày giả như `31/02/2026`.
     - Cài đặt `formatViDateDisplay(iso: string): string`: nếu `iso.trim()` khớp `^(\d{4})-(\d{2})-(\d{2})$` trả `${dd}/${mm}/${yyyy}`, ngược lại trả nguyên `iso` (an toàn với chuỗi rỗng hoặc legacy `"20/08"`).
     - Cài đặt `formatViWeekdayDate(iso: string): string`: với `iso.trim()` khớp `^(\d{4})-(\d{2})-(\d{2})$`, lấy `getUTCDay()` của `new Date(\`${iso.trim()}T00:00:00Z\`)`, ánh xạ sang `["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]`, trả `${weekday}, ${formatViDateDisplay(iso.trim())}` (trả `""` nếu không khớp).
     - Cài đặt `parseTimeHHMM(raw: string): string | null`: trim chuỗi; khớp `^(\d{1,2}):(\d{2})$` hoặc 4 chữ số `^(\d{2})(\d{2})$`; kiểm tra giờ `0..23` và phút `0..59`; trả `${hh.padStart(2, "0")}:${mm}`.
     - Cài đặt `evaluateAssignmentDeadline(input: { due: string; dueAt?: string | null; submittedAt?: string | null; todayISO?: string; nowMs?: number; legacyDateLate?: boolean })`:
       - Tính `rawDueAtMs = input.dueAt ? Date.parse(input.dueAt) : Number.NaN`, `hasDueAt = Number.isFinite(rawDueAtMs)`.
       - `dueDateISO = hasDueAt ? vietnamDateKeyOf(new Date(rawDueAtMs)) : input.due` (luôn lấy ngày VN từ chính `dueAt` khi `hasDueAt` để không bao giờ bị lệch ngày/giờ — RT-6).
       - `nowMs = input.nowMs ?? Date.now()`, `todayISO = input.todayISO ?? vietnamTodayISO(new Date(nowMs))`.
       - Nếu `input.submittedAt != null`:
         - Khi `hasDueAt`: `submittedMs = Date.parse(input.submittedAt)`, `isLate = Number.isFinite(submittedMs) && submittedMs > rawDueAtMs`.
         - Khi `!hasDueAt`: nếu `input.legacyDateLate === true`, tính ngày VN từ `submittedAt` (`vietnamDateKeyOf(new Date(submittedMs))` nếu hợp lệ, fallback `submittedAt.slice(0, 10)`) và `isLate = /^\d{4}-\d{2}-\d{2}$/.test(input.due) && submitDateISO > input.due`; ngược lại `isLate = false`.
         - Trả `{ hasDueAt, dueAtMs: hasDueAt ? rawDueAtMs : null, dueDateISO, isOverdue: false, isLate }`.
       - Nếu chưa nộp (`submittedAt == null`):
         - Khi `hasDueAt`: `isOverdue = nowMs >= rawDueAtMs`.
         - Khi `!hasDueAt`: `isOverdue = /^\d{4}-\d{2}-\d{2}$/.test(input.due) && input.due < todayISO`.
         - Trả `{ hasDueAt, dueAtMs: hasDueAt ? rawDueAtMs : null, dueDateISO, isOverdue, isLate: false }`.
  2. Trong `packages/api/src/contracts.ts`:
     - Tại `classAssignmentCreateSchema` (khoảng dòng 1142): thêm `dueTime: z.string().regex(TIME_REGEX).optional(),` và cập nhật JSDoc nêu rõ `dueTime` tùy chọn (`HH:MM` giờ VN, mặc định `"23:59"` khi vắng mặt).
     - Tại `KernelClassAssignmentRow` (khoảng dòng 1671): thêm `/** ISO datetime hạn nộp (UTC, tính từ giờ VN lúc giao); null trên dữ liệu cũ trước #572. */ dueAt?: string | null;`.
- **Success criteria:** Tất cả unit test và kiểm tra kiểu của `@teacher-os/api` pass hoàn toàn.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types` exits `0`.

### Task 1.3 — Viết test TDD (Red) cho server `POST /api/classes/:id/assignments`, `loadSnapshot`, `assignmentPublishedEvents` và regression study-pack
- **Goal:** Bổ sung test tích hợp server chứng minh ghi/xuất `dueAt`, chặn giờ đã qua trong ngày (`reason: "past-time"`), không bị khóa chết ở phút `23:59` VN của hôm nay, tương thích ngược khi bỏ trống `dueTime`, định dạng thông báo tiếng Việt, và không ảnh hưởng `backfillStudyPackTargetsForStudent`.
- **Target files and symbols:**
  - `apps/server/src/lib/notifications/templates.test.ts`
  - `apps/server/src/kernel.test.ts`
- **Steps:** <!-- Updated: Red Team RT-2, RT-4, RT-6 -->
  1. Trong `apps/server/src/lib/notifications/templates.test.ts` (khoảng dòng 29–49):
     - Cập nhật test hiện hữu của `assignmentPublishedEvents` với `due: "2026-11-01"` (không có `dueAt`): khẳng định `e.body` chứa `"01/11/2026"` (không còn chuỗi ISO `"2026-11-01"`).
     - Thêm test mới truyền `due: "2026-11-06"`, `dueAt: new Date(Date.parse("2026-11-06T17:30:00+07:00")).toISOString()`: khẳng định `e.body` chứa `"17:30 06/11/2026"`.
  2. Trong `apps/server/src/kernel.test.ts` (sau dòng 6528 trong cụm test `POST /api/classes/:id/assignments`, import thêm `type { Db } from "./app"` và `backfillStudyPackTargetsForStudent` từ `./lib/study-pack-assign`):
     - Cập nhật test `"happy-path"` (dòng 6468): kiểm tra `assigned?.dueAt` bằng `new Date(Date.parse("2030-01-15T23:59:00+07:00")).toISOString()` khi không gửi `dueTime`.
     - Thêm test `"stores custom dueTime as VN timestamp in dueAt and projects to snapshot"`: gửi `{ promptId: promptReadyA, due: "2030-06-11", dueTime: "17:30", note: "", studentIds: [studentIdA1] }` → HTTP `201`, `snapshot.classAssignments` chứa `due: "2030-06-11"` và `dueAt: new Date(Date.parse("2030-06-11T17:30:00+07:00")).toISOString()`.
     - Thêm test `"due today with past dueTime rejects 400 past-time, while future dueTime, 23:59 at 23:59:30 VN, and omitted dueTime succeed"`: dùng `vi.useFakeTimers({ toFake: ["Date"] })` (tuyệt đối chỉ fake `Date`, không fake macrotask timers để không treo libSQL/notifications — RT-4) ghim `vi.setSystemTime(new Date("2026-11-06T14:00:00+07:00"))` trong khối `try { ... } finally { vi.useRealTimers(); }`:
       - Gửi `{ promptId: promptReadyA, due: "2026-11-06", dueTime: "13:59", note: "", studentIds: [studentIdA1] }` → HTTP `400`, JSON `{ error: "invalid due time", reason: "past-time" }`.
       - Gửi `{ promptId: promptReadyA, due: "2026-11-06", dueTime: "14:00", note: "", studentIds: [studentIdA1] }` → HTTP `400`, `reason: "past-time"`.
       - Gửi `{ promptId: promptReadyA, due: "2026-11-06", dueTime: "14:01", note: "", studentIds: [studentIdA1] }` → HTTP `201`.
       - Ghim tiếp `vi.setSystemTime(new Date("2026-11-06T23:59:30+07:00"))`: gửi cả `{ promptId: promptReadyA, due: "2026-11-06", dueTime: "23:59", note: "", studentIds: [studentIdA1] }` lẫn `{ promptId: promptReadyA, due: "2026-11-06", note: "", studentIds: [studentIdA1] }` → đều trả HTTP `201` (không bao giờ khóa chết ngày hôm nay ở phút cuối ngày — RT-2).
     - Thêm test `"regular assignment with non-null dueAt is NOT backfilled by backfillStudyPackTargetsForStudent"`: gọi `await backfillStudyPackTargetsForStudent(t.db as unknown as Db, await t.orgIdOf(orgA), classIdA, studentIdA2, new Date("2026-11-06T10:00:00+07:00"))` và khẳng định kết quả trả `0`.
- **Success criteria:** Các test mới chạy và fail đúng ở các assertion kiểm tra `dueAt`, `past-time` và định dạng thông báo.
- **Verify:** `pnpm --filter server exec vitest run src/lib/notifications/templates.test.ts src/kernel.test.ts` exits non-zero with assertion failure; passing test is a failure.

### Task 1.4 — Cập nhật `kernel.ts`, `snapshot.ts` và `notifications/templates.ts` (Green)
- **Goal:** Cài đặt logic tính/kiểm tra `dueAt` (kèm `deps.now?: () => Date`) trong `POST /api/classes/:id/assignments`, xuất `dueAt` trong `loadSnapshot`, và định dạng ngày/giờ tiếng Việt trong `assignmentPublishedEvents`.
- **Target files and symbols:**
  - `apps/server/src/routes/kernel.ts` (`kernelRoutes` deps & `POST /classes/:id/assignments`, khoảng dòng 124–143 và 710–807)
  - `apps/server/src/routes/snapshot.ts` (`loadSnapshot`, khoảng dòng 716–725)
  - `apps/server/src/lib/notifications/templates.ts` (`assignmentPublishedEvents`, khoảng dòng 76–94)
- **Steps:** <!-- Updated: Red Team RT-2, RT-4, RT-6 -->
  1. Trong `apps/server/src/lib/notifications/templates.ts`:
     - Import `formatViDateDisplay`, `formatVietnamTimeHHMM`, `vietnamDateKeyOf` từ `@teacher-os/api/vietnam-date`.
     - Mở rộng tham số `assignmentPublishedEvents` thêm `dueAt?: string | null`.
     - Định dạng nhãn hạn nộp: nếu `input.dueAt` hợp lệ (`Number.isFinite(Date.parse(input.dueAt))`), lấy cả giờ lẫn ngày theo múi giờ Việt Nam từ chính `dueAt` (`${formatVietnamTimeHHMM(dueAtMs)} ${formatViDateDisplay(vietnamDateKeyOf(new Date(dueAtMs)))}`); nếu không có `dueAt`, dùng `formatViDateDisplay(input.due)`. Đặt `body: \`Có bài tập mới: ${input.title}, hạn nộp ${dueLabel}.\``.
  2. Trong `apps/server/src/routes/kernel.ts`:
     - Import thêm `vietnamDateTimeMs` từ `@teacher-os/api/vietnam-date`.
     - Thêm tùy chọn `now?: () => Date;` vào kiểu tham số `deps` của `kernelRoutes` (khoảng dòng 124–143).
     - Trong `kernel.post("/classes/:id/assignments", ...)` (khoảng dòng 742):
       - Lấy `const now = deps.now ? deps.now() : new Date();` và `const todayVN = vietnamTodayISO(now);`.
       - Kiểm tra `!parseStartDateStrict(input.due) || input.due < todayVN` → trả `400 { error: "invalid due date", reason: "invalid-date" }`.
       - Tính `const effectiveDueTime = input.dueTime ?? "23:59";`, `const dueAtMs = vietnamDateTimeMs(input.due, effectiveDueTime);`.
       - Nếu `Number.isNaN(dueAtMs)` → trả `400 { error: "invalid due date", reason: "invalid-date" }`.
       - Nếu `input.dueTime !== undefined && !(input.due === todayVN && input.dueTime === "23:59") && dueAtMs <= now.getTime()` → trả `400 { error: "invalid due time", reason: "past-time" }`.
       - Tạo `const dueAtDate = new Date(dueAtMs);`.
       - Khi `db.insert(classAssignment).values({...})`, truyền thêm `dueAt: dueAtDate`.
       - Khi gọi `assignmentPublishedEvents({...})`, truyền thêm `dueAt: dueAtDate.toISOString()`.
  3. Trong `apps/server/src/routes/snapshot.ts` (khoảng dòng 716–725):
     - Bổ sung `dueAt: row.dueAt ? row.dueAt.toISOString() : null,` vào object trả về của `classAssignmentRows.map((row) => ({ ... }))`.
- **Success criteria:** Toàn bộ test của `templates.test.ts`, `kernel.test.ts` và kiểm tra kiểu của `server` đều pass.
- **Verify:** `pnpm --filter server exec vitest run src/lib/notifications/templates.test.ts src/kernel.test.ts && pnpm --filter server check-types` exits `0`.

## Verification

- `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types` exits `0`.
- `pnpm --filter server exec vitest run src/lib/notifications/templates.test.ts src/kernel.test.ts && pnpm --filter server check-types` exits `0`.

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
