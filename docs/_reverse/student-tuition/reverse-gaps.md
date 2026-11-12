---
feature: student-tuition
type: reverse-gaps
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-gaps — student-tuition

## OQ (câu hỏi mở — kèm 🟡 trong spec)

- **OQ-01.** Ranh giới feature cho phân hệ B: reverse-plan.json features[26] liệt kê
  apps/e2e/specs/student-tuition-summary.spec.ts làm nguồn của student-tuition, nhưng
  component bị test (student-tuition-summary.tsx + tab hồ sơ) sống ở apps/web — phía giáo
  viên; docs/_reverse/tuition-invoicing/ đã kiểm KHÔNG phủ nó. Hiện xử: đưa vào feature
  như phân hệ B với cross-ref rõ. Cần xác nhận ranh giới trước khi draft thành chính thức.
- **OQ-02.** Surface học viên hoàn toàn chỉ-đọc. Negative-search: `grep -n "router.post"
  apps/server/src/routes/student.ts` → chỉ có invitations/inbox/onboarding/enrollments/
  assignments/attempts, KHÔNG có invoices. Học viên không thể báo "tôi đã chuyển khoản",
  không yêu cầu lại hóa đơn. Là thiết kế (đối soát tự động là kênh duy nhất) hay gap?
- **OQ-03.** `POLL_INTERVAL_MS = 5000` và `POLL_CAP_MS = 15 phút` khai báo 2 lần:
  apps/student/src/lib/repos/payments-portal.ts:1-4 và apps/web/src/lib/repos/payments.ts:13-16
  (không import chéo, kèm comment "#320" cùng nguồn). Cố ý tránh phụ thuộc chéo app hay
  cần gom vào packages?
- **OQ-04.** `STUDENT_AMBIGUOUS`: negative-search `grep -rn "STUDENT_AMBIGUOUS" apps/server/src
  apps/student/src apps/web/src packages/api/src` → chỉ contracts.ts:1969 (khai báo). View
  học viên có sẵn màn hiển thị cho mã này (student-error-view.tsx:115-119) nhưng không có
  nhánh server nào trả. Có kịch bản thật nào sinh nhiều hồ sơ trùng email không, hay là
  dead code? (liên hệ BR-03 tự cấp theo email — hồ sơ trùng email có thể đến từ nhiều org:
  khi đó rows > 1 nhưng guard chọn row đầu, KHÔNG trả AMBIGUOUS — student.ts:179-189).
