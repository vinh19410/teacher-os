---
title: "Trang chi tiết hóa đơn: click dòng hóa đơn để xem toàn bộ thông tin"
description: "Click một dòng hóa đơn ở /tuition hoặc tab Học phí trong hồ sơ học viên sẽ mở trang /tuition/$invoiceId hiển thị đầy đủ mọi thông tin hóa đơn đang có: thông tin chung, số tiền, học viên/lớp, thanh toán chuyển khoản (QR, link /pay) và lịch sử giao dịch ngân hàng đã khớp."
status: pending
priority: P2
effort: "7h"
issue: 345
branch: develop
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-10-08
---

# Trang chi tiết hóa đơn: click dòng hóa đơn để xem toàn bộ thông tin

## Overview

Hiện tại bảng "Hóa đơn" ở `/tuition` và tab "Học phí" trong hồ sơ học viên chỉ hiện một phần thông
tin (mã rút gọn, loại, số tiền, ngày, trạng thái); ghi chú bị giấu trong `title` tooltip, còn mã
chuyển khoản, link `/pay`, lịch sử tiền về chỉ xem được rải rác hoặc không xem được. Plan này thêm
trang **`/tuition/$invoiceId`**: click (hoặc Enter/Space) trên một dòng hóa đơn sẽ điều hướng tới
trang chi tiết, hiển thị **mọi thông tin hóa đơn đang có** và đủ hành động thu tiền.

Dữ liệu lấy từ 3 nguồn:

1. **Kernel snapshot** (đã có trên client — `data.invoices`, `data.students`, `data.enrollments`,
   `data.classes`): id, mã `INV-…`, học viên, enrollment → lớp, loại, ghi chú, số tiền, đã thu,
   còn lại, trạng thái (effective — "Quá hạn" suy ra từ `due`), ngày lập, hạn đóng, phương thức,
   thời điểm tạo `createdAt`.
