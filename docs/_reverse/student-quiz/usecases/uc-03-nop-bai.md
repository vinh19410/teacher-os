---
type: reverse-usecase
feature: student-quiz
uc: UC-03
status: draft
updated: 2026-11-12
---
# UC-03 — Nộp bài một lần

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Học viên chốt bài: UI cảnh báo câu trống, máy chủ flip trạng thái một lần nguyên tử, chấm tự động số câu đúng và đóng dấu lượt giao |
| (b) Actor chính | Học viên. Phụ: bộ chấm thuần từ snapshot; (boundary) bộ kích hoạt chấm AI |
| (c) Tiền điều kiện | Attempt `in_progress`; đề Speaking đã có file (BR-sq-004); mọi pending autosave đã drain |
| (d) Hậu điều kiện | `status='submitted'`, `submitted_at` trên attempt, `correct_count` được ghi, `class_assignment_target.submitted_at` đóng dấu ISO; mọi lệnh ghi sau này bị chặn 409 |

**(e) Luồng chính**

1. Học viên bấm "Nộp bài". — ✅ [S20] `apps/student/src/components/quiz/quiz-runtime-header.tsx:85`
2. UI đếm câu chưa trả lời; còn câu trống → dialog "Bạn còn N câu hỏi chưa làm. Bạn có muốn nộp bài không? Sau khi nộp, bạn không thể thay đổi đáp án." — ✅ [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:160-174`
3. UI drain autosave (tối đa 2 wave) rồi POST submit với body `{}`. — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:356-400`; [S7] `packages/api/src/contracts.ts:2729-2730`
4. Máy chủ đọc skill để xác định `requiresMedia` (đề Speaking). — ✅ [S1] `apps/server/src/routes/student.ts:1936-1943`
5. Đáp ứng điều kiện → chốt `in_progress → submitted` một lần + đóng dấu thời điểm nộp, chỉ khi còn `in_progress` (và đã có file bài nói khi cần) — chốt trong một bước duy nhất. — ✅ [S1] `apps/server/src/routes/student.ts:1944-1952`
6. Flip thắng → chấm bằng `gradeQuiz` thuần từ snapshot + answers: normalize (trim + gộp khoảng trắng + lowercase), đáp án chính ± alternates ngăn cách " / ", `answerSet` ghép cặp tối đa (Kuhn), verdict correct/wrong/skipped. — ✅ [S8] `packages/api/src/lib/grade-quiz.ts:22-72`
7. Ghi phụ trong MỘT `db.batch`: `correct_count` trên attempt + `submitted_at` (ISO string) trên target. — ✅ [S1] `apps/server/src/routes/student.ts:1993-2021`
8. Trả `200` với `correctCount` + trạng thái; UI chuyển man summary. — ✅ [S1] `apps/server/src/routes/student.ts:2044-2049`; [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:288-310`
9. Bài có phần chấm được → kích hoạt lịch chấm AI (nền, không chặn phản hồi). — ✅ [S1] `apps/server/src/routes/student.ts:1960-1961`, [S29] `apps/server/src/lib/ai-grading/run-grading.ts:560-574`

**(f) Luồng thay thế/đặc biệt**

- f1: Đề Speaking chưa có file → 400 `{ error: "media required", code: "MEDIA_REQUIRED" }`; toast "Bạn cần tải file bài nói lên trước khi nộp"; target KHÔNG bị đóng dấu. — ✅ [S1] `apps/server/src/routes/student.ts:1982-1984`; [S16] `:295`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:419-451`
- f2: Nộp kép / tab khác đã nộp → flip 0 rows → re-read: đã nộp → 409 `ATTEMPT_SUBMITTED`; vẫn in_progress mà thiếu file → MEDIA_REQUIRED, có file → 409 `MEDIA_CONFLICT`. — ✅ [S1] `apps/server/src/routes/student.ts:1976-1984`; toast [S16] `:296,300-304`
- f3: Flip thắng nhưng `db.batch` lỗi và dấu chưa có → request sau self-heal stamp (chỉ khi `submittedAt === null`). — ✅ [S1] `apps/server/src/routes/student.ts:2023-2045`; test [S23] `apps/server/src/routes/student-quiz.test.ts:774-793`
- f4: Correct_count ghi bởi request thua CAS không xảy ra — grade tính từ dữ liệu đã freeze nên không đụng trạng thái nộp. — ✅ [S1] `apps/server/src/routes/student.ts:1911-1918` (docblock), `:1993-1998`
- f5: Sau nộp: PATCH answer/essay → 409; PUT/DELETE media → 409 `ATTEMPT_SUBMITTED` (object R2 giữ nguyên); DELETE không xoá object sau nộp. — ✅ [S1] `apps/server/src/routes/student.ts:1596,1623,1662,1683,1742,1867-1877`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:564-600`

**(g) Dữ liệu chính**

- Vào: body `{}`; attemptId đường dẫn.
- Ra: `{ ok?, correctCount, status: "submitted", submittedAt }` — client chỉ cần biết thành công để điều hướng. — ✅ [S1] `apps/server/src/routes/student.ts:2044-2049`

**(h) Truy vết test**

- Unit: double submit + restart 409 — `apps/server/src/routes/student-quiz.test.ts:731-773`; self-heal stamp — `:774-793`; MEDIA_REQUIRED + không stamp — `apps/server/src/routes/student-quiz-media.test.ts:419-451`. — ✅
- E2E: guard nộp khi còn câu trống trong hành trình take — `apps/e2e/specs/student-quiz-take-review.spec.ts:481-615`; speaking submit + phát lại — `:1083-1164`. — ✅
