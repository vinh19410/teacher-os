# Phase 2: Thẻ kỳ nghỉ hiển thị trong 3 view

## Goal
Thẻ kỳ nghỉ (holiday card) hiển thị ở ô Tháng, cột Tuần và agenda Ngày của `/schedule` từ `data.holidays` thật; 375px chỉ có chấm warn trong ô Tháng; layout không vỡ.

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

### Task 2.1 — Tạo component `HolidayCalendarCard`
- Goal: một component card dùng chung cho 3 view, warn styling nhất quán.
- Target files: `apps/web/src/components/schedule/holiday-calendar-card.tsx` (create).
- Steps:
  1. Props: `{ name: string; fromDate?: string; toDate?: string; full?: boolean }`.
  2. `full` (view Ngày): card lớn — icon + tên (`font-medium text-warn`) + dòng phụ khoảng ngày `formatDayMonth(from) – formatDayMonth(to)` chỉ khi span > 1 ngày (`text-[11px] text-warn/80`).
  3. compact (mặc định, view Tháng/Tuần): 1 dòng truncate — icon nhỏ + tên, `truncate rounded border border-warn/50 bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn` (pattern `month-item` + warn token của `holiday-preview-table.tsx`).
  4. `data-testid="holiday-calendar-card"` trên phần tử ngoài cùng; icon dùng lucide sẵn có trong deps (vd `Palmtree`/`Sun` — chọn icon đã dùng được trong repo; nếu import hỏng thì đổi icon khác của lucide-react).
  5. Không dùng màu hard-code ngoài token warn (`border-warn/50 bg-warn-soft text-warn`) theo `DESIGN.md`.
- Success criteria: component render được cả 2 variant, không import nào lỗi.
- Verify: `pnpm --filter web test -- holiday-calendar-card` — chưa có test riêng, chấp nhận "no test files found" exit 0 HOẶC chỉ chạy `pnpm --filter web exec biome check src/components/schedule/holiday-calendar-card.tsx` exit 0 (lint sạch). Kiểm chứng render thật nằm ở Task 2.4.

### Task 2.2 — View Tháng render thẻ holiday
- Goal: ô Tháng có thẻ holiday; mobile 375px có chấm warn.
- Target files: `apps/web/src/components/schedule/schedule-month-view.tsx` (modify), `apps/web/src/lib/repos/holidays.ts` (chỉ khi cần helper — không bắt buộc).
- Steps:
  1. Truyền `holidays: data.holidays` vào `buildMonthCells` trong `useMemo`.
  2. Trong vòng render `cell.items`, thêm nhánh `item.kind === "holiday"` → `<HolidayCalendarCard name={item.name} />` (compact, key `item.id`); các nhánh lesson/event giữ nguyên.
  3. Chấm mobile: `item.kind === "holiday"` → class `bg-warn` (lesson giữ `classDotClass`, event giữ `bg-muted-foreground`).
  4. Desktop: thẻ nằm trong khối `max-sm:hidden` hiện có, truncate 1 dòng.
- Success criteria: ô ngày thuộc span holiday hiển thị thẻ; layout ô không đổi chiều cao bất thường.
- Verify: `pnpm --filter web test -- schedule-month schedule-day` exit 0 (view-model xanh) và `pnpm --filter web exec biome check src/components/schedule/schedule-month-view.tsx` exit 0.

### Task 2.3 — View Tuần + View Ngày render thẻ holiday
- Goal: cột tuần và agenda ngày hiển thị thẻ kỳ nghỉ đúng ngày.
- Target files: `apps/web/src/components/schedule/schedule-week-view.tsx` (modify), `apps/web/src/components/schedule/schedule-day-view.tsx` (modify).
- Steps:
  1. Week: trong component, build `holidaysOnDate: Map<string, KernelHolidaySummary[]>` bằng cách expand span từ `data.holidays` (một lần, ngoài vòng cột — cùng vị trí `eventsByDate`); render `HolidayCalendarCard` compact cho từng holiday của `dates[i]` sau các block buổi học, trước `dayEvents`; điều kiện "—" rỗng thêm xét `holidaysOnDate` (cột có holiday nhưng không buổi → không hiện "—").
  2. Day: trong vòng `items`, nhánh `item.kind === "holiday"` → `<HolidayCalendarCard full name fromDate toDate />`; các nhánh khác giữ nguyên.
  3. Không đổi `ClassSessionModal`, `OrgEventChip`, block buổi học.
- Success criteria: agenda ngày có thẻ full đầu danh sách; cột tuần có thẻ compact trong đúng cột ngày.
- Verify: `pnpm --filter web test -- schedule-week` exit 0 và `pnpm --filter web exec biome check src/components/schedule/` exit 0.

### Task 2.4 — Smoke UI thật + regression viewport
- Goal: thẻ hiện đúng trên UI thật, không vỡ 3 viewport.
- Target files: không có (chạy).
- Steps:
  1. Chạy dev stack + seed lớp có buổi hôm nay, tạo holiday 1 ngày hôm nay qua hộp thoại (hoặc dùng E2E của phase 3 làm proof).
  2. Kiểm 3 viewport 1440×900 / 768×1024 / 375×812: không tràn ngang 375px, thẻ không làm lệch baseline hiện có ngoài ý muốn.
- Success criteria: thẻ hiển thị cả 3 view; không overflow 375px.
- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- schedule-views-and-events` exit 0 (proof cuối ở phase 3; giai đoạn này có thể ghi nhận pending và chuyển task đó sang phase 3 — KHÔNG được bỏ cả hai).
