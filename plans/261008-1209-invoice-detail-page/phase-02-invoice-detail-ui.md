---
phase: 2
title: "UI trang chi tiết hóa đơn + row click"
status: completed
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
- Create: `apps/web/src/routes/_auth/tuition/$invoiceId.tsx` — trang detail (có `validateSearch` nhận optional `ky` để giữ filter).
- Create: `apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx` — unit/render test.
- Modify: `apps/web/src/lib/repos/payments.ts` — `fetchInvoiceTransactions`, `invoiceTransactionsQueryKey`, `invoiceTransactionsQueryOptions`.
- Modify: `apps/web/src/components/modals/invoice-payment-modal.tsx` — tách logic dùng chung (xem step 2).
- Create: `apps/web/src/components/modals/invoice-payment-modal.test.tsx` — unit test `useInvoicePayment` + `InvoicePaymentActions` (viết TRƯỚC khi refactor modal, xem step 2).
- Create: `apps/web/src/components/tuition/invoice-status-cell.tsx` — badge trạng thái dùng chung 3 surface (bảng `/tuition`, tab Học phí hồ sơ học viên, trang detail).
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx` — row `onClick` tab Học phí (~L284-326) + đổi sang `InvoiceStatusCell`.
- Modify: `apps/web/src/routes-matcher.ts` — thêm `"/tuition/"` vào `VALID_DYNAMIC_PREFIXES` (deep-link `/tuition/<id>` phải trả SPA shell 200 ở worker.ts:106 và vite.config.ts:49).
- Modify: `apps/web/src/routes-matcher.test.ts` — thêm case `isValidAppRoute("/tuition/<id>") === true`; drift-guard (`:105-133`) tự pass sau khi thêm prefix.
- Modify: `apps/web/src/components/layout/app-shell.tsx` — `routeTitles` cho id mới.
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts:284,475` — path `../routes/_auth/tuition/index.tsx`.
- Modify: `apps/web/src/lib/empty-states.test.tsx:106` — import `@/routes/_auth/tuition/index`.
- Regenerate: `apps/web/src/routeTree.gen.ts` — file GITIGNORED (`.gitignore:12`), regen local qua dev/build để typecheck + navigate type-safe; KHÔNG commit, KHÔNG `git add -f`.
- Modify: `CHANGELOG.md` — mục `## 2026-10-08` `### Added`.

## Tasks & Steps

1. **Repo fetch giao dịch** (`lib/repos/payments.ts`): theo đúng pattern `fetchInvoicePayment`
   (credentials include, throw khi `!res.ok`, nhận `signal`), key `["invoice-transactions", id]`.
2. **Tách logic dùng chung khỏi modal** (DRY) — **viết unit test TRƯỚC, refactor SAU** (test
   hiện tại không bảo vệ refactor: `payment-qr-panel.test.tsx` chỉ render panel presentational,
   không import modal; rotate/copy/confirmRotate hiện zero coverage):
   - Unit test mới `invoice-payment-modal.test.tsx` khoá hành vi hiện tại của vùng bị tách:
     poll gating (`refetchInterval` trả `false` khi `!data`/`!payable`/quá cap 15 phút từ
     `openedAt`), `confirmRotate` reset khi đóng, nút copy hiển thị label đã copy. Test phải
     xanh trên code TRƯỚC refactor để có nghĩa.
   - Trong `invoice-payment-modal.tsx` export:
     - hook `useInvoicePayment(invoiceId, active)` — `useQuery` payment + `refetchInterval` dùng
       `shouldPollPayment` (`panelOpen = active`), `payLink`, mutation `rotate` + `confirmRotate`
       state, `copy`/`copiedLabel`; **reset `openedAt` khi `document.visibilitychange` sang
       visible** (trang detail sống lâu hơn modal — không kẹt poll cliff 15 phút khi teacher quay
       lại tab). Modal và trang cùng dùng, hành vi modal không đổi.
     - component `InvoicePaymentActions({ payable, payLink })` — nút "Sao chép link thanh toán"
       (luôn hiện — link `/pay` hợp lệ xem trạng thái kể cả khi paid), "Tạo link mới"/"Xác nhận
       tạo link mới"/"Không" + cảnh báo link cũ hết hiệu lực (chỉ khi `payable`; hiện tại modal
       gate cả footer bằng `payment.data?.payable` ở cấp modal `:92`, tách gate vào đây).
     - **paidAmount-watch (bước riêng, không gộp):** `useEffect` trên `payment.data` so
       `paidAmount` với giá trị trước bằng `useRef` (so GIÁ TRỊ, không so reference object);
       chỉ khi ĐỔI → `invalidateQueries` `invoiceTransactionsQueryKey(id)` + `["kernel"]`.
       Lý do: kernel snapshot KHÔNG tự poll (`query-client.ts:19-23` staleTime Infinity, không
       refetchInterval) — đây là cơ chế duy nhất khiến header SỐ TIỀN/badge cập nhật khi IPN về
       giữa chừng; transactions query poll (step 6) tự cập nhật bảng lịch sử.
   - Modal `InvoicePaymentModal` chuyển sang dùng hook + component, hành vi không đổi (unit test
     mới + e2e `tuition-bank-transfer.spec.ts` phải vẫn xanh).
