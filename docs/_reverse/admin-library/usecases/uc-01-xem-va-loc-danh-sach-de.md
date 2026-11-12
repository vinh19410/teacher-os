---
feature: admin-library
type: reverse-usecase
uc: UC-01
status: draft
updated: "2026-11-12"
---

# UC-01 — Xem và lọc danh sách đề

a. **Mục tiêu:** Admin xem toàn bộ đề thư viện của hệ thống để tìm đề cần soạn tiếp,
   kiểm tra đề nào thiếu audio, hoặc vào sửa/xóa. 🟡 (mục tiêu sử dụng — suy từ cấu
   trúc bảng + chip lọc; OQ-01)
b. **Actor:** Admin.
c. **Tiền điều kiện:** Đã đăng nhập với vai trò admin, email trong danh sách cho phép.
d. **Luồng chính (truy vết F1):**
   1. Mở mục "Thư viện" trên console → trang danh sách đề (FR-01).
   2. Chọn chip kỹ năng (Đọc/Nghe) và chip trạng thái (Nháp/Đã xuất bản); hệ thống
      đồng bộ bộ lọc vào URL để chia sẻ được (FR-05).
   3. Gõ từ khóa — phủ tiêu đề, mô tả, bộ sưu tập, nhóm đề (FR-05).
   4. Bảng hiển thị: tên (liên kết sang soạn), kỹ năng, "bộ sưu tập · nhóm đề", nhãn
      trạng thái, "N part · M câu", thời gian cập nhật, cờ đủ audio cho đề nghe (FR-05).
e. **Luồng thay thế:**
   - 2a. Tham số lọc giá trị lạ trên URL → server từ chối 400 (E-24).
   - 4a. Chưa có đề nào → khối trống "Chưa có bộ đề nào." + nút "Tạo bộ đề".
   - 4b. Có đề nhưng lọc hụt → "Không có bộ đề nào khớp bộ lọc." + nút "Xóa bộ lọc".
   - 4c. Lỗi tải → "Không tải được danh sách bộ đề. Vui lòng thử lại." + nút "Thử lại".
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần).
g. **Quy tắc liên quan:** FR-05 (gồm sắp đề mới cập nhật trước).
h. **Truy vết:** apps/server/src/routes/admin-library.ts:404-477;
apps/admin/src/routes/_auth/library/tests/index.tsx:139-279;
apps/admin/src/components/library/test-table.tsx:56-119;
apps/admin/src/components/library/library-filters.ts:1-169.
