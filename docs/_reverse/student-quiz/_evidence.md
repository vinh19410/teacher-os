---
type: reverse-evidence
feature: student-quiz
status: draft
updated: 2026-11-12
---
# student-quiz — Bằng chứng tái lập (evidence)

> Mỗi mệnh đề mang nhãn ở spec/gaps/flows có bằng chứng tại đây; dòng nào không tra được về file:line dưới đây thì phải hạ nhãn. Toàn bộ nhãn theo luật ở spec Mục 0.

## §1 Endpoints (điểm gắn và tuyến)

| Endpoint | Method | File:line | Ghi chú |
|---|---|---|---|
| `/api/student` (toàn bộ router quiz) | — | `apps/server/src/app.ts:433` | Mount sau guard middleware — ✅ |
| `/assignments/:assignmentId/quiz` | GET | `apps/server/src/routes/student.ts:1333-1452` | Đề sạch + trạng thái attempt — ✅ |
| `/assignments/:assignmentId/quiz/start` | POST | `apps/server/src/routes/student.ts:1461-1549` | 201 mới / 200 resume / 409 đã nộp — ✅ |
| `/attempts/:attemptId/answer` | PATCH | `apps/server/src/routes/student.ts:1559-1626` | `json_set` 1 key — ✅ |
| `/attempts/:attemptId/essay` | PATCH | `apps/server/src/routes/student.ts:1640-1686` | Chỉ khi có writing part — ✅ |
| `/attempts/:attemptId/media` | PUT | `apps/server/src/routes/student.ts:1699-1817` | Raw body + `X-File-Name` header — ✅ |
| `/attempts/:attemptId/media` | DELETE | `apps/server/src/routes/student.ts:1824-1881` | Idempotent — ✅ |
| `/attempts/:attemptId/media` | GET | `apps/server/src/routes/student.ts:1890-1909` | Stream + header bảo mật — ✅ |
| `/attempts/:attemptId` | GET | `apps/server/src/routes/student.ts:2229-2299` | Summary sau nộp; 409 khi in_progress — ✅ |
| `/attempts/:attemptId/detail` | GET | `apps/server/src/routes/student.ts:2306-2405` | Review đầy đủ + giải thích — ✅ |
| Guard học viên + quizWriteGuard | — | `apps/server/src/routes/student.ts:124-210,716-739,818-820,386-423` | 401/403 + CSRF — ✅ |

## §2 Validation

- Body JSON-only + cap byte thật: 4096B mặc định, 48KB cho `/essay` — ✅ `apps/server/src/routes/student.ts:410-417` (`bodyLimit({ maxSize: c.req.path.endsWith("/essay") ? QUIZ_ESSAY_BODY_MAX : 4096 … })`); hằng `QUIZ_ESSAY_BODY_MAX = 48 * 1024` tại `packages/api/src/contracts.ts:2408`.
- PUT/DELETE media miễn JSON + cap qua regex đường dẫn — ✅ `apps/server/src/routes/student.ts:402-406` + regex `:423` (`/^\/api\/student\/attempts\/[^/]+\/media$/`).
- Đáp án: `q` int ≥ 0, `value` ≤ 500 ký tự — ✅ `packages/api/src/contracts.ts:2732-2741`; range so snapshot chạy server tại `apps/server/src/routes/student.ts:1599-1601`.
- Essay ≤ 10.000 ký tự — ✅ `packages/api/src/contracts.ts:2407,2413-2418`.
- Media: 50MB + 12 MIME — ✅ `packages/api/src/contracts.ts:2423-2452`; tên file strip Cc/Cf + ≤200 — ✅ `packages/api/src/lib/quiz-media.ts:68-89`.
- PUT media: 411 thiếu Content-Length `apps/server/src/routes/student.ts:1713`; rỗng `:1716,1749`; MIME `:1723`; tên file `:1734`; size mismatch `:1761` — chuỗi "kiểm rẻ trước (header), DB sau, R2 cuối" đúng thứ tự code `:1699-1817`.
- Ownership: `ownedAttempt` predicate org+student — ✅ `apps/server/src/routes/student.ts:822-827`; dùng ở answer/essay/media/submit.
- Cross-org: GET quiz join target theo org+student — ✅ `apps/server/src/routes/student.ts:1339-1354`; test `apps/server/src/routes/student-quiz.test.ts:1338-1424`.

