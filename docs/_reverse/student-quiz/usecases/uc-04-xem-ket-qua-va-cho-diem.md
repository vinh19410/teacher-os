---
type: reverse-usecase
feature: student-quiz
uc: UC-04
status: draft
updated: 2026-11-12
---
# UC-04 — Xem kết quả và chờ điểm giáo viên

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Sau nộp, học viên xem tóm tắt số câu đúng/sai/bỏ qua và bảng đáp án; bài Speaking/Writing hiển thị "Đang chờ giáo viên chấm" rồi tự cập nhật điểm; xem lại toàn bộ bài kèm giải thích |
| (b) Actor chính | Học viên. Phụ: giáo viên (chấm — thuộc feature grading), client poll |
| (c) Tiền điều kiện | Attempt `submitted` (còn `in_progress` → 409) |
| (d) Hậu điều kiện | Học viên thấy verdict từng câu, đáp án của mình so với key, giải thích, media, (khi có) điểm + band + nhận xét + highlight |

**(e) Luồng chính**

1. Submit thành công điều hướng sang man summary (hoặc mở quiz đã nộp → thẳng summary). — ✅ [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-62`
2. GET `/attempts/:id`: chưa nộp → 409 `attempt not yet submitted` (client điều hướng về); nộp rồi → summary. — ✅ [S1] `apps/server/src/routes/student.ts:2229-2299`, gate `:2236-2239`
3. Summary gồm: correct/wrong/skipped/total, từng câu {verdict, key, đáp án của mình (null nếu rỗng)}, bài Writing kèm số từ, media nếu Speaking. — ✅ [S1] `apps/server/src/routes/student.ts:2246-2274`, [S7] `packages/api/src/contracts.ts:2833-2877`
4. UI hiển thị "Bạn đã nộp bài lúc …", "Bảng đáp án", "Xem chi tiết bài làm"; đề Speaking thêm "Bài nói của bạn" kèm player, đề Writing "Bài viết của bạn". — ✅ [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:126,157,214,220,243`
5. Speaking/Writing chưa chấm → nhãn "Đã nộp — Đang chờ giáo viên chấm"; client poll summary mỗi 15 giây, tối đa 40 lần, refetch khi focus. — ✅ [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:144`; [S11] `apps/student/src/lib/repos/quiz.ts:201-248`
6. Giáo viên chấm xong (feature grading) → poll thấy `grade` (scores + band + feedback) và hiển thị. — ✅ [S28] `apps/server/src/lib/quiz-grade.ts:1-37`, [S1] `apps/server/src/routes/student.ts:2276-2281`
7. Học viên bấm "Xem chi tiết bài làm" → GET detail: đề đầy đủ kèm `answer` + `alts`, đáp án của mình, verdict từng câu, `note` đề, giải thích từng câu. — ✅ [S1] `apps/server/src/routes/student.ts:2306-2405`, [S15] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`

**(f) Luồng thay thế/đặc biệt**

- f1: Giải thích khi đề đã bị sửa: không tìm thấy theo id câu → khớp theo cặp (stem, đáp án) từ đề hiện tại. — ✅ [S1] `apps/server/src/routes/student.ts:296-312,2306-2405`; test [S25] `apps/server/src/routes/student-quiz-explanation.test.ts`
- f2: Bài Writing có highlight đã chấm → key `annotations` (offset quy đổi raw→plain); không highlight thì không có key. — ✅ [S1] `apps/server/src/routes/student.ts:2282-2298`, [S28] `apps/server/src/lib/quiz-annotation.ts:29-40`
- f3: Attempt practice → summary thêm `practice: true` + `testId` để dựng điều hướng về đề. — ✅ [S1] `apps/server/src/routes/student.ts:2267-2271`
- f4: Speaking nộp thiếu file (dữ liệu legacy) → "Bài này được nộp khi chưa có file bài nói." — ✅ [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:185`; OQ-7
- f5: Bài Writing nộp trống → "Bạn đã nộp bài trống." — ✅ [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:253`
- f6: Bài không có phần chấm tay → chỉ kết quả tự chấm, không poll. — ✅ [S11] `apps/student/src/lib/repos/quiz.ts:188-248`
- f7: Bố cục Writing ≥ 921px tách hai khung đề/bài. — ✅ [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:86-92,330-340`

**(g) Dữ liệu chính**

- Vào: attemptId.
- Ra: `QuizAttemptSummary` (+`grade`/`annotations`/`practice`/`testId`/`part` tuỳ điều kiện) và `QuizAttemptDetail` (thêm `questions` đầy đủ + `note` + `explanation`). — ✅ [S7] `packages/api/src/contracts.ts:2833-2908`

**(h) Truy vết test**

- Unit: summary sau nộp + verdicts — `apps/server/src/routes/student-quiz.test.ts:568-626,1066-1147`; giải thích + fallback — `apps/server/src/routes/student-quiz-explanation.test.ts`; grade mapping — `apps/server/src/lib/quiz-grade.ts` qua test grade-quiz. — ✅
- E2E: chip Đúng/Chưa trả lời, "Đúng 1 câu · Sai 1 · Bỏ qua 3", "Giải thích" — `apps/e2e/specs/student-quiz-take-review.spec.ts:481-761`; leak-check detail không lộ trước nộp — `:616-761`. — ✅
