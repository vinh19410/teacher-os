---
feature: materials
type: reverse-usecase
uc: UC-03
status: draft
updated: "2026-11-12"
---

# UC-03 — Thêm liên kết vào ngân hàng

a. **Mục tiêu:** Giáo viên lưu một đường dẫn học liệu trực tuyến (video, bài tập
   trực tuyến, tài liệu web) vào ngân hàng để dùng lại cho các buổi học mà không
   cần tải file.
b. **Actor:** Giáo viên có quyền ghi.
c. **Tiền điều kiện:** Đang ở trang Tài liệu hoặc modal chọn tài liệu của buổi
   học; có quyền ghi.
d. **Luồng chính:**
   1. Bấm "Thêm liên kết" → hộp thoại hiện các ô Tiêu đề, Mô tả, Liên kết, Thư
      mục (FR-10).
   2. Nhập tiêu đề (bắt buộc, 1–200 sau trim), mô tả (tùy chọn), URL, chọn thư
      mục đích (FR-10).
   3. Bấm Lưu → máy chủ kiểm URL http/https tuyệt đối và thư mục thuộc tổ chức →
      tạo tài liệu loại liên kết, trả bản ghi đầy đủ (FR-10, BR-17, BR-01).
   4. Thành công → toast, hộp thoại đóng, danh sách tự làm mới.
e. **Luồng thay thế:**
   - 2a. Tiêu đề rỗng → "Nhập tiêu đề tài liệu." tại form (E-27).
   - 2b. URL không phải http/https → "Liên kết phải bắt đầu bằng http:// hoặc
     https://." tại form; máy chủ cũng từ chối độc lập (E-27, E-05, BR-17).
   - 3a. Thư mục đích đã bị xóa → "Thư mục không còn tồn tại — có thể đã bị
     xóa." (E-08).
   - 3b. Sai dạng dữ liệu (thiếu/trường thừa) → "Dữ liệu không hợp lệ. Kiểm tra
     lại rồi thử lại." (E-05).
   - 4a. Mất mạng / lỗi không có mã → câu dự phòng, hộp thoại giữ nguyên chữ đã
     nhập (E-29); phiên hết hạn → về đăng nhập (E-01).
f. **Hậu điều kiện:** Một tài liệu loại "liên kết" thuộc tổ chức, không có
   object trong kho; mở liên kết mở thẳng URL gốc.
g. **Quy tắc liên quan:** FR-10, FR-25; BR-01, BR-06, BR-17.
h. **Truy vết:** apps/web/src/components/materials/material-dialogs.tsx:252-344;
apps/server/src/routes/materials.ts:1043-1065;
packages/api/src/material-contracts.ts:332-341,348-353,388-396;
apps/server/src/routes/materials.test.ts:775-852;
apps/web/src/routes/_auth/materials/index.test.tsx:318-341.
