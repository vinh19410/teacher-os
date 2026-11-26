---
phase: 2
title: "Phase 2: MonthCalendarSection UI & Dashboard Integration (TDD)"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: MonthCalendarSection UI & Dashboard Integration (TDD)

## Goal

Triển khai component chỉ xem `MonthCalendarSection` theo đúng bố cục/token của `open-design/teacher.html` và `DESIGN.md`/`REVIEW.md`, tích hợp vào đầu cột phải trang `/teacher/dashboard` (trên `RiskStudentsSection` và `OrgStatsSection`), và khóa chặt mọi hành vi tương tác, a11y, reflow `320px` + `pointer: coarse`, rollover nửa đêm VN (kể cả đêm cuối tháng) và RBAC/E2E bằng TDD.

## Files to Create / Modify

- Create: `apps/web/src/components/dashboard/month-calendar-section.tsx`.
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`.
- Modify: `apps/web/src/routes/_auth/dashboard.test.tsx`.

## Tests Before

Bổ sung trước các bài test TDD đỏ vào `apps/web/src/routes/_auth/dashboard.test.tsx` kiểm tra widget `Lịch tháng` (hiển thị đầu cột phải, chọn ngày đổi agenda, chuyển tháng ẩn/hiện nút `"Hôm nay"` và trả focus về nút ngày hôm nay qua `todayBtnRef`, rollover nửa đêm VN trong tháng và qua đêm cuối tháng `31/10 → 01/11` không cướp lựa chọn tay, 1 `aria-live="polite"` duy nhất không trùng text hiển thị, ẩn lớp `paused`, không xuất hiện chuỗi `"ca dạy"`, và empty org hiển thị `"Không có buổi dạy."`).

## Tasks & Steps

### Task 2.1 — Viết integration tests TDD đỏ trong `dashboard.test.tsx`

<!-- Updated: Red Team Session 1 - Neo assertion vào data-testid (month/agenda/live) tránh va chạm sr-only & split-span, thêm test rollover ranh giới cuối tháng 31/10 -> 01/11 -->

- **Goal:** Định nghĩa trước hành vi người dùng và hợp đồng a11y/E2E của `Lịch tháng` trong `dashboard.test.tsx` và xác nhận fail ở pha Red.
- **Target files and symbols:** `apps/web/src/routes/_auth/dashboard.test.tsx` (`describe("dashboard")` bổ sung các test case cho `Lịch tháng`).
- **Steps:**
  1. Giữ nguyên 100% các test hiện có trong `apps/web/src/routes/_auth/dashboard.test.tsx` (không nới lỏng bất kỳ assertion nào).
  2. Thêm các test cases sau vào cuối `describe("dashboard")`:
     - **Render & chọn ngày:** mở dashboard ngày `2026-10-07` (`WEDNESDAY`) có buổi hôm nay (`19:00` lớp A) và buổi ngày `2026-10-09` (`18:00` lớp B):
       - Có `<section>` chứa heading `Lịch tháng`, nằm trước heading `Cần kiểm tra` theo thứ tự DOM (`compareDocumentPosition`).
       - `screen.getByTestId("dashboard-calendar-month").textContent` là `"Tháng 10 năm 2026"`, nút `"Hôm nay"` chưa hiển thị (vì đang ở tháng hiện tại).
       - Nút ngày `7` (`data-cal-day="2026-10-07"`) có `aria-pressed="true"`, `data-today="true"`, `aria-label` là `"Ngày 7, hôm nay, 1 buổi dạy"`; `screen.getByTestId("dashboard-calendar-agenda").textContent` chứa `"Hôm nay · 07/10 · 1 buổi dạy"`, `"19:00"` và tên lớp A; không chứa `"ca dạy"`.
       - Bấm nút ngày `9` (`data-cal-day="2026-10-09"`): `aria-pressed` chuyển sang ngày `9`, `dashboard-calendar-agenda` có `.textContent` chứa `"Thứ Sáu · 09/10 · 1 buổi dạy"`, `"18:00"` và tên lớp B.
       - Bấm nút ngày `10` (không có buổi, Thứ Bảy `data-weekend="true"`): `dashboard-calendar-agenda` có `.textContent` chứa `"Thứ Bảy · 10/10"` và `within(agenda).getByText("Không có buổi dạy.")` tìm đúng 1 node.
     - **Chuyển tháng, nút `"Hôm nay"` & trả focus:**
       - Bấm nút `Tháng sau` (`aria-label="Tháng sau"`): `dashboard-calendar-month` đổi sang `"Tháng 11 năm 2026"`, nút `"Hôm nay"` xuất hiện; agenda vẫn giữ ngày đang chọn (`2026-10-07`).
       - Bấm `"Hôm nay"`: `dashboard-calendar-month` quay về `"Tháng 10 năm 2026"`, nút `"Hôm nay"` biến mất, ngày `2026-10-07` có `aria-pressed="true"`, và `document.activeElement` nằm đúng trên nút `[data-cal-day="2026-10-07"]` (không rơi về `document.body`).
     - **Single `aria-live="polite"` region không đụng selector (`REVIEW.md:33`):**
       - Kiểm tra trên toàn bộ trang dashboard `container.querySelectorAll('[aria-live="polite"]')` có độ dài đúng `1` và chính là `screen.getByTestId("dashboard-calendar-live")`.
       - Khi mount ban đầu text rỗng (`""`); sau khi bấm `Tháng sau` đổi thành `"Đang xem Tháng 11 năm 2026"`; sau khi bấm ngày trống đổi thành `"Đã chọn Thứ Bảy 10/10, chưa có buổi dạy"` (không trùng `"Không có buổi dạy."`).
     - **Rollover nửa đêm giờ Việt Nam — cùng tháng và ranh giới cuối tháng (`31/10 → 01/11`):**
       - Nhánh 1 (chưa chọn tay, ranh giới cuối tháng): mount ở `2026-10-31T23:55:00+07:00`, advance sang `2026-11-01T00:05:00+07:00` + dispatch `visibilitychange` → `dashboard-calendar-month` tự đổi sang `"Tháng 11 năm 2026"` và ngày `2026-11-01` có `aria-pressed="true"` + `data-today="true"`.
       - Nhánh 2 (đã chọn tay ngày `2026-10-15`, ranh giới cuối tháng): mount ở `2026-10-31T23:55:00+07:00`, bấm chọn ngày `2026-10-15`, rồi qua nửa đêm sang `2026-11-01T00:05:00+07:00` + dispatch `visibilitychange` → vẫn giữ nguyên `dashboard-calendar-month` là `"Tháng 10 năm 2026"`, giữ `aria-pressed="true"` trên `2026-10-15`, và nút `"Hôm nay"` xuất hiện (không cướp `viewYm` sang tháng 11).
     - **Paused class (#694) kể cả buổi quá khứ `completed`:**
       - Lớp `paused` có buổi `completed` ngày `2026-10-05` và `upcoming` ngày `2026-10-07`: nút ngày `5` có `aria-label="Ngày 5"` (không báo số buổi), bấm ngày `5` thấy `"Không có buổi dạy."`, tên lớp tạm dừng không bao giờ xuất hiện.
- **Success criteria:** Các test cũ vẫn pass, các test mới fail đúng vì `Lịch tháng` chưa được mount trên `dashboard.tsx`.
- **Verify:** `pnpm --filter web exec vitest run src/routes/_auth/dashboard.test.tsx` exits non-zero với lỗi thiếu heading `"Lịch tháng"` (passing ở bước này là thất bại).

### Task 2.2 — Tạo component `apps/web/src/components/dashboard/month-calendar-section.tsx`

<!-- Updated: Red Team Session 1 - Dùng LEADING_BLANK_KEYS (sạch Biome), state nguyên tử {viewYm, selectedIso} + functional updater, todayBtnRef (bỏ querySelector), data-testid + chuỗi live không trùng text, header grow basis-auto whitespace-nowrap chịu 320px + pointer-coarse -->

- **Goal:** Xây dựng component `MonthCalendarSection` khớp hoàn toàn thiết kế `open-design/teacher.html`, token `DESIGN.md` và checklist `REVIEW.md`.
- **Target files and symbols:** `apps/web/src/components/dashboard/month-calendar-section.tsx` (`MonthCalendarSection`).
- **Steps:**
  1. Khai báo hằng tĩnh ngoài component (tránh `lint/suspicious/noArrayIndexKey`):
     ```ts
     const LEADING_BLANK_KEYS = ["b0", "b1", "b2", "b3", "b4", "b5"] as const;
     ```
  2. Khai báo props rõ ràng:
     ```ts
     export function MonthCalendarSection({
       lessons,
       classes,
       classById,
       todayIso,
     }: {
       lessons: readonly Lesson[];
       classes: readonly ClassGroup[];
       classById: (id: string) => ClassGroup | undefined;
       todayIso: string;
     })
     ```
  3. Tính `calendarIndex = useMemo(() => buildDashboardCalendarIndex(lessons, classes), [lessons, classes])` và `todayYm = todayIso.slice(0, 7)`.
  4. State nguyên tử & refs (chống stale closure, chống cướp tháng cuối tháng, bỏ `querySelector` nội suy chuỗi):
     - `const [calState, setCalState] = useState(() => ({ viewYm: todayYm, selectedIso: todayIso }));`
     - `const [liveAnnouncement, setLiveAnnouncement] = useState("");`
     - `const prevTodayIsoRef = useRef(todayIso);`
     - `const todayBtnRef = useRef<HTMLButtonElement | null>(null);`
     - `const pendingFocusTodayRef = useRef(false);`
     - Rollover nửa đêm giờ VN trong `useEffect` chỉ phụ thuộc `[todayIso]`:
       ```ts
       useEffect(() => {
         const prevToday = prevTodayIsoRef.current;
         if (prevToday === todayIso) return;
         prevTodayIsoRef.current = todayIso;
         const prevTodayYm = prevToday.slice(0, 7);
         const nextTodayYm = todayIso.slice(0, 7);
         setCalState((cur) => {
           const followingToday = cur.selectedIso === prevToday;
           if (!followingToday) return cur;
           return {
             selectedIso: todayIso,
             viewYm: cur.viewYm === prevTodayYm ? nextTodayYm : cur.viewYm,
           };
         });
       }, [todayIso]);
       ```
     - Trả focus khi bấm `"Hôm nay"` trong `useEffect` phụ thuộc `[calState.viewYm, calState.selectedIso, todayIso, todayYm]`:
       ```ts
       useEffect(() => {
         if (
           pendingFocusTodayRef.current &&
           calState.viewYm === todayYm &&
           calState.selectedIso === todayIso
         ) {
           pendingFocusTodayRef.current = false;
           todayBtnRef.current?.focus();
         }
       }, [calState.viewYm, calState.selectedIso, todayIso, todayYm]);
       ```
  5. Các handler tương tác (cập nhật `liveAnnouncement` với chuỗi phân biệt, không trùng text hiển thị):
     - `handleShiftMonth(delta: -1 | 1)`: tính `nextYm = shiftCalendarMonth(calState.viewYm, delta)`; nếu `nextYm === calState.viewYm` thì return; `setCalState((cur) => ({ ...cur, viewYm: nextYm }))`; `setLiveAnnouncement(\`Đang xem \${formatMonthHeading(nextYm)}\`)`.
     - `handleJumpToday()`: `pendingFocusTodayRef.current = true`; `setCalState({ viewYm: todayYm, selectedIso: todayIso })`; tính số buổi `count = sessionsForDashboardDate(calendarIndex, todayIso).length`; `setLiveAnnouncement(count > 0 ? \`Đã quay về hôm nay \${formatDayMonth(todayIso)}, \${count} buổi dạy\` : \`Đã quay về hôm nay \${formatDayMonth(todayIso)}, chưa có buổi dạy\`)`.
     - `handleSelectDay(iso: string, count: number)`: `setCalState((cur) => ({ ...cur, selectedIso: iso }))`; `const label = formatAgendaDateLabel(iso, todayIso)`; `setLiveAnnouncement(count > 0 ? \`Đã chọn \${label} \${formatDayMonth(iso)}, \${count} buổi dạy\` : \`Đã chọn \${label} \${formatDayMonth(iso)}, chưa có buổi dạy\`)`.
  6. Dựng giao diện theo `open-design/teacher.html` dùng semantic tokens Tailwind v4:
     - Root `<section aria-labelledby="dashboard-calendar-title" className="min-w-0">`.
     - Heading `<div className="mb-4 flex items-center justify-between gap-3"><h2 id="dashboard-calendar-title" className="font-semibold text-lg tracking-tight">Lịch tháng</h2></div>`.
     - `<Card data-testid="dashboard-month-calendar" className="grid min-w-0 gap-3 p-4">`.
     - **1 vùng `aria-live="polite"` duy nhất**: `<p role="status" aria-live="polite" data-testid="dashboard-calendar-live" className="sr-only">{liveAnnouncement}</p>`. Không gắn `aria-live` lên nhãn tháng hay vùng agenda.
     - Header (`.cal-head`, chịu `320px` + `pointer: coarse` không bóp nhãn tháng): `flex flex-wrap items-center justify-between gap-1`:
       - Nhãn tháng: `<span data-testid="dashboard-calendar-month" className="min-w-0 grow basis-auto whitespace-nowrap font-semibold text-sm">{monthHeading}</span>`.
       - Cụm nút `<div className="flex shrink-0 items-center gap-1">`:
         - Khi `calState.viewYm !== todayYm`: `<Button variant="ghost" size="sm" onClick={handleJumpToday} className="h-8 px-2 text-xs pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0">Hôm nay</Button>`.
         - Nút Tháng trước: `<Button variant="ghost" size="icon-sm" onClick={() => handleShiftMonth(-1)} disabled={calState.viewYm <= MIN_CALENDAR_YM} aria-label="Tháng trước" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0"><ArrowLeft className="size-4" aria-hidden="true" /></Button>`.
         - Nút Tháng sau: `<Button variant="ghost" size="icon-sm" onClick={() => handleShiftMonth(1)} disabled={calState.viewYm >= MAX_CALENDAR_YM} aria-label="Tháng sau" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0"><ArrowRight className="size-4" aria-hidden="true" /></Button>`.
     - Lưới ngày (`role="group"`, `aria-label="Chọn ngày để xem buổi dạy"`, `className="grid grid-cols-7 gap-0.5 text-center"`):
       - Header 7 thứ `dayNames` (`T2..CN`) từ `@/lib/mock-data`: `<span key={wd} aria-hidden="true" className="pb-1 font-medium text-muted-foreground text-xs">{wd}</span>`.
       - Ô trống đầu tháng: `LEADING_BLANK_KEYS.slice(0, grid.leadingBlanks).map((key) => <span key={key} aria-hidden="true" />)`.
       - Từng ngày `cell` trong `grid.days`:
         - `daySessions = sessionsForDashboardDate(calendarIndex, cell.iso)`.
         - `isSelected = cell.iso === calState.selectedIso`, `isToday = cell.iso === todayIso`.
         - `ariaLabel = \`Ngày \${cell.day}\${isToday ? ", hôm nay" : ""}\${daySessions.length > 0 ? \`, \${daySessions.length} buổi dạy\` : ""}\``.
         - `<button key={cell.iso} ref={isToday ? todayBtnRef : undefined} type="button" data-cal-day={cell.iso} aria-pressed={isSelected} aria-current={isToday ? "date" : undefined} data-today={isToday ? "true" : "false"} data-weekend={cell.isWeekend ? "true" : "false"} aria-label={ariaLabel} onClick={() => handleSelectDay(cell.iso, daySessions.length)} className={cn("relative grid h-9 w-full min-w-0 place-items-center rounded-md font-mono text-sm tabular-nums transition-colors pointer-coarse:h-11 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none", !isSelected && "hover:bg-muted", !isSelected && cell.isWeekend && "text-muted-foreground", !isSelected && isToday && "font-bold text-foreground shadow-[inset_0_0_0_1px_var(--input)]", isSelected && "bg-primary text-primary-foreground shadow-none")}>`
         - Bên trong button: `{cell.day}` và khi `daySessions.length > 0`: `<span aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" />`.
     - Vùng agenda ngày đang chọn (`data-testid="dashboard-calendar-agenda"`, `className="grid gap-2 border-border border-t pt-3"`):
       - Tiêu đề: `<p className="font-semibold text-muted-foreground text-xs">{agendaDateLabel}{" · "}<span className="font-mono tabular-nums">{formatDayMonth(calState.selectedIso)}</span>{selectedSessions.length > 0 ? \` · \${selectedSessions.length} buổi dạy\` : ""}</p>`.
       - Nếu `selectedSessions.length > 0`:
         ```tsx
         <ul className="grid gap-2">
           {selectedSessions.map((session) => (
             <li key={`${session.classId}-${session.time}`} className="flex min-w-0 gap-3 text-sm">
               <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                 {session.time}
               </span>
               <span className="min-w-0 truncate">
                 {classById(session.classId)?.name ?? "Lớp"}
               </span>
             </li>
           ))}
         </ul>
         ```
       - Nếu trống: `<p className="text-muted-foreground text-sm">Không có buổi dạy.</p>`.
- **Success criteria:** Component biên dịch sạch, không dùng hex cứng, không dùng `"ca dạy"`, đúng token `DESIGN.md`, sạch Biome `noArrayIndexKey` và `useExhaustiveDependencies`.
- **Verify:** `no verification needed` (kiểm chứng trực tiếp qua Task 2.3 ngay sau khi wire vào `dashboard.tsx`).

### Task 2.3 — Tích hợp `MonthCalendarSection` vào `/teacher/dashboard` và xanh toàn bộ suite web (pha Green)

- **Goal:** Mount `MonthCalendarSection` ở đầu cột phải `dashboard.tsx` và đảm bảo toàn bộ unit/integration tests + typecheck + lint đều pass.
- **Target files and symbols:** `apps/web/src/routes/_auth/dashboard.tsx` (`DashboardRoute`).
- **Steps:**
  1. Import `MonthCalendarSection` từ `@/components/dashboard/month-calendar-section` trong `apps/web/src/routes/_auth/dashboard.tsx`.
  2. Trong cột phải `<div className="min-w-0 space-y-10 self-start">`, đặt `<MonthCalendarSection lessons={data.lessons} classes={data.classes} classById={classById} todayIso={todayIso} />` làm phần tử đầu tiên ngay trước `<RiskStudentsSection ... />` và `<OrgStatsSection ... />`.
  3. Chạy `dashboard.test.tsx`, sau đó chạy trọn bộ `pnpm --filter web test`, `pnpm check-types` và `pnpm exec biome check .`.
- **Success criteria:** Tất cả test cũ & mới trong `dashboard.test.tsx` và toàn bộ `pnpm --filter web test` pass 100%, 0 lỗi Biome, 0 lỗi TypeScript.
- **Verify:** `pnpm --filter web exec vitest run src/routes/_auth/dashboard.test.tsx src/lib/dashboard-calendar.test.ts && pnpm --filter web test && pnpm check-types && pnpm exec biome check .` exits 0.

## Tests After

- `pnpm --filter web test` exits 0.
- `pnpm check-types` exits 0.
- `pnpm exec biome check .` exits 0.

## Verification

- `pnpm --filter web test && pnpm check-types && pnpm exec biome check .`

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
