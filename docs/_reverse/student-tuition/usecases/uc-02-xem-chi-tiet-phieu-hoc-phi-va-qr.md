---
feature: student-tuition
type: reverse-usecase
uc: UC-02
status: draft
author: vinh19410
updated: "2026-11-12"
---

# UC-02 — Xem chi tiết phiếu học phí và QR

a. **Mục tiêu:** Học viên nhận đủ thông tin để chuyển khoản đúng một lần: tài khoản nhận,
   số tiền còn nợ, nội dung chuyển khoản — QR chỉ là hướng dẫn, văn bản copy-per-field mới
   là thứ đưa vào app ngân hàng. 🔵 (3 bằng chứng: hàng memo copy riêng + memo dựng server
   mỗi lần đọc + comment "the text is what parents actually copy" — INF-3)
b. **Actor:** Học viên (student SPA).
c. **Tiền điều kiện:** Đã vào được portal (UC-01); hóa đơn thuộc học viên + tổ chức phiên;
   chưa tất toán và tổ chức đã liên kết tài khoản nhận (nếu không → panel ở trạng thái
   Paid / NoBankLink).
d. **Luồng chính (truy vết F2):**
   1. Bấm khoản chưa xong ở danh sách → `/tuition/$invoiceId` (FR-13).
   2. Tải hướng dẫn thanh toán, không tự retry (FR-14).
   3. Server backfill mã nếu hóa đơn cũ thiếu (FR-18), dựng hướng dẫn từ link hiện tại +
      số nợ hiện tại (FR-19, FR-20).
   4. Header: "← Học phí", tên, mã + tổng, 2 ô "Đã đóng"/"Còn lại" (FR-16).
   5. Panel: ảnh QR + 5 hàng Ngân hàng / Số tài khoản / Chủ tài khoản / Số tiền / Nội dung,
      copy từng trường với hint "Giữ nguyên nội dung chuyển khoản để hệ thống tự xác nhận"
      (FR-24).
e. **Luồng thay thế:**
   - 2a. Hóa đơn không mở được → "Không mở được phiếu học phí này." (E-08).
   - 3a. Đã tất toán → panel "Đã thanh toán đủ" (E-10).
   - 3b. Chưa liên kết ngân hàng → "Giáo viên chưa thiết lập nhận chuyển khoản" (E-09).
   - 5a. Ảnh QR lỗi → "Không tạo được ảnh QR", các hàng văn bản vẫn dùng được (E-11).
f. **Hậu điều kiện:** Không đổi dữ liệu ngoài lazy backfill 2 cột mã của hóa đơn (lần đọc
   đầu); phiên poll có thể khởi động nếu còn phải thu (UC-03).
g. **Quy tắc liên quan:** FR-14..FR-25; BR-01, BR-04, BR-05, BR-06.
h. **Truy vết:** apps/student/src/routes/_auth/tuition/$invoiceId.tsx:1-105;
   apps/server/src/lib/payment-instructions.ts:21-115;
   packages/ui/src/components/payments/payment-qr-panel.tsx:1-183;
   packages/api/src/lib/vietqr.ts:5-29; apps/e2e/specs/tuition-bank-transfer.spec.ts:266-272.
