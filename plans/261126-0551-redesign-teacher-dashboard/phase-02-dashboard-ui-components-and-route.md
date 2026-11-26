---
phase: 2
title: "Phase 2: Redesign Dashboard UI Components & Route (TDD)"
status: completed
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Redesign Dashboard UI Components & Route (TDD)

## Goal

Triển khai giao diện mới cho `/teacher/dashboard` khớp bản thiết kế `open-design/redesign-teacher-dashboard/index.html` trên hệ token `globals.css` (`DESIGN.md`), giữ nguyên 100% hợp đồng selector/RBAC/E2E (không sửa 4 spec E2E), chống tràn ngang từ `320px`, đảm bảo Drawer không va chạm `⌘K` (`CommandDialog` `z-50`) và toàn bộ unit test (gồm a11y cho `StudentRiskDrawer` và 6 trạng thái `FocusSessionCard`) đều pass.

## Files to Create / Modify

- Modify: `apps/web/src/components/dashboard/reminder-cards.tsx`
- Modify: `apps/web/src/components/dashboard/reminder-cards.test.tsx`
- Create: `apps/web/src/components/dashboard/focus-session-card.tsx`
- Create: `apps/web/src/components/dashboard/today-schedule-section.tsx`
- Create: `apps/web/src/components/dashboard/risk-students-section.tsx`
- Create: `apps/web/src/components/dashboard/student-risk-drawer.tsx`
- Create: `apps/web/src/components/dashboard/org-stats-section.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.test.tsx`

## Tests Before

<!-- Updated: Red Team Session 1 - Chốt rõ RTL matcher khi tách span số đếm & tránh trùng nhãn CTA/số "2", Hero dùng "buổi dạy", thêm test fail-closed openTasks, Drawer portal/a11y/lọc lớp active/guard due legacy -->

Trước khi sửa component và route, cập nhật và bổ sung test TDD trong `reminder-cards.test.tsx` và `dashboard.test.tsx` cho các hành vi mới:
- `reminder-cards.test.tsx`:
  - Truyền tường minh `canAccessFinance={true}` ở các case kiểm 3 thẻ và bổ sung test default prop `canAccessFinance` **fail-closed `false`** (render `<ReminderCards data={FULL_DATA} />` không truyền prop → ẩn `reminder-card-tuition` và grid `lg:grid-cols-2`).
  - Giữ toàn bộ assertion hợp đồng E2E (`data-testid="reminder-card-attendance|grading|tuition"`, heading `"Ca dạy hôm nay chưa điểm danh"`, `"Bài tập quá hạn chấm > 24h"`, `"Học phí đến hạn"`, `aria-label="1. Điểm danh — ..."`, `"2 Writing · 1 Speaking"`, `"Đã hoàn tất hôm nay"`, URL params `/attendance?date=...&status=pending`, `/grading?status=awaiting`, `/tuition`).
  - Với số đếm tách kiểu (`font-mono` số + `text-muted-foreground` đơn vị trong cùng block `<p>`): dùng `expect(within(card).getByTestId("reminder-card-count").textContent).toBe("2 ca dạy")` (RTL `getByText` chỉ đọc direct `TEXT_NODE`, trong khi Playwright `getByText("1 ca dạy")` khớp normalized `innerText` trên block `<p>` chứa dấu cách thực giữa 2 inline `<span>`).
  - Với nhãn bước và CTA đáy: query riêng `within(card).getByTestId("reminder-card-label")` (`"Điểm danh"` / `"Chấm bài"` / `"Học phí"`) và `within(card).getByTestId("reminder-card-cta")` (`"Điểm danh"` / `"Chấm bài"` / `"Xem học phí"`, khi `done` là `"Xem lại"`), tránh trùng text `"Điểm danh"`/`"Chấm bài"` trong cùng thẻ.
  - Kiểm tra preview Thẻ 1 (`item.time` + `item.className`, kèm `"+2 ca khác"` khi `pending = 5` và `items.length >= 3`), dòng breakdown Thẻ 2 (`"2 Writing · 1 Speaking"` là single text node `tabular-nums`, nên `within(gradingCard).getByText("2")` chỉ khớp duy nhất badge bước `2`), và dòng Thẻ 3 (`"2.500.000đ cần thu"`).