- **OQ-05.** "Quá hạn" là nhãn suy diễn (#322), schema chỉ unpaid/paid. Nghiệp vụ có cần
  trạng thái quá hạn bền (cho nhắc nợ/báo cáo) không, hay giữ suy diễn vĩnh viễn?
- **OQ-06.** Trang chi tiết portal bỏ qua `note` và `due` dù hợp đồng trả (contracts.ts:3008-3022;
  $invoiceId.tsx:60-99). Hạn đóng chỉ thấy ở danh sách. Cố ý tối giản hay thiếu?
- **OQ-07.** Trang danh sách không poll, không nút làm mới (chỉ staleTime 30s). Học viên
  đứng ở danh sách chờ tiền về sẽ không thấy cập nhật ngoài refetch tự nhiên. Chấp nhận?
- **OQ-08.** Hóa đơn thu tay: status=paid + paidAmount=0 (payment-instructions.ts:78-82
  comment "paidAmount may stay 0"). Chi tiết portal sẽ hiện "Đã đóng 0đ / Còn lại <tổng>"
  trong khi panel báo "Đã thanh toán đủ" (FR-23 trạng thái thắng là PAID). Chấp nhận chênh
  lệch hiển thị này không? (danh sách thì ổn nhờ isSettled/paidOf — tuition-list.tsx:10-22).
- **OQ-09.** Danh sách orderBy createdAt asc (student.ts:942) — cũ nhất trước. Người dùng
  thường mong mới nhất trước; có chủ ý (thứ tự kế toán) không?
- **OQ-10.** QR theo số nợ hiện thời: học viên lưu QR cũ, chuyển khoản sau khi đã có giao
  dịch một phần → số tiền trên QR không còn khớp số thực chuyển. Đối soát ghép theo mã
  chuyển khoản nên vẫn về đúng hóa đơn (cross-ref tuition-invoicing); quy tắc xử lý chênh
  tiền (một phần/thừa) từ góc nhìn học viên chưa có văn bản.
- **OQ-11.** Phân hệ B có dòng "Ngoài ra đã thu X từ hóa đơn không gắn lớp." nhưng portal
  không có tổng tương đương — học viên có cần ngữ cảnh đó không? (danh sách vẫn hiện từng
  khoản riêng lẻ nên thông tin không mất, chỉ thiếu tổng).
- **OQ-12.** /pay công khai có nút làm mới thủ công sau cap 15 phút (pay.$token.tsx:18
  comment "then a manual refresh button"), portal chi tiết thì không — ai xem portal quá
  15 phút phải rời trang và vào lại. Có chủ ý không?

## GAP (khoảng trống chứng minh)

- **GAP-1 (R2).** Không có i18n: negative-search `grep -rn "useTranslation|i18n"
  apps/student/src` → rỗng; mọi wording là literal TSX. Mỗi câu chữ có đúng 1 nguồn trong
  code (trừ nhóm PAYMENT_QR_VI dùng chung 3 bề mặt).
- **GAP-2.** Không có unit test wording cho trang /tuition và chi tiết ($invoiceId) — chỉ
  e2e assert chuỗi tại chỗ (S36:297-307, S35:260-269).
- **GAP-3.** payment-instructions.ts không có unit test riêng — hành vi qua
  invoice-payment.test.ts (S38) và e2e (S35); nhánh "hết 3 lần backfill" chưa có assert.
- **GAP-4.** Nhánh poll khi tab ẩn chỉ đọc từ code ($invoiceId.tsx:34); e2e không điều
  khiển document.visibilityState nên chưa có bằng chứng thực thi.
- **GAP-5.** Không có test hiển thị chi tiết portal cho hóa đơn thu tay (OQ-08) — rule
  #347 chỉ test ở kernel GV (tuition-from-kernel.test.ts:452-475) và panel ở mức component
  khác; không có test tổng hợp "mở chi tiết hóa đơn mark-paid".
- **GAP-6.** studentTuitionSummary với invoice trỏ enrollment thuộc lớp khác org — không
  thấy test biên này trong describe 707-1014 (S39); ghi nhận thiếu chứng minh.
- **GAP-7 (R1).** Quét skip/todo/only trong test của feature (S34, S38, S39): không có test
  modifier nào bị bỏ — mục này rỗng. (Một match grep duy nhất là chữ "only" trong comment
  "client-only drift" — S34:148 — không phải test.only.)

## INF (suy luận nhiều bằng chứng — 🔵)

- **INF-1.** Một nguồn tính tiền cho cả GV và học viên: invoiceReceived/tuitionTotals/
  effectiveInvoiceStatus sống trong cùng module kernel và được cả tab hồ sơ lẫn trang
  doanh thu dùng; bằng chứng (a) vị trí hàm trong tuition-from-kernel.ts:28-48,
  :194-205; (b) test chung 63-126 + 679-706; (c) component tổng hợp nhập type từ chính
  module đó (student-tuition-summary.tsx:6-9).
- **INF-2.** Poll cập nhật bằng cách đổi query key (bump `reload`) thay vì invalidate —
  cùng pattern ở portal ($invoiceId.tsx:23,26,35) và /pay (pay.$token.tsx:30,55-64); hiệu
  quả: bỏ qua cache, không dính staleTime.
- **INF-3.** Bề mặt QR chia sẻ nguyên tắc "QR là hướng dẫn, văn bản mới là chân lý":
  panel copy-per-field với memo là hàng riêng (payment-qr-panel.tsx:64-66 comment) + memo
  dựng server mỗi lần đọc (payment-instructions.ts:96-101) + comment e2e assert QR chỉ là
  img vietqr.app (S35:269). Ba bằng chứng → kiến trúc cố ý.

## CF (xung đột dữ liệu)

- Không phát hiện xung đột giữa mã ↔ test ↔ schema trong phạm vi feature này.
  (Ghi chú: e2e S34 test component ở apps/web nhưng được plan gán cho feature student-tuition
  — đã xử lý như OQ-01, không tính là CF.)
