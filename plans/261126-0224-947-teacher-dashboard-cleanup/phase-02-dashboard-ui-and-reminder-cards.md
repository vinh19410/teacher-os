---
phase: 2
title: "Phase 2: Dashboard UI & Reminder Cards (TDD)"
status: done
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Dashboard UI & Reminder Cards (TDD)

## Goal

Cập nhật `apps/web/src/lib/repos/dashboard-reminders.ts`, `apps/web/src/components/dashboard/reminder-cards.tsx` và `apps/web/src/routes/_auth/dashboard.tsx` để hoàn tất toàn bộ yêu cầu giao diện của #947 (3 thẻ lối tắt 1-2-3 rõ label + hết double-padding focus ring, bỏ ô KPI trùng, đổi nhãn "Tổng học viên", fail-closed quyền tài chính trên cả KPI lẫn `ReminderCards`, bảng "Cần kiểm tra" 2 loại + cột "Còn" rõ đơn vị không tràn từ 320px, múi giờ VN nhất quán, ngôn ngữ giáo viên, rút chữ mô tả) kèm unit tests đầy đủ.

## Files to Create / Modify

- Modify: `apps/web/src/lib/repos/dashboard-reminders.ts` (`remindersQueryKey`, `dashboardRemindersQueryOptions` tách cache theo `viewerRole`)
- Modify: `apps/web/src/components/dashboard/reminder-cards.tsx` (`ReminderCards`, `ReminderCard`)
- Modify: `apps/web/src/components/dashboard/reminder-cards.test.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.tsx` (`RISK_LABEL`, `ScheduleRow`, `DashboardRoute`)
- Modify: `apps/web/src/routes/_auth/dashboard.test.tsx`

## Tasks & Steps

### Task 2.1 — Viết test TDD (Red phase) cho `ReminderCards` và `DashboardRoute`

<!-- Updated: Red Team Session 1 - Neo WEDNESDAY theo +07:00, sửa cả 2 test reminders (:235 & :260) dùng async barrier "1 ca dạy", sửa phantom test #694 (:324) và assertion chết /Sổ học phí/ (:73), thêm test fail-closed canAccessFinance trên cả KPI & ReminderCards -->