- `dashboard.test.tsx`:
  - Giữ toàn bộ các test bảo vệ hợp đồng (read-only schedule không có button `/Điểm danh/`, không có `"Buổi học hôm nay"`, `canAccessFinance === false` ẩn cả `"Còn phải thu"`, `reminder-card-tuition`, **và Hero `openTasks` không đếm nhánh `tuition`**, empty org trung thực, refetch reminders khi kernel refresh, ẩn lớp `paused`, date kicker pinned `Asia/Ho_Chi_Minh`).
  - Cập nhật matcher cho số đếm reminder cards sang `textContent` của `[data-testid="reminder-card-attendance|grading|tuition"]` (thay `findByText("1 ca dạy")` vốn fail trên split `<span>` trong RTL) và query hàng trong `Cần kiểm tra` từ `.closest("tr")` sang `.closest("button")`.
  - Bổ sung test mới cho:
    1. Hero `summary` dùng `"buổi dạy"` (tuyệt đối không xuất hiện chuỗi `"1 ca dạy"` trong Hero để bảo toàn `daily-attendance.spec.ts:201`); chỉ nối số việc chờ sau khi `reminders` tải xong; trạng thái lỗi `reminders` hiện `role="alert"` và nút `"Thử lại"`.
    2. `FocusSessionCard` ở trạng thái `live` (`role="progressbar"` + `"Đang dạy"`), `next` (`"Ca dạy tiếp theo"`), và `empty` (org rỗng, không crash).
    3. Timeline `Lịch hôm nay` hiển thị pill `"Đã điểm danh"` vs `"Chưa điểm danh"` cho ca quá khứ và `"Đang dạy"` cho ca đang diễn ra (read-only `<span>`, không phải `<button>`).
    4. `StudentRiskDrawer`: bấm vào dòng học viên mở `role="dialog"` (render qua portal vào `document.body`) hiển thị tên, chỉ các lớp `active` (ẩn lớp `paused` và `invited`), gói học, chi tiết buổi quên điểm danh & bài tập quá hạn thật (cả khi legacy `due` rỗng/non-ISO không hiện `"/"`), link `"Mở hồ sơ học viên"` trỏ đúng `/students/<id>`, Tab wrapping hoạt động trên JSDOM (không bị `offsetParent` triệt tiêu), bấm `Escape` đóng drawer và trả focus về nút học viên đã bấm; và khi `Escape` có `defaultPrevented` hoặc có dialog khác đang mở thì drawer không đóng nhầm.
    5. Khối `"Toàn trung tâm"` hiển thị `Tổng học viên`, `Bài tập chưa có điểm`, và `Còn phải thu` (chỉ khi `canAccessFinance === true`; không hiện hint `"học viên đến hạn"` khi `outstanding === 0`).

## Tasks & Steps

### Task 2.1 — Cập nhật `ReminderCards` và `reminder-cards.test.tsx` (TDD)

<!-- Updated: Red Team Session 1 - Default canAccessFinance = false (fail-closed), inline block <p> cho innerText Playwright "N ca dạy", single text node cho grading breakdown, data-testid rõ cho label/count/cta -->

