---
phase: 2
title: "Phase 2: Redesign Student Dashboard Components & Route (TDD)"
status: done
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Redesign Student Dashboard Components & Route (TDD)

## Goal

Triển khai trọn vẹn giao diện `/student/` mới theo `open-design/redesign-student-dashboard/index.html` và `DESIGN.md` (GreetingHeader, NextTaskHero, TodayScheduleCard, GoalProgressCard, AssignmentList/Row v2 không cắt focus ring, ClassCard v2 bảo toàn `overview.test.tsx:214`, StudentVocabEntrySection & TuitionSummaryCard, tách `StudentOverviewContent` sau guard kèm đồng hồ 60s + `visibilitychange` + refetch qua nửa đêm VN trên `index.tsx`), đồng thời giữ nguyên 100% hợp đồng E2E và cập nhật test mock/unit tương ứng.

## Files to Create / Modify

- Create: `apps/student/src/components/overview/next-task-hero.tsx`
- Create: `apps/student/src/components/overview/today-schedule-card.tsx`
- Create: `apps/student/src/components/overview/goal-progress-card.tsx`
- Create: `apps/student/src/components/overview/tuition-summary-card.tsx`
- Create: `apps/student/src/components/overview/student-dashboard-redesign.test.tsx`
- Modify: `apps/student/src/components/overview/greeting-header.tsx`
- Modify: `apps/student/src/components/overview/assignment-list.tsx`
- Modify: `apps/student/src/components/overview/assignment-row.tsx`
- Modify: `apps/student/src/components/overview/class-card.tsx`
- Modify: `apps/student/src/routes/_auth/index.tsx`
- Modify: `apps/student/test/overview.test.tsx` (chỉ cập nhật assertions của `GreetingHeader` theo copy mới, giữ nguyên 100% assertions của `ClassCard`, `AssignmentRow`, `AssignmentList`, `StatCard`, `StudentErrorView`, `OverviewEmptyState`)
- Modify: `apps/student/test/placement-test.test.tsx` (bổ sung mock `useStudentSchedule` trong `vi.mock("@/lib/repos/student")`)
- Modify: `apps/student/test/wrong-role-loader-fallback.test.tsx` (bổ sung mock `useStudentSchedule` trong `vi.mock("@/lib/repos/student")`)

## Tests Before

Tạo trước test component `apps/student/src/components/overview/student-dashboard-redesign.test.tsx` kiểm tra các component mới (`NextTaskHero`, `TodayScheduleCard`, `GoalProgressCard`, `TuitionSummaryCard`) trước khi cài đặt chúng.
- Điều kiện đỏ (TDD red phase): chạy `pnpm --filter student exec vitest run src/components/overview/student-dashboard-redesign.test.tsx` phải thoát khác `0` do các file component chưa tồn tại; nếu thoát `0` là sai quy trình TDD.

## Tasks & Steps

### Task 2.1 — Viết unit test TDD đỏ cho 4 component mới của Student Dashboard

<!-- Updated: Red Team Session 1 - Bổ sung kiểm tra nowMs trên ZoomJoinButton, fallback notice khi isFallback, clamp thước IELTS, và TuitionSummaryCard chuẩn hóa type="tuition" + nhiều hóa đơn chưa đóng -->

