---
phase: 2
title: "Schedule UI tuần thật: validateSearch ?week, nav tuần, today-highlight, locks cập nhật cùng lúc"
status: pending
priority: P1
effort: "2h30"
dependencies: [1]
---

# Phase 2: Schedule UI tuần thật + nav URL + tripwire locks

## Overview

Wire `week-grid.ts` (phase 1) vào route `/schedule`: tuần là URL state qua `validateSearch`
mới (`{ week?: string }`, precedent `login.tsx:17-23`); grid vẫn filter theo weekday
`l.day === i + 1` (giữ nguyên `schedule.tsx:29-32` — weekly-recurring slot semantics) nhưng
cột nhận sub-label ngày thật của tuần đang chọn, lead tính từ data, today-highlight theo ngày
thật VN, nav 3 nút thật. LessonModal nhận `dateIso` của cell để hiển thị ngày thật. Tripwire
lock `kernel-runtime.contract.test.ts:185-209` được cập nhật TRONG CÙNG PHASE theo đúng chỉ
dẫn trong comment của nó ("update this lock together with the feature, not before").

## Requirements

- Functional:
  - `validateSearch` trên `Route` (`schedule.tsx`): passthrough sanitize kiểu login —
    `week: typeof search.week === "string" ? search.week : undefined`. KHÔNG parse ở đây
    (parse-null-fallback làm ở component để invalid param rơi về tuần hiện tại mà không cần
    redirect).
  - Component: `const { week: weekParam } = Route.useSearch()`; derivation ĐI QUA MỘT CHỖ qua
    `resolveWeek(weekParam)` (phase 1, red-team #10): `const { weekStart, dates, isCurrentWeek } =
    resolveWeek(weekParam)`. **Dọn URL khi param rác (red-team #9):** nếu `weekParam !== undefined
    && parseWeekParam(weekParam) === null` → `router.navigate({ to: "/schedule", search: {},
    replace: true })` MỘT lần (không loop — param sạch sau replace; UI vẫn render tuần hiện tại
    ngay lập tức từ resolveWeek fallback). `todayIso = todayISOVietnam()`.
  - Nav row (đặt trên grid, dưới PageHead): 3 nút thật — "← Tuần trước" navigate
    `{ to: "/schedule", search: { week: addWeeks(weekStart, -1) } }`; "Tuần này" navigate
    `{ search: {} }` (xóa param → về tuần hiện tại; disabled khi
    `isSameISOWeek(weekStart, todayIso)`); "Tuần sau →" `+1`. Dùng `<Link>` của TanStack Router
    hoặc `router.navigate` — ưu tiên Link (declarative, reload-safe by construction vì state
    nằm trên URL).
  - Lead PageHead: `Tuần {formatWeekRange(weekStart)} · {n} buổi` với **`n` = số slot distinct**
    (red-team #8: distinct `${day}|${time}` của lesson `status !== "cancelled"` — lớp 1:2 chiếm
    1 slot, đúng nghĩa timetable tuần: lớp 12 buổi trên 2 slot hiện "2 buổi" vì mỗi tuần 2 slot;
    grid vẫn render đủ row blocks gồm cancelled với opacity như hiện tại — KHÔNG đổi semantics
    hiển thị status; N là số slot, không phải số block hiển thị).
  - Column header: giữ `{dn}` + thêm dòng dưới `{formatDayMonth(dates[i])}`; cột được
    today-styling CHỈ khi `dates[i] === todayIso` (so chuỗi ISO — KHÔNG dùng index/todayIdx).
    Style mirror accent pattern của app (vd `text-accent-blue` / border accent) — chọn class
    nhất quán với design tokens sẵn có, không tạo token mới.
  - Cell click → mở modal kèm ngày cell: state `openLesson: { id: string; dateIso: string } | null`.
  - LessonModal: thêm prop `dateIso: string`; subtitle thời gian hiển thị
    `"{dayName}, {dd/MM} · {time} ({dur} phút)"` với `dayName = lessonDayLabel(lesson.day)`
    và `dd/MM = formatDayMonth(dateIso)` (ngày thật của tuần đang xem — đúng vì cột i chứa
    lesson `day === i+1` và `dates[i]` là ISO của thứ đó trong tuần đang chọn).
  - Tripwire locks (`kernel-runtime.contract.test.ts:185-209`) — cập nhật CÙNG phase:
    - GIỮ negative cho fakes trên `schedule.tsx`: `GCal`, `todayIdx`, `dayDates`, `19–25\/08`,
      `11 buổi học`, `dayDates` trên lesson-modal/$classId/mock-data.
    - BỎ negative `← Trước|Sau →|Tuần này` trên schedule.tsx (giờ là UI thật) — dashboard
      lock (dòng 171) KHÔNG đụng.
    - THÊM positive trên schedule.tsx (red-team #10: khóa cả hop ĐỌC, không chỉ hop ghi):
      `toMatch(/validateSearch/)`, `toMatch(/useSearch/)` (hop đọc — thiếu là nav đổi URL nhưng
      grid đứng yên), `toMatch(/resolveWeek/)` (đi qua composition hàm duy nhất), `toMatch(/week-grid/)`
      (import), `toMatch(/Tuần trước/)`, `toMatch(/Tuần sau/)`; today-highlight qua
      `resolveWeek().isCurrentWeek`/`todayISOVietnam` — `toMatch(/todayISOVietnam|isCurrentWeek/)`.
    - THÊM positive trên lesson-modal.tsx: `toMatch(/dateIso/)`, `toMatch(/formatDayMonth/)` ;
      GIỮ negative `dayDates` và negative `/\/08/` (source-level chống fake concat — chuỗi
      "/08" literal không được xuất hiện trong source; ngày thật đi qua `formatDayMonth`).
    - Update stale comment dòng 186-189: ghi rõ nav tuần thật đã land (#56), GCal vẫn non-goal.
- Non-functional:
  - KHÔNG fetch/query key mới — mọi dữ liệu từ `useData()` snapshot sẵn có.
  - KHÔNG đổi filter/sort/status-styling hiện hữu của grid (dòng 29-32, 57-61 giữ nguyên).
  - `?week` chấp nhận mọi ngày trong tuần (không cần normalize về Monday trên URL); invalid
    param → current week, không throw, không redirect loop.
  - Re-auth flow giữ nguyên: `_auth/route.tsx` beforeLoad dùng `location.href` (incl. search)
    → `?week` tự theo returnUrl.

## Architecture

Data flow: `URL ?week` → `validateSearch` (sanitize) → `Route.useSearch` → `resolveWeek(param)`
(composition duy nhất — phase 1, unit-test đầy đủ gồm param rác/clock VN) → render grid + nav;
param rác → resolveWeek fallback tuần hiện tại + effect dọn URL (replace, không loop); nav click
→ Link/navigate ghi `?week=addWeeks(...)` (guard biên năm phase 1) → router cập nhật URL →
component re-render với tuần mới. Reload: URL giữ nguyên → cùng derivation → cùng dữ liệu
(reload-safe by construction; snapshot `['kernel']` fetch mới theo `data-provider.tsx:69-75`).
Filter theo weekday giữ nguyên nghĩa "mọi tuần đều thấy đủ series lesson" — đây là ngữ nghĩa
weekly-recurring slot đã được dashboard dùng (`dashboard-from-kernel.ts:7-10` match theo weekday),
KHÔNG derive occurrence-date từ createdAt ordering (fragile khi edit đổi day). **Hệ quả semantics
(đã pin lên issue #56):** status của block là status của series (không phải occurrence của tuần
đang xem); lớp xong series vẫn hiện slot ở mọi tuần — bound occurrence đòi cột ngày ở DB (ngoài scope).

## Related Code Files

- Create: (không)
- Modify: `apps/web/src/routes/_auth/schedule.tsx` (validateSearch + nav + lead + sub-label +
  today highlight + openLesson state), `apps/web/src/components/schedule/lesson-modal.tsx`
  (prop dateIso + subtitle), `apps/web/src/lib/kernel-runtime.contract.test.ts` (lock update,
  chỉ vùng test dòng 185-209 + comment)
- Delete: (không)

## Implementation Steps (TDD)

1. **Tests Before** — update `kernel-runtime.contract.test.ts` TRƯỚC (test sẽ đỏ vì UI chưa có):
   viết lại test "schedule flow shows no fake chrome…" thành phiên bản mới: giữ negative fakes,
   bỏ 3 negative nav-labels cho schedule.tsx, thêm positive locks như Requirements. Chạy
   `pnpm -F web test` → đỏ đúng ở các assertion positive (validateSearch/week-grid chưa có).
2. **Refactor/Implement** — `schedule.tsx`:
   a. Thêm `validateSearch` vào `createFileRoute("/_auth/schedule")` (kiểu trả
      `{ week?: string }`).
   b. Import helpers từ `@/lib/week-grid`; tính `weekStart/dates/todayIso` như Architecture;
      đổi state `openLessonId` → `openLesson`.
   c. Nav row 3 nút + lead prop cho `PageHead` (`title="Lịch dạy" lead={...}`).
   d. Column header: sub-label `formatDayMonth(dates[i])` + conditional today class khi
      `dates[i] === todayIso`.
   e. Truyền `dateIso={openLesson.dateIso}` cho `LessonModal`.
   Sau đó `lesson-modal.tsx`: nhận `dateIso`, đổi dòng thời gian (hiện dòng 38) thành
   `` {lessonDayLabel(lesson.day)}, {formatDayMonth(dateIso)} · {lesson.time} ({lesson.dur} phút) ``.
3. **Tests After** — `pnpm -F web test` xanh: contract test mới pass; toàn bộ test cũ pass
   (đặc biệt describe "direct actions…" dòng 211+ đọc lesson-modal — các assertion
   `useDirectKernelAction()`/`disabled={busy || isPending(lesson.id)}` không đổi).
   Verify thủ công (dev server, không cần infra mới): F5 với `?week=2026-08-17` giữ tuần;
   `?week=abc` không crash (về tuần hiện tại); nav ±1 tuần đổi URL + sub-label ngày.
4. **Regression Gate** — `pnpm test` && `pnpm check-types` && `pnpm exec biome check .` &&
   `pnpm build`. Lưu ý: `check-types` của web chạy `vite build` trước (regenerate
   `routeTree.gen.ts` untracked) — không tay sửa file gen.

## Success Criteria

- [x] Contract test mới (negative fakes + positive wiring gồm `useSearch` + `resolveWeek`) pass;
  không weaken assertion nào ngoài 3 nav-label negatives đã approve.
- [x] `/schedule` có nav "← Tuần trước / Tuần này / Tuần sau →" hoạt động; "Tuần này" disabled khi đang ở tuần hiện tại.
- [x] URL `?week=<iso>` phản ánh tuần đang xem; F5 giữ đúng tuần + đúng sub-label ngày; param rác
  fallback tuần hiện tại VÀ URL được dọn (replace, không param rác tồn dư).
- [x] Lead hiển thị "Tuần {dd–dd/mm} · N buổi" computed (grep không còn hardcode chuỗi này).
- [x] Cột hôm nay chỉ highlight khi tuần đang xem chứa hôm nay (test bằng cách nav sang tuần khác — highlight biến mất).
- [x] Modal hiển thị "{thứ}, {dd/MM} · {time} ({dur} phút)" theo cell đã click.
- [x] Grid filter/sort/status styling không đổi so với trước phase (diff chỉ thêm, không sửa dòng 29-32/57-61).
- [x] 4 gate commands xanh.

## Risk Assessment

- **ValidateSearch throw/lặp redirect khi param rác** — không dùng zod/redirect trong
  validateSearch (passthrough như login precedent); parse-null-fallback ở component. Signal:
  nhập `?week=abc` mà router loop/crash → response: đảm bảo validateSearch chỉ typeof-check,
  không bao giờ navigate.
- **AutoCodeSplitting + validateSearch trên file route**: plugin (`vite.config.ts` tanstackRouter
  autoCodeSplitting) tách route module — nếu check-types đỏ vì type search không nhận diện,
  response: chạy lại `pnpm -F web build` để regenerate routeTree.gen rồi check lại (file gen
  untracked, không commit). Signal: TS error về `useSearch` trả `unknown`/không có `week`.
- **"Tuần này" navigate `{search:{}}` có thể giữ param cũ** nếu dùng replace sai — dùng Link
  với search hàm `prev => ({})` hoặc ensure replace; signal: test thủ công nút "Tuần này"
  không xóa `?week`. Response pre-decided: dùng `<Link to="/schedule" search={() => ({})}>`.
- **Assumption "grid weekday-only đủ cho DOD nav tuần"**: mọi tuần hiển thị cùng series lesson
  là NGHĨA đúng của weekly-recurring slot (đã approve); signal nếu reviewer hiểu "buổi phải
  khác nhau theo tuần" → trỏ về design decision + `dashboard-from-kernel.ts` cùng semantics;
  occurrence-per-date là yêu cầu khác (cần date column ở DB) — ngoài scope #56.
- **Lock update thiếu một file** (quên lesson-modal positive) → CI đỏ ở phase này ngay
  (Tests Before bắt trước khi implement) — chính là lý do viết test trước.