- **Goal:** Nâng cấp `ReminderCards` khớp visual prototype đồng thời giữ nguyên 100% selector E2E và nâng cấp default `canAccessFinance` sang fail-closed `false`.
- **Target files and symbols:** `apps/web/src/components/dashboard/reminder-cards.tsx` (`ReminderCards`, `remindersSectionTitle`), `apps/web/src/components/dashboard/reminder-cards.test.tsx`.
- **Steps:**
  1. Cập nhật `reminder-cards.test.tsx` theo mục Tests Before (xác nhận red phase khi chạy vitest).
  2. Trong `reminder-cards.tsx`:
     - Giữ nguyên export `remindersSectionTitle`.
     - Đổi default prop thành `canAccessFinance = false` (fail-closed tuyệt đối khi caller quên truyền prop).
     - Container grid: `showTuition ? "grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-3" : "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2"`.
     - Mỗi `ReminderCard` nhận `data-testid={props.testId}`, `data-done={props.done ? "true" : "false"}`, className `group relative flex min-w-0 flex-col gap-3 p-5` + khi `done` thêm `bg-muted shadow-none`.
     - Stretched `<Link to={props.to} search={props.search} aria-label={`${props.step}. ${props.label} — ${props.title}`} className="absolute inset-0 rounded-xl outline-none focus-visible:shadow-[var(--focus-ring)]" />`.
     - Hàng đầu: vòng tròn `size-6 shrink-0 rounded-full grid place-items-center font-mono text-xs font-semibold` (`bg-primary text-primary-foreground` khi chưa xong; `bg-success text-background` kèm `<Check className="size-3.5" aria-hidden="true" />` khi xong) + `<span data-testid="reminder-card-label" className="font-semibold text-sm">{props.label}</span>`.
     - Tiêu đề phụ giữ thẻ heading `<h3>`: `<h3 className="font-normal text-muted-foreground text-sm">{props.title}</h3>`.
     - Khi `done`: `<p className="inline-flex min-h-9 items-center gap-2 font-semibold text-sm text-success"><Check className="size-4 shrink-0" aria-hidden="true" />{DONE_TODAY_LABEL}</p>`.
     - Khi chưa xong:
       - Số đếm dùng block `<p>` bình thường (không dùng `display: flex` để trình duyệt giữ nguyên dấu cách thực giữa 2 inline `<span>`, giúp Playwright `getByText("1 ca dạy")` khớp chắc chắn):
         ```tsx
         <p data-testid="reminder-card-count" className="leading-none">
           <span className="font-mono font-semibold text-[clamp(1.75rem,1.4rem+1vw,2.25rem)] tabular-nums tracking-tight">
             {props.count}
           </span>{" "}
           <span className="ml-1 whitespace-nowrap text-muted-foreground text-sm">
             {props.unit}
           </span>
         </p>
         ```
       - Danh sách preview có đường kẻ trên `border-t border-border pt-3 grid gap-1 text-sm`:
         - Thẻ 1 (`attendance`): tối đa 3 dòng (`item.time` mono muted + `item.className` truncate) + dòng `+{pending - previewItems.length} ca khác` (`text-muted-foreground`) khi `pending > previewItems.length`.
         - Thẻ 2 (`grading`): `<li className="tabular-nums">{`${writing} Writing · ${speaking} Speaking`}</li>` (single text node → khớp cả RTL `getByText("2 Writing · 1 Speaking")` lẫn Playwright `getByText("1 Writing · 0 Speaking")`, không tạo span `"2"` trùng badge bước `2`).
         - Thẻ 3 (`tuition`): `<li className="tabular-nums"><span className="whitespace-nowrap font-mono">{fmtVND(outstanding)}</span> cần thu</li>`.
     - Chân thẻ `mt-auto pt-2`: visual button không lồng interactive element:
       ```tsx
       <span
         aria-hidden="true"
         data-testid="reminder-card-cta"
         className={cn(
           buttonVariants({ variant: props.done ? "ghost" : "outline", size: "default" }),
           "pointer-events-none w-full group-hover:bg-accent group-hover:text-accent-foreground",
         )}
       >
         {props.done ? "Xem lại" : props.cta}
         <ArrowRight className="size-4" aria-hidden="true" />
       </span>
       ```
- **Success criteria:** `reminder-cards.test.tsx` pass 100%, không còn double-padding, focus ring ôm khít `Card` và default `canAccessFinance` fail-closed.
- **Verify:** `pnpm --filter web exec vitest run src/components/dashboard/reminder-cards.test.tsx` exits 0.

### Task 2.2 — Tạo các component giao diện mới cho Dashboard

<!-- Updated: Red Team Session 1 - group-last:border-b-0, formatEndTime fail-safe, RiskStudentsSection root <section> + 2 hàng < sm cho 320px, StudentRiskDrawer portal z-40/z-[45] dưới CommandDialog z-50 + onCloseRef/openId + focus trap không offsetParent + guard due legacy + Avatar size-12, OrgStatsSection hint guard outstanding > 0 -->

