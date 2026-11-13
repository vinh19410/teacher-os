# Nguồn nghịch đảo — tuition-invoicing

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

| S-id | path | loại | range | confidence | encoding | ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/web/src/routes/_auth/tuition/index.tsx | route web | 1-376 | ✅ | UTF-8 (TSX) | Trang Doanh thu; nguồn chính #343/#345 |
| S2 | apps/web/src/routes/_auth/tuition/$invoiceId.tsx | route web | 1-359 | ✅ | UTF-8 (TSX) | Chi tiết hóa đơn + QR + lịch sử |
| S3 | apps/web/src/routes/_auth/debts/index.tsx | route web | 1-612 | ✅ | UTF-8 (TSX) | Sổ công nợ TOS-15/18 |
| S4 | apps/server/src/routes/payment-transactions.ts | route server | 1-152 | ✅ | UTF-8 (TS) | Hàng đợi chưa khớp: list/assign/ignore |
| S5 | packages/db/src/schema/invoice.ts | schema | 1-61 | ✅ | UTF-8 (TS) | Bảng invoice, 2 FK thật, 2 unique nullable |
| S6 | apps/e2e/specs/create-invoice.spec.ts | e2e | 1-248 | ✅ | UTF-8 (TS) | R1 tạo hóa đơn (4 test) |
| S7 | apps/server/src/routes/kernel.ts | route server | 209-211, 1635-1639, 3042-3522 | ✅ | UTF-8 (TS) | Toàn bộ endpoint hóa đơn + guard; file 3523 dòng |
| S8 | apps/server/src/routes/snapshot.ts | loader | 61-93, 239, 348, 870 | ✅ | UTF-8 (TS) | loadInvoices + finance gate |
| S9 | packages/db/src/schema/payment-transaction.ts | schema | 1-63 | ✅ | UTF-8 (TS) | Sổ giao dịch |
| S10 | apps/server/src/lib/payments/recompute-invoice.ts | service | 1-38 | ✅ | UTF-8 (TS) | Tính lại paidAmount từ sổ |
| S11 | apps/server/src/lib/payments/ingest-transaction.ts | service | 1-165 | ✅ | UTF-8 (TS) | Đường ghi duy nhất tiền vào |
| S12 | apps/server/src/lib/payments/record-manual-payment.ts | service | 1-196 | ✅ | UTF-8 (TS) | Phiếu thu thủ công |
| S13 | packages/api/src/contracts.ts | contract | 1503-1572, 1768-1797, 2995-3087, 4034-4107 | ✅ | UTF-8 (TS) | Schemas + wire; file 4799 dòng |
| S14 | apps/server/src/lib/payment-instructions.ts | service | 1-116 | ✅ | UTF-8 (TS) | QR + lazy backfill |
| S15 | packages/api/src/lib/payment-code.ts | util | 1-43 | ✅ | UTF-8 (TS) | Mã chuyển khoản + token |
| S16 | apps/server/src/routes/public-pay.ts | route server | 1-56 | ✅ | UTF-8 (TS) | Trang công khai (data) |
| S17 | apps/web/src/routes/pay.$token.tsx | route web | 1-116 | ✅ | UTF-8 (TSX) | Trang /pay |
| S18 | apps/web/src/lib/tuition-from-kernel.ts | helper | 1-710 | ✅ | UTF-8 (TS) | Toàn bộ quy tắc tính số web |
| S19 | apps/web/src/lib/format-invoice.ts | helper | 1-56 | ✅ | UTF-8 (TS) | Mã ngắn + nhãn |
| S20 | apps/web/src/lib/repos/invoices.ts | client | 1-35 | ✅ | UTF-8 (TS) | Map snapshot → Invoice |
| S21 | apps/web/src/lib/repos/payments.ts | client | 1-206 | ✅ | UTF-8 (TS) | Polling + fetchers |
| S22 | apps/web/src/components/modals/add-invoice-modal.tsx | UI | 1-213 | ✅ | UTF-8 (TSX) | Modal tạo |
| S23 | apps/web/src/components/modals/invoice-payment-modal.tsx | UI | 1-445 | ✅ | UTF-8 (TSX) | Modal thu + queue + copy/rotate |
| S24 | apps/web/src/components/modals/record-payment-modal.tsx | UI | 1-323 | ✅ | UTF-8 (TSX) | Modal phiếu thu |
| S25 | apps/web/src/components/debts/billing-timeline-drawer.tsx | UI | 1-354 | ✅ | UTF-8 (TSX) | Drawer timeline |
| S26 | apps/web/src/components/tuition/invoice-status-cell.tsx | UI | 1-41 | ✅ | UTF-8 (TSX) | Ô trạng thái dùng chung |
| S27 | apps/web/src/lib/use-finance-route-guard.ts | guard | 1-31 | ✅ | UTF-8 (TS) | Gate web |
| S28 | packages/auth/src/role.ts | role gate | 69-87 | ✅ | UTF-8 (TS) | FINANCE_ROLES; file 177 dòng |
| S29 | apps/server/src/lib/require-finance-role.ts | guard | 1-27 | ✅ | UTF-8 (TS) | 401 trước 403 |
| S30 | apps/server/src/lib/notifications/templates.ts | service | 36-54, 129-146 | ✅ | UTF-8 (TS) | 2 builder sự kiện |
| S31 | apps/web/src/lib/repos/kernel.ts | client | 71-81, 159-169 | ✅ | UTF-8 (TS) | Lệnh → endpoint; file 834 dòng |
| S32 | apps/web/src/lib/data-store-reducer.ts | store | 77-87, 98-106 | ✅ | UTF-8 (TS) | Optimistic mark-paid |
| S33 | apps/web/src/lib/use-direct-kernel-action.ts | hook | 1-60 | ✅ | UTF-8 (TS) | Chặn thao tác kép |
| S34 | apps/web/src/lib/kernel-outcome.ts | hook | 1-172 | ✅ | UTF-8 (TS) | Toast quyết định |
| S35 | packages/api/src/skeleton.ts | util | 75-96 | ✅ | UTF-8 (TS) | parseStartDateStrict |
| S36 | apps/server/src/routes/bank-hub-webhooks.ts | route server | 13-60 | ✅ | UTF-8 (TS) | IPN + lifecycle webhook |
| S37 | apps/server/src/routes/bank-link.ts | route server | 255-281 | ✅ | UTF-8 (TS) | Reconcile + cooldown; file 371 dòng |
| S38 | apps/server/src/routes/student.ts | route server | 732-733, 927-976 | ✅ | UTF-8 (TS) | Cổng học viên; file 2410 dòng |
| S39 | packages/ui/src/components/payments/payment-qr-panel.tsx | UI dùng chung | 29-80 | ✅ | UTF-8 (TSX) | QR panel 3 bề mặt |
| S40 | apps/web/src/components/tuition/revenue-chart.tsx | UI | 1-258 | ✅ | UTF-8 (TSX) | Biểu đồ doanh thu |
| S41 | packages/db/src/migrations/0004_gray_cloak.sql | migration | 1-16 | ✅ | UTF-8 (SQL) | CREATE TABLE invoice |
| S42 | packages/db/src/migrations/0013_perfect_madame_hydra.sql | migration | 1-4 | ✅ | UTF-8 (SQL) | ADD due, note |
| S43 | packages/db/src/migrations/0034_familiar_jamie_braddock.sql | migration | 21-47 | ✅ | UTF-8 (SQL) | payment_transaction + 3 cột invoice |
| S44 | apps/web/src/lib/mock-data.ts | model | 134-155, 330-332 | ✅ | UTF-8 (TS) | Invoice + fmtVND |
| S45 | apps/web/src/lib/week-grid.ts | util | 29-31, 38, 100 | ✅ | UTF-8 (TS) | todayISOVietnam; file 210 dòng |
| S46 | apps/server/src/invoice-payment.test.ts | test | 142-232 | ✅ | UTF-8 (TS) | 6 test active |
| S47 | apps/server/src/invoice-transactions.test.ts | test | 196-273 | ✅ | UTF-8 (TS) | 8 test active |
| S48 | apps/server/src/payment-transactions.test.ts | test | 137-221 | ✅ | UTF-8 (TS) | 5 test active |
| S49 | apps/server/src/lib/payments/manual-payment.test.ts | test | 170-408 | ✅ | UTF-8 (TS) | 13 test active |
| S50 | apps/server/src/lib/payments/ledger-invariants.test.ts | test | 263-349 | ✅ | UTF-8 (TS) | 4 test bất biến + 1 test.fails có chủ đích (dòng 340) |
| S51 | apps/server/src/routes/debt-reminders.test.ts | test | 310-395 | ✅ | UTF-8 (TS) | 4 test active |
| S52 | apps/server/src/routes/billing-timeline.test.ts | test | 267-390 | ✅ | UTF-8 (TS) | 5 test active |
| S53 | apps/server/src/lib/require-finance-role.test.ts | test | 1-375 | ✅ | UTF-8 (TS) | 1 test tổng hợp active |
| S54 | apps/web/src/routes/_auth/tuition/index.test.tsx | test | 67-178 | ✅ | UTF-8 (TSX) | 5 test active |
| S55 | apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx | test | 188-395 | ✅ | UTF-8 (TSX) | 10 test active |
| S56 | apps/web/src/routes/_auth/debts/index.test.tsx | test | 168-501 | ✅ | UTF-8 (TSX) | 11 test active |
| S57 | apps/web/src/lib/tuition-from-kernel.test.ts | test | 1-1470 | ✅ | UTF-8 (TS) | 64 test active |
| S58 | apps/web/src/components/modals/add-invoice-modal.test.tsx | test | 62-139 | ✅ | UTF-8 (TSX) | 3 test active |
| S59 | apps/web/src/components/modals/record-payment-modal.test.tsx | test | 131-430 | ✅ | UTF-8 (TSX) | 10 test active |
| S60 | apps/web/src/components/modals/invoice-payment-modal.test.tsx | test | 1-190 | ✅ | UTF-8 (TSX) | 8 test active |
| S61 | apps/web/src/lib/repos/invoices.test.ts | test | 1-197 | ✅ | UTF-8 (TS) | 6 test active |
| S62 | apps/web/src/lib/format-invoice.test.ts | test | 1-113 | ✅ | UTF-8 (TS) | 11 test active |
| S63 | packages/api/src/vietnam-date.ts | util | 27-29 | ✅ | UTF-8 (TS) | vietnamTodayISO |
| S64 | apps/server/src/app.ts | bootstrap | 423 | ✅ | UTF-8 (TS) | Mount /public/pay |
| S65 | apps/web/src/lib/data-actions.ts | client | 74, 118-140 | ✅ | UTF-8 (TS) | Kiểu lệnh ghi |
| S66 | apps/web/src/lib/use-kernel-form-submit.ts | hook | 7-26, 61-64 | ✅ | UTF-8 (TS) | Thông điệp lỗi form |
| S67 | packages/db/src/schema/enrollment.ts | schema | 15-47 | ✅ | UTF-8 (TS) | Đăng ký |
| S68 | packages/db/src/schema/class.ts | schema | 13-41 | ✅ | UTF-8 (TS) | Lớp + tuition_fee |
| S69 | packages/db/src/schema/org-bank-link.ts | schema | 14-47 | ✅ | UTF-8 (TS) | Liên kết ngân hàng |
| S70 | packages/db/src/schema/organization.ts | schema | 5-9 | ✅ | UTF-8 (TS) | Tổ chức |
| S71 | packages/db/src/schema/student.ts | schema | 18-24 | ✅ | UTF-8 (TS) | Học viên |
| S72 | apps/server/src/public-pay.test.ts | test | 66-111 | ✅ | UTF-8 (TS) | 5 test trang công khai (file 120 dòng) |
| S73 | apps/server/src/bank-hub-ipn.test.ts | test | 209-430 | ✅ | UTF-8 (TS) | 12 test IPN/khớp (file 436 dòng) |
| S74 | apps/server/src/bank-hub-reconcile.test.ts | test | 173-236 | ✅ | UTF-8 (TS) | 4 test đối soát (file 246 dòng) |
| S75 | apps/server/src/routes/bank-hub-webhooks.test.ts | test | 1-199 | ✅ | UTF-8 (TS) | Header/guard webhook (file 199 dòng) |

> Mọi `[S<n>]` trong spec/flows/states/erd/usecases resolve vào bảng trên. Range đã kiểm `wc -l` (không vượt EOF).