## §3 Errors (wording NGUYÊN VĂN — đã trích trong Error Matrix spec Mục 6)

- Toàn bộ 24 dòng bảng 6.1 đối chiếu trực tiếp với `apps/server/src/routes/student.ts` tại đúng dòng đã ghi (kiểm bằng sed từng range ngày 2026-11-12). — ✅
- Coded errors: `ATTEMPT_SUBMITTED` (:913-916), `MEDIA_CONFLICT` (:917-920), `MEDIA_REQUIRED` (:1982-1984) — chỉ PUT media / submit dùng biến có `code`; các route còn lại trả wording trần. — ✅
- Client map lỗi nộp: MEDIA_REQUIRED → "Bạn cần tải file bài nói lên trước khi nộp"; MEDIA_CONFLICT → "File bài nói vừa thay đổi — hãy thử nộp lại"; 401 → banner reauth — ✅ `apps/student/src/components/quiz/quiz-take-view.tsx:293-305,495-505`.
- Client map lỗi upload: đầy đủ ở `apps/student/src/components/quiz/speaking-upload-state.ts:46-110` — 401 reauth, 409+ATTEMPT_SUBMITTED redirect, 409 khác "File vừa được thay ở tab khác — đã tải lại.", 413 "File vượt quá 50 MB.", 415 "Định dạng không hỗ trợ.", 0 "Không tải lên được — kiểm tra kết nối.", 400 "File không hợp lệ. Hãy chọn file khác.". — ✅

## §4 Business Rules (code khẳng định)

- Unique 1 attempt/lượt giao — ✅ `packages/db/src/schema/quiz-attempt.ts:86-89` (`uniqueIndex("quiz_attempt_assignment_student_uq").on(assignmentId, studentId)`); race re-read `apps/server/src/routes/student.ts:1539-1549`; test đồng thời `apps/server/src/routes/student-quiz.test.ts:1227-1258`.
- Snapshot đóng băng — ✅ `apps/server/src/routes/student.ts:1526-1538` (start ghi `questionsSnapshot = JSON.stringify(parseQuizQuestions(prompt.questions))`); GET quiz lấy câu từ snapshot khi có attempt `:1390-1393`; test bất biến `apps/server/src/routes/student-quiz.test.ts:827-860`.
- Flip-first submit — ✅ `apps/server/src/routes/student.ts:1944-1952` (UPDATE … WHERE status='in_progress' + `isNotNull(mediaKey)` khi cần); thua CAS 409 `:1979-1984`; batch correctCount + stamp `:1993-2021`; self-heal `:2023-2045`; test `apps/server/src/routes/student-quiz.test.ts:731-793`.
- Grade thuần từ snapshot — ✅ `packages/api/src/lib/grade-quiz.ts:22-72` (normalize trim+collapse+lowercase, `ALT_SEPARATOR = " / "`, verdicts, answerSet Kuhn); test `grade-quiz.test.ts`.
- correctCount chỉ lúc nộp — ✅ docblock `packages/db/src/schema/quiz-attempt.ts:22-23` + code `apps/server/src/routes/student.ts:1998` (không có đường ghi nào khác — grep `correctCount` toàn route chỉ submit + đọc).
- Speaking cần file trước nộp — ✅ `apps/server/src/routes/student.ts:1939-1984`; test `apps/server/src/routes/student-quiz-media.test.ts:419-451` (nộp thiếu file MEDIA_REQUIRED + không đóng dấu target).
- Note chỉ lộ cho speaking ở take — ✅ `apps/server/src/routes/student.ts:1414-1418` (spread `...(prompt.skill === "speaking" ? { note: prompt.note } : {})`) + docblock contract `packages/api/src/contracts.ts:2769-2776`.
- Giải thích chỉ sau nộp, fallback theo (stem, đáp án) — ✅ `apps/server/src/routes/student.ts:296-312` (`fillExplanationsFromCurrent`); test `student-quiz-explanation.test.ts`.
- Đóng dấu lượt giao — ✅ `apps/server/src/routes/student.ts:2003-2008` (`class_assignment_target.submittedAt = new Date().toISOString()` trong batch); self-heal chỉ stamp khi `submittedAt === null` `:2040-2041`.

