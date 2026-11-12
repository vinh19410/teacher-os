---
type: reverse-usecase
feature: grading
uc: UC-04
status: draft
updated: 2026-11-12
---

# UC-04 — Lưu bản nháp rà soát

**a. Mục tiêu** — Giáo viên/trợ giảng chỉnh điểm AI rồi lưu thành điểm rà soát, đánh dấu nháp đang "Đang rà soát", chưa lộ cho học viên.

**b. Actor** — Chính: teacher/owner/admin/class_teacher/ta (`canReviewGrade` — ta được phép).

**c. Điều kiện tiên quyết** — Có nháp AI ở trạng thái "ai_drafted" / "teacher_reviewing" / "manual_pending"; đủ 4 tiêu chí chọn.

**d. Luồng chính** —
1. GV mở bài nộp; form điền sẵn: điểm đã publish > điểm rà soát > điểm AI [FR-63].
2. GV/TA chỉnh 4 band + nhận xét, bấm "Lưu bản nháp" (F5).
3. Hệ thống kiểm vai review; kiểm nháp tồn tại + trạng thái sửa được [FR-53].
4. CAS theo version + chưa "published"; lưu điểm/nhận xét rà soát, tăng version, nháp sang "teacher_reviewing" [FR-54].
5. Badge nháp chuyển "Đang rà soát"; học viên vẫn không thấy điểm [FR-51].

**e. Luồng thay thế & lỗi** —
- E1: thiếu vai → 403 GRADE_REVIEW_FORBIDDEN.
- E2: nháp không tồn tại → 404 DRAFT_NOT_FOUND [FR-55].
- E3: trạng thái không sửa được → 409 DRAFT_NOT_EDITABLE [FR-55].
- E4: trượt version → 409 E-selfomy-alignment-011 → hộp thoại "Tải lại bản mới nhất" giữ edits [FR-26, FR-33].

**f. Hậu điều kiện** — Nháp "teacher_reviewing" với reviewed_scores/reviewed_feedback mới; version tăng.

**g. Quy tắc nghiệp vụ** — BR-02 (nháp vẫn chưa tới học viên), BR-05 (ta chỉ được lưu nháp).

**h. Truy vết** — FR-51…FR-55, FR-63; BR-02, BR-05; F5; Error GRADE_REVIEW_FORBIDDEN, DRAFT_NOT_FOUND, DRAFT_NOT_EDITABLE, E-011; Test: grading.test.ts:1944 ("PATCH version cũ → 409 E-selfomy-alignment-011"), :2136 (BR-01 — nhãn "BR-001" là của bình luận code), :2341 ("TA lưu bản nháp OK…"), ai-grading-ac-001.spec.ts:213-233, ai-grading-ac-004.spec.ts:296.
