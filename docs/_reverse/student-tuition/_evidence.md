---
feature: student-tuition
type: reverse-evidence
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# _evidence — student-tuition

Bằng chứng thô theo hạng mục. Cite dạng `repo-relative/path:line`; range đã kiểm EOF bằng
awk và nội dung bằng sed.

## §Endpoints (2 GET trên kernel học viên)

| Endpoint | Hành vi | Nguồn |
|---|---|---|
| GET `/api/student/invoices` | guard requireStudent (732-733) → select where orgId+studentId, orderBy asc createdAt,id → map {id, invoiceCode `INV-<8 cuối>.toUpperCase()`, amount, paidAmount, amountDue `Math.max(amount - paidAmount, 0)`, status, due, type} | apps/server/src/routes/student.ts:928-953 |
| GET `/api/student/invoices/:id/payment` | select id+org+student → 404 "invoice not found" nếu !row → ensurePaymentRefs → 404 nếu !refs → loadPaymentInstructions → 200 | apps/server/src/routes/student.ts:957-976 |
| Guard học viên | 401 UNAUTHORIZED → 403 STUDENT_EMAIL_UNVERIFIED → auto-provision theo email (lower/trim) → 403 STUDENT_NOT_LINKED → chọn org theo header `x-student-org-id` ?? `?org`, chỉ khớp hồ sơ của phiên | apps/server/src/routes/student.ts:124-210 |
| Route guards | `router.use("/invoices", requireStudent)` + `router.use("/invoices/*", requireStudent)` | apps/server/src/routes/student.ts:732-733 |

## §Service thanh toán (S2)

| Hàm | Hành vi | Nguồn |
|---|---|---|
| ensurePaymentRefs | đọc row; sai org → undefined; vòng ≤3: nếu thiếu paymentCode/payToken thì UPDATE có điều kiện (where isNull) — đụng unique thì bắt lỗi và thử lại; đọc lại sau mỗi vòng | apps/server/src/lib/payment-instructions.ts:21-55 |
| loadPaymentInstructions | amountDue clamp ≥0; base {invoiceCode, amount, paidAmount, amountDue, status, due, note, payable: amountDue > 0}; payable=false + reason "PAID" khi amountDue ≤ 0 hoặc status paid; NO_BANK_LINK khi không có row link hợp lệ; memo + qrUrl chỉ khi chuyển khoản được | apps/server/src/lib/payment-instructions.ts:62-115 |
| Doc comment | "QR is always built from the org's CURRENT linked account and the CURRENT remaining debt — nothing about it is stored"; "Settled covers both ledger-paid ... and manually mark-paid rows" | apps/server/src/lib/payment-instructions.ts:57-61, apps/server/src/lib/payment-instructions.ts:78-82 |
| buildTransferMemo | code thuần; VietinBank bin 970415 → `SEVQR <code>` | packages/api/src/lib/vietqr.ts:5-13 |
| buildVietQrUrl | vietqr.app/img?acc&bank&amount(floor)&des&template=compact | packages/api/src/lib/vietqr.ts:16-29 |
| Sinh mã | PAYMENT_CODE_RE `TOS[0-9A-HJKMNP-TV-Z]{8}` (bỏ I/L/O/U); generatePaymentCode; generatePayToken 128-bit | packages/api/src/lib/payment-code.ts:7-43 |

## §Hợp đồng (S10)

| Kiểu | Trường | Nguồn |
|---|---|---|
| PaymentInstructions | invoiceCode, amount, paidAmount, amountDue, status, due, note, payable, reason? ("NO_BANK_LINK" \| "PAID"), bank?, memo?, qrUrl? | packages/api/src/contracts.ts:3008-3022 |
| PublicPayView | Omit note/due + orgName + studentName | packages/api/src/contracts.ts:3025-3028 |
| StudentInvoiceItem | id, invoiceCode, amount, paidAmount, amountDue, status, due, type | packages/api/src/contracts.ts:3030-3039 |
| STUDENT_ERROR_CODES | NOT_LINKED/AMBIGUOUS/EMAIL_UNVERIFIED → "STUDENT_*" | packages/api/src/contracts.ts:1967-1973 |

## §Client portal (phân hệ A)

