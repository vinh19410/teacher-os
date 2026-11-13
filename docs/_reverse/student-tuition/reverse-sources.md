---
feature: student-tuition
type: reverse-source-map
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-sources — student-tuition

Bảng tài nguyên S. Range kiểm bằng đếm dòng thực tế (awk END NR), không dùng wc -l.

| S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/student.ts | code | 1-2410 | ✅ | ts | kernel học viên (guard 124-210) + GET /invoices 928-953 + GET /invoices/:id/payment 957-976 |
| S2 | apps/server/src/lib/payment-instructions.ts | code | 1-116 | ✅ | ts | ensurePaymentRefs + loadPaymentInstructions + memo/qrUrl |
| S3 | packages/db/src/schema/invoice.ts | code | 1-61 | ✅ | ts | invoice + payment_code/pay_token nullable unique |
| S4 | packages/db/src/schema/org-bank-link.ts | code | 1-47 | ✅ | ts | 1 link/org, status none→linked→inactive/unlinked |
| S5 | packages/db/src/schema/payment-transaction.ts | code | 1-63 | ✅ | ts | ledger; unique (provider, provider_txn_id) |
| S6 | packages/db/src/schema/class.ts | code | 1-41 | ✅ | ts | tuitionFee dòng 34 |
| S7 | packages/db/src/schema/enrollment.ts | code | 1-47 | ✅ | ts | status invited/active; unique (classId, studentId) |
| S8 | packages/db/src/schema/student.ts | code | 1-71 | ✅ | ts | hồ sơ per org; auto-provision theo email |
| S9 | packages/db/src/schema/organization.ts | code | 1-10 | ✅ | ts | id/name/created_at |
| S10 | packages/api/src/contracts.ts | code | 1-4799 | ✅ | ts | PaymentInstructions 3008-3022, PublicPayView 3025-3028, StudentInvoiceItem 3030-3039, STUDENT_ERROR_CODES 1967-1973 |
| S11 | packages/api/src/lib/vietqr.ts | code | 1-30 | ✅ | ts | VIETINBANK_BIN + SEVQR + buildVietQrUrl |
| S12 | packages/api/src/lib/payment-code.ts | code | 1-43 | ✅ | ts | PAYMENT_CODE_RE TOS+8, alphabet 32 ký tự, pay token |
| S13 | apps/server/src/lib/notifications/templates.ts | code | 1-193 | ✅ | ts | invoiceIssuedEvent 130-145, tuitionReminderEvent 40-52 — cả hai linkPath "/tuition" |
| S14 | apps/student/src/routes/_auth/tuition/index.tsx | client route | 1-66 | ✅ | tsx | trang danh sách /tuition |
| S15 | apps/student/src/routes/_auth/tuition/$invoiceId.tsx | client route | 1-105 | ✅ | tsx | trang chi tiết + poll |
| S16 | apps/student/src/components/overview/tuition-list.tsx | client component | 1-130 | ✅ | tsx | isSettled/paidOf/dueOf + 2 nhóm + 2 tổng |
| S17 | apps/student/src/components/overview/empty-state.tsx | client component | 1-30 | ✅ | tsx | khối trống dùng chung |
| S18 | apps/student/src/components/overview/student-error-view.tsx | client component | 1-243 | ✅ | tsx | view lỗi 4 lý do + phục hồi |
| S19 | apps/student/src/components/layout/student-page-gate.tsx | client component | 1-59 | ✅ | tsx | gate + redirect onboarding |
| S20 | apps/student/src/components/layout/student-nav.tsx | client component | 1-131 | ✅ | tsx | mục Học phí 74 + ACTIVE_KEY_BY_PREFIX 103-110 |
| S21 | apps/student/src/components/layout/notification-bell.tsx | client component | 1-295 | ✅ | tsx | mở thông báo → navigate linkPath 53-61 |
| S22 | apps/student/src/lib/repos/student.ts | client lib | 1-867 | ✅ | ts | org localStorage 45-53, headers 55-67, invoices hooks 832-867 |
| S23 | apps/student/src/lib/repos/payments-portal.ts | client lib | 1-4 | ✅ | ts | POLL_INTERVAL_MS 5000 + POLL_CAP_MS 15 phút |
| S24 | apps/student/src/lib/query-client.ts | client lib | 1-65 | ✅ | ts | 401 → signOut + /login?returnUrl 30-39; offlineFirst 40-50 |
| S25 | packages/ui/src/components/payments/payment-qr-panel.tsx | shared component | 1-183 | ✅ | tsx | panel QR 4 trạng thái + copy 5 trường |
| S26 | apps/web/src/routes/_auth/students/$studentId.tsx | client route | 1-392 | ✅ | tsx | tab Học phí 227-234 + khối 326-365 |
| S27 | apps/web/src/components/tuition/student-tuition-summary.tsx | client component | 1-118 | ✅ | tsx | 3 thẻ + bảng theo lớp (phân hệ B) |
| S28 | apps/web/src/components/tuition/invoice-status-cell.tsx | client component | 1-41 | ✅ | tsx | ô trạng thái bảng hóa đơn |
| S29 | apps/web/src/lib/tuition-from-kernel.ts | client lib | 1-710 | ✅ | ts | invoiceReceived 28-33, tuitionTotals 35-48, effectiveInvoiceStatus 194-205, studentTuitionSummary 329-399 |
| S30 | apps/web/src/lib/format-invoice.ts | client lib | 1-56 | ✅ | ts | invoiceCode 7-9, invoiceType 13-15, nhãn trạng thái 21-25 |
| S31 | apps/web/src/lib/repos/payments.ts | client lib | 1-206 | ✅ | ts | bản sao hằng số poll 13-16 |
| S32 | apps/web/src/routes/pay.$token.tsx | client route | 1-116 | ✅ | tsx | /pay công khai — cross-ref, có nút làm mới sau cap |
| S33 | apps/web/src/components/modals/invoice-payment-modal.tsx | client component | 1-445 | ✅ | tsx | modal giáo viên dùng chung panel (dòng 244) |
| S34 | apps/e2e/specs/student-tuition-summary.spec.ts | e2e | 1-218 | ✅ | ts | 2 test active, không skip (R1) |
| S35 | apps/e2e/specs/tuition-bank-transfer.spec.ts | e2e | 1-375 | ✅ | ts | test portal 222-272 trong chuỗi đầu-cuối |
| S36 | apps/e2e/specs/student-class-detail.spec.ts | e2e | 1-348 | ✅ | ts | nav portal + /tuition empty 297-307 + viewport 327-346 |
| S37 | apps/e2e/specs/helpers.ts | e2e lib | 1-560 | ✅ | ts | isoInDaysFromTodayVN 307-309 |
| S38 | apps/server/src/invoice-payment.test.ts | test | 1-232 | ✅ | ts | stable codes / 401 / NO_BANK_LINK |
| S39 | apps/web/src/lib/tuition-from-kernel.test.ts + apps/web/src/components/tuition/student-tuition-summary.test.tsx | test | 1-1470 + 1-291 | ✅ | ts | kernel: invoiceReceived 679-706, studentTuitionSummary 707-1014; component: 9 its |
| S40 | docs/_reverse/tuition-invoicing/ | doc cross-ref | — | ✅ | md | bộ đặc tả phía giáo viên cùng domain |

Ghi chú nguồn:

- reverse-plan.json features[26] = student-tuition: sources gồm S14, S15, S34;
  existing_doc = null; confidence medium. ✅ docs/_reverse/reverse-plan.json
- Toàn bộ nguồn đọc ở working tree; git status không có file nào thuộc bảng trên đang
  modified (chỉ .gitignore, admin-library-audio.test.ts, biome.json ngoài feature) —
  nội dung working tree = nội dung @ d6c0f6b5 cho feature này. ✅
