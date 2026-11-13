---
feature: admin-library
type: reverse-usecase
uc: UC-02
status: draft
updated: "2026-11-12"
---

# UC-02 — Tạo bộ đề mới

a. **Mục tiêu:** Admin khởi tạo một đề IELTS theo kỹ năng (đọc hoặc nghe) với metadata
   đầy đủ để bắt đầu soạn. 🟡 (mục tiêu — suy từ form; OQ-01)
b. **Actor:** Admin.
c. **Tiền điều kiện:** Đã qua cổng admin; chưa có ràng buộc gì khác (tạo đề nháp tự do).
d. **Luồng chính (truy vết F2):**
   1. Từ trang danh sách bấm "Tạo bộ đề" → form tạo (FR-06).
   2. Nhập tiêu đề (bắt buộc, ≤200 ký tự), mô tả, thời lượng (mặc định 1 giờ), bộ
      sưu tập, nhóm đề, chọn kỹ năng đọc/nghe (FR-06).
   3. Gửi tạo → hệ thống áp khung slot theo kỹ năng (đọc 3, nghe 4) làm giới hạn soạn, chưa tạo dòng part nào, đề luôn ở
      trạng thái nháp (FR-06, FR-07, BR-02, BR-03).
   4. Chuyển thẳng vào trang soạn đề mới tạo.
e. **Luồng thay thế:**
   - 2a. Thiếu tiêu đề / sai hình dữ liệu → 400 (E-05); form chặn phía client trước.
   - 3a. Gửi thiếu origin chuẩn → 403 (E-03); sai kiểu nội dung → 415 (E-04).
f. **Hậu điều kiện:** Tồn tại đề nháp chưa có dòng part nào (các slot trống theo khung); chưa nhìn thấy ở phía
   học viên.
g. **Quy tắc liên quan:** FR-06, FR-07; BR-01 (kỹ năng chốt từ lúc tạo), BR-02, BR-03.
h. **Truy vết:** apps/server/src/routes/admin-library.ts:480-502, :297-299;
apps/admin/src/routes/_auth/library/tests/new.tsx:1-122;
packages/api/src/library-contracts.ts:74-88.