- **Goal:** Khóa toàn bộ hành vi UI mong đợi bằng unit tests trước khi chỉnh component (không còn phantom test hay race condition).
- **Target files and symbols:** `apps/web/src/components/dashboard/reminder-cards.test.tsx`, `apps/web/src/routes/_auth/dashboard.test.tsx`.
- **Steps:**
  1. Cập nhật `apps/web/src/components/dashboard/reminder-cards.test.tsx`:
     - Kiểm tra 3 thẻ hiển thị số bước `1`, `2`, `3` cùng nhãn chức năng (`Điểm danh`, `Chấm bài`, `Học phí`), tiêu đề góc nhìn giáo viên (`Ca dạy hôm nay chưa điểm danh`, `Bài tập quá hạn chấm > 24h`, `Học phí đến hạn`), bộ đếm (`2 ca dạy`, `3 bài`, `4 học viên`), và CTA rút gọn (`Điểm danh →`, `Chấm bài →`, `Xem học phí →`).
     - Kiểm tra href giữ nguyên hợp đồng: `/attendance?date=2026-10-26&status=pending`, `/grading?status=awaiting`, `/tuition`, và `aria-label` mang rõ số bước + nhãn chức năng.
     - Kiểm tra khi `tuition` là `undefined` **hoặc** `canAccessFinance={false}` (dù `data.tuition` có dữ liệu): không render thẻ 3 (`queryByTestId("reminder-card-tuition")` là `null`, `queryByRole("link", { name: /Học phí/ })` là `null`) và container dùng 2 cột (`lg:grid-cols-2`).
     - Kiểm tra trạng thái `done` (đếm 0): hiện `"Đã hoàn tất hôm nay"`, không hiện số 0 hay dòng preview thừa (`0 Writing · 0 Speaking`, `0đ`), link đích vẫn hoạt động.
     - Giữ nguyên unit test `remindersSectionTitle` (export không vỡ).
  2. Cập nhật `apps/web/src/routes/_auth/dashboard.test.tsx`:
     - Đổi `WEDNESDAY` (dòng `:29`) sang `new Date("2026-10-07T10:00:00+07:00")` để bất biến với TZ máy.
     - Bỏ kiểm tra `Buổi học hôm nay`; thêm assert chắc chắn KHÔNG còn xuất hiện chữ `"Buổi học hôm nay"` trên trang.
     - Kiểm tra 3 ô KPI với teacher (`canAccessFinance: true`): `"Tổng học viên"` (không còn dòng phụ `"cần kiểm tra"`), `"Bài tập chưa có điểm"` (không còn `"trên tổng bài đã giao"`), `"Còn phải thu"` (không còn `"hóa đơn"`).
     - Thêm test với role không có quyền tài chính (`viewer: { role: "ta", canAccessFinance: false }`) ngay cả khi mock `startRemindersServer` trả `REMINDERS_BODY` có `tuition`: khẳng định CẢ ô KPI `"Còn phải thu"` LẪN Thẻ 3 `"Học phí"` (`queryByTestId("reminder-card-tuition")`) đều ẩn.
     - Cập nhật **CẢ HAI** test reminders (`:227-246` VÀ `:248-281` `"refetch reminders khi kernel snapshot refresh"`): dùng `await screen.findByText("1 ca dạy")` làm async wait barrier chờ `GET /api/dashboard/reminders` tải xong (tránh race condition do tiêu đề tĩnh `"Việc cần làm hôm nay"` xuất hiện ngay lúc skeleton!), sau đó assert tiêu đề `"Việc cần làm hôm nay"`, nút `"Làm mới"`, và link `/attendance?date=2026-10-07&status=pending`.
     - Cập nhật test bảng `"Cần kiểm tra"`:
       - Truyền thêm `packages` (inline `KernelPackageRow` cho học viên có gói — lưu ý `kernel-harness.tsx` chưa có `packageRow` helper) và `classAssignments` quá hạn chưa nộp.
       - Kiểm tra chỉ hiển thị `"Chưa điểm danh"` và `"Bài tập trễ hạn"`; học viên chỉ có buổi `absent` KHÔNG xuất hiện; không còn `"Miss check-in"` hay subtitle `"Học viên rủi ro: vắng mặt hoặc miss check-in"`.
       - Kiểm tra cột `"Còn"`: học viên có gói hiển thị `"còn 10 buổi"` (theo gói active); học viên không có gói hiển thị `"Chưa có gói"`, không hiển thị `"còn 0 buổi"`.
     - Cập nhật test empty org theo ngôn ngữ giáo viên mới: `"Không có buổi dạy hôm nay."`, `"Không có buổi dạy sắp tới trong tuần."`, `"Không có học viên cần kiểm tra."`.
     - Cập nhật test lớp tạm dừng `#694` (`:283-336`): đổi `les-risk` (dòng `:324`) từ `status: "absent"` sang `status: "upcoming"` + thêm 1 `classAssignment` quá hạn chưa nộp thuộc `cl-paused` (và 1 lớp `active` đối chứng hoặc khẳng định rõ lớp tạm dừng bị loại hoàn toàn khỏi cả lịch lẫn `"Cần kiểm tra"`), để không biến thành phantom test.
- **Success criteria:** Hai file test thất bại rõ ràng trên code hiện tại (trạng thái TDD Red).
- **Verify:** `pnpm --filter web exec vitest run src/components/dashboard/reminder-cards.test.tsx src/routes/_auth/dashboard.test.tsx` exits non-zero với assertion failures trên code cũ.

### Task 2.2 — Triển khai `dashboard-reminders.ts` và `ReminderCards`

<!-- Updated: Red Team Session 1 - Thêm viewerRole vào remindersQueryKey, thêm prop canAccessFinance (fail-closed), sửa double-padding Card p-6 + inner p-5, giữ <h3> con trực tiếp + thêm data-testid bền vững -->

