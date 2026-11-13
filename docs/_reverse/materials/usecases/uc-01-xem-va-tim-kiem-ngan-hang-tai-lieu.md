---
feature: materials
type: reverse-usecase
uc: UC-01
status: draft
updated: "2026-11-12"
---

# UC-01 — Xem và tìm kiếm ngân hàng tài liệu

a. **Mục tiêu:** Giáo viên/trợ giảng nhìn một trang biết ngân hàng có những tài
   liệu nào, nằm ở thư mục nào, tài liệu nào đang được dùng ở bao nhiêu buổi — để
   tìm nhanh tài liệu cũ trước khi soạn bài hoặc gắn vào buổi học. 🟡 (nhãn "Dùng
   ở N buổi" chỉ đếm buổi thật, không phản ánh lượt dùng trên giáo trình — OQ-02)
b. **Actor:** Giáo viên, Trợ giảng (web, đã đăng nhập); mọi vai đọc đều xem được,
   vai chỉ-đọc không thấy nút ghi.
c. **Tiền điều kiện:** Đã đăng nhập vào tổ chức; không có điều kiện dữ liệu nào
   khác (trang rỗng là trạng thái chính đáng).
d. **Luồng chính (truy vấn F1):**
   1. Mở mục "Tài liệu" (nhóm "Giảng dạy") trên điều hướng hoặc gõ địa
      chỉ /materials (FR-01).
   2. Trang hiện tiêu đề "Tài liệu" + mô tả; nếu có quyền ghi, hai nút "Thêm liên
      kết" và "Tải file lên" xuất hiện (FR-02, FR-26).
   3. Panel trái hiện "Tất cả tài liệu", "Chưa xếp thư mục", rồi cây thư mục thụt
      lề; chọn một mục ghi thư mục lên URL (FR-04, FR-03).
   4. Gõ ô tìm kiếm ("Tìm theo tiêu đề, mô tả hoặc tên file…") — sau 300ms ngừng
      gõ, từ khóa đẩy lên URL và danh sách tải lại từ máy chủ (FR-03, FR-08).
   5. Chọn chip loại (Tất cả / File / Liên kết / Audio/Video kèm số đếm) — lọc
      ngay trên danh sách đã tải (FR-05).
   6. Mỗi dòng hiện icon loại, tiêu đề, mô tả, dòng meta, đường dẫn thư mục, nhãn
      "Dùng ở N buổi", và nút mở/tải theo loại (FR-06, UC-07).
e. **Luồng thay thế:**
   - 4a. Từ khóa vượt 100 ký tự / loại lạ trên URL → máy chủ trả 400 (E-06).
   - 5a. Lọc xong không còn dòng → "Không có tài liệu nào phù hợp với bộ lọc." +
     nút "Xóa bộ lọc" (FR-07).
   - 5b. Trang rỗng chưa lọc → "Chưa có tài liệu nào" + mô tả theo quyền + 2 nút
     hành động nếu có quyền ghi (FR-07).
   - 3a. Thư mục trong URL đã bị xóa → "Thư mục này không còn tồn tại." + nút
     "Xem tất cả tài liệu" (FR-07, E-08).
   - 4b. Lỗi máy chủ → "Không tải được danh sách tài liệu." + "Thử lại" (FR-07);
     mất mạng → câu dự phòng (E-29).
   - 1a. Chưa đăng nhập → về đăng nhập (E-01); vai không có quyền đọc → câu từ
     chối quyền (E-02).
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần); URL phản ánh đúng bộ lọc
   đang xem nên tải lại/chia sẻ giữ nguyên.
g. **Quy tắc liên quan:** FR-01..FR-09, FR-26; BR-01, BR-02, BR-18.
h. **Truy vết:** apps/web/src/routes/_auth/materials/index.tsx:58-98,161-208,217-501;
apps/web/src/lib/repos/materials.ts:281-340,470-490;
apps/server/src/routes/materials.ts:161-174,989-1041;
apps/web/src/components/layout/sidebar.tsx:72-78;
apps/web/src/routes/_auth/materials/index.test.tsx:138-449;
apps/server/src/routes/materials.test.ts:971-1027,1443-1457.
