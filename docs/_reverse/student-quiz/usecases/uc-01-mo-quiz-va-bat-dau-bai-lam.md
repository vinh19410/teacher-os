---
type: reverse-usecase
feature: student-quiz
uc: UC-01
status: draft
updated: 2026-11-12
---
# UC-01 — Mở quiz và bắt đầu bài làm

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Học viên mở quiz được giao từ dòng tổng quan, xem đề sạch và bắt đầu (hoặc tiếp tục) một lượt làm bài duy nhất với đề được đóng băng |
| (b) Actor chính | Học viên đã đăng nhập. Phụ: hệ thống (snapshot đề lúc start) |
| (c) Tiền điều kiện | Có `class_assignment_target` trỏ học viên; bài đã mở (`availableAt` quá khứ hoặc null); session hợp lệ, email đã xác minh, user đã liên kết student/org |
| (d) Hậu điều kiện | Có attempt `in_progress` với `questions_snapshot`; chưa có thì tạo mới (201), có rồi thì dùng lại (200); đã nộp thì không tạo được (409) và UI điều hướng sang summary |

**(e) Luồng chính**

1. Học viên bấm "Làm bài: {title}" trên dòng tổng quan. — ✅ [S22] `apps/student/src/components/overview/assignment-row.tsx:65-71`
2. Route học viên GET chi tiết quiz: join lượt giao theo org + student, lọc `availableAt`, không thấy → 404 chung `assignment not found`. — ✅ [S1] `apps/server/src/routes/student.ts:1333-1377`, [S27] `apps/server/src/lib/assignment-visibility.ts:1-16`
3. Máy chủ trả đề sạch: câu hỏi chỉ `stem/opts/type hiệu dụng/pin`, không có `answer`/`alts`/`transcript`; `note` chỉ với đề Speaking; kèm trạng thái attempt (chưa có/đang làm/đã nộp) và `dueAt` ISO khi có. — ✅ [S1] `apps/server/src/routes/student.ts:1389-1452`, [S10] `packages/api/src/lib/infer-question-types.ts`
4. Chưa có attempt: UI hiện card giới thiệu + dialog "Bắt đầu làm bài — Bạn có muốn bắt đầu làm bài ngay bây giờ không?"; học viên xác nhận. — ✅ [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:115-117`
5. UI gọi POST start; máy chủ kiểm tra lượt giao lần nữa, đọc attempt hiện có. — ✅ [S1] `apps/server/src/routes/student.ts:1461-1496`
6. Chưa có attempt → tạo bản ghi với snapshot đề = bản JSON chốt từ đề gốc, đáp án rỗng, thời điểm bắt đầu; trả `201 {attemptId}`. — ✅ [S1] `apps/server/src/routes/student.ts:1510-1538`
7. Đã có attempt `in_progress` → trả `200 {attemptId}` (idempotent, không tạo dòng mới); UI mở dialog "Tiếp tục bài làm". — ✅ [S1] `apps/server/src/routes/student.ts:1487-1496`; [S17] `:139-141`
8. UI vào màn làm bài với đáp án đã lưu (nếu có). — ✅ [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-62`

**(f) Luồng thay thế/đặc biệt**

- f1: Hai request start đồng thời → request thua unique re-read và resume attempt của request thắng (kết quả hội tụ một dòng). — ✅ [S1] `apps/server/src/routes/student.ts:1539-1549`; test [S23] `apps/server/src/routes/student-quiz.test.ts:1227-1258`
- f2: Attempt đã `submitted` → 409 `attempt already submitted`; UI xoá mirror localStorage và điều hướng thẳng summary. — ✅ [S1] `apps/server/src/routes/student.ts:1506,1544`; [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-40`
- f3: Bài chưa tới giờ mở hoặc học viên không thuộc lượt giao → 404 `assignment not found` (chung, không tiết lộ nguyên nhân). — ✅ [S1] `apps/server/src/routes/student.ts:1362,1375,1495`; OQ-3
- f4: Đề bị sửa sau khi attempt tồn tại → GET quiz vẫn trả câu hỏi từ snapshot của attempt. — ✅ [S1] `apps/server/src/routes/student.ts:1390-1393`; test [S23] `apps/server/src/routes/student-quiz.test.ts:827-860`
- f5: Thiếu phiên → 401; email chưa xác minh → 403 `STUDENT_EMAIL_UNVERIFIED`; chưa liên kết → 403 `STUDENT_NOT_LINKED`. — ✅ [S1] `apps/server/src/routes/student.ts:128,133-134,169-170,194-195`

**(g) Dữ liệu chính**

- Vào: `assignmentId` đường dẫn; header `x-student-org-id`.
- Ra: đề sạch (`StudentQuizDetail`: title/due/dueAt/skill/part/type/band/intro/prompt/passage/cue*/optionBank/note?/questions[]/writing?/attempt?) + `attemptId` từ start. — ✅ [S7] `packages/api/src/contracts.ts:2765-2806`; start `:2729-2730`

**(h) Truy vết test**

- Unit: start idempotent + nộp rồi start lại 409 — `apps/server/src/routes/student-quiz.test.ts:676-730`; concurrent start hội tụ một attempt — `:1227-1258`; snapshot bất biến — `:827-860`; guard 401/403 — `:447-487`; cross-org — `:1338-1424`. — ✅
- E2E: hành trình take đầy đủ gồm mở bài, reload, guard — `apps/e2e/specs/student-quiz-take-review.spec.ts:481-615`; leak-check đề sạch — `:616-761`. — ✅