- **Goal:** Khóa toàn bộ hợp đồng DOM, a11y, strict-mode E2E guard và trạng thái trống/lỗi của `NextTaskHero`, `TodayScheduleCard`, `GoalProgressCard`, `TuitionSummaryCard`.
- **Target files and symbols:** `apps/student/src/components/overview/student-dashboard-redesign.test.tsx`.
- **Steps:**
  1. Tạo `apps/student/src/components/overview/student-dashboard-redesign.test.tsx` (`// @vitest-environment jsdom`), mock `@tanstack/react-router` (`Link`), `sonner`, và `requestStudentZoomJoin` (theo mẫu `class-card.test.tsx`).
  2. Viết các test bắt buộc:
     - **`NextTaskHero`:**
       - Khi có bài cần làm: hiển thị tiêu đề bài bằng `<p>` (không phải `<h2>` chứa `"Bài tập"`), heading cố định `"Việc tiếp theo"`, count `"N bài cần làm"`, metadata thật (`className`, `skill`), queue 2 bài kế tiếp, nút CTA `<Link to="/learn/quizzes/...">` KHÔNG mang `aria-label="Làm bài: ${title}"` (tránh strict-mode collision với `AssignmentRow`), và anchor `href="#assignments"`.
       - Khi không còn bài cần làm (done state): hiển thị heading KHÔNG chứa chuỗi `"bài tập"` (case-insensitive), thông điệp đã xong bài giáo viên giao, và link `/practice/vocabulary` (có nhắc số từ đến hạn khi `vocabDueCount > 0`).
     - **`TodayScheduleCard`:**
       - Hiển thị `"Lịch hôm nay"`, `"Bây giờ HH:mm"`, trạng thái `ended` (`"Đã kết thúc"`), `live` (`ZoomJoinButton` `"Vào lớp (Zoom)"` + `"Đang diễn ra"`), `open` (`ZoomJoinButton` + `"Bắt đầu sau N phút"`), `later` có Zoom (`ZoomJoinButton` + `"Mở từ HH:mm (trước 30 phút)"`), `later` không có Zoom (`"Bắt đầu sau ..."`), không có `"Phòng 305"`, và xác nhận click `ZoomJoinButton` ngoài cửa sổ (dùng `nowMs` truyền vào) KHÔNG gọi `window.open`.
       - Hiển thị skeleton cục bộ khi `isLoading === true`.
       - Hiển thị chú thích nhẹ khi `data.isFallback === true`.
       - Khi hôm nay rỗng (`todayItems = []`) nhưng có `upcomingFallback`: hiển thị `"Hôm nay không có buổi học."` + buổi học sắp tới gần nhất + link `/schedule`.
     - **`GoalProgressCard`:**
       - Trả về rỗng (`container.firstChild === null`) khi `!summary.hasGoalData`.
       - Với IELTS + `entryScore` + `targetScore`: render 4 stat (`<dl>`), badge `"IELTS"`, thanh scale `role="img"` có tick `4.0..9.0` (`aria-hidden="true"`).
       - Với `entryScore: "B1 trở lên"` hoặc `entryScore: "7.0"` >= `targetScore: "6.5"`: không sinh text âm `"+-"` hay width âm.
       - Khi `showPlacementHighlight === true`: render `.goal-note` mang `data-testid="placement-highlight-banner"` và link `data-testid="placement-banner-cta"` trỏ `/placement-test`.
       - Khi `showPlacementHighlight === false`: KHÔNG render `placement-highlight-banner` hay `placement-banner-cta`.
     - **`TuitionSummaryCard`:**
       - Trả về rỗng khi `summary === null`.
       - Khi còn học phí chưa đóng (kể cả `type: "tuition"` hoặc `type: "Phí tài liệu"`): render `<h2>Học phí</h2>`, không lộ chữ raw `"tuition"`, số tiền `fmtVnd(totalDue)`, link chính trỏ thẳng `/tuition/${primaryInvoice.id}` có accessible name khớp `/Học phí/`; khi `unsettledCount > 1` nêu rõ số tiền hóa đơn gần nhất và link phụ `"Tất cả (N)"` trỏ `/tuition` KHÔNG chứa `"Học phí"`.
       - Khi tất cả đã thanh toán: hiển thị `"Đã thanh toán đủ"` và link tới hóa đơn.
- **Success criteria:** File test biên dịch hợp lệ và chạy đỏ do 4 component chưa tạo.
- **Verify:** `pnpm --filter student exec vitest run src/components/overview/student-dashboard-redesign.test.tsx` exits non-zero (expected TDD red state).

### Task 2.2 — Tạo 4 component mới (`NextTaskHero`, `TodayScheduleCard`, `GoalProgressCard`, `TuitionSummaryCard`)

<!-- Updated: Red Team Session 1 - Truyền nowMs cho mọi ZoomJoinButton, hiển thị chú thích fallback lịch, dùng clamp/EXAM_LABELS ở GoalProgressCard, và chuẩn hóa nhãn + chi tiết nhiều hóa đơn ở TuitionSummaryCard -->