| Thành phần | Hành vi | Nguồn |
|---|---|---|
| Nav | item {key tuition, label "Học phí", href /tuition}; ACTIVE_KEY_BY_PREFIX "/tuition" → active | apps/student/src/components/layout/student-nav.tsx:74, apps/student/src/components/layout/student-nav.tsx:103-110 |
| /tuition | gate → Loader → StudentErrorView(code) → header + empty hoặc TuitionList | apps/student/src/routes/_auth/tuition/index.tsx:14-66 |
| TuitionList | isSettled = status paid \|\| amountDue ≤ 0; paidOf = settled ? amount : paidAmount; dueOf = settled ? 0 : amountDue; 2 MiniStat "Đã đóng"/"Còn lại" (hot); settled: loại + tiền + Tag "Đã thanh toán"; chưa đủ: link hàng, loại \| \| "Học phí", "Hạn <due>" \| "Chưa có hạn đóng", "Đã nhận X / Y" \| "Tổng Y" | apps/student/src/components/overview/tuition-list.tsx:10-22, apps/student/src/components/overview/tuition-list.tsx:63-123 |
| Chi tiết | comment #320 poll 5s/tab-visible/15 phút; query retry:false; poll effect; loading "Đang tải…"; lỗi "Không mở được phiếu học phí này."; header + 2 ô + PaymentQrPanel | apps/student/src/routes/_auth/tuition/$invoiceId.tsx:14-99 |
| Panel QR | PAYMENT_QR_VI: title/paidFull/partial/noBankLink/copyHint/copied/copy + 5 fields; state = payable? (reason PAID → paid, còn lại<amount → partial, else open) : (PAID → paid : nolink); QR nền trắng; lỗi ảnh; copy + aria-live | packages/ui/src/components/payments/payment-qr-panel.tsx:33-49, packages/ui/src/components/payments/payment-qr-panel.tsx:83-141, packages/ui/src/components/payments/payment-qr-panel.tsx:143-178 |
| Gate | NOT_LINKED → view lỗi; onboardingCompletedAt null → Navigate /onboarding | apps/student/src/components/layout/student-page-gate.tsx:32-44 |
| View lỗi | default/TEACHER_ON_STUDENT_PORTAL/NOT_LINKED/EMAIL_UNVERIFIED/AMBIGUOUS + nút gửi lại email, kiểm tra lại, đăng xuất, chuyển cổng GV | apps/student/src/components/overview/student-error-view.tsx:82-119, apps/student/src/components/overview/student-error-view.tsx:148-203 |
| Repos | localStorage active_student_org_id (47,52); header x-student-org-id (64); fetchStudentInvoices + useStudentInvoices staleTime 30s (832-850); fetchStudentInvoicePayment (852-867) | apps/student/src/lib/repos/student.ts:45-67, apps/student/src/lib/repos/student.ts:832-867 |
| Query client | 401 → signOut + /login?returnUrl (30-39); default staleTime 60s + offlineFirst (40-50) | apps/student/src/lib/query-client.ts:30-50 |
| Poll hằng số | POLL_INTERVAL_MS 5000, POLL_CAP_MS 15 phút (portal); bản sao web 13-16 | apps/student/src/lib/repos/payments-portal.ts:1-4, apps/web/src/lib/repos/payments.ts:13-16 |

## §Phân hệ B (tab hồ sơ GV)

