---
feature: vocab-hub
type: reverse-usecase-index
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# usecases/vocab-hub-reverse-usecase-index — vocab-hub

Danh mục use case đảo ngược — draft

Actor chính duy nhất: Giáo viên. Học viên chỉ là ĐỐI TƯỢNG (UC-07, UC-08) —
hành vi phía học viên thuộc student-practice.

## Bảng use case

| UC | Tên | File | Luồng |
|---|---|---|---|
| UC-01 | Xem trang hub từ vựng | usecases/uc-01-xem-trang-hub-tu-vung.md | F1 |
| UC-02 | Tạo bộ từ vựng | usecases/uc-02-tao-bo-tu-vung.md | F2 |
| UC-03 | Soạn từ vựng trong bộ từ | usecases/uc-03-soan-tu-vung-trong-bo-tu.md | F3 |
| UC-04 | Upload âm thanh phát âm cho từ | usecases/uc-04-upload-am-thanh-phat-am.md | F3 |
| UC-05 | Xoá bộ từ vựng | usecases/uc-05-xoa-bo-tu-vung.md | F2 |
| UC-06 | Thêm bộ từ từ thư viện dựng sẵn | usecases/uc-06-them-bo-tu-tu-thu-vien.md | F4 |
| UC-07 | Gợi ý và thu hồi bộ từ cho học viên | usecases/uc-07-goi-y-va-thu-hoi-bo-tu.md | F5 |
| UC-08 | Xem tiến độ học từ vựng của học viên | usecases/uc-08-xem-tien-do-hoc-tu-vung.md | F6 |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR | BR | Error (chính) |
|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-03, FR-04, FR-18 | BR-02, BR-07 | E-01, E-31 |
| UC-02 | FR-05, FR-22 | BR-01, BR-02, BR-03, BR-14 | E-01, E-07, E-08, E-26 |
| UC-03 | FR-07, FR-08, FR-09, FR-22 | BR-01, BR-03 | E-01, E-07, E-09, E-12, E-27 |
| UC-04 | FR-10, FR-11, FR-22 | BR-03, BR-04, BR-10, BR-14 | E-01, E-09, E-12, E-14..E-20, E-28 |
| UC-05 | FR-06, FR-22 | BR-01, BR-05, BR-11, BR-13 | E-01, E-07, E-09 |
| UC-06 | FR-15, FR-16, FR-17, FR-22 | BR-01, BR-08, BR-09, BR-14 | E-01, E-07, E-08, E-21, E-22, E-23, E-24, E-29, E-30 |
| UC-07 | FR-12, FR-13, FR-14, FR-22 | BR-01, BR-06, BR-07 | E-01, E-07, E-09, E-10, E-13, E-25 |
| UC-08 | FR-20, FR-21 | BR-12, BR-13 | E-01, E-10, E-11, E-31 |
| (cross) | FR-19, FR-23 | BR-13, BR-14 | E-02..E-06 (tầng chung) |

Ghi chú ma trận: FR-19 (đổi tên) không gắn UC nào vì không có UI — OQ-02;
FR-23 là ranh giới học viên, không lập UC riêng; E-02..E-06 là lỗi tầng
app/kernel dùng chung mọi UC, không lặp lại từng dòng.