- **Goal:** Xây dựng 4 khối giao diện mới đúng bố cục `open-design/redesign-student-dashboard/index.html`, dùng 100% token `packages/ui/src/styles/globals.css` và `DESIGN.md` (không hex cứng, không `text-bg`, không `whitespace-nowrap` gây tràn 320px).
- **Target files and symbols:**
  - `apps/student/src/components/overview/next-task-hero.tsx` (`NextTaskHero`)
  - `apps/student/src/components/overview/today-schedule-card.tsx` (`TodayScheduleCard`)
  - `apps/student/src/components/overview/goal-progress-card.tsx` (`GoalProgressCard`)
  - `apps/student/src/components/overview/tuition-summary-card.tsx` (`TuitionSummaryCard`)
- **Steps:**
  1. **`next-task-hero.tsx`:**
     - Card `rounded-xl border bg-card p-5 shadow-sm md:p-6 flex flex-col justify-between gap-5`.
     - Status flag dot + chữ (`Quá hạn` `text-destructive`, `Sắp đến hạn` `text-warn`, `Việc tiếp theo` `text-muted-foreground`), không dùng màu đơn độc.
     - `<h2 id="next-task-heading">` dùng nhãn cố định (`"Việc tiếp theo"` khi có bài, `"Hoàn thành bài giao"` khi rỗng — tuyệt đối KHÔNG chứa `"bài tập"`).
     - Tên bài dùng `<p className="font-semibold text-xl leading-snug tracking-tight text-foreground break-words">`.
     - Metadata dùng `flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground` với `School` icon cho `className` và `Layers` icon cho `skillLabel` (chỉ render nếu có).
     - Due line hiển thị `dueLabel` + `remaining.label` (tone `text-destructive` / `text-warn` / `text-muted-foreground`).
     - CTA: `<Link to="/learn/quizzes/$assignmentId" params={{ assignmentId: primary.assignment.id }} className={cn(buttonVariants({ variant: "default", size: "lg" }), "min-h-11 w-full sm:w-auto")}>Làm bài <ArrowRight aria-hidden="true" className="size-4" /></Link>` (KHÔNG đặt `aria-label="Làm bài: ${title}"`), cạnh `<a href="#assignments" className="inline-flex min-h-9 items-center text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:shadow-[var(--focus-ring)] rounded-md">Xem tất cả bài tập</a>`.
     - Queue `"Tiếp theo"` (`border-t border-border pt-4 space-y-2`): tối đa 2 dòng `<p className="flex items-baseline justify-between gap-4 text-sm">` với tên truncate (`min-w-0 flex-1 truncate`) + hạn (`shrink-0 font-mono text-xs text-muted-foreground tabular-nums`).
     - Done state: vòng tròn `size-10 rounded-full bg-muted text-success` chứa `<Check />`, heading `"Hoàn thành bài giao"`, mô tả (có nhắc `vocabDueCount` khi `vocabDueCount > 0`) + nút `<Link to="/practice/vocabulary">` `"Ôn từ vựng →"`.
  2. **`today-schedule-card.tsx`:**
     - Card `rounded-xl border bg-card p-5 shadow-sm md:p-6 flex flex-col gap-4`.
     - Header: `<h2 id="today-schedule-heading" className="font-semibold text-lg tracking-tight text-foreground">Lịch hôm nay</h2>` + `<span className="font-mono text-sm text-muted-foreground tabular-nums">Bây giờ {nowHHMM}</span>` (chỉ render khi `nowHHMM` khác rỗng).
     - Khi `isLoading`: 2 dòng skeleton `animate-pulse motion-reduce:animate-none`.
     - Khi `data.isFallback`: hiển thị ghi chú nhỏ `text-xs text-muted-foreground` báo lịch chi tiết tạm chưa tải đủ.
     - Khi có buổi hôm nay: `ul` với `divide-y divide-border`, mỗi `li` là grid `grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 py-4 first:pt-0 last:pb-0`:
       - Cột giờ: `item.time` (`font-mono text-sm font-medium tabular-nums`) + `item.endTime` (`font-mono text-xs text-muted-foreground tabular-nums`, chỉ render khi khác `null`).
       - Cột nội dung (`min-w-0 space-y-1.5`): tên lớp (`font-medium text-sm truncate`), dòng phụ có icon (`Video` nếu `item.hasZoom`, `CalendarClock` nếu không) + `item.subtitle` (`topic || mode || "Buổi học"`), hàng trạng thái/hành động (LUÔN truyền `nowMs={nowMs}` cho `<ZoomJoinButton>`, TUYỆT ĐỐI không render raw `joinUrl` thành link):
         - `ended`: `<Check className="size-3.5" /> Đã kết thúc` (mờ dòng tên + giờ).
         - `live`: `<ZoomJoinButton ... nowMs={nowMs} variant="default" size="sm" />` (nếu `item.hasZoom`) + chấm xanh `"Đang diễn ra"`.
         - `open`: `<ZoomJoinButton ... nowMs={nowMs} variant="default" size="sm" />` + `"Bắt đầu sau ${item.relativeText}"`.
         - `later`: nếu `item.hasZoom` render `<ZoomJoinButton ... nowMs={nowMs} variant="outline" size="sm" />` + ghi chú `"Mở từ ${item.openAtLabel} (trước ${ZOOM_EARLY_JOIN_MINUTES} phút)"` (khi `item.openAtLabel` khác `null`); nếu không có Zoom render `"Bắt đầu sau ${item.relativeText}"`.
     - Khi hôm nay không có buổi (`todayItems.length === 0`): thông báo `"Hôm nay không có buổi học."` + nếu `upcomingFallback.length > 0`, hiển thị tối đa 2 buổi sắp tới (tên lớp, ngày + giờ, `<ZoomJoinButton ... nowMs={nowMs} variant="outline" size="sm" />` nếu `hasZoom`), cùng chân thẻ `<Link to="/schedule">` `"Xem lịch học →"`.
  3. **`goal-progress-card.tsx`:**
     - Nếu `!summary.hasGoalData` trả `null`.
     - Card `rounded-xl border bg-card p-5 shadow-sm md:p-6 space-y-6`.
     - Header: `<h2 id="goal-heading" className="font-semibold text-lg tracking-tight text-foreground">Tiến độ tới mục tiêu</h2>` + badge `summary.examLabel` (`rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground`).
     - `<dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">`: mỗi stat hiển thị `<dt className="text-xs text-muted-foreground">`, `<dd>` với số/giá trị (`font-mono font-semibold text-2xl sm:text-3xl tracking-tight tabular-nums leading-tight break-words` khi `isNumeric`, hoặc `font-semibold text-lg leading-snug break-words` khi text dài như `"4.5 – 5.5"` / `"1–2 giờ"` / `"Đã đạt"` để không tràn `320px`) + dòng hint `text-xs text-muted-foreground`.
     - Thước IELTS (chỉ khi `summary.ieltsScale != null`):
       - `role="img"` + `aria-label` mô tả rõ ràng khoảng `4.0–9.0`, hiện tại, mục tiêu.
       - Thanh nền `h-2 rounded-full bg-muted relative` (dùng các phần trăm đã clamp `[0, 100]` và `gapWidthPct >= 0` từ selector, đảm bảo pin không bao giờ tràn ra ngoài cạnh trái/phải):
         - Nếu có `currentPointPct != null`: thanh hoàn thành `bg-foreground`, dải khoảng cách `bg-foreground/20` (chỉ khi `gapWidthPct > 0`), pin tròn đặc `bg-foreground ring-[3px] ring-card`, pin vòng rỗng `bg-card border-[3px] border-foreground`.
         - Nếu chỉ có `currentRangePct != null`: dải vùng hiện tại `bg-foreground`, dải khoảng cách (khi `gapWidthPct > 0`), pin vòng rỗng tại `targetPointPct`.
         - Nếu chỉ có `targetPointPct`: pin vòng rỗng tại `targetPointPct`.
       - Dãy tick `4.0 .. 9.0` (`aria-hidden="true"`) + legend (`aria-hidden="true"`).
     - Chân thẻ `.goal-note` (CHỈ khi `showPlacementHighlight === true`):
       - `<div data-testid="placement-highlight-banner" className="flex flex-col gap-3 rounded-lg bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">`:
         - Mô tả: `"Trình độ hiện tại là bạn tự đánh giá khi đăng ký. Làm bài kiểm tra đầu vào 5 kỹ năng (~40 phút) để giáo viên xếp lộ trình sát hơn."`
         - CTA: `<Link to="/placement-test" data-testid="placement-banner-cta" className={cn(buttonVariants({ variant: "default", size: "sm" }), "shrink-0")}>Làm bài test đầu vào <ArrowRight aria-hidden="true" className="size-4" /></Link>`.
  4. **`tuition-summary-card.tsx`:**
     - Nếu `summary === null` trả `null`.
     - `<section aria-labelledby="tuition-heading" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm">`:
       - Nhóm trái (`min-w-0 space-y-1`):
         - `<h2 id="tuition-heading" className="text-xs font-medium text-muted-foreground">Học phí</h2>` (khớp `getByRole("heading", { name: "Học phí" })` của `tuition-bank-transfer.spec.ts:266`).
         - `<p className="font-semibold text-base text-foreground">` với `<span className="font-mono tabular-nums">{fmtVnd(summary.totalDue)}</span>` + hạn (khi `totalDue > 0`), hoặc `"Đã thanh toán đủ"`.
         - `<p className="text-sm text-muted-foreground">{summary.subtitle}</p>` (đã chuẩn hóa `invoiceTypeLabel`, khi `unsettledCount > 1` nêu rõ `"${unsettledCount} hóa đơn chưa đóng · hóa đơn gần nhất ${fmtVnd(primaryInvoiceDue)}"`).
       - Nhóm phải (`flex flex-wrap items-center gap-2`):
         - `<Link to="/tuition/$invoiceId" params={{ invoiceId: summary.primaryInvoice.id }} aria-label={summary.primaryLinkAriaLabel} className={buttonVariants({ variant: "outline", size: "sm" })}>Xem hóa đơn</Link>` (luôn chứa `"Học phí"` trong `aria-label` để khớp `getByRole("main").getByRole("link", { name: /Học phí/ }).first()` và đi thẳng trang QR `/tuition/$invoiceId`!).
         - Nếu `summary.totalInvoices > 1`: `<Link to="/tuition" className={buttonVariants({ variant: "ghost", size: "sm" })}>Tất cả ({summary.totalInvoices})</Link>` (không chứa chữ `"Học phí"`).
