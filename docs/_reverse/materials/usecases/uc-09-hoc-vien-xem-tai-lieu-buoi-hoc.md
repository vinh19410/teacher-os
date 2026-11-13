---
feature: materials
type: reverse-usecase
uc: UC-09
status: draft
updated: "2026-11-12"
---

# UC-09 — Học viên xem tài liệu buổi học

a. **Mục tiêu:** Học viên mở đúng tài liệu của buổi mình học (cả tài liệu giáo
   viên gắn trực tiếp lẫn tài liệu theo giáo trình) để xem/tải/phát; học viên của
   lớp khác không thể dò được tài liệu của lớp mình.
b. **Actor:** Học viên (ứng dụng học viên, đã đăng nhập).
c. **Tiền điều kiện:** Có đăng ký ĐANG HỌC trong lớp; lớp có dòng bài học vào
   đúng ngày được hỏi.
d. **Luồng chính (F7):**
   1. Mở buổi học trong ứng dụng → mục tài liệu liệt kê tài liệu của buổi đó,
      có cả tài liệu từ giáo trình của bài đang dạy (FR-22).
   2. Mở liên kết → tab mới; audio/video phát được; tài liệu tải về — qua đường
      phục vụ file dành cho học viên, hỗ trợ tua theo dải byte như giáo viên
      (FR-23).
   3. Thông tin hiển thị chỉ gồm tiêu đề, mô tả, loại, định dạng, dung lượng,
      tên file, thứ tự — không bao giờ có key lưu trữ, người tải lên, thư mục,
      hay số buổi dùng (BR-15).
e. **Luồng thay thế:**
   - 1a. Chưa đăng nhập → yêu cầu đăng nhập (E-01).
   - 1b. Không có đăng ký đang học trong lớp này, hoặc lớp không có bài học ngày
     đó → 404 giống hệt khi lớp không tồn tại — không dò ra sự tồn tại (E-26,
     BR-16).
   - 2a. File id lạ hoặc không thuộc buổi → 404 (E-18, E-26); tài liệu giáo
     trình của đúng bài buổi đó vẫn mở được dù chưa được gắn trực tiếp (FR-23).
   - 2b. Kho chưa cấu hình → thông báo tạm ngưng (E-23); dải byte ngoài file →
     416 (E-25).
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần); học viên chỉ nhìn thấy tài
   liệu của buổi có quyền.
g. **Quy tắc liên quan:** FR-22, FR-23; BR-01, BR-15, BR-16.
h. **Truy vết:** apps/server/src/routes/student-materials.ts:28-34,44-219;
packages/api/src/material-contracts.ts:476-497;
apps/student/src/components/class/lesson-materials.tsx:1-221;
apps/server/src/routes/materials.test.ts:1156-1426;
apps/student/src/components/class/lesson-materials.test.tsx:1-171;
apps/e2e/specs/material-upload-student.spec.ts:1-290.
