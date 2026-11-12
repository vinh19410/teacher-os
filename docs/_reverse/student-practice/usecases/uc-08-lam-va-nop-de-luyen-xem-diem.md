---
feature: student-practice
type: reverse-usecase
uc: UC-08
status: draft
updated: "2026-11-12"
---

# UC-08 — Làm và nộp đề luyện, xem điểm

a. **Mục tiêu:** Học viên hoàn thành đề luyện trên đúng bố cục thi, biết kết quả ngay với
   đề tự chấm và chờ Band cho đề Viết/Nói; kết quả không ảnh hưởng điểm lớp. 🟡 (định vị
   "luyện không tính điểm lớp" — e2e #378 khẳng định; OQ-13)
b. **Actor:** Học viên.
c. **Tiền điều kiện:** Có lượt làm mode practice (từ UC-07); đề đang ready.
d. **Luồng chính (truy vết F9):**
   1. Vào `/learn/quizzes/practice/:testId`: lấy đề sạch + lượt dở (resume answers/essay)
      (FR-28); lượt đã nộp ở tab khác → thẳng trang tổng kết.
   2. Làm bài trên view dùng chung với bài giao lớp: khung giấy phần đầu, câu gộp mọi phần
      đánh số toàn cục, đề Nói hiện ghi chú hướng dẫn (FR-28).
   3. Nộp qua endpoint attempt dùng chung → tự chấm từ snapshot → "đúng/tổng" hiển thị ngay
      (FR-29).
   4. Đề Viết/Nói: giáo viên chấm theo tiêu chí IELTS → catalog hiển thị "Band x.x"
      (trung bình các tiêu chí, 1 chữ số thập phân) (FR-26, FR-29).
e. **Luồng thay thế:**
   - 1a. Đề biến nháp/bị xoá giữa chừng → GET quiz 404 (E-25).
   - 2a. Nộp lần nữa sau khi đã nộp → practice làm lại được: start lượt mới, không 409
     (FR-27); endpoint submit dùng chung vẫn giữ idempotency cho lượt đã nộp.
   - 3a. Đề Viết luyện vào hàng chờ chấm với nhãn "Luyện tập" (không stamp bài tập lớp,
     không vào bảng điểm lớp — FR-29).
f. **Hậu điều kiện:** Lượt làm chuyển submitted kèm correctCount (tự chấm); Viết/Nói chờ
   gradeScores; không thay đổi dữ liệu bài tập lớp.
g. **Quy tắc liên quan:** FR-27..FR-29; (vòng đời attempt đầy đủ — cross-ref feature
   student-quiz).
h. **Truy vết:** apps/server/src/routes/student-practice.ts:367-410, :118-142;
apps/student/src/routes/_auth/learn/quizzes/practice/$testId.tsx:1-50;
apps/student/src/lib/repos/quiz.ts:32-48, :176-186; apps/server/src/routes/student.ts:1919;
packages/api/src/lib/ielts-band.ts:143-152; apps/server/src/routes/student-practice.test.ts:537-675,
:676-786; apps/e2e/specs/student-practice.spec.ts:120-178.
