---
title: "Phase 1: Nền dữ liệu doanh thu"
status: done
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Nền dữ liệu doanh thu (contract + snapshot + bucketing)

## Overview

Snapshot kernel hiện map invoice thiếu `createdAt` — đây là mốc duy nhất đáng tin để xếp doanh thu
vào kỳ (`invoice.date` là text hiển thị `dd/mm` không năm, `due` là hạn đóng tiền không phải ngày
phát hành). Phase này bổ sung `createdAt` theo suốt dòng data (contract → server → web mapping),
viết hàm bucketing thuần `revenueByPeriod` đúng rule `tuitionTotals`, kèm unit test — chưa đụng UI.

## Key Insights

- `packages/db/src/schema/invoice.ts:46-48`: cột `createdAt` là
  `integer("created_at", { mode: "timestamp_ms" })` — **đã có trong DB, không cần migration**, nhưng
  Drizzle map mode này sang **JS `Date`**; qua `c.json` sẽ thành **ISO string**. Wire convention của
  repo là ISO string tường minh (precedent `.toISOString()` tại `snapshot.ts:441,454,542`) — chọn
  đúng convention: contract `createdAt: string` (ISO), server map tường minh, web `Date.parse`.
- **Rule "Đã thu" phải khớp `tuitionTotals`** (`tuition-from-kernel.ts:24-36`): invoice
  `status === "paid"` tính **full `amount`** — comment trong code nói rõ mark-paid thủ công giữ
  `paidAmount = 0` ("the status — not the ledger — drives the KPI"); chỉ nhánh **chưa paid** mới
  clamp `min(paidAmount, amount)`. Dùng sai → KPI "Đã thu" và cột chart lệch nhau ngay trên cùng
  màn hình với flow "Đã nhận" (`tuition.tsx:280-291` → `mark-invoice-paid`, handler chỉ set
  `status` + `method`, không đụng `paidAmount` — `kernel.ts:1440-1449`).
- Múi giờ: repo đã có tiền lệ UTC-drift và pin "hôm nay" về **Asia/Ho_Chi_Minh** qua
  `todayISOVietnam` (`week-grid.ts:27-34`, dùng tại `tuition.tsx:54`) — bucket doanh thu phải theo
  cùng múi giờ, không phải device-local.
- `apps/server/src/routes/snapshot.ts:39-64` `loadInvoices` select danh sách cột tường minh.
- `packages/api/src/contracts.ts:1283-1312` `KernelInvoiceRow` — thêm field **additive**.
- `apps/web/src/lib/repos/invoices.ts:17-31` `mapInvoices` trả `Invoice[]`; interface `Invoice`
  (`mock-data.ts:107-121`) **chưa có `createdAt`** — thêm field required kéo theo cập nhật 5 file
  fixture test (xem Files below). Cột DB `notNull` + default `now` nên mọi row thật luôn có giá trị.
- `POST /invoices` KHÔNG nhận `createdAt` (`invoiceCreateSchema` strict — `contracts.ts:1133-1141`);
  hữu ích cho Phase 3 (seed phải direct-SQL).

## Requirements

- [x] `KernelInvoiceRow` có `createdAt: string` (ISO 8601) kèm doc comment đơn vị.
- [x] `loadInvoices` (server) map tường minh `createdAt: row.createdAt.toISOString()` — KHÔNG
      `Number()` trên giá trị wire.
- [x] `Invoice` (mock-data.ts) thêm `createdAt: number` (timestamp ms) — **required**, không optional;
      5 file fixture test cập nhật cơ học (thêm `createdAt: <ms>` vào literal).
- [x] `mapInvoices`: `createdAt: Date.parse(row.createdAt) || 0` — snapshot cũ thiếu field (deploy
      skew) → `0`, invoice đó bị LOẠI khỏi bucket và được **đếm** (không crash, không im lặng tuyệt đối).
- [x] `revenueByPeriod` thuần, deterministic qua `now: Date`; bucket theo **Asia/Ho_Chi_Minh**
      (formatter pattern như `week-grid.ts`); rule từng invoice: `status === "paid"` →
      `collected += amount`; ngược lại → `collected += min(paidAmount, amount)`; `issued += amount`
      mọi invoice hợp lệ.
- [x] Cửa sổ: month = 12 kỳ gần nhất, quarter = 8 kỳ (tính cả kỳ hiện tại), year = tối đa
      **5 năm gần nhất** (cap để 1 row cũ không nở chart); kỳ rỗng vẫn trả bucket `0/0`; sort tăng dần.
