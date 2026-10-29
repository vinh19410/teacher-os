---
phase: 2
title: "Nút (eye) và drawer dòng thời gian trên /debts"
status: completed
priority: P1
effort: "4h"
dependencies: ["phase-01"]
---

# Phase 2: Drawer timeline

## Goal

Thêm nút icon `(eye)` trên mỗi dòng của bảng Sổ công nợ (`/debts`) để mở ngăn kéo (Sheet/Drawer bên phải ở desktop, full-screen ở mobile 375px) hiển thị 3 chỉ số lũy kế của học viên và dòng thời gian lịch sử hóa đơn & giao dịch nhóm theo tháng.

## Files to Create or Modify

- Modify: `apps/web/src/lib/repos/payments.ts` — thêm `billingTimelineQueryKey`, `fetchBillingTimeline`, `billingTimelineQueryOptions` (với `staleTime: 0`).
- Create: `apps/web/src/components/debts/billing-timeline-drawer.tsx` — component Drawer hiển thị lịch sử hóa đơn & giao dịch theo tháng.
- Create: `apps/web/src/components/debts/billing-timeline-drawer.test.tsx` — unit test cho Drawer (thứ tự, nhãn nguồn, nhóm tháng, loading/lỗi/rỗng, focus heading, Esc đóng).
- Modify: `apps/web/src/routes/_auth/debts/index.tsx` — thêm nút `(eye)` trong cột Thao tác và mount `BillingTimelineDrawer`.
- Modify: `apps/web/src/routes/_auth/debts/index.test.tsx` — thêm test bấm nút `(eye)` mở drawer mà không kích hoạt điều hướng dòng, Esc đóng trả focus về nút `(eye)`.

## Nội dung & Quy tắc UI

<!-- Updated: Validation & Red-Team Session 1 — staleTime: 0, focus heading tabIndex=-1, trả focus về nút (eye), điều kiện nối note -->
- **Header drawer:** Tiêu đề `<h2 ref={headingRef} tabIndex={-1}>Lịch sử hóa đơn & giao dịch — {row.name}</h2>` + 3 ô tóm tắt lũy kế của học viên: **Phải đóng** (`fmtVND(row.totalDue)`), **Đã thu** (`fmtVND(row.totalPaid)`), **Còn nợ** (`fmtVND(row.remaining)`).
- **Danh sách nhóm theo tháng (giờ VN `Asia/Ho_Chi_Minh`):**
  - Tiêu đề nhóm tháng: `"Tháng {MM}/{YYYY}"` (sắp xếp theo thứ tự xuất hiện của sự kiện đã sort mới nhất trước).
  - Sự kiện `invoice_issued`: hiển thị `"Phát hành hóa đơn {code} · {type} · {fmtVND(amount)}"` + hạn đóng (`due ? "hạn " + formatDue(due) : "—"`), badge trạng thái (`Đã thu` / `Chưa thu`), thời gian phát hành, link tới `/tuition/$invoiceId`.
  - Sự kiện `payment`: hiển thị `"Thu {fmtVND(amount)}"`, badge nguồn `"QR Bank-Hub"` (khi `source === "bank_hub"`) hoặc `"Thu thủ công · {method || 'Khác'}"` (khi `source === "manual"`), kèm `" — {note}"` chỉ khi `note.trim().length > 0`, mã hóa đơn `{code}` và link tới `/tuition/$invoiceId`.
- **Trạng thái:** loading (skeleton `data-testid="billing-timeline-loading"`), lỗi (thông báo + nút `"Thử lại"` gọi `refetch()`), rỗng (`"Chưa có hóa đơn hoặc giao dịch nào."`).
- **Layout & Accessibility:** Sheet trượt bên phải ở desktop (`sm:max-w-lg sm:w-full`), full-screen (`w-full h-full`) ở viewport 375px; khi mở tự `.focus()` vào tiêu đề `<h2>` (`tabIndex={-1}`); bẫy focus `Tab`/`Shift+Tab` trong drawer; bấm `Escape` hoặc nút đóng sẽ đóng drawer và hoàn trả focus về phần tử đã mở nó (`previouslyFocused.current`, tức nút `(eye)`).

## Tasks & Steps

