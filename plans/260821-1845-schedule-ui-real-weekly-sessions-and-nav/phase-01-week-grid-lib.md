---
phase: 1
title: "Pure lib week-grid: toán tuần ISO/UTC an toàn múi giờ + unit tests"
status: pending
priority: P1
effort: "1h30"
dependencies: []
---

# Phase 1: Pure lib week-grid

## Overview

Tạo `apps/web/src/lib/week-grid.ts` — thư viện hàm thuần (không React, không deps mới) phục vụ
phase 2: parse/validate param `?week`, tính start-of-week (Monday-first), ±n tuần, 7 ngày của
tuần, so sánh cùng tuần, format khoảng tuần "18–24/08" và ngày "18/08", và "hôm nay" theo giờ
Việt Nam. Mọi phép toán ngày trên chuỗi ISO `yyyy-mm-dd` anchor UTC-midnight → deterministic
trên CI chạy UTC; clock injectable qua tham số `now`.

## Requirements

- Functional — export từ `week-grid.ts`:
  - `todayISOVietnam(now = new Date()): string` — ngày "hôm nay" `yyyy-mm-dd` theo
    `Asia/Ho_Chi_Minh` qua `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })`
    (en-CA cho ra `yyyy-mm-dd` trực tiếp; mirror pattern server `kernel.ts:716-722`). KHÔNG
    dùng `new Date().getDate()` trần.
  - `parseWeekParam(raw: unknown): string | null` — trả ISO `yyyy-mm-dd` nếu `raw` là chuỗi
    khớp regex `^(\d{4})-(\d{2})-(\d{2})$`, năm trong **1970–2099** (red-team #13: chặn
    expanded-year ở biên — `9999-12-31` + addWeeks sinh garbage `"+010000-0"`), VÀ roundtrip
    hợp lệ (tháng 1-12, ngày tồn tại thật — pattern roundtrip của `date-input.ts:3-23`;
    `2026-02-30`, `2026-13-01`, `9999-12-31`, `0001-01-01` → null); ngược lại null.
  - `resolveWeek(rawParam: unknown, now: Date = new Date()): { weekStart: string; dates: string[];
    isCurrentWeek: boolean }` (red-team #10 — composition hàm quyết định correctness của issue,
    không chỉ từng hàm rời): `parseWeekParam(rawParam) ?? todayISOVietnam(now)` →
    `startOfWeekMonday` → `{ weekStart, dates: weekDates(...), isCurrentWeek: isSameISOWeek(weekStart,
    todayISOVietnam(now)) }`. Route component CHỈ consume hàm này (mọi derivation đi qua 1 chỗ).
  - `startOfWeekMonday(iso: string): string` — ISO của Thứ 2 tuần chứa `iso` (Mon-first,
    khớp `lesson.day` 1-7 và `dayNames` `["T2".."CN"]` tại `mock-data.ts:156`). Input đã được
    assume hợp lệ (output của parseWeekParam/todayISOVietnam) — throw/never care: chỉ dùng nội bộ.
  - `addWeeks(iso: string, n: number): string` — `iso + n*7 ngày` (anchor `new Date(\`${iso}T00:00:00Z\`)`,
    cộng mili-giây 7n ngày, `toISOString().slice(0,10)` — không DST trên UTC anchor). **Guard
    output (red-team #13):** kết quả phải khớp `^\d{4}-\d{2}-\d{2}$` (từ chối expanded-year
    `"+010000-01-07"`), không khớp → trả về `iso` đầu vào (nav đứng yên ở biên thay vì ghi rác
    vào URL).
  - `weekDates(weekStartIso: string): string[]` — 7 ISO Thứ 2→CN (derive từ
    `startOfWeekMonday(weekStartIso)` để chịu được đầu vào bất kỳ ngày nào trong tuần).
  - `isSameISOWeek(a: string, b: string): boolean` — `startOfWeekMonday(a) === startOfWeekMonday(b)`.
  - `formatDayMonth(iso: string): string` — `"18/08"` qua `Intl.DateTimeFormat("vi-VN",
    { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" })` (lấy phần ngày/tháng
    từ ISO anchor UTC — dùng parts của ISO string trực tiếp cũng chấp nhận được NẾU và chỉ nếu
    không tạo Date local; ghi chú trong implementation chọn một cách và test pin).
  - `formatWeekRange(weekStartIso: string): string` — cùng tháng `"18–24/08"` (en-dash "–",
    cùng ký tự lead cũ "19–25/08" đã gỡ nhưng giờ COMPUTED); khác tháng `"31/08–06/09"`;
    khác năm (tuần vắt 28/12→03/01) `"28/12–03/01"` (không cần hiện năm — khoảng tuần ngắn,
    consistent với format dd/MM).
  - **JSDoc đầu file pin 3 quy ước ngày** (mirror `kernel.ts:72-80` và `format-schedule.ts:46-52`):
    (1) class schedule JSON `days` 0-6 Mon-first; (2) `lesson.day` 1-7 Mon-first; (3) JS
    `getDay()` 0=Sunday — "never use raw getDay()"; week-grid làm việc trên ISO strings nên
    không chạm quy ước (3) ngoàitodayISOVietnam đãTZ-đúng.
