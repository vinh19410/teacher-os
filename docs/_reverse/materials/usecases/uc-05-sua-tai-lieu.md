---
feature: materials
type: reverse-usecase
uc: UC-05
status: draft
updated: "2026-11-12"
---

# UC-05 — Sửa tài liệu

a. **Mục tiêu:** Giáo viên chỉnh tên hiển thị, mô tả hoặc vị trí thư mục của một
   tài liệu mà không phải xóa-tạo lại (giữ nguyên liên kết buổi và lịch sử).
b. **Actor:** Giáo viên có quyền ghi.
c. **Tiền điều kiện:** Tài liệu còn tồn tại trong tổ chức; đang thấy nút "Sửa"
   trên dòng tài liệu.
d. **Luồng chính:**
   1. Bấm "Sửa" trên dòng tài liệu → hộp thoại hiện Tiêu đề, Mô tả, Thư mục với
      giá trị hiện có (FR-12).
   2. Sửa một hoặc vài trường; bấm Lưu → máy chủ chỉ nhận đúng 3 trường này, ghi
      đè mốc cập nhật (FR-12).
   3. Thành công → toast, danh sách tự làm mới và xếp lại theo mới-sửa-trước.
e. **Luồng thay thế:**
   - 2a. Tiêu đề rỗng sau trim → "Nhập tiêu đề tài liệu." (E-27); vượt 200 ký tự
     hoặc sai dạng → 400 (E-05).
   - 2b. Gửi không có gì để sửa → hợp đồng từ chối 400 (E-05, BR-06).
   - 2c. Thư mục đích lạ → "Thư mục không còn tồn tại — có thể đã bị xóa."
     (E-08).
   - 2d. Tài liệu vừa bị người khác xóa → "Tài liệu không còn tồn tại — có thể
     đã bị xóa." (E-07).
   - Kiểu cố: KHÔNG có đường sửa loại tài liệu, URL, hay file sau khi tạo —
     muốn đổi thì xóa và tạo lại (BR-06).
f. **Hậu điều kiện:** Thông tin hiển thị và vị trí thư mục cập nhật; liên kết
   buổi, giáo trình và object không hề động đến.
g. **Quy tắc liên quan:** FR-12, FR-25; BR-01, BR-06.
h. **Truy vết:** apps/web/src/components/materials/material-dialogs.tsx:435-511;
apps/server/src/routes/materials.ts:1100-1133;
packages/api/src/material-contracts.ts:398-413.