- **Goal:** Tạo 5 component tách rạch ròi theo ranh giới hiển thị: `FocusSessionCard`, `TodayScheduleSection`, `RiskStudentsSection`, `StudentRiskDrawer`, `OrgStatsSection`.
- **Target files and symbols:**
  - `apps/web/src/components/dashboard/focus-session-card.tsx` (`FocusSessionCard`)
  - `apps/web/src/components/dashboard/today-schedule-section.tsx` (`TodayScheduleSection`)
  - `apps/web/src/components/dashboard/risk-students-section.tsx` (`RiskStudentsSection`)
  - `apps/web/src/components/dashboard/student-risk-drawer.tsx` (`StudentRiskDrawer`)
  - `apps/web/src/components/dashboard/org-stats-section.tsx` (`OrgStatsSection`)
- **Steps:**
  1. Tạo `focus-session-card.tsx`:
     - Nhận `focus: DashboardFocusState` và `classById: (id: string) => ClassGroup | undefined`.
     - Dùng `formatEndTime(session.time, session.dur)` từ `dashboard-from-kernel.ts` (không dùng `addMinutes` thiếu guard `NaN`); nếu `endTime` rỗng chỉ hiển thị `session.time`.
     - Render `<Card>` (`p-5 flex flex-col gap-3`) với `data-testid="dashboard-focus-card"` và `data-state={focus.kind}`.
     - Hiển thị đầy đủ 6 state từ `DashboardFocusState`:
       - `live`: chấm xanh `bg-success` + `"Đang dạy"` (`text-success uppercase tracking-wider text-xs font-semibold`), tên lớp `h2`, meta thật (`Clock` `{time}{endTime ? \` – ${endTime}\` : ""}`, `Users` `{count} học viên`, mode `Online`/`Offline` nếu có), thanh tiến độ `role="progressbar"` (`aria-label="Tiến độ ca dạy"`, `aria-valuemin={0}`, `aria-valuemax={100}`, `aria-valuenow={Math.round(progress * 100)}`) với fill `bg-success` (`scaleX`), footer `"Còn {formatDurationVi(minutesLeft)}"` + `<Link to="/schedule">Xem tuần <ArrowRight /></Link>`.
       - `next`: nhãn `"Ca dạy tiếp theo"`, tên lớp, meta thật, footer `"Bắt đầu sau {formatDurationVi(minutesUntil)}"` + link `Xem tuần`.
       - `done-today-with-upcoming`: nhãn `"Đã xong ca dạy hôm nay"`, tiêu đề `isTomorrow ? \`Ca đầu ngày mai: ${className}\` : \`Ca tiếp theo: ${className}\``, meta thật, footer `{weekday}{dateIso ? \`, ${formatDayMonth(dateIso)}\` : ""}` + link `Xem tuần`.
       - `no-today-with-upcoming`: nhãn `"Ca dạy tiếp theo"`, tên lớp, meta thật, footer `{weekday}{dateIso ? \`, ${formatDayMonth(dateIso)}\` : ""}` + link `Xem tuần`.
       - `done-today-no-upcoming`: nhãn `"Đã xong ca dạy hôm nay"`, tiêu đề `"Hết lịch dạy trong tuần"`, footer link `Xem tuần`.
       - `empty`: nhãn `"Lịch dạy tuần này"`, tiêu đề `"Chưa có ca dạy sắp tới"`, mô tả ngắn `"Lịch tuần luôn sẵn sàng ở mục Lịch dạy."`, footer link `Xem tuần`.
  2. Tạo `today-schedule-section.tsx`:
     - Nhận `todayLessons: Lesson[]`, `todayGroups: DashboardClassSession[]`, `upcomingGroups: UpcomingDayGroup[]`, `nowMin: number`, `classById`.
     - Render `<section aria-labelledby="dashboard-today-title" className="min-w-0">`:
       - Header: `<h2 id="dashboard-today-title">Lịch hôm nay</h2>` + `<Link to="/schedule">Xem tuần <ArrowRight /></Link>`.
       - Empty state: khung `rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground` chứa `<strong className="mb-1 block font-medium text-foreground">Không có buổi dạy hôm nay.</strong>Lịch tuần vẫn xem được ở mục Lịch dạy.`.
       - Timeline `<ol>`: mỗi `<li>` gắn class **`group`** (`grid grid-cols-[48px_16px_minmax(0,1fr)] sm:grid-cols-[56px_20px_minmax(0,1fr)] gap-x-2 sm:gap-x-3`):
         - Cột giờ: `g.time` (`font-mono text-sm font-medium tabular-nums`) + `formatEndTime(g.time, g.dur)` (`font-mono text-xs text-muted-foreground tabular-nums`, chỉ render khi khác rỗng).
         - Cột rail + chấm trạng thái (`past` muted, `live` emerald + ring, `next` hollow border-input; ẩn rail line khi chỉ có 1 buổi).
         - Cột nội dung (`flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-border py-3 pb-4 group-last:border-b-0` — **bắt buộc dùng `group-last:border-b-0`**, tuyệt đối không dùng `last:border-b-0`): tên lớp (`break-words [overflow-wrap:anywhere]`, muted khi `past`), dòng meta gồm `{g.lessons.length} học viên` + `{cls.mode}` (nếu có) và `<span>{formatClassSessionMeta(g)}</span>` (giữ topic & type thật, không nối dấu `·` treo), và pill trạng thái **read-only `<span>`**:
           - `live` → `bg-success-soft text-success` (`Đang dạy`)
           - `past` → kiểm `hasPendingTodayAttendance(todayLessons, g.classId, g.time)`: `false` → `bg-muted text-success` (`Đã điểm danh` + `Check`), `true` → `bg-warn-soft text-warn` (`Chưa điểm danh`).
       - Khối `Lịch sắp tới` (`mt-10`): `<h2 className="font-semibold text-lg tracking-tight">Lịch sắp tới</h2>`, empty state `"Không có buổi dạy sắp tới trong tuần."`, hoặc các nhóm ngày (`<h3>{formatWeekdayLong(group.day)} {group.dateIso && <span className="font-mono font-normal text-muted-foreground tabular-nums">{formatDayMonth(group.dateIso)}</span>}</h3>`) với compact list 2 cột (`group` trên `<li>`, `group-last:border-b-0` trên body, không rail, không pill).
  3. Tạo `risk-students-section.tsx`:
     - Nhận `rows: DashboardRiskRow[]`, `onSelectStudent: (row: DashboardRiskRow, trigger: HTMLButtonElement) => void`, và `headingRef?: RefObject<HTMLHeadingElement | null>` (làm fallback focus khi hàng học viên biến mất sau refresh).
     - **Bắt buộc thẻ gốc là `<section aria-labelledby="dashboard-risk-title" className="min-w-0">`** (bảo toàn helper `section("Cần kiểm tra")` trong `dashboard.test.tsx:105-109`).
     - Header: `<h2 id="dashboard-risk-title" ref={headingRef} tabIndex={-1} className="font-semibold text-lg tracking-tight outline-none">Cần kiểm tra</h2>` + `{rows.length > 0 && <span className="text-muted-foreground text-sm tabular-nums">{rows.length} học viên</span>}`.
     - Empty state: khung dashed chứa `<strong>Không có học viên cần kiểm tra.</strong>` + `"Học viên chưa điểm danh hoặc trễ bài sẽ hiện ở đây."`.
     - Non-empty: `<Card data-testid="dashboard-risk-card" className="min-w-0 p-2">` chứa `<ul className="divide-y divide-border">` với mỗi `<li>` là `<button type="button" aria-haspopup="dialog" onClick={(e) => onSelectStudent(row, e.currentTarget)} ...>`:
       - **Responsive chống tràn 320px:** trên mobile `< sm` dùng bố cục 2 hàng (`flex flex-wrap items-center gap-x-3 gap-y-2`: hàng 1 = `Avatar` + Tên `min-w-0 flex-1` + cột phải `"còn N buổi"`/`"Chưa có gói"` `shrink-0`; hàng 2 = dải badge `w-full pl-11` hoặc full-width `w-full`); từ `sm:` trở lên chuyển lưới 3 cột ngang (`sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center`) khớp desktop prototype!
       - Badge cảnh báo (`rounded-full border border-warn/35 text-warn text-xs font-medium px-2 h-[22px]` + `<AlertTriangle className="size-3 shrink-0" aria-hidden="true" />`).
       - Cột phải: nếu `hasPackage`: `"còn ${remaining} buổi"` (`text-warn` khi `remaining <= 2` + dòng nhỏ `"sắp hết gói"`), ngược lại `"Chưa có gói"` (`text-muted-foreground`).
  4. Tạo `student-risk-drawer.tsx`:
     - Nhận `row: DashboardRiskRow | null`, `issues: DashboardRiskIssue[]`, `classNames: string[]`, `onClose: () => void`, `returnFocusTo: HTMLElement | null`, `fallbackFocusRef?: RefObject<HTMLElement | null>`.
     - Khi `row === null` return `null`.
     - Render qua `createPortal(..., document.body)` (hoặc render trực tiếp nếu `typeof document === "undefined"`):
       - Scrim `fixed inset-0 z-40 bg-black/50` với guard `onPointerDown` + `onClick` giống `apps/web/src/components/ui/modal.tsx:127-145`.
       - Panel `fixed inset-y-0 right-0 z-[45] grid w-[min(440px,100vw)] grid-rows-[auto_minmax(0,1fr)_auto] border-l border-border bg-card shadow-lg` (**thấp hơn `CommandDialog` `z-50` và `Modal` `z-100`**, không bao giờ che khuất `⌘K`!).
       - `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}`.
       - Lưu `onCloseRef.current = onClose` và chỉ gắn `useEffect` mở/đóng theo `const openId = row?.student.id ?? null` (tuyệt đối không phụ thuộc object reference `row` để tick 60s không reset focus!).
       - Kiểm tra `hasOpenHigherDialog()` (bất kỳ `[role="dialog"]` nào khác không nằm trong `drawerRef`) và `e.defaultPrevented` trước khi xử lý `Escape` hay `Tab`.
       - Focus trap `Tab`/`Shift+Tab` theo mẫu `apps/web/src/components/debts/billing-timeline-drawer.tsx:108-127` (**không lọc `offsetParent !== null`** để hoạt động trung thực trên cả JSDOM lẫn trình duyệt).
       - Khóa `document.body.style.overflow = "hidden"` (lưu và khôi phục giá trị trước đó khi cleanup).
       - Khi đóng: trả focus về `returnFocusTo` nếu còn `document.contains(returnFocusTo)`, ngược lại focus về `fallbackFocusRef?.current`.
       - Nội dung:
         - `<Avatar text={row.student.avatar} size="md" className="size-12 text-sm" />` (đúng 48px theo prototype), tên học viên, chuỗi `classNames.join(" · ") || "Chưa ghi danh lớp"`.
         - `<dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">` (`Gói học`, `Vấn đề` = `issues.length`).
         - Danh sách issue thật:
           - `missed-check-in`: `"Buổi ${dateLabel} · ${issue.className} chưa được ghi nhận."` (`dateLabel` = `formatDayMonth(issue.dateIso)` nếu `issue.dateIso`, else `formatWeekdayLong(issue.day)`).
           - `overdue-assignment`: guard `dueLabel = isValidISODate(issue.due) ? formatDayMonth(issue.due) : issue.due.trim()` → nếu `dueLabel` có giá trị thì `"${issue.title} · hạn nộp ${dueLabel}, chưa nộp."`, ngược lại `"${issue.title} · đã quá hạn, chưa nộp."` (không bao giờ render `"/"`).
         - Chân drawer: nút ghost `"Đóng"` và `<Link to="/students/$studentId" params={{ studentId: row.student.id }} onClick={onClose} className={buttonVariants({ variant: "default" })}>Mở hồ sơ học viên <ArrowRight className="size-4" aria-hidden="true" /></Link>`.
  5. Tạo `org-stats-section.tsx`:
     - Nhận `studentCount: number`, `ungradedCount: number`, `canAccessFinance: boolean`, `outstanding: number`, `dueStudentsCount?: number`.
     - Render `<section aria-labelledby="dashboard-stats-title" className="min-w-0">` với `<h2 id="dashboard-stats-title">Toàn trung tâm</h2>` và `<dl className="divide-y divide-border rounded-xl border bg-card px-5 py-2 shadow-sm">` chứa `Tổng học viên`, `Bài tập chưa có điểm`, và (chỉ khi `canAccessFinance === true`) `Còn phải thu` (chỉ hiển thị `<span className="mt-0.5 block text-muted-foreground text-xs">{`trong đó ${dueStudentsCount} học viên đến hạn`}</span>` khi `outstanding > 0 && dueStudentsCount !== undefined && dueStudentsCount > 0`).
