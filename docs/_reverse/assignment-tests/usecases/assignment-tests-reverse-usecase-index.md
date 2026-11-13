# Use case index — assignment-tests (reverse)

Actor chính: **GV** = Giáo viên (org member). Hệ thống phụ: Kernel snapshot, ngân hàng prompt, D1.

## Danh sách UC

| ID | Tên UC | Actor | Mô tả một dòng | File |
|----|--------|-------|----------------|------|
| UC-01 | Tạo bộ đề full test | GV | Điền header, tạo draft, tự gửi parts đã gán, sang trang edit | `uc-01-tao-bo-de.md` |
| UC-02 | Ghép part vào slot | GV | Chọn từ ngân hàng hoặc soạn mới trong slot (lockPart) | `uc-02-ghep-part-vao-slot.md` |
| UC-03 | Chỉnh sửa part đã gán | GV | Mở composer với baseline, PATCH field-diff | `uc-03-chinh-sua-part.md` |
| UC-04 | Gỡ part khỏi slot | GV | Bỏ prompt khỏi test, prompt ở lại ngân hàng | `uc-04-go-part.md` |
| UC-05 | Cập nhật thông tin bộ đề | GV | PATCH metadata; skill bất biến | `uc-05-cap-nhat-bo-de.md` |
| UC-06 | Soát đáp án bộ đề | GV | Dán key, so khớp, áp thay đổi vào prompt | `uc-06-soat-dap-an.md` |
| UC-07 | Xem trước bộ đề | GV | Paper học viên không lộ đáp án | `uc-07-xem-truoc.md` |
| UC-08 | Phục hồi bản nháp soạn dở | GV | Autosave localStorage + banner tiếp tục/hủy | `uc-08-phuc-hoi-ban-nhap.md` |
| UC-09 | Xóa bộ đề | GV (hiện chỉ API) | Batch xóa parts + test | `uc-09-xoa-bo-de.md` |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR | BR | Error chính |
|----|----|----|-------------|
| UC-01 | FR-001, FR-017, FR-004 (gửi parts sau tạo), FR-014 | BR-003, BR-004, BR-015 | E-003, E-013, E-016, E-017, E-018 |
| UC-02 | FR-004, FR-007, FR-008, FR-009, FR-015 | BR-002, BR-005, BR-007, BR-008, BR-010, BR-014 | E-007, E-008, E-009, E-010, E-011, E-012 |
| UC-03 | FR-010, FR-012 (cùng PATCH prompt) | BR-014 | E-012 (gián tiếp qua content-lock prompt), E-018 |
| UC-04 | FR-011, FR-004 | BR-007, BR-008 | E-012 |
| UC-05 | FR-002, FR-017 | BR-001, BR-004 | E-004, E-005, E-016, E-017 |
| UC-06 | FR-012, FR-010 (Apply là PATCH prompt) | BR-011 | E-014, E-015 |
| UC-07 | FR-013, FR-005 | BR-009 | E-019 |
| UC-08 | FR-014, FR-007 | — | E-018 (không liên quan trực tiếp) |
| UC-09 | FR-003, FR-015 | BR-013 | E-004, E-001 |
