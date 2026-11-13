---
feature: student-tuition
type: reverse-usecase
uc: UC-01
status: draft
author: vinh19410
updated: "2026-11-12"
---

# UC-01 — Xem danh sách hóa đơn học phí

a. **Mục tiêu:** Học viên nhìn một màn hình biết mình nợ bao nhiêu, đã đóng bao nhiêu, và
   khoản nào sắp đến hạn, từ đó quyết định vào chi tiết để chuyển khoản. 🟡 (mục tiêu
   nghiệp vụ — records; số "nợ" chỉ có tổng per-portal, không có khái niệm tổng toàn tổ
   chức ở portal — OQ-11)
b. **Actor:** Học viên (student SPA).
c. **Tiền điều kiện:** Session học viên đã xác thực email; có hồ sơ học viên (tự cấp nếu
   chưa); màn hình phải hiển thị đúng cả khi có và không có hóa đơn.
d. **Luồng chính (truy vết F1):**
   1. Mở mục "Học phí" trên menu → `/tuition` (FR-01).
   2. Gate lấy hồ sơ theo phiên (FR-03).
   3. Tải danh sách qua khóa cache danh sách hóa đơn, cache 30 giây (FR-04).
   4. Header "Học phí"/"Học phí của tôi" (FR-02) + 2 ô tổng "Đã đóng"/"Còn lại" (FR-12).
   5. Khoản đã xong hiện gọn với nhãn "Đã thanh toán"; khoản chưa đủ hiện loại, hạn đóng,
      "Đã nhận X / Y" hoặc "Tổng Y", và link sang chi tiết (FR-10, FR-13).
e. **Luồng thay thế:**
   - 3a. Email chưa xác thực → view "Email chưa được xác thực" với 3 nút phục hồi (E-02).
   - 3b. Chưa có hồ sơ → view "Tài khoản chưa được liên kết" + hướng dẫn Chuông (E-03).
   - 3c. Tải thất bại → view lỗi theo mã; lỗi mạng → view mặc định (E-07, FR-05).
   - 5a. Không có hóa đơn → "Chưa có hóa đơn học phí" + mô tả (FR-07).
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần); cache 30 giây có thể trả dữ liệu cũ
   trong giới hạn staleTime.
g. **Quy tắc liên quan:** FR-01..FR-13; BR-01..BR-05, BR-09.
h. **Truy vết:** apps/student/src/routes/_auth/tuition/index.tsx:1-66;
   apps/student/src/components/overview/tuition-list.tsx:1-130;
   apps/server/src/routes/student.ts:124-210, apps/server/src/routes/student.ts:928-953;
   apps/e2e/specs/student-class-detail.spec.ts:297-307;
   apps/e2e/specs/tuition-bank-transfer.spec.ts:260-269.