3. **Di chuyển route list**: `git mv` sang `tuition/index.tsx`, đổi `createFileRoute("/_auth/tuition/")`. Export `TuitionRoute` giữ nguyên tên. Chạy dev/build để sinh lại `routeTree.gen.ts`, xác nhận id thực (`/_auth/tuition/`, `/_auth/tuition/$invoiceId`).
4. **Row click `/tuition`**: thêm `onClick: () => navigate({ to: "/tuition/$invoiceId", params: { invoiceId: i.id }, search: { ky: search.ky } })` cho mỗi row. Cell hành động (cột cuối): bọc `div` `onClick={(e) => e.stopPropagation()}` + `onKeyDown` chặn Enter/Space, kèm `biome-ignore lint/a11y/noStaticElementInteractions` với lý do — copy precedent `class-roster-tab.tsx:152-160`. Không đổi selector của nút (e2e `tuition-bank-transfer.spec.ts:124`, `create-invoice.spec.ts:161` dùng text nút).
5. **Row click hồ sơ học viên**: tab "Học phí" thêm `onClick` điều hướng tương tự (không có nút trong row).
6. **Trang detail `tuition/$invoiceId.tsx`**:
   - `createFileRoute("/_auth/tuition/$invoiceId")` + `notFoundComponent` "Không tìm thấy hóa đơn" + link "← Về Doanh thu" (copy cấu trúc `students/$studentId.tsx:36-55`).
   - `const inv = data.invoices.find((i) => i.id === invoiceId)`; không có → `throw notFound()`.
   - Join: `student = data.students.find(s => s.id === inv.sid)`; `enrollment = data.enrollments.find(e => e.id === inv.eid)`; `cls = data.classes.find(c => c.id === enrollment?.classId)`.
   - Header: link "← Doanh thu" (`/tuition`, truyền lại `search: { ky }` — xem validateSearch bên dưới), mã `invoiceCode(inv.id)` (font-display), badge trạng thái dùng **cùng nhánh** như bảng `/tuition` qua `InvoiceStatusCell` dùng chung. Nút "Đã nhận" (khi `inv.status !== "paid"`) dùng `useDirectKernelAction` y hệt `/tuition` (method `inv.method === "—" ? "CK" : inv.method`).
     → Tách cell badge trạng thái thành `apps/web/src/components/tuition/invoice-status-cell.tsx` và dùng chung ở **3 surface**: bảng `/tuition`, trang detail, và tab "Học phí" hồ sơ học viên (`$studentId.tsx:300-324` hiện nhánh riêng chỉ hiện "Chưa thu"/"Quá hạn", không bao giờ "Thu một phần" — lệch nhãn thật, hợp nhất theo nhánh của `/tuition`). Chạy e2e `student-package-validation`, `class-roster-tuition-debt` để bắt regress nhãn.
   - **`ky` filter giữ qua URL (convention AGENTS.md — filter sống trong URL):** detail route thêm `validateSearch` nhận optional `ky` (cùng shape index route `tuition.tsx:50-57`); row click từ cả 2 điểm vào truyền `search: { ky: search.ky }`; link "← Doanh thu" truyền lại `ky` (fallback "month") — teacher xem kỳ quarter/year quay lại list không bị reset kỳ.
   - **Thông tin hóa đơn** (`<dl>` 2 cột label mono/value): Mã hóa đơn, Mã đầy đủ (UUID mono, `break-all`), Loại (`invoiceType`), Ngày lập (`inv.date`), Tạo lúc (`createdAt` → `Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })`; `createdAt === 0` → "—"), Hạn đóng (`formatDue(inv.due)`, `text-danger` khi effective overdue; paid → "—" như bảng), Phương thức (`inv.method`), Ghi chú (`inv.note` hoặc "—", `whitespace-pre-wrap`).
   - **Số tiền**: Tổng `fmtVND(amount)`; Đã thu = `status === "paid" ? amount : Math.min(paidAmount, amount)` (rule `tuitionTotals`, `tuition-from-kernel.ts`); Còn lại = `amount − Đã thu`; `Progress` theo tỉ lệ. Khi `paid && paidAmount === 0` hiện chú thích "Ghi nhận thủ công".
   - **Học viên & lớp**: Avatar + tên → `Link` `/students/$studentId`; Lớp → `Link` `/classes/$classId` hoặc "—" (legacy `eid === ""` hoặc enrollment đã xoá).
   - **Thanh toán chuyển khoản:** dùng `useInvoicePayment(inv.id, true)` + `PaymentQrPanel` + `InvoicePaymentActions`; loading "Đang tải…"; lỗi fetch → text `text-muted-fg` "Không tải được thông tin chuyển khoản." (không chặn phần còn lại của trang). Ba trạng thái `payable` (contract: `payable=false` khi settled hoặc no-bank-link — `contracts.ts:2079-2093`): `payable=true` → QR + copy + rotate đầy đủ; PAID → panel lý do, copy link VẪN hiện (link `/pay` hợp lệ để xem trạng thái), ẨN rotate; `NO_BANK_LINK` → panel lý do + copy link, ẩn rotate.
   - **Lịch sử giao dịch**: `useQuery(invoiceTransactionsQueryOptions(inv.id))`; `refetchInterval` = `POLL_INTERVAL_MS` khi `payment.data == null || payment.data.payable` (chưa settled — còn khả năng tiền về; KHÔNG clone nguyên `shouldPollPayment` để tránh race lệch pha timer). Khi payment refetch cuối trả `payable=false` kèm `paidAmount` mới, paidAmount-watch (step 2) invalidate transactions → fetch lần cuối dữ liệu đầy đủ rồi ngừng poll — không miss row cuối. `DataTable` headers `["Ngày giao dịch", "Số tiền", "Nội dung chuyển khoản", "Mã tham chiếu", "Ghi nhận lúc"]`; `emptyMessage` "Chưa có giao dịch chuyển khoản nào khớp với hóa đơn này." (+ khi paid thủ công: "Hóa đơn được đánh dấu đã thu thủ công.").
   - Layout: `grid grid-cols-[minmax(0,1fr)_minmax(0,380px)] gap-6 max-app:grid-cols-1` (trái: thông tin + số tiền + học viên; phải: thanh toán); lịch sử full width bên dưới. 375px: một cột, bảng `overflow-x-auto` (DataTable đã có).