- **Success criteria:** Toàn bộ test trong `student-dashboard-redesign.test.tsx` pass.
- **Verify:** `pnpm --filter student exec vitest run src/components/overview/student-dashboard-redesign.test.tsx` exits 0.

### Task 2.3 — Nâng cấp `GreetingHeader`, `AssignmentList`, `AssignmentRow` và `ClassCard` chuẩn design v2

<!-- Updated: Red Team Session 1 - Tách overdueCount/dueSoonCount ở GreetingHeader, bỏ overflow-hidden cắt --focus-ring ở AssignmentList, và giữ ClassProgress dùng aria-hidden="true" thay vì aria-labelledby để bảo toàn overview.test.tsx:214 -->

- **Goal:** Đồng bộ visual ngôn ngữ v2 của 4 component dùng chung mà không làm vỡ bất kỳ hợp đồng E2E/unit nào của `/`, `/assignments`, và `/classes`.
- **Target files and symbols:**
  - `apps/student/src/components/overview/greeting-header.tsx` (`GreetingHeader`)
  - `apps/student/src/components/overview/assignment-list.tsx` (`AssignmentList`, `ASSIGNMENT_FILTER_TABS`, `FilterTab`)
  - `apps/student/src/components/overview/assignment-row.tsx` (`AssignmentRow`)
  - `apps/student/src/components/overview/class-card.tsx` (`ClassCard`, `ClassBadges`, `Tag`, `ClassProgress`)