### Task 2.1 — Thêm hàm fetch và queryOptions trong `apps/web/src/lib/repos/payments.ts`
- **Goal:** Cung cấp `fetchBillingTimeline` và `billingTimelineQueryOptions(studentId)` với `staleTime: 0`.
- **Target files and symbols:** `apps/web/src/lib/repos/payments.ts` (`billingTimelineQueryKey`, `fetchBillingTimeline`, `billingTimelineQueryOptions`).
- **Steps:**
  1. Import `BillingTimelineResponse` từ `@teacher-os/api/contracts`.
  2. Thêm `billingTimelineQueryKey = (studentId: string) => ["billing-timeline", studentId] as const`.
  3. Thêm `fetchBillingTimeline(studentId, baseUrl, signal)` gọi `GET ${baseUrl}/api/students/${encodeURIComponent(studentId)}/billing-timeline` với `credentials: "include"`.
  4. Thêm `billingTimelineQueryOptions(studentId, baseUrl)` với `staleTime: 0` để mỗi lần mở drawer sau khi thu tiền đều lấy dữ liệu mới nhất.
- **Success criteria:** `apps/web` biên dịch không lỗi type.
- **Verify:** `pnpm --filter web check-types` exits 0.

### Task 2.2 — Viết test đỏ cho `BillingTimelineDrawer` và nút `(eye)` trên `/debts`
- **Goal:** Tạo test kiểm tra đầy đủ hành vi của `BillingTimelineDrawer` và tích hợp nút `(eye)` trên `/debts`.
- **Target files and symbols:** `apps/web/src/components/debts/billing-timeline-drawer.test.tsx`, `apps/web/src/routes/_auth/debts/index.test.tsx`.
- **Steps:**
  1. Tạo `apps/web/src/components/debts/billing-timeline-drawer.test.tsx` kiểm tra:
     - Hiển thị 3 số Phải đóng / Đã thu / Còn nợ từ `row`.
     - Render các sự kiện nhóm theo tháng đúng thứ tự, đúng badge `"QR Bank-Hub"` và `"Thu thủ công · Tiền mặt — Đóng đợt 1"`, mỗi mục có link `/tuition/$invoiceId`.
     - Trạng thái loading, lỗi (bấm `"Thử lại"` gọi lại API), và rỗng.
     - Khi mở drawer, focus đặt vào heading `<h2>`; nhấn `Escape` gọi `onClose` và trả focus về nút kích hoạt.
  2. Trong `apps/web/src/routes/_auth/debts/index.test.tsx`, thêm test bấm nút `aria-label="Xem dòng thời gian lịch sử hóa đơn & giao dịch của Nguyễn Minh Anh"` mở drawer mà không gọi `navigate` sang `/students/$studentId`.
- **Success criteria:** Chạy test thất bại vì `billing-timeline-drawer.tsx` và nút `(eye)` chưa tồn tại.
- **Verify:** `pnpm --filter web test -- billing-timeline-drawer` exits non-zero; passing before implementation is a failure.

### Task 2.3 — Cài đặt `BillingTimelineDrawer` và gắn nút `(eye)` vào `/debts`
- **Goal:** Hoàn thiện component `BillingTimelineDrawer` và nút `(eye)` trong cột Thao tác của `/debts`.
- **Target files and symbols:** `apps/web/src/components/debts/billing-timeline-drawer.tsx` (`BillingTimelineDrawer`), `apps/web/src/routes/_auth/debts/index.tsx` (`DebtsRoute`).
- **Steps:**
  1. Tạo `apps/web/src/components/debts/billing-timeline-drawer.tsx` thực hiện đúng đặc tả ở mục "Nội dung & Quy tắc UI".
  2. Trong `apps/web/src/routes/_auth/debts/index.tsx`, thêm state `timelineRow: DebtLedgerRow | null`, thêm nút icon `Eye` (`lucide-react`) vào cột Thao tác của mỗi dòng (kể cả dòng đã thu đủ `clear`) với `data-testid={`billing-timeline-${row.studentId}`}` và `aria-label={`Xem dòng thời gian lịch sử hóa đơn & giao dịch của ${row.name}`}`, và render `<BillingTimelineDrawer open={timelineRow !== null} row={timelineRow} onClose={() => setTimelineRow(null)} />`.
- **Success criteria:** Toàn bộ unit test của `billing-timeline-drawer.test.tsx` và `debts/index.test.tsx` đều xanh.
- **Verify:** `pnpm --filter web test -- billing-timeline-drawer debts/index` exits 0 and `pnpm check && pnpm check-types` exits 0.

## Verification

- `pnpm --filter web test -- billing-timeline-drawer debts/index`
- `pnpm check`, `pnpm check-types`

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