- **Goal:** Làm sạch 3 thẻ lối tắt trong `reminder-cards.tsx` đúng Done means #3, #4, #6, chuẩn a11y focus ring `REVIEW.md` và tách cache theo quyền xem tài chính.
- **Target files and symbols:** `apps/web/src/lib/repos/dashboard-reminders.ts` (`remindersQueryKey`, `dashboardRemindersQueryOptions`), `apps/web/src/components/dashboard/reminder-cards.tsx` (`ReminderCards`, `ReminderCard`).
- **Steps:**
  1. Trong `apps/web/src/lib/repos/dashboard-reminders.ts`:
     - Mở rộng `remindersQueryKey(kernelDataUpdatedAt: number, viewerRole = "unknown")` trả `[...remindersBaseQueryKey, kernelDataUpdatedAt, viewerRole] as const`.
     - Mở rộng `dashboardRemindersQueryOptions(baseUrl = getApiBaseUrl(), kernelDataUpdatedAt = 0, viewerRole = "unknown")` truyền `viewerRole` vào `remindersQueryKey`.
  2. Trong `apps/web/src/components/dashboard/reminder-cards.tsx`:
     - Giữ export `remindersSectionTitle` (tránh phá tương thích ngược).
     - Thêm prop tùy chọn `canAccessFinance = true` cho `ReminderCards({ data, canAccessFinance = true }: { data: DashboardReminders; canAccessFinance?: boolean })`; chỉ render thẻ học phí khi `const showTuition = canAccessFinance && Boolean(data.tuition);`.
     - Grid: `showTuition ? "grid grid-cols-1 gap-4 lg:grid-cols-3" : "grid grid-cols-1 gap-4 lg:grid-cols-2"`.
     - Thẻ 1 (`data-testid="reminder-card-attendance"`): `step={1}`, `label="Điểm danh"`, `title="Ca dạy hôm nay chưa điểm danh"`, `headline={`${data.attendance.pending} ca dạy`}`, `cta="Điểm danh →"`, `to="/attendance"`, `search={{ date: data.date, status: "pending" }}`.
     - Thẻ 2 (`data-testid="reminder-card-grading"`): `step={2}`, `label="Chấm bài"`, `title="Bài tập quá hạn chấm > 24h"`, `headline={`${data.overdueGrading.count} bài`}`, `lines={[`${data.overdueGrading.writing} Writing · ${data.overdueGrading.speaking} Speaking`]}`, `cta="Chấm bài →"`, `to="/grading"`, `search={{ status: "awaiting" }}`.
     - Thẻ 3 (`data-testid="reminder-card-tuition"`, chỉ khi `showTuition && data.tuition`): `step={3}`, `label="Học phí"`, `title="Học phí đến hạn"`, `headline={`${data.tuition.students} học viên`}`, `lines={[fmtVND(data.tuition.outstanding)]}`, `cta="Xem học phí →"`, `to="/tuition"`.
  3. Trong `ReminderCard`:
     - Loại bỏ `div` đệm thừa gây double-padding (`Card` vốn có `p-6` ở `packages/ui/src/components/web-kit/card.tsx:29`); đặt thẳng `className={cn("relative space-y-2 p-5", props.done && "bg-muted/40")}` và `data-testid={props.testId}` lên `<Card>`!
     - Đặt `<Link to={props.to} search={props.search} className="absolute inset-0 rounded-xl outline-none focus-visible:shadow-[var(--focus-ring)]" aria-label={`${props.step}. ${props.label} — ${props.title}`} />` ôm khít viền `<Card>` (đúng 1 điểm focus/thẻ, không còn vành chết 24px).
     - Render header bước + nhãn gọn (`<div className="flex items-center gap-2">`) gồm badge số bước `1`/`2`/`3` (`inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground text-xs tabular-nums`) + nhãn chức năng (`font-medium text-muted-foreground text-xs`).
     - Giữ `<h3 className="font-medium text-sm">{props.title}</h3>` làm con trực tiếp của `<Card>` (vừa giữ cấu trúc phẳng, vừa tương thích selector `xpath=..`).
     - Khi `props.done` là `true`: hiển thị `DONE_TODAY_LABEL` (`"Đã hoàn tất hôm nay"`), không render danh sách `props.lines` để loại chữ nhiễu (`0 Writing · 0 Speaking`, `0đ`).
- **Success criteria:** `reminder-cards.test.tsx` xanh hoàn toàn.
- **Verify:** `pnpm --filter web exec vitest run src/components/dashboard/reminder-cards.test.tsx` exits 0.

### Task 2.3 — Triển khai `DashboardRoute` trong `dashboard.tsx`

