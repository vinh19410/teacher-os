---
phase: 2
title: "UI trang chi tiết hóa đơn + row click"
status: pending
priority: P1
effort: "3.5h"
dependencies: [1]
---

# Phase 2: UI trang chi tiết hóa đơn + row click

## Goal

Thêm route `/tuition/$invoiceId` hiển thị đầy đủ thông tin hóa đơn + hành động thu tiền, và cho
dòng hóa đơn ở `/tuition` và tab "Học phí" hồ sơ học viên điều hướng tới đó.

Đọc `DESIGN.md` trước khi code: Card white cho panel, meta `font-mono text-meta text-xs`, kicker
mono viết HOA, accent chỉ cho CTA, focus ring mọi control, motion 150ms.

## Files to Create / Modify

- Move: `apps/web/src/routes/_auth/tuition.tsx` → `apps/web/src/routes/_auth/tuition/index.tsx` (`createFileRoute("/_auth/tuition/")`, giữ `validateSearch` `?ky=`; precedent `students/index.tsx`).
- Create: `apps/web/src/routes/_auth/tuition/$invoiceId.tsx` — trang detail.
- Create: `apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx` — unit/render test.
- Modify: `apps/web/src/lib/repos/payments.ts` — `fetchInvoiceTransactions`, `invoiceTransactionsQueryKey`, `invoiceTransactionsQueryOptions`.
- Modify: `apps/web/src/components/modals/invoice-payment-modal.tsx` — tách logic dùng chung (xem step 2).
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx` — row `onClick` tab Học phí (~L284-326).
- Modify: `apps/web/src/components/layout/app-shell.tsx` — `routeTitles` cho id mới.
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts:284,475` — path `../routes/_auth/tuition/index.tsx`.
- Modify: `apps/web/src/lib/empty-states.test.tsx:106` — import `@/routes/_auth/tuition/index`.
- Regenerate: `apps/web/src/routeTree.gen.ts` (plugin TanStack tự sinh khi `vite dev`/build — commit file sinh ra).
- Modify: `CHANGELOG.md` — mục `## 2026-10-08` `### Added`.

## Tasks & Steps

1. **Repo fetch giao dịch** (`lib/repos/payments.ts`): theo đúng pattern `fetchInvoicePayment`
   (credentials include, throw khi `!res.ok`, nhận `signal`), key `["invoice-transactions", id]`.
2. **Tách logic dùng chung khỏi modal** (DRY): trong `invoice-payment-modal.tsx` export
   - hook `useInvoicePayment(invoiceId, active)` — `useQuery` payment + `refetchInterval` dùng `shouldPollPayment` (`panelOpen = active`), `payLink`, mutation `rotate` + `confirmRotate` state, `copy`/`copiedLabel`.
   - component `InvoicePaymentActions` — các nút "Sao chép link thanh toán", "Tạo link mới"/"Xác nhận tạo link mới"/"Không" + cảnh báo link cũ hết hiệu lực (đang là `footer` của modal).
   Modal `InvoicePaymentModal` chuyển sang dùng hook + component này, hành vi không đổi
   (test `payment-qr-panel.test.tsx` và e2e `tuition-bank-transfer.spec.ts` phải vẫn xanh).
   Khi rotate thành công hoặc payment refetch thấy `paidAmount` đổi, invalidate thêm
   `invoiceTransactionsQueryKey(id)` và `["kernel"]` để lịch sử + snapshot cập nhật.
