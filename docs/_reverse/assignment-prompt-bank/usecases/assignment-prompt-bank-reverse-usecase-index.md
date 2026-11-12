# Use case index — assignment-prompt-bank (reverse)

Repo: /root/projects/teacher-os @ develop d6c0f6b5. Actor chính duy nhất: **Giáo viên** (mọi role student/admin bị chặn ở bootstrap — `apps/server/src/app.ts:222-240`; trong org không có role gate riêng trên route ngân hàng — OQ-9). Actor hệ thống: **Kernel command bus / snapshot**.

## Bảng UC

| ID | Tên UC | Mục tiêu giáo viên | Mức | Luồng | File chi tiết |
|----|--------|--------------------|-----|-------|---------------|
| UC-01 | Tạo đề mới và lưu "Sẵn sàng giao" | Đưa một đề hoàn chỉnh vào ngân hàng để dùng về sau | cấp-1 mục tiêu | F1 | [uc-01](./uc-01-tao-de-luu-ngan-hang.md) |
| UC-02 | Lưu bản nháp riêng tư | Giữ nội dung chưa hoàn thiện để làm tiếp | cấp-1 | F2 | [uc-02](./uc-02-luu-ban-nhap.md) |
| UC-03 | Duyệt ngân hàng đề | Tìm/lọc/đếm đề, xem trạng thái từng đề | cấp-1 | — | [uc-03](./uc-03-duyet-ngan-hang-de.md) |
| UC-04 | Chỉnh sửa đề đã lưu | Cập nhật nội dung/metadata; bị chặn đúng chỗ khi đề đã dùng | cấp-1 | F3 | [uc-04](./uc-04-chinh-sua-de.md) |
| UC-05 | Xem trước góc nhìn học viên | Kiểm tra đề hiển thế nào cho học viên | cấp-1 | F4 | [uc-05](./uc-05-xem-truoc-de.md) |
| UC-06 | Phục hồi bản nháp soạn thảo | Không mất nội dung khi rời trang giữa chừng | cấp-2 | F5 | [uc-06](./uc-06-phuc-hoi-ban-nhap.md) |
| UC-07 | Giao đề cho lớp (touchpoint — feature classes sở hữu) | Đưa đề ready tới học viên một lớp | cấp-1 feature khác | F7 | xem spec Mục 9 + `apps/server/src/routes/kernel.ts:1511-1542` |

Khoảng trắng cố ý: không có UC xóa đề, nhân bản đề, phân quyền ngân hàng (Gap-1/5/6).

## Ma trận UC ↔ FR ↔ BR ↔ Error

* Ma trận liệt kê FR/BR/Error ở mức superset so với mục h.Truy vết từng UC — ô rộng hơn không có nghĩa mồ côi; đối chiếu mục h của từng UC để xem truy vết gọn.

| UC | FR liên quan | BR ràng buộc | Error có thể gặp | Verify by (test active — R1) |
|----|--------------|--------------|------------------|------------------------------|
| UC-01 | FR-001, FR-002, FR-004, FR-013, FR-015, FR-017, FR-018, FR-019, FR-014 | BR-001, BR-002, BR-003, BR-004, BR-005, BR-006, BR-007, BR-008, BR-009, BR-010, BR-011, BR-012, BR-013, BR-019, BR-020 | E-001, E-002, E-003, E-004, E-005, E-014, E-015, E-016, E-018 | E2E create 13 test; web new-submit 14; unit new 49 |
| UC-02 | FR-003, FR-004, FR-010, FR-014, FR-017 | BR-002, BR-007, BR-011, BR-012, BR-019 | E-001, E-005, E-015, E-018 | E2E create (draft flow :70-90) |
| UC-03 | FR-005, FR-012, FR-013 | BR-017, BR-018, BR-019 | — (chỉ trạng thái rỗng/không kết quả) | E2E assignment-bank 1 test; web index 11 test |
| UC-04 | FR-007, FR-008, FR-009, FR-011, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020 | BR-014, BR-015, BR-016, BR-020 | E-005, E-006, E-007, E-008, E-009, E-010, E-011, E-012, E-013, E-017, E-018 | API prompt-content-lock 9 test; E2E reading-types 9, map-listening 2, create (type/skill change :476-580); web new-submit 14 |
| UC-05 | FR-006, FR-020 | BR-006 | — | E2E create (preview :92-140, :437-474); web preview 12 test |
| UC-06 | FR-010, FR-016 | BR-019 (draft chỉ trên máy giáo viên) | E-020 (console.warn quá cap) | E2E create (autosave :380-435); unit draft-store |
| UC-07 | FR-013 (touchpoint) | BR-017, BR-002 | E-019, E-013 (cùng thông điệp prompt not found) | kernel.test.ts (feature classes) |
