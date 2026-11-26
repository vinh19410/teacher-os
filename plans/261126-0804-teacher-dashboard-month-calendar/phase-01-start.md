---
phase: 1
title: "Phase 1: Pure Calendar Index, Grid Math & Selectors (TDD)"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Pure Calendar Index, Grid Math & Selectors (TDD)

## Goal

Xây dựng và khóa bằng TDD toàn bộ tầng logic thuần cho widget Lịch tháng trên `/teacher/dashboard`: export `compareLessonTime` từ `dashboard-from-kernel.ts`, tạo `dashboard-calendar.ts` với `buildDashboardCalendarIndex` (allowlist lớp `active`, hybrid 1-pass an toàn với `holiday` và lớp trộn), `sessionsForDashboardDate` (trả `readonly`), `monthCalendarGrid`, `shiftCalendarMonth`, `formatMonthHeading`, `formatAgendaDateLabel` (chống đầu vào bẩn) và kiểm chứng toàn bộ case biên trong `dashboard-calendar.test.ts`.

## Files to Create / Modify

- Modify: `apps/web/src/lib/dashboard-from-kernel.ts` (export `compareLessonTime`).
- Create: `apps/web/src/lib/dashboard-calendar.ts`.
- Create: `apps/web/src/lib/dashboard-calendar.test.ts`.

## Tests Before

Viết trước suite unit test đỏ trong `apps/web/src/lib/dashboard-calendar.test.ts` phủ toàn bộ hợp đồng dữ liệu và toán học lịch UTC trước khi viết implementation `dashboard-calendar.ts`.

## Tasks & Steps

### Task 1.1 — Export `compareLessonTime` và viết bộ test TDD đỏ cho `dashboard-calendar`

<!-- Updated: Red Team Session 1 - Chốt allowlist lớp active, lọc holiday trước buildClassSessions, lớp trộn dated+undated, fixture days:[0,2] với day:1/3, thống nhất date:"", và test đầu vào bẩn -->

- **Goal:** Tạo bộ unit test mô tả đầy đủ hợp đồng `dashboard-calendar.ts` và xác nhận test fail ở pha Red (module chưa tồn tại).
- **Target files and symbols:**
  - `apps/web/src/lib/dashboard-from-kernel.ts` (`compareLessonTime`)
  - `apps/web/src/lib/dashboard-calendar.test.ts` (tests cho `buildDashboardCalendarIndex`, `sessionsForDashboardDate`, `monthCalendarGrid`, `shiftCalendarMonth`, `formatMonthHeading`, `formatAgendaDateLabel`)