3. **Di chuyển route list**: `git mv` sang `tuition/index.tsx`, đổi `createFileRoute("/_auth/tuition/")`. Export `TuitionRoute` giữ nguyên tên. Chạy dev/build để sinh lại `routeTree.gen.ts`, xác nhận id thực (`/_auth/tuition/`, `/_auth/tuition/$invoiceId`).
4. **Row click `/tuition`**: thêm `onClick: () => navigate({ to: "/tuition/$invoiceId", params: { invoiceId: i.id } })` cho mỗi row. Cell hành động (cột cuối): bọc `div` `onClick={(e) => e.stopPropagation()}` + `onKeyDown` chặn Enter/Space, kèm `biome-ignore lint/a11y/noStaticElementInteractions` với lý do — copy precedent `class-roster-tab.tsx:152-160`. Không đổi selector của nút (e2e `tuition-bank-transfer.spec.ts:124`, `create-invoice.spec.ts:161` dùng text nút).
5. **Row click hồ sơ học viên**: tab "Học phí" thêm `onClick` điều hướng tương tự (không có nút trong row).
6. **Trang detail `tuition/$invoiceId.tsx`**:
   - `createFileRoute("/_auth/tuition/$invoiceId")` + `notFoundComponent` "Không tìm thấy hóa đơn" + link "← Về Doanh thu" (copy cấu trúc `students/$studentId.tsx:36-55`).
   - `const inv = data.invoices.find((i) => i.id === invoiceId)`; không có → `throw notFound()`.
   - Join: `student = data.students.find(s => s.id === inv.sid)`; `enrollment = data.enrollments.find(e => e.id === inv.eid)`; `cls = data.classes.find(c => c.id === enrollment?.classId)`.
   - Header: link "← Doanh thu" (`/tuition`), mã `invoiceCode(inv.id)` (font-display), badge trạng thái dùng **cùng nhánh** như bảng `/tuition` (paid → badge; partial → "Thu một phần" + `invoiceRemainingLabel` đỏ khi quá hạn; còn lại → `INVOICE_STATUS_LABEL[effectiveInvoiceStatus(inv, todayISOVietnam())]`). Nút "Đã nhận" (khi `inv.status !== "paid"`) dùng `useDirectKernelAction` y hệt `/tuition` (method `inv.method === "—" ? "CK" : inv.method`).
     → Nên tách cell badge trạng thái của `/tuition` thành component nhỏ `InvoiceStatusCell` (vd. trong `apps/web/src/components/tuition/invoice-status-cell.tsx`) để bảng và trang detail dùng chung, tránh lệch nhãn.
   - **Thông tin hóa đơn** (`<dl>` 2 cột label mono/value): Mã hóa đơn, Mã đầy đủ (UUID mono, `break-all`), Loại (`invoiceType`), Ngày lập (`inv.date`), Tạo lúc (`createdAt` → `Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })`; `createdAt === 0` → "—"), Hạn đóng (`formatDue(inv.due)`, `text-danger` khi effective overdue; paid → "—" như bảng), Phương thức (`inv.method`), Ghi chú (`inv.note` hoặc "—", `whitespace-pre-wrap`).
   - **Số tiền**: Tổng `fmtVND(amount)`; Đã thu = `status === "paid" ? amount : Math.min(paidAmount, amount)` (rule `tuitionTotals`, `tuition-from-kernel.ts`); Còn lại = `amount − Đã thu`; `Progress` theo tỉ lệ. Khi `paid && paidAmount === 0` hiện chú thích "Ghi nhận thủ công".
   - **Học viên & lớp**: Avatar + tên → `Link` `/students/$studentId`; Lớp → `Link` `/classes/$classId` hoặc "—" (legacy `eid === ""` hoặc enrollment đã xoá).
   - **Thanh toán chuyển khoản**: dùng `useInvoicePayment(inv.id, true)` + `PaymentQrPanel` + `InvoicePaymentActions`; loading "Đang tải…"; lỗi fetch → text `text-muted-fg` "Không tải được thông tin chuyển khoản." (không chặn phần còn lại của trang).
   - **Lịch sử giao dịch**: `useQuery(invoiceTransactionsQueryOptions(inv.id))` với `refetchInterval` cùng điều kiện poll payment; `DataTable` headers `["Ngày giao dịch", "Số tiền", "Nội dung chuyển khoản", "Mã tham chiếu", "Ghi nhận lúc"]`; `emptyMessage` "Chưa có giao dịch chuyển khoản nào khớp với hóa đơn này." (+ khi paid thủ công: "Hóa đơn được đánh dấu đã thu thủ công.").
   - Layout: `grid grid-cols-[minmax(0,1fr)_minmax(0,380px)] gap-6 max-app:grid-cols-1` (trái: thông tin + số tiền + học viên; phải: thanh toán); lịch sử full width bên dưới. 375px: một cột, bảng `overflow-x-auto` (DataTable đã có).
7. **app-shell `routeTitles`**: thêm key `/_auth/tuition/` và `/_auth/tuition/$invoiceId` → "Doanh thu" (giữ key cũ `/_auth/tuition` không hại; xóa nếu id cũ không còn tồn tại). Xác nhận sidebar `to: "/tuition"` vẫn active trên trang con (TanStack `Link` active fuzzy mặc định — kiểm tra thực tế).
8. **Unit test `$invoiceId.test.tsx`** (vitest + testing-library, theo cách `empty-states.test.tsx` render route với data store giả):
   - Render đủ field cho invoice partial (mã, UUID, loại, ghi chú, hạn, phương thức, tổng/đã thu/còn, tên học viên, tên lớp).
   - Invoice paid thủ công (`paidAmount=0`) → Đã thu = tổng, chú thích "Ghi nhận thủ công".
   - Legacy `eid=""` → Lớp "—"; `createdAt=0` → "—"; note rỗng → "—".
   - Không tìm thấy id → notFound.
   - Mock `fetch` cho `/payment` và `/transactions` (precedent `payment-qr-panel.test.tsx`).
9. **CHANGELOG** `## 2026-10-08` → `### Added`: "Trang chi tiết hóa đơn `/tuition/<id>`: click dòng hóa đơn ở Doanh thu hoặc tab Học phí của hồ sơ học viên để xem đủ thông tin, QR/link thanh toán và lịch sử giao dịch ngân hàng đã khớp (#345)".

## Verification

- `pnpm --filter web test` xanh (gồm test mới + 2 test đổi path).
- `pnpm check` và `pnpm check-types` xanh.
- Thủ công trên dev stack (port 8001): click dòng, Enter trên dòng focus, click nút trong dòng không điều hướng; Back trình duyệt về `/tuition?ky=…` giữ kỳ đã chọn.

## Risks

- Tách hook khỏi modal có thể đổi timing poll — giữ nguyên `openedAt`, `POLL_INTERVAL_MS`, cap 15 phút.
- notFound nhấp nháy khi snapshot chưa về: KHÔNG xảy ra — `DataProvider` trả `null` cho tới khi có snapshot (`apps/web/src/lib/data-provider.tsx:177-178`), cùng lý do `students/$studentId.tsx` an toàn. Hóa đơn vừa tạo ở tab khác chỉ thấy sau lần poll snapshot kế tiếp — chấp nhận.