- Non-functional:
  - Pure functions only — không import React, không side effect, không deps ngoài stdlib.
  - Mọi Date nội bộ là UTC (either `T00:00:00Z` anchor hoặc `timeZone` explicit) — CI-UTC safe.
  - File nằm `apps/web/src/lib/` đúng convention test `src/lib/**/*.test.ts` chạy vitest node.

## Architecture

Data flow phase 2 (để hình dung contract): URL `?week=2026-08-21` → `validateSearch` (sanitize
string thô, precedent `login.tsx:17-23`) → component gọi `parseWeekParam(param)` → null thì
dùng `todayISOVietnam()` → `startOfWeekMonday` → `weekDates` (sub-label cột) +
`formatWeekRange` (lead) + so sánh với `todayISOVietnam()` (today-highlight) → nav gọi
`addWeeks(weekStart, ±1)` viết lại param. Lib không biết gì về lesson/router — test độc lập.

## Related Code Files

- Create: `apps/web/src/lib/week-grid.ts`, `apps/web/src/lib/week-grid.test.ts`
- Modify: (không)
- Delete: (không)

## Implementation Steps (TDD)

1. **Tests Before** — viết `week-grid.test.ts` với các nhóm case (chạy `pnpm -F web test` → đỏ vì module chưa có):
   - `todayISOVietnam`: clock cố định `new Date("2026-08-21T18:30:00Z")` → `"2026-08-22"`
     (18:30Z = 01:30 ngày 22 ở +07 — pin UTC-drift); `new Date("2026-08-21T10:00:00Z")` → `"2026-08-21"`.
   - `parseWeekParam`: `"2026-08-21"` → `"2026-08-21"`; `undefined`, `"abc"`, `"2026-8-1"`,
     `"2026-02-30"`, `"2026-13-01"`, `20260821` (number), `"9999-12-31"`, `"0001-01-01"` →
     `null` (bound năm 1970–2099).
   - `resolveWeek` (red-team #10): `resolveWeek("2026-08-20", new Date("2026-08-21T10:00:00Z"))` →
     `{ weekStart: "2026-08-17", dates: ["2026-08-17".."2026-08-23"], isCurrentWeek: true }`;
     `resolveWeek("abc", ...)` → tuần chứa today, `isCurrentWeek: true`; `resolveWeek("2026-01-06", ...)`
     → `weekStart: "2026-01-05"`, `isCurrentWeek: false`; clock vắt ngày VN
     (`new Date("2026-08-21T18:30:00Z")` = 21/08 23:30 VN... cẩn thận: 18:30Z = 01:30+7 ngày 22/08
     → today = "2026-08-22" → isCurrentWeek tính theo "2026-08-22").
   - `startOfWeekMonday`: `"2026-08-21"` (Thứ 6) → `"2026-08-17"`; `"2026-08-16"` (CN) →
     `"2026-08-10"` (CN thuộc tuần trước — pin Mon-first); `"2026-08-17"` (T2) → chính nó.
   - `addWeeks`: `("2026-08-17", 1)` → `"2026-08-24"`; `("2026-08-17", -1)` → `"2026-08-10"`;
     `("2026-08-17", 0)` → `"2026-08-17"`.
   - `weekDates`: `("2026-08-17")` → `["2026-08-17".."2026-08-23"]` đủ 7 phần tử theo thứ tự;
     đầu vào giữa tuần `"2026-08-20"` → cùng mảng; biên cuối tháng `("2026-08-31")` →
     `["2026-08-31", "2026-09-01", ..., "2026-09-06"]`; biên năm `("2026-12-28")` →
     `["2026-12-28", ..., "2027-01-03"]`; năm nhuận tuần chứa `"2028-02-28"` (T2) → `"2028-02-29"` ở index 1.
   - `isSameISOWeek`: `("2026-08-21","2026-08-23")` → true (T6 vs CN cùng tuần);
     `("2026-08-16","2026-08-17")` → false (CN cũ vs T2 mới).
   - `formatDayMonth`: `"2026-08-21"` → `"21/08"`; `"2026-12-03"` → `"03/12"`.
   - `formatWeekRange`: `("2026-08-17")` → `"17–23/08"`; khác tháng `("2026-08-31")` →
     `"31/08–06/09"`; khác năm `("2026-12-28")` → `"28/12–03/01"`.
2. **Refactor/Implement** — tạo `week-grid.ts` đúng Requirements: JSDoc 3 quy ước ngày trước
   tiên, rồi từng hàm nhỏ (mỗi hàm ≤ ~10 dòng). Helper nội bộ `toUtcDate(iso)` /
   `fromUtcDate(date)` để DRY anchor UTC.
3. **Tests After** — `pnpm -F web test` xanh toàn bộ `week-grid.test.ts`; đúng chuỗi format
   dùng en-dash "–" (U+2013) — nếu test fail về ký tự, kiểm copy-paste chứ không đổi ký tự.
4. **Regression Gate** — chạy đủ 4 lệnh mirror CI `.github/workflows/ci.yml:31-35`:
   `pnpm test` && `pnpm check-types` && `pnpm exec biome check .` && `pnpm build`.
   Tất cả phải xanh (file mới không đụng code hiện hữu nên mọi đỏ là của phase này).

## Success Criteria

- [x] `week-grid.ts` export đủ 9 hàm (8 hàm gốc + `resolveWeek`) theo chữ ký ở Requirements;
  JSDoc pin 3 quy ước ngày + bound năm 1970–2099 + guard addWeeks.
- [x] Toàn bộ test group ở Tests Before pass; không test nào skip.
- [x] Không import React/dependency mới trong `week-grid.ts` (grep: chỉ stdlib/Intl).
- [x] 4 gate commands xanh.

## Risk Assessment

- **`Intl.DateTimeFormat("en-CA")` trả format khác giữa Node versions** (đã từng có variance)
  → nếu `todayISOVietnam` không ra `yyyy-mm-dd`, switch sang `formatToParts` lấy
  year/month/day rồi tự ghép (pre-decided response; signal: test todayISOVietnam fail với
  output có dấu "/"). Ưu tiên viết bằng `formatToParts` ngay từ đầu để khỏi ăn rủi ro này —
  chọn cách nào thì pin bằng test.
- **Giả định "input ISO hợp lệ" cho `startOfWeekMonday`/`addWeeks`** — nếu phase 2 lỡ truyền
  chuỗi rác, NaN date tạo ra "Invalid Date" string lan truyền. Signal: test phase 2 hoặc UI
  cột trống/NaN. Response: mọi entry point UI đều đi qua `parseWeekParam` (chỉ trả ISO hợp lệ
  hoặc null) — ghi ràng buộc này vào JSDoc; không thêm validate runtime (YAGNI, pure lib nội bộ).
- **Assumption "en-CA/timeZone trick đủ cho VN date"** — signal nếu CI (UTC) test
  todayISOVietnam với clock vắt mức ngày fail → response: hard-code offset +07 qua
  `getTimezoneOffset`-style arithmetic thay Intl (chọn 1, pin test).