2. **`GET /api/invoices/:id/payment`** (đã có, #320): mã chuyển khoản (memo `TOS…`), ngân hàng
   nhận, QR VietQR, `payToken` → link công khai `/pay/<token>`, lý do không thu được (`PAID` /
   `NO_BANK_LINK`).
3. **`GET /api/invoices/:id/transactions`** (MỚI): các giao dịch ngân hàng đã khớp vào hóa đơn
   (`payment_transaction` với `match_status = 'matched'`) — số tiền, nội dung CK, mã tham chiếu,
   ngày giao dịch, thời điểm ghi nhận.

## Quyết định đã chốt với user (2026-10-08)

1. **Lịch sử giao dịch:** thêm API mới `GET /api/invoices/:id/transactions` (org-scoped, không
   trả `raw`/`bankAccountXid`/`providerTxnId`) để trang detail có bảng lịch sử giao dịch.
2. **Hành động:** trang detail có đủ hành động — QR + thông tin chuyển khoản inline, "Đã nhận",
   "Sao chép link thanh toán", "Tạo link mới" (có xác nhận) — giống modal "Thu học phí".
3. **Điểm vào:** dòng hóa đơn ở `/tuition` **và** tab "Học phí" của hồ sơ học viên đều click được;
   nút trong dòng (`Thu học phí`, `Đã nhận`) chặn propagation để không kích hoạt điều hướng.

## Scope Challenge (Step 0 — HOLD SCOPE)

- **Existing:** `DataTable` đã hỗ trợ `onClick` + phím Enter/Space trên row
  (`apps/web/src/components/ui/data-table.tsx:43-55`); precedent chặn propagation cho nút trong
  row tại `apps/web/src/components/class-detail/class-roster-tab.tsx:152-160`; layout trang detail
  theo `apps/web/src/routes/_auth/students/$studentId.tsx` (notFound component, Card white);
  logic copy link / rotate token / polling nằm trong
  `apps/web/src/components/modals/invoice-payment-modal.tsx:37-150`.
- **Requested:** click dòng → trang detail, hiển thị **hết** thông tin hiện có — deliver đủ.
- **Complexity:** ~14 files (1 contract, 1 server route + 1 server test, 1 repo web, 1 hook/
  component dùng chung tách từ modal, 2 route mới/di chuyển, 2 route sửa row click, 1 app-shell,
  2 test web cập nhật path, 1 test web mới, 1 e2e spec mới, CHANGELOG), 3 phases.
- **Mode:** auto → fast-with-scout (codebase đã scout, không cần research ngoài; không `--yagni`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Click/Enter trên dòng hóa đơn ở `/tuition` và tab Học phí hồ sơ học viên mở `/tuition/$invoiceId`; nút trong dòng vẫn hoạt động như cũ | P1 |
| 2 | Trang detail hiển thị đủ mọi trường hóa đơn từ snapshot + thông tin chuyển khoản + lịch sử giao dịch đã khớp | P1 |
| 3 | Trang detail có hành động "Đã nhận", copy link `/pay`, tạo link mới — tái dùng logic modal, không nhân bản | P1 |
| 4 | API mới `GET /api/invoices/:id/transactions` org-scoped, 404 cho id lạ/khác org, không lộ PII thô | P1 |

## Non-goals

- Sửa/xóa hóa đơn (chưa có API update/delete — follow-up riêng nếu cần).
- Hiển thị giao dịch `unmatched`/`ignored` trên trang detail (vẫn ở hàng "Giao dịch chưa khớp" của `/tuition`).
- Hiển thị `raw` webhook payload, `bankAccountXid`, `providerTxnId` (PII/nội bộ — giữ đúng chính sách retention #320).
- Đổi app student (`apps/student`) hay trang công khai `/pay/<token>`.
- Làm cho tab "Tuition" của roster lớp (aggregate theo học viên, không phải dòng hóa đơn) click được.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [API lịch sử giao dịch theo hóa đơn](./phase-01-invoice-transactions-api.md) | Pending | 1.5h |
| 2 | [UI trang chi tiết hóa đơn + row click](./phase-02-invoice-detail-ui.md) | Pending | 3.5h |
| 3 | [E2E + gate local + screenshot 3 viewport](./phase-03-e2e-and-gate.md) | Pending | 2h |

Phụ thuộc: Phase 2 cần contract + endpoint của Phase 1; Phase 3 cần Phase 1–2.

## Kiến trúc

```mermaid
flowchart LR
  A["/tuition row click"] --> D["/tuition/$invoiceId"]
  B["/students/$id tab Học phí row click"] --> D
  D -->|useData| S["kernel snapshot<br/>invoice + student + enrollment + class"]
  D -->|useQuery poll| P["GET /api/invoices/:id/payment<br/>memo, bank, QR, payToken"]
  D -->|useQuery poll| T["GET /api/invoices/:id/transactions (NEW)<br/>matched payment_transaction"]
  D -->|run mark-invoice-paid| K["POST /api/invoices/:id/mark-paid"]
  D -->|rotate| R["POST /api/invoices/:id/rotate-pay-token"]
```

## Bố cục trang (desktop 1440; 375 xếp 1 cột)

```
← Doanh thu
┌──────────────────────────────────────────────────────────────┐
│ INV-1A2B3C4D  [Thu một phần] còn 300.000đ     [Đã nhận]       │
│ Học phí tháng 10 · Nguyễn Văn A                                │
└──────────────────────────────────────────────────────────────┘
┌ THÔNG TIN HÓA ĐƠN ──────────────┐ ┌ THANH TOÁN CHUYỂN KHOẢN ──┐
│ Mã hóa đơn   INV-1A2B3C4D       │ │ PaymentQrPanel (QR, bank,  │
│ Mã đầy đủ    <uuid> (mono)      │ │ memo TOS…, số tiền còn)    │
│ Loại         Học phí            │ │ [Sao chép link thanh toán] │
│ Ngày lập     07/10              │ │ [Tạo link mới]             │
│ Tạo lúc      07/10/2026 09:12   │ └────────────────────────────┘
│ Hạn đóng     15/10/2026 (đỏ nếu quá hạn)
│ Phương thức  CK
│ Ghi chú      …
├ SỐ TIỀN ────────────────────────┤
│ Tổng 500.000đ · Đã thu 200.000đ · Còn 300.000đ · Progress     │
├ HỌC VIÊN & LỚP ─────────────────┤
│ Avatar Tên → /students/$id · Lớp → /classes/$id (— nếu legacy)│
└─────────────────────────────────┘
┌ LỊCH SỬ GIAO DỊCH ───────────────────────────────────────────┐
│ Ngày GD | Số tiền | Nội dung CK | Mã tham chiếu | Ghi nhận lúc │
│ (empty: "Chưa có giao dịch chuyển khoản nào khớp…")           │
└──────────────────────────────────────────────────────────────┘
```

## Success Criteria

- [ ] Click và Enter/Space trên dòng hóa đơn ở `/tuition` → URL `/tuition/<id>`; click nút "Thu học phí"/"Đã nhận" trong dòng KHÔNG điều hướng (modal/mark-paid vẫn chạy).
- [ ] Click dòng ở tab "Học phí" hồ sơ học viên → `/tuition/<id>`.
- [ ] Trang detail hiện: mã rút gọn + UUID, trạng thái effective (kể cả "Thu một phần" + "còn X"), loại, ngày lập, `createdAt` (giờ VN), hạn đóng, phương thức, ghi chú, tổng/đã thu/còn lại + progress, học viên (link), lớp (link hoặc "—"), QR + memo + bank, link `/pay`, bảng lịch sử giao dịch.
- [ ] Invoice mark-paid thủ công (`status=paid`, `paidAmount=0`) hiện "Đã thu" đủ số tiền theo rule `tuitionTotals`, lịch sử giao dịch rỗng có giải thích.
- [ ] id không tồn tại/khác org → notFound "Không tìm thấy hóa đơn" + link về `/tuition`; API trả 404.
- [ ] Topbar title "Doanh thu" trên cả `/tuition` và `/tuition/<id>`; sidebar "Doanh thu" active.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test` xanh.
- [ ] E2E spec mới pass, các spec `/tuition` cũ không vỡ: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.
- [ ] Screenshot 3 viewport (1440×900, 768×1024, 375×812) lưu `screenshots/`, keyboard focus OK theo `REVIEW.md`.

## Rủi ro chính

| Rủi ro | Giảm thiểu |
|--------|-----------|
| Di chuyển `tuition.tsx` → `tuition/index.tsx` đổi route id (`/_auth/tuition` → `/_auth/tuition/`), vỡ `routeTitles` và 2 test đọc path file | Cập nhật `app-shell.tsx` theo id thực trong `routeTree.gen.ts`; sửa `kernel-runtime.contract.test.ts:284,475` và import `empty-states.test.tsx:106` |
| Row `onClick` nuốt click của nút trong dòng | Bọc cell hành động bằng wrapper `stopPropagation` (click + keydown Enter/Space) theo precedent roster |
| Nhân bản logic copy/rotate/poll giữa modal và trang | Tách hook/component dùng chung trong `invoice-payment-modal.tsx` (Phase 2 step 2), modal và trang cùng gọi |
| Lộ PII giao dịch | DTO chỉ trả field hiển thị; matched rows đã có `raw=""`; tenant predicate trên cả invoice lẫn transaction |

## Dependencies

- Không chặn/bị chặn bởi plan nào đang mở. Dựa trên #320 (payment ledger), #340 (remaining label), #343 (`createdAt`, route Doanh thu).

## Validation Log

### Session — 2026-10-08
- **Phỏng vấn user:** 3 quyết định đã chốt (xem "Quyết định đã chốt").
- **Claims kiểm chứng với source:**
  - Không có endpoint giao dịch theo hóa đơn — `payment-transactions.ts:45-74` chỉ trả `unmatched`; `kernel.ts:1479-1487` `/payment` không kèm giao dịch → cần API mới. ✔
  - `payment_transaction` có index `invoice_id` (`packages/db/src/schema/payment-transaction.ts`) → query theo hóa đơn không cần migration. ✔
  - `DataTable` hỗ trợ row `onClick` + Enter/Space (`data-table.tsx:43-55`). ✔
  - Precedent chặn propagation nút trong row (`class-roster-tab.tsx:152-160`). ✔
  - `DataProvider` không render trước khi có snapshot (`data-provider.tsx:177-178`) → không flash notFound. ✔
  - Route id thay đổi khi chuyển sang thư mục: `students/index.tsx` sinh id `/_auth/students/` (`routeTree.gen.ts:484-485`). ✔
  - 2 test web tham chiếu path `tuition.tsx` (`kernel-runtime.contract.test.ts:284,475`, `empty-states.test.tsx:106`). ✔
  - Helper e2e: `seedInvoice` cứng `enrollment_id=''` (`tuition-bank-transfer.spec.ts:36-63`), IPN qua `simulateIpn` (`:79`). ✔ (đã điều chỉnh Phase 3)
- **Red-team:** không chạy (mode auto → fast-with-scout); không có auth mới ngoài 1 GET org-scoped theo đúng pattern `/payment`.
- **Recommendation:** proceed.