- [x] Báo cáo dropped: trả về kèm số invoice bị loại (`createdAt` = 0/NaN) để UI surf (aria-label +
      console.warn khi > 0).

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (KernelInvoiceRow + `createdAt: string`)
- Modify: `apps/server/src/routes/snapshot.ts` (loadInvoices map ISO)
- Modify: `apps/web/src/lib/mock-data.ts` (interface Invoice + `createdAt`)
- Modify: `apps/web/src/lib/repos/invoices.ts` (mapInvoices)
- Modify: `apps/web/src/lib/tuition-from-kernel.ts` (revenueByPeriod + types)
- Modify (fixture cơ học, ~49 literal): `apps/web/src/lib/repos/invoices.test.ts` (7),
  `apps/web/src/lib/repos/kernel.test.ts` (2), `apps/web/src/lib/tuition-from-kernel.test.ts` (32),
  `apps/web/src/lib/format-invoice.test.ts` (6), `apps/web/src/components/ui/payment-qr-panel.test.tsx` (2)

## Implementation Steps

1. Sửa `packages/api/src/contracts.ts` — `KernelInvoiceRow` thêm
   `createdAt: string` kèm doc `/** ISO 8601 — thời điểm tạo hóa đơn trên server; mốc xếp doanh thu vào kỳ. */`.
2. Sửa `apps/server/src/routes/snapshot.ts` `loadInvoices` — select thêm `createdAt` và map
   `createdAt: row.createdAt.toISOString()` (mẫu `.toISOString()` cùng file dòng 441/454).
3. Sửa `apps/web/src/lib/mock-data.ts` — `Invoice` thêm `createdAt: number` (doc: timestamp ms, từ
   `KernelInvoiceRow.createdAt`); cập nhật 5 file fixture theo danh sách trên.
4. Sửa `apps/web/src/lib/repos/invoices.ts` `mapInvoices` — map
   `createdAt: Date.parse(row.createdAt) || 0`.
5. Thêm vào `apps/web/src/lib/tuition-from-kernel.ts`:

   ```ts
   export type RevenuePeriod = "month" | "quarter" | "year";
   export interface RevenueBucket {
     key: string; // "2026-10" | "2026-Q4" | "2026"
     label: string; // "T10" | "Q4" | "2026" — nhãn ngắn cho trục X
     issued: number; // Σ amount (tổng phát hành trong kỳ)
     collected: number; // Σ theo rule tuitionTotals (paid → full, còn lại → clamp)
   }
   export interface RevenueSeries {
     buckets: RevenueBucket[];
     dropped: number; // số invoice bị loại do createdAt không parse được
   }
   export function revenueByPeriod(
     invoices: Invoice[],
     period: RevenuePeriod,
     now: Date,
   ): RevenueSeries;
   ```

   Bucket dùng formatter `Intl.DateTimeFormat` timezone `Asia/Ho_Chi_Minh` (pattern `week-grid.ts`)
   để suy năm/tháng/quý từ timestamp ms; helper format đặt chung file để test trực tiếp.
6. Viết test vào `apps/web/src/lib/tuition-from-kernel.test.ts`:
   - mark-paid (`status: "paid"`, `paidAmount: 0`) → collected = full amount (case bắt buộc, chặn
     regression Finding 1).
   - unpaid có partial (`paidAmount` 50k / `amount` 100k) → collected = 50k, issued = 100k.
   - unpaid overpaid (`paidAmount` > `amount`) → collected clamp = amount.
   - unpaid 0 đồng → chỉ vào issued.
   - Cửa sổ fill kỳ rỗng: 12 tháng / 8 quý liên tục; năm capped 5 (row năm 2015 + now 2026 → bắt đầu 2022).
   - Biên múi giờ: invoice `createdAt` 23:30 VN ngày 31/10 → bucket T10 (không rơi T11 theo UTC).
   - Invoice `createdAt: 0` → excluded + `dropped = 1`.

## Todo

- [x] contracts.ts: `KernelInvoiceRow.createdAt` (ISO string)
- [x] snapshot.ts: map `.toISOString()`
- [x] mock-data.ts: `Invoice.createdAt` + 5 file fixture
- [x] repos/invoices.ts: `Date.parse(row.createdAt) || 0`
- [x] `revenueByPeriod` + types + helper timezone
- [x] Unit test đầy đủ theo danh sách trên

## Success Criteria

- `pnpm --filter web test` xanh (test mới pass, không test cũ vỡ — fixture đã cập nhật đồng bộ).
- `pnpm --filter server test` xanh (snapshot load không regress).
- `pnpm check-types` xanh (interface + fixture đã khớp).

## Risk Assessment

- Deploy skew (web mới + server cũ): row thiếu `createdAt` → `Date.parse(undefined)` = NaN → `|| 0`
  → invoice bị loại NHƯNG được đếm trong `dropped` — UI sẽ surf (Phase 2: aria-label + console.warn),
  không còn "chart trắng im lặng".
- Fixture churn lớn hơn nhìn bề mặt (49 literal) — cơ học, không đổi logic test nào.

## Security Considerations

- Không đổi auth — snapshot đã nằm sau `kernelCtx` (bootstrapMiddleware chặn role student).
- `createdAt` là dữ liệu org-scoped sẵn có, không lộ thêm gì mới.
