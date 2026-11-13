# Use Case Index — feature `syllabus` (reverse)

| UC ID | Tên UC | Actor chính | Mức | FR liên quan | BR liên quan | Error liên quan | File chi tiết | Nhãn |
|-------|--------|-------------|-----|--------------|--------------|-----------------|---------------|------|
| UC-01 | Tạo template giáo trình (form) | Giáo viên | user-goal | FR-001, 002, 003 | BR-012 | E-002b, 003, 004, 005, 013, 030 | uc-01-tao-template-giao-trinh.md | ✅ |
| UC-02 | Tạo template từ file Excel/CSV | Giáo viên | user-goal | FR-004..009, 028, 029, 030 | BR-016, 017, 018 | E-022..029 | uc-02-tao-template-tu-file.md | ✅ |
| UC-03 | Ghi đè nội dung template từ file | Giáo viên | user-goal | FR-016, 028, 029 | BR-003, 016, 017, 018 | E-002b, 003, 006, 013, 022..029 | uc-03-ghi-de-noi-dung-template.md | ✅ |
| UC-04 | Quản trị nội dung template (module/buổi, reorder) | Giáo viên | user-goal | FR-011, 012, 013, 014, 024, 027 | BR-002, 019 | E-006, 008, 009, 010, 011, 012 | uc-04-quan-tri-noi-dung-template.md | ✅ |
| UC-05 | Gắn tài liệu ngân hàng vào bài học | Giáo viên | user-goal | FR-015, 024 | BR-013, 014 | E-019 | uc-05-gan-tai-lieu-vao-bai-hoc.md | ✅ |
| UC-06 | Xóa template giáo trình | Giáo viên | user-goal | FR-017, 010 | BR-003, 019 | E-006 | uc-06-xoa-template-giao-trinh.md | ✅ |
| UC-07 | Nhập giáo trình từ template vào lớp | Giáo viên | user-goal | FR-018, 019, 021, 022, 023 | BR-001, 002, 004, 005, 006, 007, 008, 009, 010, 013 | E-007, 014..018, 019 | uc-07-nhap-giao-trinh-vao-lop.md | ✅ |
| UC-08 | Gỡ giáo trình khỏi lớp | Giáo viên | user-goal | FR-020, 022, 023 | BR-005, 010, 011 | E-007, 020, 021 | uc-08-go-giao-trinh-khoi-lop.md | ✅ |
| UC-09 | Xem danh sách và chi tiết giáo trình | Giáo viên | summary | FR-009, 010, 011, 026, 027 | BR-002, 019 | E-006 | uc-09-xem-danh-sach-chi-tiet.md | ✅ |

Số hiệu BR/E dùng trong bảng là hậu tố của `BR-syllabus-XXX` / `E-syllabus-XXX` (ví dụ BR-012 = BR-syllabus-012).

## Ma trận UC ↔ FR

| FR | UC-01 | UC-02 | UC-03 | UC-04 | UC-05 | UC-06 | UC-07 | UC-08 | UC-09 |
|----|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| FR-001 Tạo template | X | | | | | | | | |
| FR-002 Ràng buộc kỹ năng | X | | | | | | | | |
| FR-003 Bulk modules | X | | | | | | | | |
| FR-004 Import file lúc tạo | | X | | | | | | | |
| FR-005 Định dạng 5 cột + legacy | | X | X | | | | | | |
| FR-006 Tự đánh số buổi | | X | X | | | | | | |
| FR-007 Phát hiện template cũ | | X | X | | | | | | |
| FR-008 Tải file mẫu | | X | | | | | | | |
| FR-009 Danh sách + lọc | | | | | | | | | X |
| FR-010 Đếm lớp đang dùng | | | | | | X | | | X |
| FR-011 Chi tiết editor | | | | X | X | | | | X |
| FR-012 CRUD module | | | | X | | | | | |
| FR-013 CRUD buổi + Loại | | | | X | X | | | | |
| FR-014 Reorder | | | | X | | | | | |
| FR-015 Gắn tài liệu | | | | | X | | | | |
| FR-016 Ghi đè nội dung | | | X | | | | | | |
| FR-017 Xóa template | | | | | | X | | | |
| FR-018 Nhập vào lớp | | | | | | | X | | |
| FR-019 Lớp chuyển auto | | | | | | | X | | |
| FR-020 Gỡ khỏi lớp | | | | | | | | X | |
| FR-021 Tự-heal | | | | | | | X | | |
| FR-022 Backfill | | | | | | | X | X | |
| FR-023 Chặn buổi thủ công | | | | | | | X | X | |
| FR-024 Guard kind/status từ lớp | | | | X | X | | | | |
| FR-025 Tài liệu buổi N ↔ bài N | | | | | (đọc) | | | | |
| FR-026 Snapshot đọc | | X | X | X | X | X | X | X | X |
| FR-027 Copy không mở như template | | | | X | | | | | X |
| FR-028 Preview + gỡ file | | X | X | | | | | | |
| FR-029 Chỉ csv/xlsx 2MB | | X | X | | | | | | |
| FR-030 Chặn submit | X | X | | | | | | | |

