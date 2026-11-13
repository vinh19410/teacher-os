---
type: reverse-usecase
feature: grading
uc: UC-01
status: draft
updated: 2026-11-12
---

# UC-01 — Xem hàng chờ chấm và lọc

**a. Mục tiêu** — Nhân sự trung tâm thấy ngay danh sách bài Writing/Speaking đã nộp chờ chấm (kèm bài luyện tập), biết bài nào AI đã chấm nháp, và tìm nhanh bài cần xử lý.

**b. Actor** — Chính: nhân sự trung tâm (teacher/owner/admin/class_teacher/ta — GET mở mọi staff). Phụ: hệ thống (sweep chạy kèm).

**c. Điều kiện tiên quyết** — Có ít nhất một bài nộp đã nộp kỹ năng chấm được; người dùng đăng nhập staff.

**d. Luồng chính** —
1. GV mở trang hàng chờ (F3).
2. Hệ thống chạy sweep lượt treo rồi trả danh sách: bài assignment writing/speaking đã nộp + bài luyện tập [FR-01, FR-02, FR-64].
3. Mỗi dòng có học viên/lớp/kỹ năng/trạng thái chấm/trạng thái AI + chế độ nháp [FR-03].
4. Chưa chấm đứng trước, đã chấm xếp sau theo thời điểm [FR-04].
5. GV lọc theo từ khoá/mode/skill/status (client) [FR-05], tìm kiếm khử rung 300ms [FR-06].
6. Nhóm + đếm chéo không phân biệt dấu [FR-07]; kicker hiển thị "N bài chờ chấm · M bài đã nộp" [FR-09].
7. Hàng chờ trống → nút "Tạo bài nộp mẫu dùng thử" [FR-10].

**e. Luồng thay thế & lỗi** —
- E1: tải thất bại → "Không tải được hàng chờ chấm. Thử tải lại trang." [FR-12].
- E2: kết quả vượt trần 500 dòng/nhánh → dữ liệu cắt ngang (không có phân trang — OQ-06).

**f. Hậu điều kiện** — Không đổi dữ liệu (trừ sweep có thể hoàn Credit lượt treo).

**g. Quy tắc nghiệp vụ** — BR-13 (luyện tập chấm như bài tập); nhãn "Luyện tập".

**h. Truy vết** — FR-01…FR-12, FR-64; BR-13; F3; Error 400 invalid json; Test: apps/web/src/routes/_auth/grading/index.test.tsx (10 test), apps/server/src/routes/grading.test.ts.