- **Success criteria:** Tất cả 5 file mới biên dịch sạch không lỗi TypeScript hay Biome.
- **Verify:** `pnpm --filter web exec tsc --noEmit` exits 0.

### Task 2.3 — Ghép toàn bộ trang `/teacher/dashboard` và cập nhật `dashboard.test.tsx` (Green phase)

<!-- Updated: Red Team Session 1 - Hero dùng "buổi dạy", openTasks/outstanding/dueStudentsCount fail-closed theo canAccessFinance === true, reset stale selectedStudentId, visibilitychange + refetch khi đổi ngày VN, lọc classesByStudent chỉ lấy lớp active không paused -->

- **Goal:** Lắp ráp `DashboardRoute` trong `apps/web/src/routes/_auth/dashboard.tsx` theo cấu trúc Hero + Việc cần làm hôm nay + Split 2 cột + Drawer, rồi kiểm chứng toàn bộ unit tests.
- **Target files and symbols:** `apps/web/src/routes/_auth/dashboard.tsx` (`DashboardRoute`), `apps/web/src/routes/_auth/dashboard.test.tsx`.
- **Steps:**
  1. Cập nhật `apps/web/src/routes/_auth/dashboard.test.tsx` theo mục Tests Before (giữ mọi hợp đồng cũ + bổ sung test Hero summary `"buổi dạy"`, fail-closed `openTasks`, Focus Card states, timeline pills, `StudentRiskDrawer` open/lọc lớp active/Tab trap/Escape/return-focus, `Toàn trung tâm`).
  2. Trong `apps/web/src/routes/_auth/dashboard.tsx`:
     - Gỡ import `MorningSpot`, `PageHead`, `SectionTitle`, `Stat`, `Badge`, `Avatar`, `lessonDayLabel` không còn dùng trực tiếp.
     - Thêm state `const [now, setNow] = useState(() => new Date())` kèm `useEffect`:
       - `setInterval(() => setNow(new Date()), 60_000)` cleanup `clearInterval`.
       - Lắng nghe `document` `"visibilitychange"`: khi `!document.hidden` cập nhật `setNow(new Date())`.
     - Theo dõi `todayIso = todayISOVietnam(now)` bằng `useRef(todayIso)`: khi `todayIso` đổi sang ngày VN mới qua nửa đêm và `kernelUpdatedAt > 0`, gọi `void reminders.refetch()` để đồng bộ `ReminderCards` với Hero/Timeline.
     - Thêm state drawer: `selectedStudentId: string | null`, `drawerTriggerRef = useRef<HTMLButtonElement | null>(null)`, `riskHeadingRef = useRef<HTMLHeadingElement | null>(null)`. Tra `selectedRiskRow = selectedStudentId ? (risk.find((r) => r.student.id === selectedStudentId) ?? null) : null`. Thêm `useEffect`: khi `selectedStudentId !== null && selectedRiskRow === null` thì gọi `setSelectedStudentId(null)` (chống zombie reopen!).
     - Tính fail-closed tài chính ngay tại `dashboard.tsx`:
       - `const canAccessFinance = data.viewer?.canAccessFinance === true;`
       - `const outstanding = canAccessFinance ? tuitionTotals(data.invoices).outstanding : 0;`
       - `const dueStudentsCount = canAccessFinance && reminders.isSuccess ? reminders.data.tuition?.students : undefined;`
       - `const openTasks = reminders.isSuccess ? [reminders.data.attendance.pending > 0, reminders.data.overdueGrading.count > 0, canAccessFinance && (reminders.data.tuition?.students ?? 0) > 0].filter(Boolean).length : null;`
     - Render Hero 2 cột (`mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-end`):
       - Trái: `<p className="mb-2 text-muted-foreground text-sm first-letter:uppercase">{kicker}</p>`, `<h1 className="font-semibold text-2xl tracking-tight md:text-3xl">{formatDashboardGreeting(displayName, now)}</h1>`, `<p className="mt-3 max-w-[60ch] text-base text-muted-foreground">...</p>`:
         - Dùng từ **`buổi dạy`** (không dùng `"ca dạy"` để bảo toàn `daily-attendance.spec.ts:201`): khi `todayGroups.length > 0` → `Hôm nay có <strong>{todayGroups.length} buổi dạy</strong>{remainingTodayCount < todayGroups.length ? (remainingTodayCount > 0 ? ", còn " + remainingTodayCount + " buổi" : ", đã hoàn thành hết") : ""}.`; khi `todayGroups.length === 0` → `"Hôm nay không có buổi dạy nào."`.
         - Chỉ nối phần việc chờ khi `openTasks !== null`: `openTasks > 0 ? <><strong>{openTasks} việc</strong> đang chờ bạn xử lý.</> : "Mọi việc hôm nay đã xong."`.
       - Phải: `<FocusSessionCard focus={focus} classById={classById} />`.
     - Render khu vực `"Việc cần làm hôm nay"` (`mb-10`, `aria-busy={reminders.isPending}`):
       - Nút `Làm mới` với icon `RefreshCw` (`animate-spin` khi `reminders.isFetching`, text `"Đang tải…"` khi `reminders.isFetching`, `"Làm mới"` khi rảnh).
       - Loading skeleton: 3 hoặc 2 khối `h-56 animate-pulse rounded-xl bg-muted` theo `canAccessFinance`.
       - Error state: `<Card role="alert" className="flex flex-wrap items-center gap-3 p-4 sm:px-5 text-sm">` với `<AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />`, `"Không tải được bộ đếm nhắc việc. Kiểm tra kết nối mạng rồi thử lại."` và nút outline `"Thử lại"`.
       - Ready state: `<ReminderCards data={reminders.data} canAccessFinance={canAccessFinance} />`.
     - Render Split 2 cột (`grid gap-10 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]`):
       - Trái: `<TodayScheduleSection ... />`
       - Phải (`min-w-0 space-y-10 self-start`): `<RiskStudentsSection headingRef={riskHeadingRef} ... />` + `<OrgStatsSection studentCount={data.students.length} ungradedCount={ungraded} canAccessFinance={canAccessFinance} outstanding={outstanding} dueStudentsCount={dueStudentsCount} />`.
     - Render `<StudentRiskDrawer />` dùng `studentRiskDetails(...)` và danh sách lớp đã lọc active: `classesByStudent(data, selectedRiskRow.student.id).filter((c) => c.status !== "paused" && c.enrollmentStatus === "active").map((c) => c.name)`.
- **Success criteria:** Toàn bộ unit test dashboard + reminder-cards + dashboard-from-kernel pass 100%, lint & typecheck xanh.
- **Verify:** `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/components/dashboard/reminder-cards.test.tsx src/routes/_auth/dashboard.test.tsx && pnpm check && pnpm check-types` exits 0.

## Tests After

Chạy toàn bộ unit test của package `web` để đảm bảo không ảnh hưởng bất kỳ route/component nào khác:
- `pnpm --filter web test` exits 0.

## Verification

- `pnpm --filter web test` exits 0.
- `pnpm check` exits 0.
- `pnpm check-types` exits 0.

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
