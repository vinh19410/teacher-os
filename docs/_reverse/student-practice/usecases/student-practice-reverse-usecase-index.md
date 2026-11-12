---
feature: student-practice
type: reverse-usecase-index
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# usecases/student-practice-reverse-usecase-index — student-practice

| UC | Tên | Actor | Flow | Ghi chú |
|---|---|---|---|---|
| UC-01 | Xem tổng quan luyện từ vựng | Học viên | F1 | Điểm vào chính; đọc-thuần |
| UC-02 | Học từ mới trong phiên Learn | Học viên | F2, F3 | Đường chính lần đầu gặp từ |
| UC-03 | Ôn tập theo lịch SRS | Học viên | F2, F4 | Superset của UC-02 về infra phiên; khác engine + API ghi |
| UC-04 | Xử lý gợi ý bộ từ của giáo viên | Học viên | F5 | accept/dismiss |
| UC-05 | Tự học khóa học từ vựng thư viện | Học viên | F6, F2 | "Đăng ký" ngầm = lần mở bộ từ đầu |
| UC-06 | Nghe phát âm của từ | Học viên | F7 | Phục vụ UC-02/UC-03 + trang bộ từ |
| UC-07 | Duyệt catalog luyện đề và bắt đầu đề | Học viên | F8 | Phân hệ B; chỉ đề ready cùng org |
| UC-08 | Làm và nộp đề luyện, xem điểm | Học viên | F9 | Máy attempt dùng chung với student-quiz |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07 | BR-05, BR-06, BR-07, BR-08 | E-01, E-16, E-17, E-18 |
| UC-02 | FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-19, FR-20, FR-21, FR-22 | BR-01, BR-02, BR-03, BR-10, BR-11, BR-14, BR-16 | E-01, E-02, E-03, E-04, E-05, E-06, E-07, E-08, E-09, E-11, E-19, E-20 |
| UC-03 | FR-10, FR-12, FR-13, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22 | BR-01, BR-02, BR-04, BR-05, BR-10, BR-12, BR-13, BR-14 | E-07, E-08, E-09, E-10, E-19, E-20 |
| UC-04 | FR-07, FR-08, FR-09 | BR-15 | E-12, E-13, E-17, E-18 |
| UC-05 | FR-10, FR-11, FR-12, FR-13 | BR-08, BR-09, BR-10, BR-16 | E-06, E-11, E-21, E-22 |
| UC-06 | FR-20, FR-22 (phát âm trong prompt) | BR-14 | E-14, E-15 |
| UC-07 | FR-23, FR-24, FR-25, FR-26, FR-27, FR-30 | BR-16 (tiền tố đề) | E-23, E-24, E-25, E-27, E-28 |
| UC-08 | FR-27, FR-28, FR-29 | BR-16 | E-25, E-26, E-27 |

Ghi chú superset:

- UC-03 dùng chung hạ tầng phiên với UC-02 (F2 cấp thẻ + cùng view) nhưng engine, API ghi
  (answer so với learn-commit) và máy lịch khác nhau — đặc tả riêng.
- UC-05 kết thúc bằng F2: mọi bộ từ đều đi qua cùng đường cấp thẻ.
- UC-01 là điểm điều phối: mọi UC khác đều đi ra từ tổng quan (hoặc từ redirect FR-02).
- UC-07/UC-08 thuộc phân hệ B (luyện đề #378): nộp bài dùng endpoint attempt chung với
  luồng giao bài — đặc tả vòng đời attempt đầy đủ thuộc feature student-quiz, ở đây chỉ
  ghi điểm khác biệt (entry từ catalog, tự làm lại được, không vào bảng điểm lớp).
