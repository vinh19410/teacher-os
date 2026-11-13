---
feature: materials
type: reverse-usecase
uc: UC-04
status: draft
updated: "2026-11-12"
---

# UC-04 — Tải file lên ngân hàng

a. **Mục tiêu:** Giáo viên đưa file học liệu (PDF, ảnh, Office, MP3/M4A/MP4) vào
   ngân hàng của trung tâm để gắn vào buổi học sau này; file rác/giả mạo phải bị
   chặn trước khi tốn băng thông và dung lượng kho.
b. **Actor:** Giáo viên có quyền ghi.
c. **Tiền điều kiện:** Đang ở trang Tài liệu (hoặc modal tài liệu buổi học / bộ
   chọn trong form tạo buổi); kho file của triển khai đã cấu hình (không thì
   chỉ dùng được liên kết).
d. **Luồng chính (F2):**
   1. Bấm "Tải file lên" → hộp thoại hiện vùng chọn file và gợi ý "PDF,
      PNG/JPG/WEBP, DOCX/PPTX/XLSX tối đa 25 MB; MP3/M4A/MP4 tối đa 95 MB."
      (FR-11).
   2. Chọn file → client kiểm NGAY bằng cùng hàm với máy chủ: định dạng trong
      danh sách 10 MIME, dung lượng trong trần 25 MiB (tài liệu) / 95 MiB
      (audio-video) (FR-24, BR-07, BR-09, BR-19).
   3. Chọn thư mục đích (mặc định giữ lựa chọn hiện tại; upload từ bộ chọn buổi
      luôn về thư mục gốc) và bấm tải lên (FR-11).
   4. Client gửi nguyên byte file qua PUT kèm tên file trong header riêng;
      server kiểm lại 4 lớp: header (MIME + trần) → tên file khớp đuôi → 64 byte
      đầu khớp chữ ký nhị phân → byte thật đúng bằng khai báo (FR-11, BR-08).
   5. File stream thẳng vào kho theo key `<mã tổ chức>/<mã tài liệu>`, rồi ghi
      dòng tài liệu với tiêu đề ban đầu là tên file (BR-10).
   6. Thành công → toast, hộp thoại đóng, danh sách tự làm mới.
e. **Luồng thay thế:**
   - 2a. File sai định dạng → "Định dạng chưa hỗ trợ. Chỉ nhận PDF, ảnh
     PNG/JPG/WEBP, DOCX/PPTX/XLSX, MP3/M4A/MP4." ngay tại chỗ chọn, KHÔNG gửi
     byte nào (E-22, E-28, BR-19).
   - 2b. File quá trần → "File quá lớn — tối đa {dung lượng}." ngay tại chỗ
     (E-21, E-28).
   - 2c. File rỗng/không đọc được kích thước → "File không hợp lệ hoặc rỗng.
     Hãy chọn file khác." (E-20, E-28).
   - 3a. Bấm tải khi chưa có file → "Chọn một file để tải lên." (E-27).
   - 4a. Máy chủ từ chối độc lập với cùng nhóm câu lỗi (E-20, E-21, E-22) —
     client không thể qua mặt lớp kiểm của server (BR-19).
   - 4b. Kho chưa cấu hình → "Kho file tài liệu đang tạm ngưng. Liên kết vẫn
     dùng được; thử tải file lại sau." (E-23).
   - 5a. Ghi dữ liệu lỗi sau khi file đã vào kho → object vừa ghi bị dọn sạch,
     người dùng thấy lỗi máy chủ để thử lại (E-24, BR-10).
   - 3b. Thư mục đích vừa bị xóa → "Thư mục không còn tồn tại…" (E-08).
f. **Hậu điều kiện:** Một tài liệu loại file/audio-video tồn tại trong ngân
   hàng, có object riêng trong kho private; thất bại ở bất kỳ bước nào để lại
   đúng trạng thái cũ (không object thừa, không dòng thừa).
g. **Quy tắc liên quan:** FR-11, FR-24, FR-25, FR-26; BR-01, BR-02, BR-07,
   BR-08, BR-09, BR-10, BR-19.
h. **Truy vết:** apps/web/src/components/materials/material-dialogs.tsx:346-433;
apps/web/src/lib/repos/materials.ts:224-271;
packages/api/src/material-contracts.ts:18-26,115-301,303-330;
apps/server/src/routes/materials.ts:302-432,1067-1098;
apps/server/src/routes/materials.test.ts:853-970,2029-2302;
apps/web/src/routes/_auth/materials/index.test.tsx:274-291;
apps/e2e/specs/material-upload-student.spec.ts:1-290.
