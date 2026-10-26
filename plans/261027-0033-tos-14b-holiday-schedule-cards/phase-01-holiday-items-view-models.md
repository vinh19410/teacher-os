# Phase 1: Holiday items trong view-model Tháng / Ngày

## Goal
`buildMonthCells` và `buildDayAgenda` trả thêm item `kind: "holiday"` cho mỗi ngày thuộc khoảng `[fromDate..toDate]` của một kỳ nghỉ trong snapshot — dữ liệu thật từ `data.holidays`, không fixture cứng trong view.

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

### Task 1.1 — Test trước: holiday items trong `buildMonthCells` (TDD red)
- Goal: test mô tả hành vi mới thất bại vì view-model chưa có holiday.
- Target files: `apps/web/src/lib/schedule-month.test.ts` (append describe mới, không sửa test cũ).
- Steps:
  1. Thêm fixture holiday span ví dụ `{ id: "hol-1", name: "Nghỉ lễ 30/4", fromDate: "2026-04-28", toDate: "2026-04-30" }` truyền qua `MonthSourceData.holidays` (tham số mới, optional).
  2. Assert: ngày 28, 29, 30/4 mỗi ô có đúng 1 item `{ kind: "holiday", id: "hol-1", name: "Nghỉ lễ 30/4" }`; ngày ngoài span không có.
  3. Assert: item holiday đứng **trước** lesson/event trong `cell.items` (kỳ nghỉ là cả ngày) và chiếm slot trong cap 3 (ô có ≥3 buổi + holiday → holiday giữ slot đầu, `overflow` tăng tương ứng).
  4. Assert: `holidays` không truyền (undefined) → không item holiday nào, hành vi cũ giữ nguyên.
- Success criteria: các test mới chạy và FAIL vì `buildMonthCells` chưa nhận `holidays` (type error hoặc assertion fail).
- Verify: `pnpm --filter web test -- schedule-month` thoát non-zero với lỗi ở describe holiday mới; các test cũ trong file vẫn PASS.

### Task 1.2 — Test trước: holiday item trong `buildDayAgenda` (TDD red)
- Goal: test agenda ngày có item holiday, sort trước các item có giờ.
- Target files: `apps/web/src/lib/schedule-day.test.ts` (append, không sửa test cũ).
- Steps:
  1. Fixture holiday span dài 3 ngày qua `DaySourceData.holidays`.
  2. Assert: `buildDayAgenda(data, "2026-04-29")` có item `{ kind: "holiday", id, name, fromDate, toDate }` đúng span; ngày ngoài span thì không.
  3. Assert: item holiday đứng đầu agenda dù lesson/event có giờ sớm hơn.
  4. Assert: không truyền `holidays` → hành vi cũ giữ nguyên.
- Success criteria: test mới FAIL vì type/chưa có holiday; test cũ PASS.
- Verify: `pnpm --filter web test -- schedule-day` thoát non-zero với lỗi ở describe holiday mới; test cũ trong file PASS.

### Task 1.3 — Implement view-model holiday (TDD green)
- Goal: cả hai view-model trả item holiday theo spec test.
- Target files:
  - `apps/web/src/lib/schedule-month.ts` — thêm `export interface HolidaySpanLike { id: string; name: string; fromDate: string; toDate: string }` (structural mirror của `KernelHolidaySummary`, comment ghi rõ KHÔNG import từ `@teacher-os/api` — pattern `ScheduleEventLike`); `MonthSourceData.holidays?: readonly HolidaySpanLike[]`; `MonthHolidayItem { kind: "holiday"; id: string; name: string }`; thêm vào union `MonthItem`.
  - `apps/web/src/lib/schedule-day.ts` — `DaySourceData.holidays?: readonly HolidaySpanLike[]` (import type `HolidaySpanLike` từ `schedule-month` — nguồn duy nhất); `DayHolidayItem { kind: "holiday"; id: string; name: string; fromDate: string; toDate: string }`; thêm vào union `DayAgendaItem`.
- Steps:
  1. Trong `buildMonthCells`: index holidays theo date một lần ngoài vòng lặp cell (expand span bằng vòng `while fromDate <= toDate` so sánh chuỗi ISO — cùng convention `yyyy-mm-dd` UTC của `week-grid`), pattern Map như `eventsByDate`.
  2. Push `MonthHolidayItem` vào `items` trước sort; sửa `compareItems`: holiday sort trước (key 0), lesson/event giữ logic time rồi id.
  3. Trong `buildDayAgenda`: sau vòng events, push `DayHolidayItem` cho holiday có `fromDate <= dateISO <= toDate`; sort cùng quy tắc holiday-trước.
  4. Không đụng logic lesson/event/projected hiện có.
- Success criteria: toàn bộ test `schedule-month` + `schedule-day` xanh (test cũ không đổi hành vi).
- Verify: `pnpm --filter web test -- schedule-month schedule-day` exit 0, tổng kết "passed" gồm cả describe holiday mới.

### Task 1.4 — Regression gate toàn cục giai đoạn 1
- Goal: không vỡ feature khác dùng chung view-model/mock-data.
- Target files: không có (chỉ chạy).
- Steps: chạy check types và lint.
- Success criteria: sạch.
- Verify: `pnpm check-types` exit 0 và `pnpm check` exit 0.