- **Steps:**
  1. **`greeting-header.tsx`:**
     - Props: `{ studentName: string; dueSoonCount: number; overdueCount?: number; remainingSessionsToday?: number; totalSessionsToday?: number; nowMs?: number }`.
     - Kicker: `<p className="text-sm text-muted-foreground">{formatVietnamLongDate(nowMs ?? Date.now())}</p>` (bỏ `StudentSpot` và `useStudentOrgs` trùng breadcrumb shell).
     - Heading: `<h1 className="font-semibold text-2xl tracking-tight text-foreground md:text-3xl">Chào {displayName}</h1>` (giữ cách tách tên hiển thị từ `studentName`).
     - Summary `<p aria-live="polite" className="max-w-[62ch] text-base text-muted-foreground">`:
       - Phần bài tập tách bạch `overdueCount` và `dueSoonCount`:
         - Cả hai `> 0`: `<strong>{overdueCount} bài quá hạn</strong> và <strong>{dueSoonCount} bài sắp đến hạn</strong>`.
         - Chỉ `overdueCount > 0`: `<strong>{overdueCount} bài quá hạn</strong>`.
         - Chỉ `dueSoonCount > 0`: `<strong>{dueSoonCount} bài sắp đến hạn</strong>`.
         - Cả hai `=== 0`: `"không còn bài nào sắp đến hạn"`.
       - Chỉ khi `remainingSessionsToday !== undefined` mới ghép phần lịch học hôm nay (`remainingSessionsToday > 0` → `<strong>{remainingSessionsToday} buổi học</strong> còn lại hôm nay`, ngược lại `totalSessionsToday === 0 ? "hôm nay không có buổi học" : "đã xong lịch học hôm nay"`).
  2. **`assignment-list.tsx`:**
     - Thêm prop tùy chọn `id?: string` (để `/` gắn `id="assignments"` cho anchor `#assignments` + `scroll-mt-20`).
     - Giữ nguyên 4 tab `TABS` (`all`, `due-soon`, `overdue`, `submitted`), mặc định `"all"`, `role="tablist"`, `role="tab"`, `aria-selected`, `aria-hidden="true"` trên số đếm.
     - Nâng cấp style segmented tabs chuẩn `DESIGN.md:70` (`inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-1`, tab chọn `bg-card text-foreground font-medium shadow-sm`, bỏ duplicate `rounded-lg rounded-md`).
     - Nâng cấp danh sách bài tập: bọc các `AssignmentRow` trong 1 card `rounded-xl border bg-card shadow-sm divide-y divide-border` (TUYỆT ĐỐI KHÔNG đặt `overflow-hidden` để không cắt 4px `--focus-ring` trên `/` và `/assignments`!; heading `font-semibold text-lg tracking-tight`).
  3. **`assignment-row.tsx`:**
     - Giữ nguyên guard `if (assignment.source !== "class_assignment") return rowContent;` và `<Link to="/learn/quizzes/$assignmentId" params={{ assignmentId: assignment.id }} aria-label={assignment.submittedAt ? \`Xem lại kết quả: \${assignment.title}\` : \`Làm bài: \${assignment.title}\`}>` ôm trọn `rowContent` (bảo toàn `row.getByText("Chưa nộp")` / `reviewedRow.getByText("Đã nộp")` trong `student-quiz-take-review.spec.ts:492,609`!).
     - Trên `<Link>`: dùng `block first:rounded-t-xl last:rounded-b-xl transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:rounded-xl focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none` (bỏ `outline-hot` legacy v1 và giữ focus ring 4px rõ ở cả 4 cạnh).
     - Đổi `<h4>` thành `<p className="truncate font-medium text-sm text-foreground">{assignment.title}</p>`.
     - Layout hàng chuẩn prototype: thông tin trái (`title` + `className · skill`), cụm phải (`dueText` + chấm trạng thái `--success`/`--warn`/`--destructive`/muted kèm `derived.statusLabel` + pill affordance `aria-hidden="true"` `"Làm bài"` / `"Xem kết quả"` khi `source === "class_assignment"`), responsive xếp dọc gọn trên `< sm`.
  4. **`class-card.tsx`:**
     - Dọn duplicate classes (`rounded-xl border bg-card p-5 shadow-sm flex flex-col justify-between`), thêm `border-dashed` khi `isInvited`, chuẩn hóa tiêu đề `font-semibold text-lg leading-snug tracking-tight`.
     - Trong `ClassProgress`: giữ thanh tiến độ ở dạng trang trí `aria-hidden="true"` (vì nhãn `"Tiến độ khóa học"` và `"Buổi X/Y"` đã hiện dạng text liền kề; TUYỆT ĐỐI KHÔNG gắn `aria-label` hay `aria-labelledby` vì `overview.test.tsx:214` kiểm substring `expect(html).not.toContain("aria-label")`).
     - Giữ nguyên 100% text & thuộc tính đã khóa trong `class-card.test.tsx`, `overview.test.tsx`, `student-class-detail.spec.ts`, `class-status.spec.ts`.
