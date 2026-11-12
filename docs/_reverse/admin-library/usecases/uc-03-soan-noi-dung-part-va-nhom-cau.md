---
feature: admin-library
type: reverse-usecase
uc: UC-03
status: draft
updated: "2026-11-12"
---

# UC-03 — Soạn nội dung part và nhóm câu

a. **Mục tiêu:** Admin nhập nội dung từng part — intro, đoạn văn/phiên âm bản, câu
   hỏi, nhóm câu, ngân hàng đáp án, ghim ảnh — sao cho đề đạt được điều kiện xuất bản
   mà không phá dữ liệu cũ (đặc biệt nhóm câu hỏng). 🟡 (mục tiêu tổng quát hóa từ
   form + luật; OQ-06)
b. **Actor:** Admin.
c. **Tiền điều kiện:** Đề tồn tại; đang ở trang soạn; slot part thuộc khung kỹ năng.
   Nếu đề đang xuất bản: nội dung mới phải vẫn đạt luật sẵn sàng.
d. **Luồng chính (truy vết F3):**
   1. Chọn tab part trong khung (p1-p3 / s1-s4) → form chia tab nội dung / câu hỏi.
   2. Soạn; đổi dạng bài giữ nguyên nội dung câu đã có (chỉ câu rỗng nhận hình mới)
      (FR-14).
   3. Rời ô → lưu ngay part (blur), xác nhận "Đã lưu <part>" (FR-38).
   4. Nếu đề đang xuất bản: server tự chấm lại luật trên nội dung mới (tên audio lấy
      từ bản ghi hiện có) — đạt thì lưu tiếp, không phải hạ ngược (FR-15, BR-09).
   5. Cần xem tổng thể → mở xem trước (UC-08).
e. **Luồng thay thế:**
   - 3a. Part có nhóm câu hỏng trên server → banner: "Nhóm câu hỏi đã lưu trên server
     hỏng định dạng nên đang được ẩn. Lưu bình thường sẽ bị chặn để tránh xóa nhầm —
     bấm «Lưu đè nhóm hỏng» nếu chắc chắn muốn thay thế." Lưu thiếu xác nhận → 409
     GROUPS_CORRUPT (E-11) (FR-18, BR-05).
   - 3b. Bấm «Lưu đè nhóm hỏng» → ghi đè có log lý do (FR-18; SM-02 hỏng→lành).
   - 3c. Snapshot cũ: nhóm đã lành trên server nhưng client vẫn gửi cờ → 409
     GROUPS_NOT_CORRUPT "Nhóm câu đã được phục hồi trên server — tải lại trang." (FR-19).
   - 3d. Slot ngoài khung / part-body lệch đường dẫn → 404 PART_NOT_FOUND / 400 (E-07, E-05).
   - 3e. Đề đang xuất bản mà nội dung mới hỏng luật → 400 NOT_READY kèm lý do từng
     part (E-08).
   - 3f. Rời trang khi còn thay đổi chưa lưu → hộp thoại xác nhận "Còn thay đổi chưa
     lưu. Rời trang bây giờ sẽ mất các thay đổi này — tiếp tục?" (FR-37).
f. **Hậu điều kiện:** Part được lưu trọn vẹn (câu hỏi + nhóm + ngân hàng + ảnh); các
   cột audio KHÔNG đổi; đề thay đổi thời gian cập nhật (nổi lên đầu danh sách).
g. **Quy tắc liên quan:** FR-14..FR-19, FR-37, FR-38, FR-40; BR-04, BR-05, BR-09.
h. **Truy vết:** apps/server/src/routes/admin-library.ts:616-696, :165-201;
apps/admin/src/components/library/part-form.tsx:1-946 (banner :804-826);
apps/admin/src/routes/_auth/library/tests/$testId.tsx:281-314, :552-566;
apps/server/src/routes/admin-library.test.ts:1075-1247;
packages/api/src/library-contracts.ts:124-252.
