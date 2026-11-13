---
feature: admin-library
type: reverse-usecase
uc: UC-06
status: draft
updated: "2026-11-12"
---

# UC-06 — Xóa đề và xóa part

a. **Mục tiêu:** Admin dọn dữ liệu: bỏ một part sai khung, hoặc xóa hẳn một đề cùng
   toàn bộ part và âm thanh. 🟡 (mục tiêu — suy từ dialog + luật; OQ-03)
b. **Actor:** Admin.
c. **Tiền điều kiện:** Đề tồn tại. Xóa part/audio: đề phải ở nháp (đang xuất bản thì
   phải hạ trước). Xóa đề: không có điều kiện trạng thái.
d. **Luồng chính (truy vết F6):**
   1. Xóa part: đề nháp → part biến mất khỏi chi tiết (FR-20).
   2. Xóa đề: bấm "Xóa" ở dòng danh sách → hộp thoại "Xóa bộ đề?" mô tả "Bộ đề
      «<tên>» và toàn bộ part, audio bên trong sẽ bị xóa vĩnh viễn. Không thể hoàn
      tác." → xác nhận (FR-21).
   3. Hệ thống xóa đề + toàn bộ part trong MỘT lô; sau đó dọn các object audio ở nền
      — hỏng giữa chừng chỉ để object mồ côi (FR-21, BR-10).
   4. Xóa lần hai trên đề đã mất → 404 (E-06).
e. **Luồng thay thế:**
   - 1a. Đề đang xuất bản → 409 NOT_READY (E-09, BR-09).
   - 3a. Object audio dọn thất bại → chỉ log; đề vẫn xóa thành công (BR-10, OQ-08).
   - 3b. Đề đang được tham chiếu qua bản vật hóa: KHÔNG có đường chặn — hành vi chưa
     được test chốt (GAP-01, OQ-03 🟡).
f. **Hậu điều kiện:** Part hoặc đề + part biến mất; object audio có thể còn lại trong
   kho (mồ côi, dọn tay).
g. **Quy tắc liên quan:** FR-13 (mở khóa hạ ngược), FR-20, FR-21; BR-09, BR-10.
h. **Truy vết:** apps/server/src/routes/admin-library.ts:589-613, :699-720;
apps/admin/src/components/library/delete-test-dialog.tsx:1-87;
apps/server/src/routes/admin-library.test.ts:687-773.
