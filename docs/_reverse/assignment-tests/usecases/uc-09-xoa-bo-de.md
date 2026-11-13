# UC-09 — Xóa bộ đề

a) **Actor & mục tiêu:** Giáo viên (hoặc caller API) xóa vĩnh viễn một bộ đề cùng các slot.

b) **Tiền điều kiện:** Bộ đề thuộc org hiện tại. `tests.ts:140-146`

c) **Trigger:** DELETE `/api/assignments/tests/:id`. UI hiện không có nút gọi (G-3).

d) **Kịch bản chính:**
1. Batch 2 statement trong MỘT db.batch: xóa `assignment_test_part` theo testId + xóa `assignment_test` theo id+org. `tests.ts:147-159`
2. 200 `{id}`; snapshot sau đó không còn row. `tests.ts:160`; test `tests.test.ts:316-323`

e) **Nhánh mở rộng:**
- 1a. Sai org / không tồn tại → 404. `tests.ts:146`
- 1b. Có quiz_attempt: không bị chặn — FK SET NULL, attempt giữ điểm, hiển thị "Đề đã xoá" (OQ-6 cần chốt chính sách). `quiz-attempt.ts:35-40,57-59`
- Không có attempt check như PUT parts — xóa không khóa (khác với sửa parts).

f) **Nghiệp vụ/quy tắc:** FR-003; BR-013; NFR-003 (batch nguyên tử).

g) **Hậu điều kiện:** Parts + test biến mất; attempt cũ test_id null.

h) **Nguồn & nhãn:** S1 `tests.ts:133-161`; S9 `quiz-attempt.ts`; mutation map `repos/kernel.ts:289-294` + test mapping `repos/assignment-tests.test.ts:163-171`. Nhãn ✅ cho API; 🟡 cho availability UI (G-3).
