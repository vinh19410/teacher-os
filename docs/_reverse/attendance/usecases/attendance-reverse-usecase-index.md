# usecases/attendance-reverse-usecase-index — attendance

| UC | Tên | Actor | Flow | Ghi chú |
|---|---|---|---|---|
| UC-01 | Xem danh sách điểm danh theo ngày | Giáo viên | F1 | Bao gồm đọc từ dashboard CTA (FR-29) |
| UC-02 | Lưu điểm danh cả ca | Giáo viên | F2 | Đường chính, đủ sĩ số |
| UC-03 | Điền nhanh & xử lý lưu thiếu | Giáo viên | F3, F4 | Superset của UC-02: điền nhanh + modal + auto-advance |
| UC-04 | Tạo lịch nghỉ — dời buổi (shift) | Giáo viên | F5, F6 | Preview bắt buộc trước apply (planHash) |
| UC-05 | Tạo lịch nghỉ — hủy buổi (cancel) | Giáo viên | F5, F7 | Dùng chung preview; không sinh bù |
| UC-06 | Hoàn tác kỳ nghỉ tương lai | Giáo viên | F8 | Chỉ kỳ chưa bắt đầu |

## Ma trận UC ↔ FR ↔ BR ↔ Error

| UC | FR liên quan | BR liên quan | Error liên quan |
|---|---|---|---|
| UC-01 | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-29, FR-31 | BR-02, BR-03, BR-12 | E-01, E-02, E-03, E-12 |
| UC-02 | FR-06, FR-09, FR-10, FR-11, FR-12, FR-13, FR-14, FR-31 | BR-01, BR-02, BR-03, BR-10 | E-04, E-05, E-06, E-07, E-08, E-09, E-10, E-11 |
| UC-03 | FR-15, FR-16, FR-17 (+ FR-09..FR-12) | BR-03, BR-12 | E-25, E-08, E-10 |
| UC-04 | FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-27, FR-28, FR-30, FR-32, FR-31 | BR-04, BR-05, BR-06, BR-09, BR-02 | E-13, E-14, E-15, E-16, E-17, E-18, E-19, E-24 |
| UC-05 | FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-25, FR-27, FR-31 | BR-04, BR-05, BR-09, BR-11, BR-02 | E-16, E-17, E-18, E-19 |
| UC-06 | FR-26, FR-24, FR-28, FR-31 | BR-07, BR-08, BR-09 | E-20, E-21, E-22, E-23 |

Ghi chú superset:

- UC-03 là đường đi mở rộng của UC-02 (cùng endpoint PUT, thêm bước điền nhanh/modal/auto-advance) — đặc tả UC-02 là nền, UC-03 chỉ khác biệt hóa.
- UC-04/UC-05 dùng chung F5 (preview) và cùng gate apply (past-range/no-sessions/stale-preview/too-large) — chỉ khác nhánh planner + statements.
- UC-01 phục vụ mọi UC ghi (điều kiện tiên quyết đọc trước ghi).