7. **app-shell `routeTitles`**: thêm key `/_auth/tuition/` và `/_auth/tuition/$invoiceId` → "Doanh thu" (giữ key cũ `/_auth/tuition` không hại; xóa nếu id cũ không còn tồn tại). Xác nhận sidebar `to: "/tuition"` vẫn active trên trang con (TanStack `Link` active fuzzy mặc định — kiểm tra thực tế).
8. **Unit test `$invoiceId.test.tsx`** (vitest + testing-library, theo cách `empty-states.test.tsx` render route với data store giả):
   - Mock router phải có `useParams` (param hoá theo case) + `notFound` ném throwable + `Link` hỗ trợ `params`/`search` — mock hiện có của `empty-states.test.tsx:25-39` chỉ có `useSearch`/`useNavigate`, KHÔNG đủ cho route có param.
   - Render đủ field cho invoice partial (mã, UUID, loại, ghi chú, hạn, phương thức, tổng/đã thu/còn, tên học viên, tên lớp).
   - Invoice paid thủ công (`paidAmount=0`) → Đã thu = tổng, chú thích "Ghi nhận thủ công".
   - Legacy `eid=""` → Lớp "—"; `createdAt=0` → "—"; note rỗng → "—".
   - Không tìm thấy id → notFound.
   - 3 trạng thái `payable` từ mock `/payment`: payable → nút rotate + copy; PAID → copy hiện + rotate ẩn; NO_BANK_LINK → tương tự (mock global `fetch` trả fixture JSON — KHÔNG dùng `payment-qr-panel.test.tsx` làm precedent fetch-mock, file đó render panel với prop data cứng, không mock fetch).
   - paidAmount-watch: refetch payment trả `paidAmount` khác giá trị trước → assert `invalidateQueries` được gọi cho `invoiceTransactionsQueryKey` + `["kernel"]`; cùng giá trị → không gọi.
9. **CHANGELOG** `## 2026-10-08` → `### Added`: "Trang chi tiết hóa đơn `/tuition/<id>`: click dòng hóa đơn ở Doanh thu hoặc tab Học phí của hồ sơ học viên để xem đủ thông tin, QR/link thanh toán và lịch sử giao dịch ngân hàng đã khớp (#345)".

## Verification

- `pnpm --filter web test` xanh (gồm test mới + 2 test đổi path + drift-guard routes-matcher).
- `pnpm check` và `pnpm check-types` xanh.
- Thủ công trên dev stack (port 8001): click dòng, Enter trên dòng focus, click nút trong dòng không điều hướng; Back trình duyệt VÀ link "← Doanh thu" đều về `/tuition?ky=…` giữ kỳ đã chọn; deep-link `GET /tuition/<id>` trả HTTP 200 (không 404-shell).

## Risks

- Tách hook khỏi modal có thể đổi timing poll — unit test hook viết trước khi refactor; giữ nguyên `openedAt`, `POLL_INTERVAL_MS`, cap 15 phút; visibilitychange visible reset `openedAt`.
- notFound nhấp nháy khi snapshot chưa về: KHÔNG xảy ra — `DataProvider` trả `null` cho tới khi có snapshot (`apps/web/src/lib/data-provider.tsx:177-178`), cùng lý do `students/$studentId.tsx` an toàn. Hóa đơn vừa tạo ở tab khác chỉ thấy sau khi một action/invalidation khác refresh `["kernel"]` (snapshot KHÔNG tự poll — `query-client.ts:19-23`, `refetchOnWindowFocus: false`) — chấp nhận.
