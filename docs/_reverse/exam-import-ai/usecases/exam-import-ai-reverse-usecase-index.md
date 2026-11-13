# exam-import-ai — Use Case Index

| ID | Tên UC | Actor chính | Mô tả 1 câu | FR chính | BR chính | Error chính | Nguồn | Nhãn |
|----|--------|-------------|-------------|----------|----------|-------------|-------|------|
| UC-01 | Nhập đề thi bằng AI | Giáo viên / Chủ trung tâm | Tải tệp đề → AI bóc tách trừ 5 Credit → đối chiếu 2 cột | FR-001..010, 020..022 | BR-001, 002, 003, 006, 011, 012, 013 | E-001, E-003, E-004, hard, disabled, 401, 403 | S1, S5, S9, S20 | ✅ |
| UC-02 | Mở lại bản nháp đã nhập | Giáo viên / TA (xem) | Mở `?job=<id>` để xem/tiếp tục làm việc với kết quả cũ | FR-010, 022, 023, 024 | BR-012 | E-404, bản nháp hỏng | S20, S22 | ✅ |
| UC-03 | Tải lại tệp trùng (0 Credit) | Giáo viên / Chủ trung tâm | Hệ thống nhận tệp đã nhập thành công → banner trùng + mở lại nháp cũ, không mất tiền | FR-011, 012, 013 | BR-003 | (không có lỗi — nhánh không tốn tiền) | S7, S24, S32 | ✅ |
| UC-04 | Thử bóc tách lại AI | Giáo viên / Chủ trung tâm | Sau thất bại E-004, tạo lượt thử mới tái dùng file đã lưu | FR-014, 015 | BR-002, 006, 009 | E-004, 409 not_retryable, 410 file_missing, E-001 | S1:455-583, S30 | ✅ |
| UC-05 | Chỉnh sửa bản nháp (0 Credit) | Giáo viên / Chủ trung tâm | Sửa tay tên/ kỹ năng/ thời gian/ passage/ câu hỏi; server bảo toàn nhãn rà soát | FR-017, 025 | BR-005 | 409 INVALID_STATE, 400/422 INVALID_DRAFT, 403, 415 | S1:590-678, S11 | ✅ |
| UC-06 | Lưu vào Ngân hàng đề | Giáo viên / Chủ trung tâm | Xuất bản draft thành bộ đề + prompt, có cổng xác nhận và idempotent | FR-018, 019, 025 | BR-004, 005, 007, 008, 010 | 422 review/too_many/mixed/invalid_draft, 404, 409 | S11, S29 | ✅ |
| UC-07 | Theo dõi ví Credit | Mọi thành viên org | Xem số dư + đơn giá trên màn import và GET ví | FR-021 | BR-001, 011 | 401 | S14, S33 | ✅ |
| UC-08 | Dọn lượt nhập treo (system) | Hệ thống (lazy sweep) | Job processing quá 150s được hoàn credit + mark thất bại ở lần chạm kế tiếp | FR-016 | BR-002, 006 | (nội bộ — E-004 reason timeout) | S6 | ✅ |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR | BR | Error |
|----|----|----|-------|
| UC-01 | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-020, FR-021, FR-022 | BR-001, BR-002, BR-003, BR-006, BR-011, BR-012, BR-013 | E-001, E-003, E-004, E-hard, E-disabled, E-401, E-403-role |
| UC-02 | FR-010, FR-022, FR-023, FR-024 | BR-012 | E-404 |
| UC-03 | FR-011, FR-012, FR-013 | BR-003 | (không lỗi nghiệp vụ; lỗi lookup → fail-open) |
| UC-04 | FR-014, FR-015 | BR-002, BR-006, BR-009 | E-004, E-409-retry, E-410, E-001 |
| UC-05 | FR-017, FR-025 | BR-005 | E-409-state, E-draft, E-403-role |
| UC-06 | FR-018, FR-019, FR-025 | BR-004, BR-005, BR-007, BR-008, BR-010 | E-review, E-parts, E-mixed, E-draft, E-404, E-409-state |
| UC-07 | FR-021 | BR-001, BR-011 | E-401 |
| UC-08 | FR-016 | BR-002, BR-006 | (E-004 reason timeout — ghi job, không trả client) |
