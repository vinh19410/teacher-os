---
feature: materials
type: reverse-usecase
uc: UC-02
status: draft
updated: "2026-11-12"
---

# UC-02 — Tổ chức thư mục tài liệu

a. **Mục tiêu:** Giáo viên dựng cây thư mục cho ngân hàng của trung tâm — tạo,
   đổi tên, di chuyển, xóa — để tài liệu được sắp theo môn/lớp/khóa và dễ tìm.
b. **Actor:** Giáo viên có quyền ghi (giáo viên / chủ trung tâm / quản trị /
   giáo viên đứng lớp); trợ giảng không thấy các nút này.
c. **Tiền điều kiện:** Đang ở trang Tài liệu (UC-01); có quyền ghi.
d. **Luồng chính (F3):**
   1. Bấm "Thư mục mới" → nhập tên 1–100 ký tự → thư mục con được tạo ngay trong
      thư mục đang xem (hoặc gốc) (FR-15, FR-04).
   2. Chọn một thư mục → panel hiện "Đổi tên", "Di chuyển", "Xóa thư mục"
      (FR-04).
   3. "Đổi tên": nhập tên mới → giữ nguyên vị trí (FR-16).
   4. "Di chuyển": chọn cha mới trên select cây (đã loại chính subtree đang di
      chuyển) → thư mục rời vị trí cũ (FR-16).
   5. "Xóa thư mục": xác nhận "Chỉ xóa được thư mục rỗng" → xóa nếu không còn
      thư mục con lẫn tài liệu (FR-17, BR-05).
   6. Thành công → toast + cây và danh sách tự làm mới.
e. **Luồng thay thế:**
   - 1a. Tên rỗng / chỉ khoảng trắng → "Nhập tên thư mục."; quá 100 ký tự →
     "Tên thư mục tối đa 100 ký tự." ngay tại form (E-27).
   - 1b. Tên có ký tự điều khiển hoặc sai dạng → máy chủ trả 400 (E-05).
   - 1c/3b/4b. Trùng tên trong cùng cha (kể cả gốc) → "Đã có thư mục cùng tên ở
     vị trí này. Hãy chọn tên khác." (E-09, BR-03).
   - 4c. Di chuyển vào chính nó/con cháu → "Không thể chuyển thư mục vào chính
     nó hoặc thư mục con của nó." (E-11, BR-04); vượt 5 cấp → "Cây thư mục tối
     đa 5 cấp — không thể đặt thư mục sâu hơn." (E-12).
   - 4d. Cha bị xóa/chéo tổ chức giữa chừng → guard SQL nguyên tử chặn, hệ thống
     đọc lại và thử 1 lần rồi mới báo xung đột ghi (E-08, E-13, BR-04).
   - 5a. Còn thư mục con hoặc tài liệu → "Thư mục còn thư mục con hoặc tài liệu.
     Hãy chuyển hoặc xóa chúng trước." (E-10).
   - 2a. Thư mục đã bị xóa bởi người khác → "Thư mục không còn tồn tại — có thể
     đã bị xóa." (E-08).
f. **Hậu điều kiện:** Cây thư mục thay đổi đúng một thao tác; tài liệu bên trong
   không bị ảnh hưởng khi đổi tên/di chuyển; xóa chỉ xảy ra với thư mục rỗng.
g. **Quy tắc liên quan:** FR-04, FR-09, FR-15, FR-16, FR-17, FR-25; BR-01,
   BR-03, BR-04, BR-05.
h. **Truy vết:** apps/web/src/routes/_auth/materials/index.tsx:503-665;
apps/web/src/components/materials/material-dialogs.tsx:118-250,513-574;
apps/web/src/components/materials/folder-select.tsx:1-55;
apps/web/src/lib/material-folders.ts:19-105;
apps/server/src/routes/materials.ts:677-985;
apps/server/src/routes/materials.test.ts:509-774.
