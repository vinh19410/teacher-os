---
type: reverse-usecase-index
feature: student-classes
status: draft
updated: "2026-11-12"
---

# student-classes — Danh mục tình huống sử dụng (usecase index)

Feature chỉ-đọc nên danh sách UC gọn (3 UC, đúng phạm vi góc nhìn học viên về lớp đã ghi danh). Không nhân rộng UC cho nghiệp vụ admin (đã có bộ `classes`).

| ID | Tên | Actor chính | Mức | File chi tiết | Trạng thái |
|----|-----|-------------|-----|---------------|------------|
| UC-01 | Xem chi tiết lớp học | Học viên đã kích hoạt | summary | usecases/uc-01-xem-chi-tiet-lop-hoc.md | draft |
| UC-02 | Xem "Bạn cùng lớp" | Học viên đã kích hoạt | summary | usecases/uc-02-xem-ban-cung-lop.md | draft |
| UC-03 | Mở bài tập từ trang lớp | Học viên đã kích hoạt | summary | usecases/uc-03-mo-bai-tap-tu-trang-lop.md | draft |

## Truy vết tổng

| UC | FR liên quan | BR liên quan | Luồng | OQ liên quan |
|----|--------------|--------------|-------|--------------|
| UC-01 | FR-sc-001..013, FR-sc-017, FR-sc-018 | BR-sc-002..006, BR-sc-008..012, BR-sc-014 | F1, F3 | OQ-1, OQ-2, OQ-3, OQ-4, OQ-7 |
| UC-02 | FR-sc-014, FR-sc-015 | BR-sc-003, BR-sc-010, BR-sc-013 | F2 | OQ-5 |
| UC-03 | FR-sc-012, FR-sc-016 | BR-sc-007 | F4 | — |

## Sổ tay nguồn dùng chung

Toàn bộ UC dùng chung bảng nguồn S1..S18 (student-classes-reverse-spec.md Mục 0.1) và bằng chứng trong `_evidence.md`. Các nhánh từ chối chung (phiên, vai trò, tổ chức) khai báo một lần ở UC-01 và được UC-02/UC-03 tham chiếu, không lặp.