## Ma trận UC ↔ BR

| BR | UC-01 | UC-02 | UC-03 | UC-04 | UC-05 | UC-06 | UC-07 | UC-08 | UC-09 |
|----|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| BR-001 unique copy per lớp | | | | | | | X | X | |
| BR-002 template là class_id NULL | | | | X | | X | X | | X |
| BR-003 copy độc lập | | | X | | | X | | | |
| BR-004 kind giữ / status reset | | | | | | | X | | |
| BR-005 pointer là cột suy ra | | | | | | | X | X | |
| BR-006 chặn import khi có buổi manual | | | | | | | X | | |
| BR-007 trần 52 buổi | | | | | | | X | | |
| BR-008 chặn template rỗng vào lớp trống | | | | | | | X | | |
| BR-009 409 khi đã có copy | | | | | | | X | | |
| BR-010 chặn buổi manual khi có copy | | | | | | | X | X | |
| BR-011 reset manual/0 khi gỡ | | | | | | | | X | |
| BR-012 kỹ năng theo loại lớp | X | | | | | | | | |
| BR-013 tài liệu dùng chung org | | | | | X | | X | | |
| BR-014 PK kép links | | | | | X | | | | |
| BR-015 buổi N ↔ bài N | | | | | (đọc) | | | | |
| BR-016 mirror giới hạn ký tự | | X | X | | | | | | |
| BR-017 all-or-nothing file | | X | X | | | | | | |
| BR-018 ô Date là lỗi | | X | X | | | | | | |
| BR-019 copy chỉ xóa qua lớp | | | | X | | X | | | X |

## Ma trận UC ↔ Error (chỉ error chính)

| Error | UC-01 | UC-02 | UC-03 | UC-04 | UC-05 | UC-06 | UC-07 | UC-08 | UC-09 |
|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| E-002 invalid json / invalid body | X | | X | X | X | | X | X | |
| E-003 vượt 500 node | X | X | X | | | | (422 tương ứng) | | |
| E-004/005 kỹ năng theo loại | X | | | | | | | | |
| E-006 syllabus not found | | | X | X | X | X | X | | X |
| E-007 class not found | | | | | | | X | X | |
| E-008/009 module/lesson not found | | | | X | X | | | | |
| E-010/011/012 reorder | | | | X | | | | | |
| E-013 2 MiB | X | | X | | | | | | |
| E-014 CURRICULUM_ALREADY_EXISTS | | | | | | | X | | |
| E-015 TEMPLATE_TOO_LARGE | | | | | | | X | | |
| E-016 MANUAL_SESSIONS_EXIST | | | | | | | X | | |
| E-017 TOO_MANY_LESSONS | | | | | | | X | | |
| E-018 EMPTY_TEMPLATE | | | | | | | X | | |
| E-019 material-not-found | | | | | X | | X | | |
| E-020/021 class-has-syllabus | | | | | | | X | X | |
| E-022..029 lỗi file client | | X | X | | | | | | |
| E-030 chặn submit client | X | X | | | | | | | |
| E-031 batch failed nội bộ | | | | | | | X | | |