<!-- Updated: Red Team Session 1 - Pin timeZone: "Asia/Ho_Chi_Minh" cho kicker, fail-closed canAccessFinance === true, truyền canAccessFinance & viewerRole vào reminders, sửa layout 2 cột xl:grid-cols-[1.35fr_1fr] + min-w-0 + mobile stacked list cho "Cần kiểm tra" để không cắt cột "Còn" ở 320px/375px/1024px -->

- **Goal:** Hoàn thiện cấu trúc, nhãn KPI, bảng `"Cần kiểm tra"` responsive từ 320px, ngôn ngữ giáo viên, múi giờ VN nhất quán và rút chữ mô tả trên toàn Dashboard.
- **Target files and symbols:** `apps/web/src/routes/_auth/dashboard.tsx` (`RISK_LABEL`, `ScheduleRow`, `DashboardRoute`).
- **Steps:**
  1. Cập nhật `RISK_LABEL`:
     ```ts
     const RISK_LABEL: Record<DashboardRiskReason, string> = {
     	"missed-check-in": "Chưa điểm danh",
     	"overdue-assignment": "Bài tập trễ hạn",
     };
     ```
  2. Dọn trùng class `tabular-nums tabular-nums` → `tabular-nums` ở `ScheduleRow`.
  3. Gọi `atRiskRows(data.students, data.lessons, now, data.classes, data.classAssignments, data.assignments)`.
  4. Tính fail-closed `const canAccessFinance = data.viewer?.canAccessFinance === true;` và `const viewerRole = data.viewer?.role ?? "unknown";`; truyền `viewerRole` vào `dashboardRemindersQueryOptions(baseUrl, kernelUpdatedAt, viewerRole)` và truyền `canAccessFinance={canAccessFinance}` vào `<ReminderCards data={reminders.data} canAccessFinance={canAccessFinance} />`.
  5. Thêm `timeZone: "Asia/Ho_Chi_Minh"` vào `kicker = now.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long", year: "numeric" })` để khớp 100% với lời chào, lịch hôm nay và thẻ nhắc việc server.
  6. Ở Section `"Việc cần làm hôm nay"`:
     - Đổi heading thành tĩnh `"Việc cần làm hôm nay"` (bỏ import `remindersSectionTitle` khỏi `dashboard.tsx`).
     - Đổi nút `"Làm mới dữ liệu"` → `"Làm mới"`.
     - Skeleton loading dùng `canAccessFinance ? 3 : 2` khung và grid tương ứng (`lg:grid-cols-3` / `lg:grid-cols-2`).
  7. Ở hàng KPI:
     - Xóa hoàn toàn `<Stat label="Buổi học hôm nay" ... />`.
     - Dùng grid `canAccessFinance ? "mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3" : "mb-8 grid grid-cols-2 gap-4"`.
     - Card 1: `<Stat label="Tổng học viên" value={String(data.students.length)} />`.
     - Card 2: `<Stat label="Bài tập chưa có điểm" value={String(ungraded)} />`.
     - Card 3 (chỉ khi `canAccessFinance`): `<Stat label="Còn phải thu" value={fmtVND(outstanding)} hot={outstanding > 0} className="col-span-2 sm:col-span-1" />`.
  8. Ở khối 2 cột (`"Lịch hôm nay"` / `"Lịch sắp tới"` và `"Cần kiểm tra"`):
     - Đổi container thành `className="space-y-8 xl:grid xl:grid-cols-[1.35fr_1fr] xl:gap-10 xl:space-y-0"` và gắn `min-w-0` lên cả `<section>` lẫn `<Card>` để không bóp bảng `"Cần kiểm tra"` xuống 225px ở 1024px.
     - Empty state `"Lịch hôm nay"`: `"Không có buổi dạy hôm nay."`.
     - Empty state `"Lịch sắp tới"`: `"Không có buổi dạy sắp tới trong tuần."`.
  9. Ở Card `"Cần kiểm tra"`:
     - Dùng `<Card className="min-w-0 self-start p-4 sm:p-6">`.
     - Bỏ đoạn `<p>Học viên rủi ro: vắng mặt hoặc miss check-in</p>`; dùng `<h2 className="mb-4 font-semibold leading-none">Cần kiểm tra</h2>`.
     - Empty state: `"Không có học viên cần kiểm tra."`.
     - Tạo helper định dạng cột `"Còn"`: `const remainingLabel = row.student.hasPackage ? \`còn ${row.student.pkg.remaining} buổi\` : "Chưa có gói";`.
     - Desktop/Tablet (`hidden sm:block`): giữ `<DataTable headers={["Học viên", "Vấn đề", "Còn"]} ... />` với cột `"Còn"` bọc `<span className="whitespace-nowrap tabular-nums">{remainingLabel}</span>`.
     - Mobile `< sm` (`sm:hidden`, phủ hoàn hảo `320px` và `375px` mà không cắt chữ/không tràn ngang): render danh sách `<ul className="divide-y divide-border rounded-xl border bg-card">` trong đó mỗi mục hiển thị dòng 1 gồm Avatar + tên học viên + `<span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">{remainingLabel}</span>`, dòng 2 là các `<Badge variant="warn">` lý do vấn đề. (Lưu ý: giữ nguyên `DataTable` trong DOM để unit test `closest("tr")` tại `dashboard.test.tsx` vẫn ổn định, và để `sm:hidden` tách riêng hoặc chỉ render 1 bảng responsive có cột gọn — khoan: nếu render cả 2 bản trong DOM, `within(risk).getByText(name)` trong jsdom sẽ khớp **2 phần tử** và throw `Found multiple elements`! Do đó **không duplicate DOM**; thay vào đó dùng bảng responsive chuẩn không ẩn/nhân đôi node: gọn padding ô ở mobile `px-2 sm:px-3`, cho tên + cột `"Còn"` gọn hoặc bố cục responsive bằng CSS table/block trên cùng 1 `DataTable` / `<table className="w-full">` với `max-sm:block` trên `tr`/`td` để chỉ có ĐÚNG 1 bản DOM duy nhất, vừa pass `closest("tr")` ở unit test, vừa hiển thị trọn vẹn cả 3 trường ở 320px/375px không hề cắt ngang!)
     - Chi tiết CSS responsive 1 bản DOM duy nhất (không dùng `DataTable` `overflow-x-auto` ẩn thanh cuộn trên mobile, hoặc dùng `<table>` ngữ nghĩa ngay trong Card `"Cần kiểm tra"`):
       - `thead`: `hidden sm:table-header-group`
       - `tbody tr`: `flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-3 last:border-b-0 sm:table-row`
       - `td` 1 (Học viên): `p-0 sm:px-3 sm:py-2.5 sm:align-middle` (Avatar `hidden sm:inline-flex` hoặc `size="sm"` gọn + tên `font-medium`)
       - `td` 2 (Vấn đề): `order-3 w-full p-0 sm:order-none sm:w-auto sm:px-3 sm:py-2.5 sm:align-middle` (badges)
       - `td` 3 (Còn): `order-2 p-0 text-right text-muted-foreground text-xs sm:order-none sm:px-3 sm:py-2.5 sm:text-left sm:align-middle sm:text-foreground sm:text-sm` (`<span className="whitespace-nowrap tabular-nums">{remainingLabel}</span>`).
       → Đúng **1 bản DOM duy nhất** (`<table>` + `<tr>` + `<td>`), `within(risk).getByText(name).closest("tr")` hoạt động hoàn hảo, desktop/tablet `>= 640px` là bảng 3 cột chuẩn shadcn, mobile `320px–639px` tự xếp 2 dòng gọn (dòng 1: Học viên bên trái + `còn N buổi` bên phải; dòng 2: badge vấn đề) — **0 tràn ngang, 0 cắt cột `"Còn"`, 0 duplicate text**!
- **Success criteria:** Toàn bộ unit test web (kể cả dưới `TZ=America/Los_Angeles`), lint, và typecheck đạt 0 lỗi.
- **Verify:** `TZ=America/Los_Angeles pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/components/dashboard/reminder-cards.test.tsx src/routes/_auth/dashboard.test.tsx && pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/components/dashboard/reminder-cards.test.tsx src/routes/_auth/dashboard.test.tsx && pnpm check && pnpm check-types` exits 0.

## Verification

- `pnpm --filter web test` exits 0.
- `pnpm check` exits 0 (0 warnings/errors).
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
