# schedule-reverse-usecase-index.md — Danh mục use case (feature `schedule`)

## Bảng UC

| ID | Tên UC | Actor | Mô tả một dòng | File chi tiết |
|----|--------|-------|----------------|---------------|
| UC-schedule-01 | Xem lịch dạy và chuyển Tháng/Tuần/Ngày | Giáo viên | Mở /schedule, đọc lịch ở 3 độ sâu, điều hướng thời gian bằng URL | [uc-01-xem-lich.md](./uc-01-xem-lich.md) |
| UC-schedule-02 | Tạo sự kiện vận hành | Giáo viên | Thêm sự kiện ngoài lịch lớp, hiển thị ngay trên view đang mở | [uc-02-tao-su-kien.md](./uc-02-tao-su-kien.md) |
| UC-schedule-03 | Xóa sự kiện vận hành | Giáo viên | Gỡ sự kiện nhập nhầm qua xác nhận 2 bước | [uc-03-xoa-su-kien.md](./uc-03-xoa-su-kien.md) |
| UC-schedule-04 | Đi tới ca học / kỳ nghỉ từ lịch (điểm chạm biên) | Giáo viên | Mở hộp thoại ca học để điểm danh/sửa; mở hộp thoại lịch nghỉ/hoàn tác — nghiệp vụ thuộc feature tương ứng | [uc-04-diem-cham-ca-hoc-ky-nghi.md](./uc-04-diem-cham-ca-hoc-ky-nghi.md) |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan | Trạng thái mã hóa |
|----|--------------|--------------|-----------------|-------------------|
| UC-schedule-01 | FR-001, FR-002, FR-003, FR-004, FR-005, FR-010, FR-011, FR-013, NFR-001, NFR-003, NFR-006, NFR-009 | BR-007, BR-008, BR-009, BR-010, BR-011, BR-012, BR-013 | E-010 (scrub URL), E-009 (chip thiếu snapshot) | ✅ (test view-model 62 test + e2e đổi view đo ≤2s) |
| UC-schedule-02 | FR-006, FR-008, FR-009, FR-012, NFR-002, NFR-004, NFR-005, NFR-007, NFR-008 | BR-001, BR-002, BR-003, BR-004, BR-005 | E-001, E-002, E-003, E-004, E-006, E-007, E-008 | ✅ (8 test API + 7 test schema + 2 test hộp thoại + e2e tạo sự kiện) |
| UC-schedule-03 | FR-007, FR-008, FR-009, FR-012, NFR-002, NFR-005, NFR-007, NFR-008 | BR-006 | E-001, E-005, E-007 | ✅ (3 test DELETE API + test UI xóa chip) |
| UC-schedule-04 | FR-014, FR-015, NFR-001 | BR-010, BR-014 | E-011 (điểm chạm — xử lý ở SRS holidays/classes) | ✅ render / 🟡 nghiệp vụ thuộc feature khác (OQ-2 liên quan vai trò không áp dụng cho UC này) |

## Phủ lỗi — kiểm tra phủ đủ ma trận

- Mỗi lỗi trong ma trận đều có ít nhất một test server hoặc test UI khóa (chi tiết `_evidence.md` §3): E-001/E-002/E-003/E-004/E-005 khóa bằng `apps/server/src/routes/events.test.ts:152-190,260-296`; E-003/E-008 khóa bằng `apps/web/src/components/schedule/org-event-modal.test.tsx:73-117`; E-001 khóa client bằng `apps/web/src/lib/repos/events.ts:67-70,106-109` (đường reauth) — phần hành vi sau khi reauth thuộc feature auth. 🔵
- E-009 (chip thiếu snapshot) không có test riêng — mã phòng vệ, kỳ vọng không xảy ra. 🟡 (nhẹ — không đưa vào danh sách OQ của reverse-gaps.md vì không blocking; ghi nhận tại đây)
