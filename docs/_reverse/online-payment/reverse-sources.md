---
type: reverse-source-map
feature: online-payment
status: draft
updated: 2026-11-12
---
# online-payment — Danh mục nguồn (provenance)

| ID | Nguồn (file/folder) | Loại | Ngày (nếu biết) | Confidence | Encoding OK? | Phần feature suy ra từ đây |
|----|---------------------|------|-----------------|------------|--------------|----------------------------|
| S1 | `apps/server/src/routes/bank-hub-webhooks.ts` + `bank-hub-webhooks.test.ts`, `apps/server/src/bank-hub-ipn.test.ts`, `apps/server/src/bank-hub-reconcile.test.ts` | code TS (webhook route) + test vitest active | 2026-11 (develop @ d6c0f6b5) | high | OK | FR-op-001..004, 008..009, NFR-op-001..004, BR-op-002/005/006/007/009/015, E-op-001..007, Flow 2/4 |
| S2 | `apps/server/src/routes/public-pay.ts` + `apps/server/src/public-pay.test.ts` | code TS (route công khai) + test | 2026-11 | high | OK | FR-op-010, NFR-op-006/014, BR-op-011, E-op-023, Flow 3, SC-op-04 |
| S3 | `apps/server/src/routes/bank-link.ts` + `apps/server/src/bank-link.test.ts` | code TS (route liên kết + đối soát) + test | 2026-11 | high | OK | FR-op-014..017, NFR-op-007/008/009/013, BR-op-001/009/015, E-op-008..018, Flow 1/4 |
| S4 | `apps/server/src/lib/payments/` (`ingest-transaction.ts`, `recompute-invoice.ts`, `record-manual-payment.ts`) + `ledger-invariants.test.ts`, `manual-payment.test.ts` | code TS (nghiệp vụ sổ cái) + test | 2026-11 | high | OK | FR-op-004..009, 019, NFR-op-003, BR-op-002..007, Flow 2/4/5 |
| S5 | `apps/server/src/lib/bank-hub/` (`bank-hub-client.ts`, `bank-hub-types.ts`, `bank-link-service.ts`) + `bank-hub-client.test.ts` | code TS (client hub + service liên kết) + test | 2026-11 | high | OK | FR-op-001, 014..016, BR-op-008/014, NFR-op-009, phụ thuộc hub |
| S6 | `apps/server/src/routes/payment-transactions.ts` + `payment-transactions.test.ts` | code TS (hàng chờ) + test | 2026-11 | high | OK | FR-op-006, 018, NFR-op-011, BR-op-013, E-op-019..021 |
| S7 | `packages/db/src/schema/org-bank-link.ts`, `payment-transaction.ts`, `invoice.ts` + `packages/db/src/migrations/0034_familiar_jamie_braddock.sql`, `0049_shocking_kabuki.sql` | schema Drizzle + migration SQL | 2026-11 | high | OK | Mục 8, ERD, BR-op-007, FR-op-004/016 |
| S8 | `packages/api/src/contracts.ts` (khối 2960-3090: BANK_LINK_ERROR_CODES, bank-link schemas, PAYMENT_ERROR_CODES, PaymentInstructions, PublicPayView, PaymentTransactionItem, ReconcileResult; khối 1517-1538: method enum + phiếu thủ công) | code TS (hợp đồng Zod/DTO) | 2026-11 | high | OK | E-op-014..022, FR-op-015, hợp đồng wording |
| S9 | `packages/api/src/lib/payment-code.ts` + `payment-code.test.ts`, `vietqr.ts`, `bank-hub-origins.ts` | code TS (thư viện dùng chung) + test | 2026-11 | high | OK | FR-op-005/012/014, NFR-op-005/012 |
| S10 | `apps/server/src/lib/payment-instructions.ts` | code TS (hướng dẫn chuyển khoản + QR realtime) | 2026-11 | high | OK | FR-op-012, BR-op-010 |
| S11 | `apps/server/src/app.ts`, `index.ts`, `routes/kernel.ts` (khối invoice payment 3098-3264), `routes/bank-hub-mock.ts` + `bank-hub-mock.test.ts`, `routes/student.ts` (960-979), `lib/safe-equal.ts`, `lib/require-finance-role.ts`, `packages/auth/src/role.ts`, `invoice-payment.test.ts`, `invoice-transactions.test.ts` | code TS (mount + kernel + gates) + test | 2026-11 | high | OK | FR-op-011, 018..022, NFR-op-014, BR-op-004/012/013, E-op-009/010/022, mount ngoài /api |
| S12 | `apps/web/src/routes/pay.$token.tsx`, `apps/web/src/lib/repos/payments.ts`, `bank-link.ts` | code TSX/TS (SPA + read model) | 2026-11 | high | OK | FR-op-010/013, NFR-op-010/013, Flow 3 |
| S13 | `apps/web/src/components/payments/bank-link-panel.tsx`, `apps/web/src/components/modals/bank-hub-link-modal.tsx`, `invoice-payment-modal.tsx`, `record-payment-modal.tsx`, `packages/ui/src/components/payments/payment-qr-panel.tsx` | code TSX (UI components) | 2026-11 | high | OK | Screens, FR-op-011/018, NFR-op-007/013, wording tiếng Việt |
| S14 | `apps/web/src/security-headers.ts` | code TS (CSP) | 2026-11 | high | OK | NFR-op-012, FR-op-014 |
| S15 | `apps/e2e/specs/tuition-bank-transfer.spec.ts` + `apps/e2e/src/fake-bank-hub.ts` | test Playwright E2E + fake hub | 2026-11 | high | OK | SC-op-01..05, FR-op-005/013, luồng đầu-cuối |

## Ghi chú nguồn

- __Confidence mỗi nguồn:__ toàn bộ là source code + test đang active trên branch `develop` (commit d6c0f6b5) → high. Không có nguồn mojibake.
- __Encoding ⚠:__ không phát hiện.
- __Negative search đã chạy:__ (1) không có scheduled/cron handler trong `apps/server/src/index.ts` (chỉ `export default app` ở dòng 177) → đối soát chỉ chạy tay; (2) không thấy `test.skip`/`test.todo` trong phạm vi; đúng 1 `test.fails` cố ý (`apps/server/src/lib/payments/ledger-invariants.test.ts:336-342`) ghi nhận bất biến còn bỏ ngỏ về vượt nợ từ giao dịch ngân hàng.