| Thành phần | Hành vi | Nguồn |
|---|---|---|
| Tabs | profile/history/tuition/assign — tuition label "Học phí" | apps/web/src/routes/_auth/students/$studentId.tsx:227-234 |
| Khối tab | StudentTuitionSummary(studentTuitionSummary(id, classes, enrollments, invoices)) + DataTable ["Mã","Loại","Số tiền","Ngày","Trạng thái"] với effectiveInvoiceStatus(inv, todayVN), onClick navigate /tuition/$invoiceId (#345) | apps/web/src/routes/_auth/students/$studentId.tsx:326-365 |
| Kernel | invoiceReceived: paid → trọn amount, else min(paidAmount, amount); studentTuitionSummary: counted chỉ enrollment active + fee !== null; unlinkedPaid tách riêng; overpaid per class | apps/web/src/lib/tuition-from-kernel.ts:28-33, apps/web/src/lib/tuition-from-kernel.ts:329-399 |
| Component | EMPTY "—"; remainingCell (—/Chưa kích hoạt — chưa tính/Dư Xđ/Đã đóng đủ/số); feeCell "Chưa thiết lập"; classCell + Badge "Đã mời" khi status !== "active"; 3 StatCard + hot; ghi chú unlinkedPaid; 2 empty | apps/web/src/components/tuition/student-tuition-summary.tsx:11-98 |
| Format | invoiceCode INV-<8 cuối>; invoiceType \| \| "Khác"; nhãn paid/unpaid/overdue → "Đã thu"/"Chưa thu"/"Quá hạn" | apps/web/src/lib/format-invoice.ts:8-30 |
| notFound | "Không tìm thấy học viên" + "← Về danh sách học viên" | apps/web/src/routes/_auth/students/$studentId.tsx:44-57 |

## §Thông báo (điểm vào F4)

| Sự kiện | Nội dung | Nguồn |
|---|---|---|
| invoiceIssuedEvent | title "Hóa đơn học phí", body kèm số tiền + hạn, linkPath "/tuition", idempotency invoice_issued:<id> | apps/server/src/lib/notifications/templates.ts:130-145 |
| tuitionReminderEvent | title "Nhắc học phí", body đến hạn ngày, linkPath "/tuition", idempotency theo ngày VN | apps/server/src/lib/notifications/templates.ts:40-52 |
| Chuông | handleInboxItemClick → navigate linkPath | apps/student/src/components/layout/notification-bell.tsx:53-61 |

## §Tests (R1 — đếm, không chạy)

| Bộ | Số lượng / phạm vi | Nguồn |
|---|---|---|
| invoice-payment.test.ts | 6 test (trong đó có test unauthenticated 401 tại 182-185) (legacy stable codes 142-168; indistinguishable 404 170-181; anonymous 401 student endpoints 187-194; rotate token 196-218; NO_BANK_LINK 219-231; ...) | apps/server/src/invoice-payment.test.ts:1-232 |
| tuition-from-kernel.test.ts | describes: tuitionTotals 63, effectiveInvoiceStatus 127, invoiceReceived 679-706, studentTuitionSummary 707-1014 (13 it), ... EOF 1470 | apps/web/src/lib/tuition-from-kernel.test.ts:63-1014 |
| student-tuition-summary.test.tsx | 9 it (số thẻ, Đã đóng đủ/Dư, đỏ còn nợ, invited, status lạ, chưa thiết lập, unlinkedPaid, '—' + hướng dẫn, không lớp) | apps/web/src/components/tuition/student-tuition-summary.test.tsx:50-286 |
| e2e student-tuition-summary | 2 test active: kịch bản 2 lớp + reload + mở hóa đơn (89-164); screenshots 3 viewport (166-218) | apps/e2e/specs/student-tuition-summary.spec.ts:89-218 |
| e2e tuition-bank-transfer | test portal 222-272: signup thật + verify email (242-252) → heading "Học phí" (260) → link → img vietqr.app (269) | apps/e2e/specs/tuition-bank-transfer.spec.ts:222-272 |
| e2e student-class-detail | nav: /tuition active + h1 "Học phí của tôi" + "Chưa có hóa đơn học phí" (297-307); 3 viewport không tràn (327-346) | apps/e2e/specs/student-class-detail.spec.ts:297-346 |

## §Cross-repo hops

- Panel QR (packages/ui) dùng bởi 3 bề mặt: modal giáo viên (invoice-payment-modal.tsx:244),
  /pay công khai (pay.$token.tsx), portal học viên ($invoiceId.tsx:4,99). ✅
- Hằng số poll nhân bản student/web — không chia sẻ module. 🔵 S23, S31
- Kernel tuition-from-kernel.ts dùng chung giữa trang Doanh thu và tab hồ sơ. 🔵 INF-1
- Cổng học viên trong docs/_reverse/tuition-invoicing/ tự khai "là feature student-tuition
  riêng" và chỉ cross-ref — xác nhận ranh giới hai bộ. ✅ S40

## §Trạng thái working tree

- `git status --short` lúc soạn: ` M .gitignore`, ` M apps/server/src/routes/admin-library-audio.test.ts`,
  ` M biome.json`, `?? .claude/`, `?? _templates/`, `?? docs/_reverse/`. Không có file nào
  của feature modified/untracked ngoài docs/_reverse (chính bộ này) → mọi cite đọc trực
  tiếp working tree tương đương nội dung @ d6c0f6b5. ✅

## §Negative searches (R3/R2/R1)

| Câu lệnh | Kết quả | Hệ quả |
|---|---|---|
| `grep -n "router.post" apps/server/src/routes/student.ts` | 7 route POST: invitations accept/reject, inbox read, onboarding, enrollments accept, quiz start, attempts submit — KHÔNG có invoices | Surface hóa đơn chỉ-đọc (OQ-02) ✅ |
| `grep -rn "STUDENT_AMBIGUOUS" apps/server/src apps/student/src apps/web/src packages/api/src` | chỉ contracts.ts:1969 | Mã không ai trả (OQ-04) ✅ |
| `grep -rn "skip|todo|only" <4 file test của feature>` | 1 match: chữ "only" trong comment "client-only drift" (S34:148) | Không test bị bỏ (GAP-7) ✅ |
| `grep -rn "useTranslation|i18n" apps/student/src` | rỗng | R2: không i18n (GAP-1) ✅ |
| (môi trường) grep trên máy là ugrep alias — có warning nhưng kết quả tương đương grep GNU | — | — |