- **Steps:**
  1. Trong `apps/web/src/lib/dashboard-from-kernel.ts`, đổi `function compareLessonTime(` thành `export function compareLessonTime(`. Không thay đổi logic hàm.
  2. Tạo `apps/web/src/lib/dashboard-calendar.test.ts` với mọi fixture đều khai báo mảng `classes` tương ứng và bao phủ các test cases sau:
     - **Dated multi-week:** 3 buổi `dated` của lớp active cùng thứ 4 ở 3 tuần khác nhau (`2026-10-07`, `2026-10-14`, `2026-10-21`) chỉ xuất hiện đúng ngày tương ứng.
     - **Same class, 2 times same day & time normalization:** lớp active `cl-1` có 2 buổi `"9:00"` và `"14:00"` cùng ngày `2026-10-07` trả về đủ 2 mục, sắp xếp theo phút (`"9:00"` trước `"14:00"`); hai row cùng lớp cùng ngày ghi `"9:00"` và `"09:00"` (hoặc `" 19:00"` và `"19:00"`) chỉ dedup thành 1 buổi duy nhất.
     - **Dedupe multi-student & mixed status (`1:2`):** 2 học viên cùng lớp/ngày/giờ gộp thành 1 buổi; nếu 1 học viên `cancelled` và 1 học viên `upcoming` thì buổi vẫn giữ; nếu tất cả `cancelled` hoặc `holiday` thì bị loại.
     - **Fail-closed active class allowlist (#694 + orphan lessons):** lớp `status: "paused"` bị loại hoàn toàn khỏi mọi ngày — bao gồm cả buổi `dated` quá khứ có `status: "completed"` hoặc `status: "absent"` lẫn buổi `upcoming` và legacy undated; bài học tham chiếu `classId` không tồn tại trong `classes` (cả `dated` lẫn `undated`) cũng bị loại hoàn toàn.
     - **Legacy undated — resolved (`buildClassSessions` 1-pass + lọc `holiday` TOS-11):**
       - Lớp active `cl-leg` có `schedule: '{"days":[0,2],"start":"19:00","end":"20:30"}'` (0-based: Thứ Hai `day: 1` & Thứ Tư `day: 3`), `startDate: "2026-10-05"` (Thứ Hai), các row `date: null` (và kiểm thêm case `date: ""` tương đương trên lớp structured):
         - 2 row `day: 1`: 1 `completed`, 1 `cancelled` → `2026-10-05` hiển thị, `2026-10-12` bị loại.
         - 3 row `day: 3`: 1 `completed`, 1 `upcoming`, 1 `holiday` → `holiday` bị loại trước khi gọi `buildClassSessions`, nên chỉ có 2 occurrence `2026-10-07` và `2026-10-14` hiển thị; `2026-10-21` (nếu không lọc `holiday` sẽ bị rò rỉ thành buổi thứ 3), `2026-10-19` và toàn bộ tháng `2026-11` trả rỗng.
     - **Legacy undated — unresolved fallback & lớp trộn dated+undated:**
       - Lớp active có `schedule: "T3 19:00"` (free text) hoặc `startDate: "01/08"` với row `date: null` hoặc `date: ""` fallback khớp theo `lesson.day` (`1..7`), loại `cancelled`/`holiday`, dedup theo `(classId, normalizedTime)`.
       - Row mang malformed non-empty date (ví dụ `date: "2026-02-30"`) trên lớp active đi thẳng `unresolvedLegacyRows` theo `lesson.day` (bỏ qua nếu `lesson.day` ngoài `1..7` như `0` hoặc `8`).
       - Lớp trộn cả row `dated` (`date: "2026-10-05"`) lẫn row `undated` (`date: null`, `day: 3`): không chạy `buildClassSessions` đè lại từ `startDate`; row `dated` khớp `2026-10-05`, row `undated` rơi về `unresolvedLegacyRows` (`day: 3`), và nếu cùng ngày trùng `(classId, normalizedTime)` chỉ trả 1 mục duy nhất.
     - **Grid math, month navigation & invalid-input guards (`monthCalendarGrid`, `shiftCalendarMonth`, `formatMonthHeading`, `formatAgendaDateLabel`):**
       - `2026-11`: `leadingBlanks === 6` (01/11/2026 là Chủ Nhật), `days.length === 30`, `days[0]` có `isWeekend: true`.
       - Tháng nhuận `2024-02` có `29` ngày; `2026-02` có `28` ngày.
       - `shiftCalendarMonth("2026-12", 1) === "2027-01"`, `shiftCalendarMonth("2026-01", -1) === "2025-12"`.
       - Kẹp biên năm: `shiftCalendarMonth("1970-01", -1) === "1970-01"`, `shiftCalendarMonth("2099-12", 1) === "2099-12"`.
       - Guard đầu vào bẩn (không ném `RangeError`, không sinh `"Thứ NaN"`): `shiftCalendarMonth("invalid", 1)` và `shiftCalendarMonth("2026-10", Number.NaN)` trả an toàn không throw; `monthCalendarGrid("2026-13")` trả `{ ym: "2026-13", leadingBlanks: 0, days: [] }`; `formatMonthHeading("2026-11") === "Tháng 11 năm 2026"`, `formatMonthHeading("2026-01") === "Tháng 1 năm 2026"`, `formatMonthHeading("invalid") === ""`; `formatAgendaDateLabel("2026-10-07", "2026-10-07") === "Hôm nay"`, `formatAgendaDateLabel("2026-10-08", "2026-10-07") === "Thứ Năm"`, `formatAgendaDateLabel("", "2026-10-07") === ""` (tuyệt đối không có `"Thứ NaN"`).
- **Success criteria:** File test được tạo đầy đủ các case trên và lỗi đúng do thiếu `./dashboard-calendar`.
- **Verify:** `pnpm --filter web exec vitest run src/lib/dashboard-calendar.test.ts` exits non-zero với lỗi import/missing module `./dashboard-calendar` (passing ở bước này là thất bại).

### Task 1.2 — Triển khai `apps/web/src/lib/dashboard-calendar.ts` (pha Green)

<!-- Updated: Red Team Session 1 - Đổi trả về readonly DashboardCalendarSession[] + EMPTY_SESSIONS, allowlist activeClassById, lọc holiday trước buildClassSessions, guard classesWithDatedRows, dedup theo phút, guard YM_PATTERN/Number.isInteger/isValidISODate/day 1..7 -->

- **Goal:** Hiện thực đầy đủ toàn bộ pure types và helpers trong `dashboard-calendar.ts` để 100% test ở Task 1.1 pass và không lỗi TypeScript/Biome.
- **Target files and symbols:**
  - `apps/web/src/lib/dashboard-calendar.ts` (`DashboardCalendarSession`, `DashboardCalendarIndex`, `CalendarDayCell`, `CalendarMonthGrid`, `MIN_CALENDAR_YM`, `MAX_CALENDAR_YM`, `buildDashboardCalendarIndex`, `sessionsForDashboardDate`, `monthCalendarGrid`, `shiftCalendarMonth`, `formatMonthHeading`, `formatAgendaDateLabel`)
- **Steps:**
  1. Định nghĩa types & constants:
     - `DashboardCalendarSession`: `{ classId: string; time: string; dur: number }`
     - `DashboardCalendarIndex`: `{ datedByIso: ReadonlyMap<string, readonly DashboardCalendarSession[]>; legacyByWeekday: ReadonlyMap<number, readonly DashboardCalendarSession[]> }`
     - `CalendarDayCell`: `{ iso: string; day: number; isWeekend: boolean }`
     - `CalendarMonthGrid`: `{ ym: string; leadingBlanks: number; days: CalendarDayCell[] }`
     - `MIN_CALENDAR_YM = "1970-01"`, `MAX_CALENDAR_YM = "2099-12"`, `YM_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/`, `EMPTY_SESSIONS: readonly DashboardCalendarSession[] = []`.
     - Helper nội bộ `sessionDedupKey(classId: string, time: string): string`: dùng `parseTimeToMinutes(time)` (từ `dashboard-from-kernel.ts`) nếu khác `null` → `` `${classId}|m:${minutes}` ``, ngược lại `` `${classId}|t:${time.trim()}` `` (chống trùng `"9:00"` vs `"09:00"` và khoảng trắng thừa).
     - Helper nội bộ `isValidCalendarYm(ym: string): boolean`: khớp `YM_PATTERN` và `ym >= MIN_CALENDAR_YM && ym <= MAX_CALENDAR_YM`.
  2. Triển khai `buildDashboardCalendarIndex(lessons: readonly Lesson[], classes: readonly Pick<ClassGroup, "id" | "status" | "schedule" | "startDate" | "sessionsTotal">[]): DashboardCalendarIndex`:
     - Xây **allowlist fail-closed**: `activeClassById = new Map(...)` chỉ chứa các `cls` có `cls.status === "active"`.
     - Duyệt `lessons` 1 pass:
       - `const cls = activeClassById.get(lesson.classId); if (!cls) continue;` (loại hoàn toàn lớp `paused`, status lạ tương lai và lesson mồ côi cho cả `dated` lẫn `undated`).
       - Nếu `lesson.date != null && isValidISODate(lesson.date)`:
         - Ghi nhận `classesWithDatedRows.add(lesson.classId)`.
         - Bỏ qua nếu `lesson.status === "cancelled" || lesson.status === "holiday"`.
         - Thêm `{ classId: lesson.classId, time: lesson.time.trim(), dur: lesson.dur }` vào `datedBuckets.get(lesson.date)`.
       - Ngược lại, nếu `lesson.date == null || lesson.date === ""`:
         - Bỏ qua ngay nếu `lesson.status === "holiday"` (TOS-11 I4: `holiday` không tiêu thụ số buổi và `slotStatsBySid` không đếm `holiday`).
         - Giữ cả `cancelled` đưa vào `nullDateByClass.get(lesson.classId)` để bảo toàn prefix heuristic cho `buildClassSessions`.
       - Ngược lại (chuỗi `lesson.date` non-empty nhưng `!isValidISODate(lesson.date)`, ví dụ `"2026-02-30"`):
         - Bỏ qua nếu `lesson.status === "cancelled" || lesson.status === "holiday"`.
         - Đẩy vào `unresolvedLegacyRows`.
     - Với mỗi `[classId, undatedRows]` trong `nullDateByClass`:
       - `const cls = activeClassById.get(classId);`
       - Nếu `!cls || classesWithDatedRows.has(classId)`: không gọi `buildClassSessions` trên tập con undated; lọc `r.status !== "cancelled" && r.status !== "holiday"` đẩy sang `unresolvedLegacyRows`.
       - Ngược lại gọi `buildClassSessions({ schedule: cls.schedule, startDate: cls.startDate, lessons: undatedRows.map((r) => (r.date === null ? r : { ...r, date: null })), sessionsTotal: cls.sessionsTotal })` đúng 1 lần cho lớp.
       - Nếu trả về mảng không null (`resolved`): với mỗi `occ`, nếu `sessionStatus(occ) === "cancelled"` thì bỏ qua; ngược lại thêm `{ classId, time: occ.time.trim(), dur: occ.dur }` vào `datedBuckets.get(occ.dateISO)`.
       - Nếu trả về `null` (`unresolved`): lọc `r.status !== "cancelled" && r.status !== "holiday"` đẩy sang `unresolvedLegacyRows`.
     - Hoàn thiện `datedByIso`: với mỗi ngày trong `datedBuckets`, dedup theo `sessionDedupKey(s.classId, s.time)` và sort bằng `compareLessonTime(a.time, b.time)`.
     - Hoàn thiện `legacyByWeekday`: với mỗi row trong `unresolvedLegacyRows`, chỉ nhận `Number.isInteger(row.day) && row.day >= 1 && row.day <= 7`, gom theo `row.day`, dedup theo `sessionDedupKey` và sort bằng `compareLessonTime`.
  3. Triển khai `sessionsForDashboardDate(index: DashboardCalendarIndex, dateIso: string): readonly DashboardCalendarSession[]`:
     - `const dated = index.datedByIso.get(dateIso) ?? EMPTY_SESSIONS;`
     - `const legacy = isValidISODate(dateIso) ? (index.legacyByWeekday.get(isoDayNumber(dateIso)) ?? EMPTY_SESSIONS) : EMPTY_SESSIONS;`
     - Nếu `legacy.length === 0` trả về `dated`; nếu `dated.length === 0` trả về `legacy`.
     - Nếu cả hai đều có phần tử: hợp nhất (ưu tiên `dated`), dedup bằng `sessionDedupKey`, rồi sort bằng `compareLessonTime(a.time, b.time)`.
  4. Triển khai các hàm lưới tháng UTC thuần có guard đầu vào bẩn:
     - `monthCalendarGrid(viewYm: string): CalendarMonthGrid`: nếu `!isValidCalendarYm(viewYm)` trả `{ ym: viewYm, leadingBlanks: 0, days: [] }`; ngược lại parse `year`/`month`, tính `leadingBlanks = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7`, `daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()`, sinh `days` cho `1..daysInMonth` với `isWeekend = (leadingBlanks + d - 1) % 7 >= 5`.
     - `shiftCalendarMonth(viewYm: string, delta: number): string`: nếu `!isValidCalendarYm(viewYm) || !Number.isInteger(delta)` trả `viewYm`; ngược lại trả `addMonths(`${viewYm}-01`, delta).slice(0, 7)`.
     - `formatMonthHeading(viewYm: string): string`: nếu `!isValidCalendarYm(viewYm)` trả `""`; ngược lại trả `` `Tháng ${Number(viewYm.slice(5, 7))} năm ${viewYm.slice(0, 4)}` ``.
     - `formatAgendaDateLabel(dateIso: string, todayIso: string): string`: nếu `!isValidISODate(dateIso)` trả `""`; nếu `dateIso === todayIso` trả `"Hôm nay"`; ngược lại trả `formatWeekdayLong(isoDayNumber(dateIso))`.
- **Success criteria:** Tất cả unit test trong `dashboard-calendar.test.ts` và `dashboard-from-kernel.test.ts` pass 100%, không có lỗi TypeScript (`TS4104` đã triệt tiêu) hoặc Biome.
- **Verify:** `pnpm --filter web exec vitest run src/lib/dashboard-calendar.test.ts src/lib/dashboard-from-kernel.test.ts && pnpm --filter web check-types && pnpm exec biome check apps/web/src/lib/dashboard-calendar.ts apps/web/src/lib/dashboard-calendar.test.ts apps/web/src/lib/dashboard-from-kernel.ts` exits 0.

## Tests After

- `pnpm --filter web exec vitest run src/lib/dashboard-calendar.test.ts src/lib/dashboard-from-kernel.test.ts` exits 0.
- `pnpm --filter web check-types` exits 0.
- `pnpm exec biome check apps/web/src/lib/dashboard-calendar.ts apps/web/src/lib/dashboard-calendar.test.ts apps/web/src/lib/dashboard-from-kernel.ts` exits 0.

## Verification

- `pnpm --filter web exec vitest run src/lib/dashboard-calendar.test.ts src/lib/dashboard-from-kernel.test.ts && pnpm --filter web check-types && pnpm exec biome check apps/web/src/lib/dashboard-calendar.ts apps/web/src/lib/dashboard-calendar.test.ts apps/web/src/lib/dashboard-from-kernel.ts`

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