## §5 Entities (schema + migration)

- `quiz_attempt` đủ cột — ✅ `packages/db/src/schema/quiz-attempt.ts:51-107`; CHECK mode — ✅ `:103-107`; index học viên — ✅ `:92-96`.
- `quiz_attempt_annotation` — cột: id/org_id/attempt_id/start_offset/end_offset/note/created_at/updated_at; essay là tài liệu đóng băng sau nộp (docblock: không lưu trích đoạn, offset luôn ổn định; chống chồng ở server 409 OVERLAP) — ✅ `packages/db/src/schema/quiz-attempt-annotation.ts:6-40`; migration `0035_ambiguous_freak.sql`.
- `class_assignment` + `class_assignment_target` — ✅ `packages/db/src/schema/class-assignment.ts:30-78`; dueAt `0059_self_study_plan.sql`; availableAt `0060_study_pack.sql`.
- `assignment_prompt` — ✅ `packages/db/src/schema/assignment-prompt.ts:27-52`; optionBank ≤ 8 tại `packages/api/src/contracts.ts:487-489` (`ASSIGNMENT_OPTION_BANK_MAX = 8`, dùng chung take + admin).
- Chuỗi migration bảng attempt: `0030_previous_drax.sql` (CREATE + unique), `0031` (ADD essay), `0032` (ADD media_*), `0033` (ADD grade_*, ghi chú DEPLOY ORDER), `0041_known_ink.sql` (practice rebuild: assignment_id nullable + test_id + mode + CHECK + index, backup/restore thủ công do D1 cascade).

## §6 Cross-repo hops (luồng nhiều chặng — ghi rõ từng chặng)

- Autosave client → server: `quiz-attempt-store.ts` (debounce/queue/mirror) → fetch PATCH `/attempts/:id/answer` trong `repos/quiz.ts` → `json_set` tại `apps/server/src/routes/student.ts:1606-1612`. Mỗi chặng có test riêng (store test thuần node + route test DB thật). — ✅
- Submit → chấm → hiển thị: POST submit `apps/server/src/routes/student.ts:1919-2051` → `gradeQuiz` thuần `packages/api/src/lib/grade-quiz.ts` → summary `apps/server/src/routes/student.ts:2229-2299` → client `repos/quiz.ts` parse schema strict → UI `$attemptId.tsx`. — ✅
- Submit → AI grading (boundary): `apps/server/src/routes/student.ts:1960-1961` chỉ gọi `scheduleAiGrading` khi thắng flip && `hasGradableTask(header)`; pipeline chấm thuộc feature grading. — ✅
- Media upload → R2 → replay: PUT `apps/server/src/routes/student.ts:1699-1817` → `createR2MediaStore` (`r2-media-store.ts`) → GET stream `apps/server/src/routes/student.ts:1890-1909` → client fetch blob (`repos/quiz.ts`) → player (`quiz-media-player.tsx`). — ✅
- E2E seed trực tiếp DB (không qua admin API) + auth học viên thật: `apps/e2e/specs/helpers-quiz.ts:71-228` (`seedQuizFixture` INSERT organization/class/student/enrollment/user/membership/lesson/assignment_prompt/class_assignment/class_assignment_target). — ✅

## §7 Gaps trong bằng chứng

- Không chạy được test (luật batch: static read only) — trạng thái "active" của test suy từ không có skip/todo/only/fails + có trong suite mặc định. — 🟡 *(xác nhận khi chạy CI → OQ-10)*
- Thứ tự dòng chính xác của các component UI con bên trong `$attemptId.tsx` (phân cụm câu hỏi, navigator) chỉ đọc ở mức cấu trúc, không đo pixel — SC-sq-03/04/05 dựa hoàn toàn vào assertion e2e. — ✅ (không ảnh hưởng mệnh đề nghiệp vụ nào)
- `student-class.ts` chỉ đọc để xác định nguồn dòng tổng quan; chi tiết phân trang/bộ lọc thuộc feature tổng quan. — ✅ (ranh giới)
