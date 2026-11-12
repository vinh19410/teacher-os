---
feature: student-tuition
type: reverse-usecase
uc: UC-03
status: draft
author: vinh19410
updated: "2026-11-12"
---

# UC-03 — Nhận tiền về tự động khi đang xem

a. **Mục tiêu:** Học viên chuyển khoản xong quay lại tab — thấy trạng thái đổi thành "Đã
   thanh toán đủ" mà không cần làm gì, trong giới hạn 15 phút. 🟡 (khoảng "người dùng thật
   quay lại sau cap" chưa có cơ chế — OQ-12)
b. **Actor:** Học viên (bị động — hệ thống tự chạy).
c. **Tiền điều kiện:** Đang ở trang chi tiết với panel payable (UC-02 kết thúc ở Open/
   Partial); tiền về qua đường đối soát thuộc tuition-invoicing (cross-ref).
d. **Luồng chính (truy vết F3):**
   1. Interval 5 giây đặt khi còn phải thu (FR-26).
   2. Mỗi tick: tab ẩn → bỏ lượt; quá 15 phút → dừng hẳn (FR-26, NFR-01, NFR-02).
   3. Tăng bộ đếm làm mới trong khóa cache → fetch mới, không dính cache (INF-2).
   4. Tiền về đủ → panel "Đã thanh toán đủ", `payable` false → interval tự dọn (máy 3,
      srs/...states.md).
e. **Luồng thay thế:**
   - 2a. Tab ẩn cả phiên → không có request nào ngoài fetch đầu (NFR-01).
   - 2b. Het 15 phút vẫn chưa về → dữ liệu cuối giữ nguyên; /pay công khai có nút làm
     mới, portal không (OQ-12).
f. **Hậu điều kiện:** Panel phản ánh trạng thái mới nhất trong cửa sổ cap; không ghi DB
   từ phía học viên.
g. **Quy tắc liên quan:** FR-26; BR-04, BR-05; NFR-01, NFR-02.
h. **Truy vết:** apps/student/src/routes/_auth/tuition/$invoiceId.tsx:14-39;
   apps/student/src/lib/repos/payments-portal.ts:1-4;
   apps/web/src/lib/repos/payments.ts:13-16; apps/web/src/routes/pay.$token.tsx:18.
