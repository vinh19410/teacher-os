---
feature: study-pack
type: reverse-usecase-index
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# usecase index — study-pack

Chín use case phủ toàn bộ luồng F1-F9 của spec Mục 9. Mã dùng chung mọi use
case tách thành dòng riêng để bảng gọn.

| UC | Tên | Actor chính | Luồng | Tệp |
|---|---|---|---|---|
| — | Dùng chung mọi UC | — | — | FR-01 (buộc đăng nhập), E-01 (401 unauthorized) |
| UC-01 | Xem kho bộ đề | Giáo viên | F1 | [uc-01-xem-kho-bo-de.md](uc-01-xem-kho-bo-de.md) |
| UC-02 | Soạn bộ đề của trung tâm | Giáo viên | F2 | [uc-02-soan-bo-de-trung-tam.md](uc-02-soan-bo-de-trung-tam.md) |
| UC-03 | Nhân bản bộ đề hệ thống về tổ chức | Giáo viên | F3 | [uc-03-nhan-ban-bo-he-thong.md](uc-03-nhan-ban-bo-he-thong.md) |
| UC-04 | Gán bộ đề cho lớp theo lịch | Giáo viên | F4 | [uc-04-gan-bo-de-cho-lop.md](uc-04-gan-bo-de-cho-lop.md) |
| UC-05 | Học viên nhận bài theo giờ mở | Học viên | F5 | [uc-05-hoc-vien-nhan-bai-theo-gio.md](uc-05-hoc-vien-nhan-bai-theo-gio.md) |
| UC-06 | Huỷ bộ đề đang chạy trên lớp | Giáo viên | F6 | [uc-06-huy-bo-de-tren-lop.md](uc-06-huy-bo-de-tren-lop.md) |
| UC-07 | Học viên vào lớp muộn nhận bài còn hạn | Học viên | F7 | [uc-07-hoc-vien-muon-nhan-bai-con-han.md](uc-07-hoc-vien-muon-nhan-bai-con-han.md) |
| UC-08 | Theo dõi tiến độ làm bài của lớp | Giáo viên | F8 | [uc-08-theo-doi-tien-do-lam-bai.md](uc-08-theo-doi-tien-do-lam-bai.md) |
| UC-09 | Xoá bộ đề chưa sử dụng | Giáo viên | F9 | [uc-09-xoa-bo-de-chua-su-dung.md](uc-09-xoa-bo-de-chua-su-dung.md) |

## Ma trận UC ↔ FR ↔ BR ↔ E

| UC | FR | NFR | BR | E |
|---|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-05, FR-06 | NFR-07, NFR-08 | BR-01 | E-01, E-02, E-07, E-34 |
| UC-02 | FR-01, FR-03, FR-04, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12 | NFR-01, NFR-02, NFR-03, NFR-07 | BR-02, BR-03, BR-04, BR-10 | E-03, E-04, E-05, E-06, E-07, E-10, E-11, E-12, E-13, E-14, E-15, E-16, E-17, E-18, E-19, E-20, E-21, E-29, E-32, E-34 |
| UC-03 | FR-01, FR-03, FR-14 | NFR-02, NFR-03, NFR-04 | BR-01 | E-03, E-07, E-30, E-34 |
| UC-04 | FR-01, FR-03, FR-04, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-22 | NFR-02, NFR-03, NFR-04, NFR-05, NFR-06 | BR-02, BR-05, BR-06, BR-07, BR-10, BR-12 | E-03, E-04, E-05, E-06, E-08, E-22, E-23, E-24, E-25, E-26, E-27, E-33, E-34 |
| UC-05 | FR-01, FR-23 | NFR-06 | BR-02, BR-06, BR-08, BR-11, BR-12 | E-01, E-31 |
| UC-06 | FR-01, FR-03, FR-21, FR-22 | NFR-03, NFR-04 | BR-08 | E-03, E-08, E-28, E-34 |
| UC-07 | FR-01, FR-24 | NFR-04 | BR-08, BR-11 | E-01 |
| UC-08 | FR-01, FR-02, FR-25, FR-26 | NFR-07 | BR-06 | E-02, E-08, E-34 |
| UC-09 | FR-01, FR-03, FR-13 | NFR-03 | BR-09 | E-03, E-07, E-09, E-34 |

Đối chiếu phủ (mọi mã xuất hiện ít nhất một lần — không mồ côi):

- FR: FR-01 ở dòng dùng chung; FR-02 (UC-01, UC-08); FR-03 (UC-02, UC-03,
  UC-04, UC-06, UC-09); FR-04 (UC-02, UC-04); FR-05/06 (UC-01); FR-07..12
  (UC-02); FR-13 (UC-09); FR-14 (UC-03); FR-15..20, FR-22 (UC-04); FR-21
  (UC-06); FR-23 (UC-05); FR-24 (UC-07); FR-25/26 (UC-08).
- NFR: NFR-01 (UC-02, UC-04); NFR-02 (UC-02, UC-03, UC-04); NFR-03 (UC-02,
  UC-03, UC-04, UC-06, UC-09); NFR-04 (UC-03, UC-04, UC-06, UC-07); NFR-05
  (UC-04); NFR-06 (UC-04, UC-05); NFR-07 (UC-01, UC-02, UC-08); NFR-08 (UC-01).
- BR: BR-01 (UC-01, UC-03); BR-02 (UC-02, UC-04, UC-05); BR-03/04 (UC-02);
  BR-05 (UC-04); BR-06 (UC-04, UC-05, UC-08); BR-07 (UC-04); BR-08 (UC-05,
  UC-06, UC-07); BR-09 (UC-09); BR-10 (UC-02, UC-04); BR-11 (UC-05, UC-07);
  BR-12 (UC-04, UC-05).
- E: E-01 ở dòng dùng chung; E-02 (UC-01, UC-08); E-03 (UC-02, UC-03, UC-04,
  UC-06, UC-09); E-04/05/06 (UC-02, UC-04); E-07 (UC-01, UC-02, UC-03, UC-09);
  E-08 (UC-04, UC-06, UC-08); E-09 (UC-09); E-10..E-21 (UC-02); E-22..E-27
  (UC-04); E-28 (UC-06); E-29 (UC-02); E-30 (UC-03); E-31 (UC-05); E-32
  (UC-02); E-33 (UC-04); E-34 (UC-01, UC-02, UC-03, UC-04, UC-06, UC-08,
  UC-09).
- UC-07 không có mã E riêng: đường bù chạy nội bộ khi kích hoạt ghi danh, lỗi
  hiếm không có mã hợp đồng riêng (ghi ở use case).
