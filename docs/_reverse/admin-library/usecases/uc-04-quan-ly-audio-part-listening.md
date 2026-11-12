---
feature: admin-library
type: reverse-usecase
uc: UC-04
status: draft
updated: "2026-11-12"
---

# UC-04 — Quản lý audio part nghe

a. **Mục tiêu:** Admin đính âm thanh cho từng part của đề nghe, thay thế khi cần, và
   kiểm tra phát lại — đảm bảo đề nghe đủ điều kiện xuất bản. 🟡 (mục tiêu — suy từ
   uploader + luật audioName; OQ-07)
b. **Actor:** Admin.
c. **Tiền điều kiện:** Đề kỹ năng nghe (đề đọc không có audio); part thuộc khung s1-s4;
   môi trường đã gắn kho audio (nếu chưa — mọi thao tác audio trả 503, E-19).
d. **Luồng chính (truy vết F4):**
   1. Trong tab nội dung của part nghe, chọn tệp → tải lên với thanh tiến trình, được
      hủy giữa chừng (FR-39).
   2. Server kiểm: dung lượng > 0 và ≤ 50 MB; kiểu trong danh sách MP3/M4A/WAV/AAC/
      OGG/WEBM; tên tệp bắt buộc (FR-22).
   3. Ghi object mới lên kho rồi mới trỏ bản ghi (so-sánh-và-đổi); thành công → thông
      tin audio hiển thị ở part (FR-23).
   4. Object cũ được dọn ở nền sau khi bản ghi đã trỏ khóa mới (FR-25, BR-08).
   5. Kiểm tra phát lại qua đường nghe bảo mật (FR-26).
e. **Luồng thay thế:**
   - 2a. Thiếu độ dài / tên tệp / thân rỗng, hoặc đề đọc → 400 INVALID_AUDIO "File
     audio không hợp lệ." (E-14).
   - 2b. Quá 50 MB → 413 "File audio vượt quá dung lượng cho phép (tối đa 50 MB)." (E-15).
   - 2c. Kiểu lạ → 415 "Định dạng audio không hỗ trợ — dùng MP3, M4A, WAV, AAC, OGG
     hoặc WEBM." (E-16).
   - 3a. Người khác đã thay giữa chừng → 409 "Audio vừa được người khác cập nhật — tải
     lại trang rồi thử lại."; object mới bị dọn, audio hiện hữu giữ nguyên (E-17, BR-07).
   - 3b. Ghi kho hỏng → 500 "audio upload failed"; bản ghi giữ khóa cũ (E-20, BR-08).
   - 4a. Xóa audio: đề đang xuất bản → 409 NOT_READY (hạ ngược trước); xóa thành công
     idempotent; thua CAS khi xóa → 409 (E-18) (FR-27, BR-09).
   - 5a. Đề/part/object lạ → 404 (E-06/E-07).
f. **Hậu điều kiện:** Part nghe có audio (khóa + tên + kiểu + cỡ + thời điểm) hoặc
   không có; bản ghi KHÔNG BAO GIỜ trỏ object thiếu.
g. **Quy tắc liên quan:** FR-22..FR-28, FR-39; BR-07, BR-08, BR-09, BR-10.
h. **Truy vết:** apps/server/src/routes/admin-library.ts:723-895;
apps/server/src/lib/media-response.ts:1-46;
apps/admin/src/lib/repos/library.ts:221-292;
apps/admin/src/components/library/audio-uploader.tsx:1-317;
apps/server/src/routes/admin-library-audio.test.ts:242-647 (working tree).
