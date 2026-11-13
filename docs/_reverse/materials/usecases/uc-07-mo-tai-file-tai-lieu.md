---
feature: materials
type: reverse-usecase
uc: UC-07
status: draft
updated: "2026-11-12"
---

# UC-07 — Mở / tải file tài liệu

a. **Mục tiêu:** Người dùng có quyền đọc mở xem hoặc tải về nội dung file của
   một tài liệu; audio/video phát được ngay trong trình duyệt và tua được, file
   tài liệu tải về nguyên vẹn với tên gốc.
b. **Actor:** Giáo viên, Trợ giảng (mọi vai đọc); học viên có đường riêng ở
   UC-09.
c. **Tiền điều kiện:** Đã đăng nhập; tài liệu loại file/audio-video (liên kết
   mở thẳng URL gốc, không qua đường này).
d. **Luồng chính (F5):**
   1. Trên dòng tài liệu: audio/video có nút "Phát" (mở inline) và "Tải xuống";
      tài liệu chỉ có "Tải xuống"; cả hai đều qua đường phục vụ file kèm phiên
      đăng nhập (FR-14).
   2. Trình duyệt lấy file theo dải byte khi phát/tua — máy chủ trả đúng phần
      được hỏi (206) (FR-14).
   3. File về đúng định dạng đã lưu, kèm bộ header khóa (không đoán kiểu, không
      chèn khung khác, không lưu cache chia sẻ) (BR-07).
   4. "Tải xuống" ép nhận file đính kèm với tên gốc đầy đủ dấu.
e. **Luồng thay thế:**
   - 2a. Dải byte yêu cầu vượt quá dung lượng → máy chủ từ chối 416 kèm tổng
     dung lượng (E-25).
   - 1a. Tài liệu đã bị xóa / id lạ → 404 (E-07).
   - 1b. Kho chưa cấu hình → "Kho file tài liệu đang tạm ngưng…" (E-23).
   - 3a. Định dạng chưa biết (không trong danh sách lưu) → vẫn tải về an toàn
     với kiểu chung chung, không bao giờ mở như trang web (BR-07).
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần); file phục vụ đúng byte đã
   lưu, không bao giờ thực thi trong trình duyệt.
g. **Quy tắc liên quan:** FR-14, FR-25; BR-01, BR-02, BR-07.
h. **Truy vết:** apps/web/src/components/materials/material-item.tsx:67-107;
apps/web/src/lib/repos/materials.ts:401-404;
apps/server/src/routes/materials.ts:1182-1203;
apps/server/src/lib/material-file-response.ts:14-112;
apps/server/src/lib/material-file-response.test.ts:1-184.