- **Success criteria:** Các test hiện hữu của `class-card.test.tsx`, `student-nav.test.tsx` pass không lỗi.
- **Verify:** `pnpm --filter student exec vitest run src/components/overview/class-card.test.tsx test/student-nav.test.tsx` exits 0.

### Task 2.4 — Kết nối trang `/student/` (`apps/student/src/routes/_auth/index.tsx`) và cập nhật unit test liên quan

<!-- Updated: Red Team Session 1 - Tách StudentOverviewContent sau toàn bộ guard, guard ACCOUNT_TEACHER_ROLE cho scheduleQuery, đồng bộ org-key me.student.orgId + cặp nguyên tử scheduleQuery.data.classes, refetch qua nửa đêm VN, và truyền vocabDueCount thật vào NextTaskHero -->

- **Goal:** Lắp ghép hoàn chỉnh `StudentOverviewPage` (tách `StudentOverviewContent` sau mọi auth/role/onboarding guard), giữ nguyên export `StudentVocabEntrySection` & `deriveStudentHomeVocabSubtitle`, tích hợp đồng hồ 60s + `visibilitychange` + refetch qua nửa đêm VN, và cập nhật đúng 3 file unit test bị ảnh hưởng (`overview.test.tsx`, `placement-test.test.tsx`, `wrong-role-loader-fallback.test.tsx`).
- **Target files and symbols:**
  - `apps/student/src/routes/_auth/index.tsx` (`StudentOverviewPage`, `StudentOverviewContent`, `StudentVocabEntrySection`, `deriveStudentHomeVocabSubtitle`)
  - `apps/student/test/overview.test.tsx`
  - `apps/student/test/placement-test.test.tsx`
  - `apps/student/test/wrong-role-loader-fallback.test.tsx`
