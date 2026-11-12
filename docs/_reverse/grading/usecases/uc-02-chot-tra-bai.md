---
type: reverse-usecase
feature: grading
uc: UC-02
status: draft
updated: 2026-11-12
---

# UC-02 — Chốt trả bài cho học viên

**a. Mục tiêu** — Giáo viên chốt điểm chính thức cho bài Writing/Speaking; học viên thấy điểm, band tổng và nhận thông báo.

**b. Actor** — Chính: teacher/owner/admin/class_teacher (`canPublishGrade`). Bị chặn: ta.

**c. Điều kiện tiên quyết** — Bài nộp đã nộp; người dùng đủ vai; đã chọn đủ 4 tiêu chí.

**d. Luồng chính** —
1. GV mở bài nộp (F4), form điền sẵn từ nháp nếu có [FR-63].
2. GV chọn 4 band 0–9 bước 0.5 + nhận xét ≤ 5000 ký tự [FR-23, FR-24].
3. Band tổng hiện sống trên tiêu đề trang [FR-27].
4. GV bấm "Chốt trả bài" (hoặc "Lưu điểm" khi không có nháp) (F6).
5. Hệ thống kiểm vai, kiểm điểm, CAS ghi điểm chính thức với version + chưa published [FR-25, FR-26].
6. Nếu có nháp → CAS nháp sang "published" [FR-28].
7. Gửi thông báo "Bài đã được chấm" (trừ demo) với đường dẫn mở bài [FR-29, FR-30].
8. UI hiện "Đã lưu · <thời điểm>"; học viên thấy điểm + band [FR-33].

**e. Luồng thay thế & lỗi** —
- E1: thiếu vai → 403 GRADE_PUBLISH_FORBIDDEN; UI khoá nút kèm "Chỉ Giáo viên đứng lớp được chốt trả bài" [FR-32].
- E2: điểm thiếu/sai thang → chặn 400 (invalid scores) [FR-23].
- E3: trượt version/nháp đã published → 409 E-selfomy-alignment-011; hộp thoại "Tải lại bản mới nhất" giữ chỉnh sửa [FR-26, FR-33].
- E4: bài chưa nộp → 409 NOT_SUBMITTED; kỹ năng sai → 400 SKILL_NOT_GRADABLE [FR-14, FR-15].

**f. Hậu điều kiện** — quiz_attempt có grade_scores/grade_feedback/graded_at; nháp (nếu có) "published"; học viên có notification idempotent.

**g. Quy tắc nghiệp vụ** — BR-01 (học viên chỉ thấy sau chốt), BR-02 (người chốt là người quyết), BR-08 (thang IELTS), BR-09 (thông báo idempotent, bỏ demo).

**h. Truy vết** — FR-22…FR-33; BR-01/02/08/09; F6; Error GRADE_PUBLISH_FORBIDDEN, E-011, NOT_SUBMITTED, SKILL_NOT_GRADABLE; Test: grading.test.ts:2382-2435 (CAS publish), ai-grading-ac-001.spec.ts:235-253, ai-grading-ac-004.spec.ts:296, teacher-grade-submission.spec.ts:202-341.