- **Steps:**
  1. Trong `apps/student/src/routes/_auth/index.tsx`:
     - Giữ nguyên toàn bộ luồng guard đầu trang ở `StudentOverviewPage` (`meQuery`, `overviewQuery`, `isLoading`, `meQuery.error`, `onboardingCompletedAt == null`, `overviewQuery.error`, `if (!me || !overview) return <Loader />`), rồi render `<StudentOverviewContent me={me} overview={overview} />`.
     - Bên trong `StudentOverviewContent` (chỉ mount sau khi `me` + `overview` + `isOnboarded` đều hợp lệ):
       - Đồng hồ `const [nowMs, setNowMs] = useState(() => Date.now());` + `useEffect` tick 60s & `visibilitychange` (`!document.hidden` → `setNowMs(Date.now())`).
       - Đồng bộ qua nửa đêm VN: `const todayISO = vietnamTodayISO(new Date(nowMs));`, theo dõi `prevTodayIsoRef` và khi `prevTodayIsoRef.current !== todayISO` gọi `queryClient.invalidateQueries({ queryKey: ["student", "overview"] })` và `queryClient.invalidateQueries({ queryKey: ["student", "schedule"] })` (mẫu `apps/web/src/routes/_auth/dashboard.tsx:82-94`).
       - Đọc `activeOrgId` qua `useSyncExternalStore(subscribeActiveStudentOrg, getActiveStudentOrgId, getActiveStudentOrgId)`. Tính `const isOrgAligned = !activeOrgId || me.student.orgId === activeOrgId;` và `const effectiveOrgId = activeOrgId ?? me.student.orgId;`.
       - Gọi `const scheduleQuery = useStudentSchedule({ enabled: isOrgAligned, orgIdOverride: effectiveOrgId });`, `const vocabQuery = useVocabOverview();`, `const invoicesQuery = useStudentInvoices();`, `const placementStatusQuery = useStudentPlacementStatus(true);`.
       - Guard wrong-role trên `scheduleQuery.error`: nếu `isHttpError(scheduleQuery.error) && scheduleQuery.error.code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL`, trả `<Loader />`.
       - Tính selector:
         - `nextTask = selectNextTaskHero(overview.assignments, todayISO, nowMs)`
         - `todaySchedule = selectTodaySchedule({ classes: scheduleQuery.isSuccess ? scheduleQuery.data.classes : overview.classes, lessons: scheduleQuery.isSuccess ? scheduleQuery.data.lessons : scheduleQuery.isError ? null : [], nowMs })`
         - `goalSummary = deriveStudentGoalSummary({ student: me.student, activeClassCount: countActiveEnrolledClasses(overview.classes) })`
         - `tuitionSummary = isOrgAligned && !invoicesQuery.isError && invoicesQuery.data ? selectStudentTuitionSummary(invoicesQuery.data) : null`
       - Truyền vào `<GreetingHeader studentName={me.student.name} dueSoonCount={nextTask.dueSoonCount} overdueCount={nextTask.overdueCount} remainingSessionsToday={isOrgAligned && scheduleQuery.isSuccess ? todaySchedule.remainingCount : undefined} totalSessionsToday={isOrgAligned && scheduleQuery.isSuccess ? todaySchedule.todayItems.length : undefined} nowMs={nowMs} />`.
       - Giữ nguyên `<PlacementPromptModal ... />`.
       - Render standalone `<PlacementHighlightBanner />` CHỈ KHI `showPlacementHighlight && !goalSummary.hasGoalData`.
       - Render Top Grid (`mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]`): `<NextTaskHero data={nextTask} vocabDueCount={vocabQuery.data?.dueCount ?? 0} />` + `<TodayScheduleCard data={todaySchedule} isLoading={isOrgAligned && scheduleQuery.isPending} nowMs={nowMs} />`.
       - Render `<GoalProgressCard summary={goalSummary} showPlacementHighlight={Boolean(showPlacementHighlight)} className="mb-10" />`.
       - Render `<AssignmentList id="assignments" assignments={overview.assignments} todayISO={todayISO} nowMs={nowMs} className="mb-10 scroll-mt-20" />`.
       - Render `<section id="classes" aria-labelledby="classes-heading" className="mb-10 scroll-mt-20">` với `<h2 id="classes-heading" className="mb-4 font-semibold text-lg tracking-tight text-foreground">Lớp học của tôi</h2>`, empty state hoặc grid `grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3` chứa `<ClassCard ... />`.
       - Render đáy `minor-grid`: `<div className={cn("grid grid-cols-1 gap-4", tuitionSummary && "sm:grid-cols-2")}>` chứa `<StudentVocabEntrySection className="mt-0" />` và `<TuitionSummaryCard summary={tuitionSummary} />`.
       - Giữ nguyên export `deriveStudentHomeVocabSubtitle` và `StudentVocabEntrySection` từ `index.tsx` (bảo toàn 100% `vocab-course-catalog.test.tsx:413-569`, `data-testid="vocab-home-entry"`, `data-testid="vocab-home-due-badge"`, style thẻ gọn v2).
  2. Cập nhật `apps/student/test/placement-test.test.tsx`: bổ sung `useStudentSchedule: () => ({ isPending: false, isSuccess: true, isError: false, error: null, data: { classes: [], lessons: [] } })` vào `vi.mock("@/lib/repos/student", ...)` (dòng 64–116).
  3. Cập nhật `apps/student/test/wrong-role-loader-fallback.test.tsx`: bổ sung `useStudentSchedule: () => ({ isPending: false, isSuccess: false, isError: false, error: null, data: undefined })` vào `vi.mock("@/lib/repos/student", ...)` (dòng 76–87).
  4. Cập nhật `apps/student/test/overview.test.tsx` (chỉ block `describe("GreetingHeader")` dòng 298–314) khớp copy mới (`"2 bài sắp đến hạn"`, `"không còn bài nào sắp đến hạn"`, kèm thêm case có `overdueCount` và `remainingSessionsToday`).
- **Success criteria:** Toàn bộ 73+ file unit test trong `apps/student` (kể cả `vocab-course-catalog.test.tsx`, `placement-test.test.tsx`, `overview.test.tsx`, `tuition-list.test.tsx`, `text-bg-guard.test.ts`, `wrong-role-loader-fallback.test.tsx`, `student-dashboard-redesign.test.tsx`, `student-overview-selectors.test.ts`), `pnpm exec biome check .` và `pnpm check-types` đều pass 100%.
- **Verify:** `pnpm --filter student test && pnpm check-types && pnpm exec biome check .` exits 0.

## Tests After

- `pnpm --filter student test` exits 0 (0 failed).
- `pnpm check-types` exits 0.
- `pnpm exec biome check .` exits 0.

## Verification

- Tất cả unit test của `apps/student` pass 100%.
- `pnpm check-types` và `pnpm exec biome check .` pass 0 lỗi.

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
