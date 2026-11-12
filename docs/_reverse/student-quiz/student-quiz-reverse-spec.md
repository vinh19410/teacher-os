---
type: reverse-srs
feature: student-quiz
status: draft
updated: 2026-11-12
confidence_summary: "✅131 🔵1 🟡12 (trong spec; toàn bộ 13 file: ✅305 🔵1 🟡13 — đếm theo luật batch sau audit) — OQ 10"
complexity_flags: [state-machine, media]
---

# student-quiz — SRS tái lập (reverse) từ mã nguồn

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).
> Toàn bộ nhãn tuân theo luật trên; mỗi mệnh đề mang nhãn đặt ở đầu dòng kèm cite `file:line` (định danh chỉ xuất hiện trong cite, trừ mã lỗi là wording hợp đồng API).

## 0. Tổng quan và nguồn

- Mục tiêu tài liệu: tái lập yêu cầu nghiệp vụ của tính năng **học viên làm quiz được giao (assignment)** trọn vòng đời một lượt làm bài: mở quiz từ lượt giao → bắt đầu (tạo attempt + đóng băng đề) → trả lời từng câu + bài viết + file bài nói (tự lưu) → nộp bài (chốt một lần) → xem kết quả tóm tắt/chi tiết → chờ và nhận điểm giáo viên. — ✅ tập hợp từ code: [S1] `apps/server/src/routes/student.ts:1333-2051`, [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:126-300`, [S16] `apps/student/src/components/quiz/quiz-take-view.tsx`.
- Danh mục nguồn đầy đủ: `reverse-sources.md` (S1–S33). Bằng chứng từng mệnh đề: `_evidence.md`. Sơ đồ: `srs/student-quiz-reverse-flows.md`, `srs/student-quiz-reverse-states.md`, `srs/student-quiz-reverse-erd.md`. Use case: `usecases/`. Hổng và câu hỏi mở: `reverse-gaps.md`.

### 0.1 Bảng nguồn (tóm tắt — chi tiết ở `reverse-sources.md`)

| ID | Nguồn | Vai trò trong feature |
|----|-------|----------------------|
| S1 | `apps/server/src/routes/student.ts` (2410 dòng) | Toàn bộ API quiz học viên: guard, GET quiz, start, answer, essay, media, submit, summary, detail |
| S2 | `packages/db/src/schema/quiz-attempt.ts` | Entity `quiz_attempt` — trạng thái, snapshot, answers, essay, media_*, grade_* |
| S3 | `packages/db/src/schema/class-assignment.ts` | Lượt giao `class_assignment` + đích học viên `class_assignment_target` (submittedAt) |
| S4 | `packages/db/src/schema/assignment-prompt.ts` | Đề: questions JSON, optionBank, note, transcript, writingPart, status |
| S5 | `packages/db/src/schema/assignment-test.ts` | Đề full-test + part (nguồn đề practice — ranh giới) |
| S6 | `packages/db/src/schema/quiz-attempt-annotation.ts` | Highlight/ghi chú giáo viên trên bài Writing (học viên chỉ đọc) |
| S7 | `packages/api/src/contracts.ts` (khối quiz ~2391-2908) | Hợp đồng Zod: caps, schema take/summary/detail, mã lỗi |
| S8 | `packages/api/src/lib/grade-quiz.ts` + `grade-quiz.test.ts` | Bộ chấm tự động thuần từ snapshot |
| S9 | `packages/api/src/lib/quiz-media.ts` | Allowlist MIME, sanitize tên file, format kích thước |
| S10 | `packages/api/src/lib/infer-question-types.ts` | Suy tfng/ynng cho câu điền chữ không khai type |
| S11 | `apps/student/src/lib/repos/quiz.ts` | Client API: endpoint, hằng poll chờ chấm, upload XHR, blob media |
| S12 | `apps/student/src/lib/quiz-attempt-store.ts` | Máy tự lưu client (debounce, mirror, halt, keepalive) |
| S13 | `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx` | Loader mở quiz + điều hướng resume/đã nộp |
| S14 | `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` | Màn làm bài + màn tóm tắt sau nộp |
| S15 | `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` | Màn xem lại chi tiết |
| S16 | `apps/student/src/components/quiz/quiz-take-view.tsx` | View làm bài: gate bắt đầu, dialog, toast lỗi nộp |
| S17 | `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx` | 3 dialog vòng đời (bắt đầu/tiếp tục/còn câu trống) |
| S18 | `apps/student/src/components/quiz/speaking-submission-panel.tsx` + `speaking-upload-state.ts` | Panel bài nói + máy trạng thái tải lên |
| S19 | `apps/student/src/components/quiz/quiz-media-player.tsx` | Player nghe/xem lại bài nói (blob URL) |
| S20 | `apps/student/src/components/quiz/quiz-runtime-header.tsx` | Header: trạng thái lưu, Thoát, Nộp bài |
| S21 | `apps/student/src/lib/assignment-status.ts` | Nhãn trạng thái lượt giao ("Quá hạn", "Đã nộp", "Điểm: X"…) |
| S22 | `apps/student/src/components/overview/assignment-row.tsx` | Dòng tổng quan: link "Làm bài"/"Xem lại kết quả" |
| S23 | `apps/server/src/routes/student-quiz.test.ts` | 23 test unit route quiz (đều active) |
| S24 | `apps/server/src/routes/student-quiz-media.test.ts` | 14 test unit media bài nói (đều active) |
| S25 | `apps/server/src/routes/student-quiz-explanation.test.ts` | 12 test giải thích sau nộp #358 (đều active) |
| S26 | `apps/server/src/lib/media-response.ts` + `media-store.ts` + `r2-media-store.ts` | Store media R2 + header bảo mật phản hồi |
| S27 | `apps/server/src/lib/assignment-visibility.ts` | Filter `availableAt` — bài chưa mở → 404 |
| S28 | `apps/server/src/lib/quiz-grade.ts` + `quiz-annotation.ts` | Map grade/annotation DB → DTO học viên |
| S29 | `apps/server/src/lib/ai-grading/run-grading.ts` | Kích hoạt bản nháp chấm AI khi nộp (ranh giới feature `grading`) |
| S30 | `packages/db/src/migrations/0030_previous_drax.sql`, `0031_classy_victor_mancha.sql`, `0032_mature_saracen.sql`, `0033_adorable_felicia_hardy.sql`, `0035_ambiguous_freak.sql`, `0041_known_ink.sql`, `0054_productive_spencer_smythe.sql`, `0059_self_study_plan.sql`, `0060_study_pack.sql` | Migration tạo/biến đổi bảng quiz_attempt, annotation, ai_grading_draft, due_at/available_at |
| S31 | `apps/e2e/specs/student-quiz-take-review.spec.ts` + `helpers-quiz.ts` | 11 test E2E đầu-cuối (auth thật, seed DB trực tiếp) |
| S32 | `apps/server/src/routes/student-practice.ts` + `student-history.ts` | Ranh giới: tự luyện cùng bảng quiz_attempt; lịch sử học tập |
| S33 | `apps/server/src/app.ts` | Mount `/api/student` + middleware CORP cho route media |

### 0.2 Liên kết tài liệu

| File | Nội dung |
|------|----------|
| `reverse-sources.md` | provenance S1–S33: đường dẫn, range dòng, độ tin cậy |
| `reverse-gaps.md` | OQ + gaps + conflicts + giả định suy ra |
| `_evidence.md` | bằng chứng từng mệnh đề theo nhóm (endpoint, validation, lỗi, luật, entity, test) |
| `srs/student-quiz-reverse-flows.md` | 5 luồng × 2 sơ đồ (sequence + activity) |
| `srs/student-quiz-reverse-states.md` | máy trạng thái attempt, media, upload UI, autosave |
| `srs/student-quiz-reverse-erd.md` | ERD vùng quiz |
| `usecases/student-quiz-reverse-usecase-index.md` | chỉ mục UC + ma trận UC × FR |
| `usecases/uc-01-…` → `uc-05-…` | 5 use case đầy đủ (a–h) |

### 0.3 Trùng lặp với tài liệu hiện có

- Không có tài liệu SRS/SRS-like cho student-quiz trong `docs/` ngoài bộ reverse này (negative search: `find docs -iname '*quiz*'` trả về 0 kết quả (student-quiz chưa có tài liệu riêng trong docs; các feature reverse lân cận nằm ở `docs/_reverse/`)). — ✅ kiểm ngày 2026-11-12.
- Ranh giới nội dung với các feature reverse lân cận: **assignment-prompt-bank** (soạn đề: questions JSON, optionBank — bộ này chỉ đọc vùng học viên thấy), **assignment-tests** (đề full-test cho practice), **grading** (giáo viên chấm + AI — bộ này chỉ ghi nhận điểm kích hoạt và hiển thị). — ✅ `docs/_reverse/` liệt kê các feature này; ranh giới chi tiết ở Mục 1.2.

## 1. Scope

### 1.1 In scope

- Xem quiz được giao và mở màn làm bài từ dòng tổng quan ("Làm bài: …" / "Xem lại kết quả: …"). — ✅ [S22] `apps/student/src/components/overview/assignment-row.tsx:65-71`.
- Bắt đầu làm bài: tạo attempt kèm **snapshot đề đóng băng**, idempotent khi quay lại, chặn khi đã nộp. — ✅ [S1] `apps/server/src/routes/student.ts:1461-1549`.
- Trả lời từng câu dạng tự chấm với tự lưu theo câu (ghi nguyên tử từng đáp án). — ✅ [S1] `apps/server/src/routes/student.ts:1559-1626`, [S12] `apps/student/src/lib/quiz-attempt-store.ts`.
- Viết bài Writing lưu riêng (cap 10.000 ký tự) khi đề có phần Writing. — ✅ [S1] `apps/server/src/routes/student.ts:1640-1686`, [S7] `packages/api/src/contracts.ts:2413-2418` (quizEssayPatchSchema).
- Tải lên / thay / xoá / nghe lại **một file bài nói Speaking** trên R2 với allowlist MIME + cap 50MB. — ✅ [S1] `apps/server/src/routes/student.ts:1699-1909`, [S7] `packages/api/src/contracts.ts:2423-2452` (QUIZ_MEDIA_MAX_BYTES + QUIZ_MEDIA_TYPES), [S9] `packages/api/src/lib/quiz-media.ts:5-46`.
- Nộp bài một lần: guard câu trống phía client, chốt một lần `in_progress → submitted` phía server, chấm tự động `correctCount` từ snapshot, đóng dấu lượt giao. — ✅ [S1] `apps/server/src/routes/student.ts:1919-2051`, [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:160-181`.
- Xem kết quả: tóm tắt (đúng/sai/bỏ qua, đáp án của mình vs key) và chi tiết (toàn bộ đề + verdict từng câu + giải thích sau nộp + highlight bài Writing + media bài nói). — ✅ [S1] `apps/server/src/routes/student.ts:2229-2405`, [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:126-300`, [S15] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`.
- Chờ giáo viên chấm bài nói/bài viết: poll định kỳ, nhãn "Đã nộp — Đang chờ giáo viên chấm", hiển thị điểm + nhận xét khi có. — ✅ [S11] `apps/student/src/lib/repos/quiz.ts:201-203`, [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:144`.
- Bảo mật truy cập: guard học viên (401/403), IDOR org+student trên mọi truy vấn, cách ly tổ chức, CSRF write-guard cho mọi method ghi. — ✅ [S1] `apps/server/src/routes/student.ts:124-210,386-421,822-902`.

### 1.2 Out of scope (thuộc feature khác, chỉ định ranh giới)

- Chế độ **tự luyện (practice)**: dùng chung bảng `quiz_attempt` với `mode='practice'`, route riêng `/api/student/practice*` — chỉ ghi nhận ở states/ERD để tránh hiểu nhầm dữ liệu. — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:33-41`, [S32] `apps/server/src/routes/student-practice.ts:229,367,412`.
- **Lịch sử học tập** `/api/student/history*`: chỉ đọc kết quả đã nộp. — ✅ [S32] `apps/server/src/routes/student-history.ts`.
- Soạn đề / giao đề (prompt bank, test, lượt giao): feature **assignment-prompt-bank / assignment-tests / classes**. Bộ này chỉ đọc prompt như dữ liệu vào. — ✅ [S4] `packages/db/src/schema/assignment-prompt.ts:50` (status draft|ready).
- **Chấm bài của giáo viên** (ghi `grade_*`, ghi chú highlight) và **pipeline chấm AI**: học viên chỉ nhận kết quả; điểm kích hoạt duy nhất từ phía feature này là `scheduleAiGrading` lúc nộp. — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:30-31`, [S1] `apps/server/src/routes/student.ts:1960-1961`, [S29] `apps/server/src/lib/ai-grading/run-grading.ts:560-574`.
- Vocabulary, inbox, notifications: route khác trong cùng router `/api/student`, không thuộc quiz. — ✅ [S1] `apps/server/src/routes/student.ts:548-713`.

## 2. Actors

| Actor | Vai trò | Bằng chứng |
|---|---|---|
| Học viên đã đăng nhập | Diễn viên chính: mở quiz, làm bài, nộp, xem kết quả; danh tính qua `studentCtx` (session user ↔ student, chọn org qua header) | ✅ [S1] `apps/server/src/routes/student.ts:124-210,716-739` |
| Giáo viên | Gián tiếp: chấm điểm `grade_*` + highlight bài Writing; kết quả lộ cho học viên qua summary/detail | ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:74-79`, [S28] `apps/server/src/lib/quiz-annotation.ts:11-40` |
| Hệ thống chấm AI | Boundary: nhận lịch chấm khi nộp bài có phần tự chấm được (Writing); học viên không gọi trực tiếp | ✅ [S1] `apps/server/src/routes/student.ts:1960-1961`, [S29] `apps/server/src/lib/ai-grading/run-grading.ts:560-574` |
| R2 object storage | Lưu file bài nói; không có cấu hình → 503 thoái hoá có kiểm soát | ✅ [S26] `apps/server/src/lib/r2-media-store.ts:14-48`, [S1] `apps/server/src/routes/student.ts:1704` |
| Hệ thống nền (không tồn tại) | Không có cron nào tự nộp bài hết hạn hay đóng attempt; `due`/`dueAt` chỉ hiển thị và derive trạng thái, không enforce ở server | 🟡 negative search: `apps/server/src/routes/student.ts:2058-2167` (gate review chỉ kiểm status) + [S27] `apps/server/src/lib/assignment-visibility.ts:1-16` (chỉ lọc `availableAt`) → OQ-1 |

## 3. Functional Requirements

- **FR-sq-001** — Học viên mở chi tiết quiz được giao: hệ thống xác nhận học viên thuộc lớp nhận lượt giao (join `class_assignment_target` theo org + student), trả đề sạch kèm trạng thái attempt hiện có (chưa bắt đầu / đang làm / đã nộp) và hạn nộp dạng ISO khi có. Bài chưa tới giờ mở (`availableAt` tương lai) hoặc không thuộc học viên → 404 chung `assignment not found`. — ✅ [S1] `apps/server/src/routes/student.ts:1333-1377`, [S27] `apps/server/src/lib/assignment-visibility.ts:1-16`; test [S23] `apps/server/src/routes/student-quiz.test.ts:1338-1368` (cross-org).
- **FR-sq-002** — Đề trả về cho màn làm bài KHÔNG chứa đáp án: mỗi câu chỉ có `stem`, `opts`, dạng bài hiệu dụng (`type` riêng của câu ?? type đề; suy thêm tfng/ynng cho câu điền chữ có đáp án T/F/NG hoặc Y/N/NG), điểm neo `pin`; `answer`/`alts`/`transcript` không bao giờ xuống wire; "Hướng dẫn thêm" (`note`) chỉ mở với đề Speaking (đề Speaking không có answer key). — ✅ [S1] `apps/server/src/routes/student.ts:1396-1417`, [S7] `packages/api/src/contracts.ts:2743-2756` (docblock RT#6), [S10] `packages/api/src/lib/infer-question-types.ts:1-89`; test [S25] `apps/server/src/routes/student-quiz-explanation.test.ts`.
- **FR-sq-003** — Bắt đầu làm bài: `POST …/quiz/start` tạo attempt `in_progress` với **snapshot đề đầy đủ đóng băng tại thời điểm bắt đầu** (`questions_snapshot`), trả `201 {attemptId}`; nếu đã có attempt đang làm → trả lại cùng `attemptId` với `200` (idempotent resume); nếu đã nộp → `409 attempt already submitted` (không retake v1); insert đụng unique `(assignmentId, studentId)` khi hai request đồng thời → re-read và resume. — ✅ [S1] `apps/server/src/routes/student.ts:1461-1549`, [S2] `packages/db/src/schema/quiz-attempt.ts:86-89` (unique index); test [S23] `apps/server/src/routes/student-quiz.test.ts:676-790,1227-1258`.
- **FR-sq-004** — Tự lưu từng đáp án: mỗi lần lưu ghi một key `"<qIndex>" → "<value>"` vào JSON `answers` bằng ghi nguyên tử từng key (D1 không có transaction — cấm read-modify-write); index ngoài phạm vi snapshot → 400 `question index out of range`; giá trị cap 500 ký tự; chỉ khi attempt còn `in_progress` (0 rows cập nhật → phân biệt 404/409 bằng re-read status). — ✅ [S1] `apps/server/src/routes/student.ts:1552-1626`, [S7] `packages/api/src/contracts.ts:2401,2732-2741`; test [S23] `apps/server/src/routes/student-quiz.test.ts:794-825,1260-1293`.
- **FR-sq-005** — Tự lưu bài viết: `PATCH /attempts/:id/essay` ghi toàn văn bài Writing (cap 10.000 ký tự) khi và chỉ khi đề có phần Writing (không có → 400 `essay not allowed`); essay nằm ngoài map `answers` vì đề Writing không có câu hỏi đánh số. — ✅ [S1] `apps/server/src/routes/student.ts:1640-1686`, [S2] `packages/db/src/schema/quiz-attempt.ts:23-26`, [S7] `packages/api/src/contracts.ts:2664-2671`.
- **FR-sq-006** — Tự lưu phía client: mỗi thay đổi đáp án được xếp hàng và gửi sau 600ms debounce; yêu cầu đang bay theo cùng câu bị bỏ qua và giá trị mới nhất được gửi lại sau (last-write-wins); toàn bộ pending được gửi kèm ngay khi rời trang (yêu cầu "gửi là xong", không cần phản hồi); bản sao đáp án ghi mirror vào bộ nhớ cục bộ để khôi phục. — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:11-25,223-260,345-355`, [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:350-354`; test [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts` (autosave + reload).
- **FR-sq-007** — Khôi phục bài làm dở: mở lại quiz có attempt `in_progress` → dialog "Tiếp tục bài làm"; đáp án ghép mirror-localStorage đè lên dữ liệu server (mirror mới hơn thắng), sau đó drain đồng bộ. Đã nộp → xoá mirror và chuyển thẳng tới màn kết quả. — ✅ [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-62`, [S12] `apps/student/src/lib/quiz-attempt-store.ts:375-480`; test [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:614-712`.
- **FR-sq-008** — Tải file bài nói: Tải file thô (không multipart), tên file khai báo kèm request; từ chối thiếu khai báo độ dài (411), file rỗng (400), vượt 50MB (413), MIME ngoài allowlist 12 loại audio/video (415), tên file rỗng/quá 200 ký tự (400); ghi kho tệp theo object key mới mỗi lần, rồi chốt ghi DB theo key cũ; thua đua chốt (file đã bị thay ở tab khác) → xoá object mới bù, thắng → xoá object cũ nền. — ✅ [S1] `apps/server/src/routes/student.ts:1691-1817`, [S9] `packages/api/src/lib/quiz-media.ts:19-77`, [S26] `apps/server/src/lib/r2-media-store.ts:14-48`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:337-451,669-707`.
- **FR-sq-009** — Xoá file bài nói: `DELETE /attempts/:id/media` xoá object R2 (nền) và xoá sạch 5 cột `media_*`; gọi khi chưa có file vẫn `ok` (idempotent); chỉ khi còn `in_progress` (sau nộp → `ATTEMPT_SUBMITTED` 409 và object không bị xoá). — ✅ [S1] `apps/server/src/routes/student.ts:1824-1881`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:564-600,735-762`.
- **FR-sq-010** — Nghe lại bài nói: `GET /attempts/:id/media` stream object kèm header bảo mật (`X-Content-Type-Options: nosniff`, CSP `default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-site`, `Cache-Control: private, no-store`, tên file RFC 5987/8187); client tải qua fetch (đính header org) rồi phát từ blob URL — thẻ `<audio>` trỏ thẳng không gửi được header org. — ✅ [S1] `apps/server/src/routes/student.ts:1890-1909`, [S26] `apps/server/src/lib/media-response.ts:15-46`, [S11] `apps/student/src/lib/repos/quiz.ts:340-431`, [S33] `apps/server/src/app.ts:311-318`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts`.
- **FR-sq-011** — Nộp bài: Nộp bài: nếu đề có phần Speaking mà chưa có file → 400 `MEDIA_REQUIRED`; nếu có file thì chốt `in_progress → submitted` một lần, chỉ khi còn `in_progress` (và đã có file bài nói khi cần) — thua đua chốt (nộp kép) → 409 `ATTEMPT_SUBMITTED`; thắng chốt → chấm `correctCount` từ snapshot + gom các ghi phụ trong một lệnh [ghi correctCount, đóng dấu thời điểm nộp ISO trên lượt giao]; chốt thắng nhưng ghi phụ thất bại và dấu chưa đóng → nhánh tự chữa đóng dấu lại (idempotent). — ✅ [S1] `apps/server/src/routes/student.ts:1911-2051`; test [S23] `apps/server/src/routes/student-quiz.test.ts:731-793`, [S24] `apps/server/src/routes/student-quiz-media.test.ts:419-451`.
- **FR-sq-012** — Kết quả tóm tắt sau nộp: `GET /attempts/:id` — attempt còn `in_progress` → 409 `attempt not yet submitted`; trả correct/wrong/skipped/total, từng câu: verdict + key + đáp án học viên (bỏ qua nếu rỗng), bài Writing kèm số từ, media bài nói theo skill; attempt practice gắn thêm cặp key `practice`/`testId`; điểm giáo viên + highlight chỉ thêm key khi đã chấm (schema strict không vỡ bundle cũ). — ✅ [S1] `apps/server/src/routes/student.ts:2053-2299`, [S7] `packages/api/src/contracts.ts:2833-2877`; test [S23] `apps/server/src/routes/student-quiz.test.ts:568-626,1066-1147`.
- **FR-sq-013** — Xem lại chi tiết: `GET /attempts/:id/detail` — cùng gate 409; trả đầy đủ đề (kèm `answer` + `alts`), đáp án học viên, verdict từng câu, `note` đề, giải thích từng câu (`explanation` — #358) chỉ SAU khi nộp; đề đổi sau đó vẫn khớp giải thích theo cặp (stem, đáp án) từ đề hiện tại khi id không còn; bài Writing kèm highlight/ghi chú đã chấm; media bài nói kèm player. — ✅ [S1] `apps/server/src/routes/student.ts:2306-2405`, [S25] `apps/server/src/routes/student-quiz-explanation.test.ts:14-648`; UI [S15] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`.
- **FR-sq-014** — Chờ giáo viên chấm: sau nộp bài Speaking/Writing chưa có điểm, client poll summary mỗi 15 giây (tối đa 40 lần ≈ 10 phút khi tab mở), refetch khi focus lại cửa sổ; hiển thị "Đã nộp — Đang chờ giáo viên chấm"; khi điểm về, hiển thị điểm + dải band + nhận xét. — ✅ [S11] `apps/student/src/lib/repos/quiz.ts:201-248`, [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:144-192`, [S21] `apps/student/src/lib/assignment-status.ts`.
- **FR-sq-015** — Chặn nộp khi còn câu trống: trước khi gọi submit, UI đếm câu chưa trả lời và yêu cầu xác nhận "Bạn còn N câu hỏi chưa làm. … Sau khi nộp, bạn không thể thay đổi đáp án."; server không tự chặn câu trống (câu bỏ trống chấm `skipped`). — ✅ [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:160-181`, [S8] `packages/api/src/lib/grade-quiz.ts:58-66`.
- **FR-sq-016** — Kiểm soát truy cập: mọi route quiz sau guard học viên — thiếu phiên → 401 `unauthorized`/`UNAUTHORIZED`; email chưa xác minh → 403 `STUDENT_EMAIL_UNVERIFIED`; user chưa liên kết student của org → 403 `STUDENT_NOT_LINKED` (org đọc từ header `x-student-org-id`); mọi truy vấn dữ liệu gắn predicate org + student (IDOR guard); org khác không thấy tài nguyên (404 chung, không tiết lộ tồn tại). — ✅ [S1] `apps/server/src/routes/student.ts:124-210,822-902`; test [S23] `apps/server/src/routes/student-quiz.test.ts:447-566,627-675,1338-1424`.
- **FR-sq-017** — CSRF write-guard cho mọi method ghi của quiz: `Origin` phải nằm trong danh sách tin cậy (403 `origin not allowed`), body JSON-only (415 `content-type must be application/json`), cap 4096 byte đo trên byte thật (413 `payload too large`) — riêng route media PUT/DELETE được miễn JSON + cap (đo 50MB trong store) và riêng PATCH essay có cap 48KB. — ✅ [S1] `apps/server/src/routes/student.ts:386-423`; test [S23] `apps/server/src/routes/student-quiz.test.ts:488-566`.
- **FR-sq-018** — Đồng bộ trạng thái lưu trên UI: header hiển thị "Đang lưu…" / "Đã lưu" / "Lỗi lưu"; lỗi 401 khi autosave → halt engine + banner "Phiên đăng nhập đã hết hạn — bài làm của bạn được giữ lại. Đang chuyển đến trang đăng nhập…". — ✅ [S20] `apps/student/src/components/quiz/quiz-runtime-header.tsx:8-10,47,85`, [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:495-505`, [S12] `apps/student/src/lib/quiz-attempt-store.ts:57-100`.

## 4. Non-functional Requirements

- **NFR-sq-001** — Chống CSRF cho mọi lệnh ghi quiz: danh sách `Origin` tin cậy, JSON-only và cap 4096 byte đo trên byte thật của body (khai báo độ dài giả không lọt); route media được miễn có chủ đích vì là raw upload. — ✅ [S1] `apps/server/src/routes/student.ts:386-423`; test [S23] `apps/server/src/routes/student-quiz.test.ts:488-566`.
- **NFR-sq-002** — Cách ly tổ chức + IDOR: mọi truy vấn attempt/assignment/media gắn predicate `orgId` + `studentId`; tài nguyên của tổ chức khác trả 404 chung (không tiết lộ sự tồn tại); org học viên đọc từ header `x-student-org-id` với dự phòng `?org=` cho thẻ media/link tải không gửi được header. — ✅ [S1] `apps/server/src/routes/student.ts:177-181,822-902,1333-1453`; test [S23] `apps/server/src/routes/student-quiz.test.ts:627-675,1338-1424`.
- **NFR-sq-003** — Không lộ đáp án trên take surface: `answer`/`alts`/`transcript` bị strip khỏi payload trước khi xuống wire; e2e kiểm 3 lớp (payload mạng, DOM, state React). — ✅ [S7] `packages/api/src/contracts.ts:2743-2756`, [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:616-761`.
- **NFR-sq-004** — Độ bền autosave trên D1 không transaction: ghi theo câu bằng ghi nguyên tử từng key (không đọc-ghi hai bước), nộp bài chốt-một-lần nên hai request đồng thời không bao giờ ghi đúp trạng thái; tổng số câu nộp sai lệch không thể xảy ra vì grade tính từ dữ liệu đã freeze. — ✅ [S1] `apps/server/src/routes/student.ts:1552-1558,1911-1918`, [S8] `packages/api/src/lib/grade-quiz.ts:56-72`.
- **NFR-sq-005** — Không mất dữ liệu khi tab đóng: gửi kèm khi rời tab (yêu cầu "gửi là xong"), mirror bộ nhớ cục bộ song song, resume ghép mirror-over-server. — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:223-260,345-355`, [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:350-354`, [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-62`.
- **NFR-sq-006** — Media an toàn: object key sinh server-side và không bao giờ xuống wire (chỉ name/type/size/uploadedAt); phản hồi ghim `nosniff` + CSP `default-src 'none'; sandbox` + `Cache-Control: private, no-store` + tên file RFC 8187; CORP same-site đặt riêng cho đường media học viên. — ✅ [S26] `apps/server/src/lib/media-response.ts:15-46`, [S33] `apps/server/src/app.ts:311-318`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:337-418`.
- **NFR-sq-007** — Media giới hạn cứng: 50 MB (`QUIZ_MEDIA_MAX_BYTES`), 12 loại MIME audio/video, tên file ≤ 200 ký tự sau khi strip ký tự điều khiển; cap đo trên byte thật khi stream vào kho tệp (đếm byte khi ghi, cưỡng chế đúng độ dài khai báo) nên body dối khai báo độ dài vẫn bị chặn. — ✅ [S7] `packages/api/src/contracts.ts:2423-2452`, [S9] `packages/api/src/lib/quiz-media.ts:19-77`, [S26] `apps/server/src/lib/media-store.ts`, `apps/server/src/lib/r2-media-store.ts:14-48`.
- **NFR-sq-008** — Thoái hoá có kiểm soát khi thiếu cấu hình R2: mọi route media trả 503 `media storage unavailable` thay vì crash. — ✅ [S1] `apps/server/src/routes/student.ts:1704,1829-1831,1896-1898`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:600-620`.
- **NFR-sq-009** — Hiệu năng self-graded result: điểm correct/wrong/skipped derive từ snapshot + answers tại thời điểm nộp (không quét lại đề hiện tại); bộ chấm thuần (pure function) chạy cùng luồng request. — ✅ [S8] `packages/api/src/lib/grade-quiz.ts:1-72`, [S1] `apps/server/src/routes/student.ts:1976-1996`.
- **NFR-sq-010** — Chờ chấm tiết kiệm: poll 15s chỉ khi tab mở, dừng sau 40 lần (~10 phút), `staleTime` 15s tránh refetch dồn dập, refetch khi focus cửa sổ. — ✅ [S11] `apps/student/src/lib/repos/quiz.ts:201-248`.
- **NFR-sq-011** — UI tiếng Việt hardcode (R2 — không có catalog i18n cho feature này): mọi wording dialog/toast/nhãn khai trực tiếp trong component. — ✅ [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:295-305`, [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:115-174`, [S20] `apps/student/src/components/quiz/quiz-runtime-header.tsx:8-10`.
- **NFR-sq-012** — Tương thích bundle: payload summary/detail dùng schema strict với key điều kiện (grade/annotations/practice chỉ thêm khi áp dụng) để bundle cũ + server mới không throw trong cửa sổ deploy. — ✅ [S7] `packages/api/src/contracts.ts:2877-2908`, [S1] `apps/server/src/routes/student.ts:2276-2298`.

## 5. Business Rules

- **BR-sq-001** — Một học viên chỉ có MỘT lượt làm bài cho mỗi lượt giao quiz; không retake trong v1 (unique `(assignmentId, studentId)`; start lại → resume cùng attempt; đã nộp → 409 vĩnh viễn). — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:16-18,86-89`, [S1] `apps/server/src/routes/student.ts:1487-1496`; e2e [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:481-615`. *(Vì sao "không retake" là định hướng sản phẩm → OQ-2.)*
- **BR-sq-002** — Đề được đóng băng tại thời điểm bắt đầu (`questions_snapshot`): giáo viên sửa đề sau đó không ảnh hưởng bài đang làm và bài đã nộp; đề xoá vẫn review được từ snapshot (chỉ mất tiêu đề deck). — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:17-19,36-37`, [S1] `apps/server/src/routes/student.ts:1526-1538`; test [S23] `apps/server/src/routes/student-quiz.test.ts:827-860`.
- **BR-sq-003** — Nộp là hành động một lần và chốt vĩnh viễn: mọi lệnh ghi sau nộp (answer/essay/media) bị chặn 409; `correctCount` chỉ được ghi đúng một lần lúc nộp, sau đó chỉ đọc. — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:22-23`, [S1] `apps/server/src/routes/student.ts:1596,1623,1662,1683,1742,1804,1877`; test [S23] `apps/server/src/routes/student-quiz.test.ts:731-773`.
- **BR-sq-004** — Bài Speaking bắt buộc phải có file trước khi nộp; các đề khác nộp tự do (kể cả bỏ trống toàn bộ → 100% skipped). — ✅ [S1] `apps/server/src/routes/student.ts:1939-1984`, [S8] `packages/api/src/lib/grade-quiz.ts:58-60`; test [S24] `apps/server/src/routes/student-quiz-media.test.ts:419-451`.
- **BR-sq-005** — Điểm tự chấm chỉ đếm `correctCount`; điểm Writing/Speaking do giáo viên chấm và chỉ học viên thấy sau khi đã chấm (key `grade` không xuất hiện khi chưa chấm). — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:30-31`, [S28] `apps/server/src/lib/quiz-grade.ts:1-37`, [S1] `apps/server/src/routes/student.ts:2276-2281`.
- **BR-sq-006** — Giải thích (explanation) là phần thưởng sau nộp: không bao giờ xuất hiện ở take payload, chỉ ở detail sau khi nộp; khi đề đã bị sửa, giải thích vẫn khớp theo cặp (stem, đáp án) từ đề hiện tại. — ✅ [S1] `apps/server/src/routes/student.ts:296-312,2306-2405`; test [S25] `apps/server/src/routes/student-quiz-explanation.test.ts`.
- **BR-sq-007** — Nộp trễ vẫn được chấp nhận: server không chặn submit sau `due`/`dueAt`; hạn chỉ dùng để hiển thị ("Quá hạn") và trạng thái trên tổng quan. — ✅ negative search: [S1] `apps/server/src/routes/student.ts:1919-2051` (submit không đọc due), [S27] `apps/server/src/lib/assignment-visibility.ts:1-16` (visibility chỉ lọc `availableAt`), [S21] `apps/student/src/lib/assignment-status.ts` (nhãn trễ). *(Chấp nhận nộp trễ có chủ đích? → OQ-1.)*
- **BR-sq-008** — Bài chưa tới giờ mở không tồn tại với học viên: `availableAt` tương lai → 404 `assignment not found` (chung với "không thuộc lớp"), không có màn "sắp mở". — ✅ [S27] `apps/server/src/lib/assignment-visibility.ts:1-16`, [S1] `apps/server/src/routes/student.ts:1355-1377`. *(Vì sao chọn 404 thay vì trang đếm ngược → OQ-3.)*
- **BR-sq-009** — Highlight/ghi chú giáo viên trên bài Writing chỉ lộ khi đã chấm VÀ có ít nhất một highlight (bài chưa chấm hoặc không highlight không thấy key `annotations`). — ✅ [S1] `apps/server/src/routes/student.ts:2282-2298`, [S6] `packages/db/src/schema/quiz-attempt-annotation.ts`.
- **BR-sq-010** — Kết quả pair-matching (`answerSet`) chấm theo NGHIỆM tối đa trên đồ thị hai phía (Kuhn) với thứ tự duy định — cùng dữ liệu luôn ra cùng verdict ở lần chấm đầu và trang xem lại. — ✅ [S8] `packages/api/src/lib/grade-quiz.ts:61-72`; test [S8] `packages/api/src/lib/grade-quiz.test.ts`.

## 6. Error Matrix (wording là hợp đồng — trích NGUYÊN VĂN)

### 6.1 Lỗi máy chủ (JSON body — wording/code không được đổi)

| HTTP | Điều kiện | Body NGUYÊN VĂN | Nguồn | Nhãn |
|---|---|---|---|---|
| 401 | Thiếu phiên đăng nhập | `{ "error": "unauthorized", "code": "UNAUTHORIZED" }` | [S1] `apps/server/src/routes/student.ts:128` | ✅ |
| 403 | Email chưa xác minh | `{ "error": "STUDENT_EMAIL_UNVERIFIED", "code": "STUDENT_EMAIL_UNVERIFIED" }` | [S1] `packages/api/src/contracts.ts:1967-1973`, `apps/server/src/routes/student.ts:133-134` | ✅ |
| 403 | User không liên kết student/org | `{ "error": "STUDENT_NOT_LINKED", "code": "STUDENT_NOT_LINKED" }` | [S1] `packages/api/src/contracts.ts:1967-1973`, `apps/server/src/routes/student.ts:169-170,194-195` | ✅ |
| 403 | Origin không trong danh sách tin cậy | `{ "error": "origin not allowed" }` | [S1] `apps/server/src/routes/student.ts:400` | ✅ |
| 415 | Content-Type không phải JSON | `{ "error": "content-type must be application/json" }` | [S1] `apps/server/src/routes/student.ts:410` | ✅ |
| 413 | Body vượt cap (4096B / 48KB essay) | `{ "error": "payload too large" }` | [S1] `apps/server/src/routes/student.ts:416` | ✅ |
| 400 | Body không parse được JSON | `{ "error": "invalid json" }` | [S1] `apps/server/src/routes/student.ts:1470,1568,1649,1928` | ✅ |
| 400 | Body sai schema Zod | `{ "error": "invalid body" }` | [S1] `apps/server/src/routes/student.ts:1473,1572,1653,1931` | ✅ |
| 404 | Bài không tồn tại / không thuộc học viên / chưa mở | `{ "error": "assignment not found" }` | [S1] `apps/server/src/routes/student.ts:1362,1375,1495,1521` | ✅ |
| 404 | Attempt không tồn tại / không của học viên | `{ "error": "attempt not found" }` | [S1] `apps/server/src/routes/student.ts:1583,1593,1621,1659,1681` | ✅ |
| 409 | Hành động sau khi đã nộp (start/answer/essay/delete) | `{ "error": "attempt already submitted" }` | [S1] `apps/server/src/routes/student.ts:1506,1544,1596,1623,1662,1683` | ✅ |
| 409 | PUT media sau nộp (biến có code) | `{ "error": "attempt already submitted", "code": "ATTEMPT_SUBMITTED" }` | [S1] `apps/server/src/routes/student.ts:913-916,1742` | ✅ |
| 409 | Summary/detail khi chưa nộp | `{ "error": "attempt not yet submitted" }` | [S1] `apps/server/src/routes/student.ts:2239,2316` | ✅ |
| 400 | Index câu ngoài phạm vi snapshot | `{ "error": "question index out of range" }` | [S1] `apps/server/src/routes/student.ts:1601` | ✅ |
| 400 | PATCH essay khi đề không có phần Writing | `{ "error": "essay not allowed" }` | [S1] `apps/server/src/routes/student.ts:1665` | ✅ |
| 400 | Nộp đề Speaking khi chưa có file | `{ "error": "media required", "code": "MEDIA_REQUIRED" }` | [S1] `apps/server/src/routes/student.ts:1982-1984` | ✅ |
| 409 | Thua đua chốt media (file đã bị thay ở tab khác) | `{ "error": "media changed", "code": "MEDIA_CONFLICT" }` | [S1] `apps/server/src/routes/student.ts:917-920,1804,1877,1984` | ✅ |
| 503 | Bucket R2 chưa cấu hình | `{ "error": "media storage unavailable" }` | [S1] `apps/server/src/routes/student.ts:1704` | ✅ |
| 400 | PUT/DELETE media trên đề không phải Speaking | `{ "error": "media not allowed" }` | [S1] `apps/server/src/routes/student.ts:1745,1839` | ✅ |
| 411 | Tải media thiếu khai báo độ dài | `{ "error": "length required" }` | [S1] `apps/server/src/routes/student.ts:1713` | ✅ |
| 400 | PUT media body rỗng | `{ "error": "empty file" }` | [S1] `apps/server/src/routes/student.ts:1716,1749` | ✅ |
| 415 | MIME ngoài allowlist 12 loại | `{ "error": "unsupported media type" }` | [S1] `apps/server/src/routes/student.ts:1723` | ✅ |
| 400 | Tên file khai báo rỗng/quá 200 ký tự sau sanitize | `{ "error": "invalid file name" }` | [S1] `apps/server/src/routes/student.ts:1734` | ✅ |
| 400 | Byte stream ≠ độ dài khai báo | `{ "error": "size mismatch" }` | [S1] `apps/server/src/routes/student.ts:1761` | ✅ |
| 404 | GET media khi chưa có file | `{ "error": "media not found" }` | [S1] `apps/server/src/routes/student.ts:1906-1908` | ✅ |

### 6.2 Wording UI tiếng Việt (hợp đồng hiển thị — client)

| Khoảnh khắc | Chuỗi NGUYÊN VĂN | Nguồn | Nhãn |
|---|---|---|---|
| Dialog bắt đầu | "Bắt đầu làm bài" / "Bạn có muốn bắt đầu làm bài ngay bây giờ không?" / nút "Bắt đầu" | [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:115-117` | ✅ |
| Dialog tiếp tục | "Tiếp tục bài làm" / "Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?" / nút "Tiếp tục" | [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:139-141` | ✅ |
| Guard nộp khi còn câu trống | "Bạn còn câu hỏi chưa làm" / "Bạn còn N câu hỏi chưa làm. Bạn có muốn nộp bài không? Sau khi nộp, bạn không thể thay đổi đáp án." / nút "Nộp bài" | [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:169-174` | ✅ |
| Toast thiếu file khi nộp (MEDIA_REQUIRED) | "Bạn cần tải file bài nói lên trước khi nộp" | [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:295` | ✅ |
| Toast thua đua chốt (MEDIA_CONFLICT) | "File bài nói vừa thay đổi — hãy thử nộp lại" | [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:296` | ✅ |
| Toast nộp lỗi khác | "Không nộp được bài" + mô tả "Phiên đăng nhập đã hết hạn." hoặc "Vui lòng kiểm tra kết nối rồi thử lại." | [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:300-304` | ✅ |
| Banner 401 autosave | "Phiên đăng nhập đã hết hạn — bài làm của bạn được giữ lại. Đang chuyển đến trang đăng nhập…" | [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:495-505` | ✅ |
| Trạng thái lưu | "Đang lưu…" / "Đã lưu" / "Lỗi lưu" | [S20] `apps/student/src/components/quiz/quiz-runtime-header.tsx:8-10` | ✅ |
| Tải file lỗi (uploadFailure) | 409 khác: "File vừa được thay ở tab khác — đã tải lại." · 413: "File vượt quá 50 MB." · 415: "Định dạng không hỗ trợ." · mất mạng: "Không tải lên được — kiểm tra kết nối." · 400: "File không hợp lệ. Hãy chọn file khác." · fallback: "Không tải lên được file. Vui lòng thử lại." | [S18] `apps/student/src/components/quiz/speaking-upload-state.ts:46-110` | ✅ |
| Xác nhận xoá file | "Xoá file bài nói?" | [S18] `apps/student/src/components/quiz/speaking-submission-panel.tsx:567` | ✅ |
| Player bài nói | "Xem lại bài nói" (video) / "Nghe lại bài nói" (audio) · lỗi phát: "Trình duyệt không phát được định dạng này." + "Tải file về" | [S19] `apps/student/src/components/quiz/quiz-media-player.tsx:87,124-130` | ✅ |
| Summary đã nộp | "Bạn đã nộp bài lúc …" · "Đã nộp — Đang chờ giáo viên chấm" · "Bài nói của bạn" · "Bài này được nộp khi chưa có file bài nói." · "Giáo viên sẽ chấm bài nói của bạn." · "Bài viết của bạn" · "Bạn đã nộp bài trống." · "Giáo viên sẽ chấm bài viết của bạn." · "Bảng đáp án" · "Xem chi tiết bài làm" | [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:126,144,157,185,192,214,220,243,253,294` | ✅ |

## 7. Success Criteria

- **SC-sq-01** — Hành trình đầu-cuối chuẩn: take → autosave sống qua reload → guard nộp khi còn câu trống → summary → detail → dòng review trên tổng quan ("Xem lại kết quả"). — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:481-615`.
- **SC-sq-02** — Không lộ đáp án ở màn làm bài, kiểm 3 lớp (payload mạng, DOM, state). — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:616-761`.
- **SC-sq-03** — Đề trộn nhiều dạng: header hướng dẫn theo cụm, widget theo type từng câu. — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:762-835`.
- **SC-sq-04** — Đề Reading rộng màn hình: đề và câu hỏi tách hai cột cuộn độc lập. — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:836-883`.
- **SC-sq-05** — Đề một dạng (legacy) đúng một header; intro dán marker "Questions" vẫn tách hướng dẫn theo đoạn câu hỏi. — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:884-949`.
- **SC-sq-06** — Bài Writing: tự lưu kèm đếm từ sống, sống qua reload + quay SPA, guard nộp bài quá ngắn, hiện ở summary. — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:950-1015`.
- **SC-sq-07** — Câu TRUE/FALSE/NOT GIVEN không đánh marker trong đề điền chữ tự nhận dạng và render radio. — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:1016-1082`, [S10] `packages/api/src/lib/infer-question-types.ts:60-89`.
- **SC-sq-08** — Bài nói: kéo-thả tải lên, sống qua reload, thay file, nộp, phát lại ở summary. — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:1083-1164`.
- **SC-sq-09** — Xoá file bài nói → nút nộp bị khoá lại. — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:1165-1195`.
- **SC-sq-10** — Rời giữa chừng tải lên có hỏi trước; huỷ quay lại dropzone; thử lại thành công. — ✅ [S31] `apps/e2e/specs/student-quiz-take-review.spec.ts:1196-1255`.
- Chỉ số nghiệp vụ (tỉ lệ hoàn thành, điểm trung bình, thời gian làm bài thực) chưa có sự kiện đo nào trong code. — 🟡 negative search: không tìm thấy analytics/telemetry trong `apps/student/src/lib/repos/quiz.ts` và route quiz → OQ-4.

## 8. Data Entities

- **quiz_attempt** — trung tâm feature: `mode` (`assignment` | `practice`, default assignment), `status` (`in_progress` | `submitted`, default in_progress), `questions_snapshot` (JSON đề đóng băng), `answers` (JSON `{"<qIndex>":"<value>"}`), `essay` (bài Writing), `media_key/media_name/media_type/media_size/media_uploaded_at` (file bài nói, key không lộ), `correct_count` (chỉ ghi lúc nộp), `grade_scores/grade_feedback/graded_at` (giáo viên), `started_at/submitted_at`; unique `(assignmentId, studentId)`; CHECK `mode='assignment' ⇒ assignmentId NOT NULL`. — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:51-107`, [S30] `packages/db/src/migrations/0030_previous_drax.sql`, `0041_known_ink.sql`.
- **quiz_attempt_annotation** — highlight + ghi chú giáo viên trên bài Writing: `start_offset/end_offset` (UTF-16 trên HTML raw), `note`; essay được freeze cùng bài nộp. — ✅ [S6] `packages/db/src/schema/quiz-attempt-annotation.ts:1-40`, [S30] `packages/db/src/migrations/0035_ambiguous_freak.sql`.
- **class_assignment / class_assignment_target** — lượt giao + đích học viên: `title` snapshot, `due` (ISO ngày), `dueAt` (ISO giờ, nullable — #587), `availableAt` (nullable — #60); đích có `submittedAt` (ISO string, nullable) do submit đóng dấu. — ✅ [S3] `packages/db/src/schema/class-assignment.ts:34-38,68-71`, [S30] `packages/db/src/migrations/0059_self_study_plan.sql`, `0060_study_pack.sql`.
- **assignment_prompt** — nguồn đề: `questions` JSON, `option_bank` (≤8), `note`, `transcript` (không bao giờ xuống wire học viên), `writing_part` (#574), `status` (`draft` | `ready`). — ✅ [S4] `packages/db/src/schema/assignment-prompt.ts:27-52`.
- **assignment_test / assignment_test_part** — đề full-test cho practice (ranh giới). — ✅ [S5] `packages/db/src/schema/assignment-test.ts`.
- **ai_grading_draft** — bản nháp chấm AI (boundary, tạo khi nộp nếu có phần chấm được). — ✅ [S29] `apps/server/src/lib/ai-grading/run-grading.ts:560-574`, [S30] `packages/db/src/migrations/0054_productive_spencer_smythe.sql`.
- Chi tiết quan hệ + cột: `srs/student-quiz-reverse-erd.md`.

## 9. Flows (tóm tắt — chi tiết ở `srs/student-quiz-reverse-flows.md`)

| Flow | Tên | UC | Nhãn |
|---|---|---|---|
| F1 | Mở quiz và bắt đầu bài làm (gate → snapshot đề → resume) | UC-01 | ✅ |
| F2 | Trả lời câu hỏi và tự lưu (autosave, essay, khôi phục) | UC-02 | ✅ |
| F3 | Nộp bài (guard câu trống → chốt một lần → chấm + đóng dấu) | UC-03 | ✅ |
| F4 | Xem kết quả và chờ điểm giáo viên (summary → poll → detail) | UC-04 | ✅ |
| F5 | Tải lên và nghe lại file bài nói (PUT/DELETE/GET media) | UC-05 | ✅ |

## 10. Screens

UI thật: SPA học viên `apps/student`, 2 route chính (TanStack Router, file-based).

- **`/learn/quizzes/$assignmentId`** — điểm vào từ dòng tổng quan; loader: đã nộp → xoá mirror + điều hướng thẳng sang summary; chưa có attempt → hiển thị card giới thiệu quiz và dialog "Bắt đầu làm bài"; có attempt dở → dialog "Tiếp tục bài làm". — ✅ [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-62`.
- **`/learn/quizzes/attempt/$attemptId`** — màn làm bài (header runtime + cụm câu hỏi theo dạng bài + navigator tiến độ + panel bài nói/bài viết) và sau nộp cùng route render summary (nhãn awaiting-grade, media player, bảng đáp án, nút xem chi tiết); 409 "chưa nộp" → điều hướng về trang trước. — ✅ [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:1-343`, [S16] `apps/student/src/components/quiz/quiz-take-view.tsx`.
- **route con detail** (`attempt/$attemptId.detail.tsx`) — xem lại toàn bộ bài: từng câu verdict + đáp án + giải thích, bài Writing + highlight, media. — ✅ [S15] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx:1-281`.
- Component chính: `quiz-take-view` (lắp ráp take screen, toast lỗi), `quiz-lifecycle-dialogs` (3 dialog vòng đời), `quiz-runtime-header` (trạng thái lưu + Thoát + Nộp bài), `speaking-submission-panel` (kéo-thả + tiến độ + lỗi), `quiz-media-player` (phát lại blob), `assignment-row` (dòng tổng quan). — ✅ [S16]–[S22].
- Danh sách màn hình dạng bullet này là đầy đủ UI của feature (không vẽ wireframe — UI đã tồn tại). — ✅ [S14]–[S22].

## 11. Constraints, Dependencies, Assumptions

- **D1/SQLite không có transaction**: mọi mẫu ghi trong feature tránh đọc-ghi hai bước — autosave ghi nguyên tử từng key; media chốt theo key cũ; submit chốt-một-lần + gom các ghi phụ trong một lệnh; đọc lại để phân biệt 404/409. — ✅ [S1] `apps/server/src/routes/student.ts:1552-1558,1691-1698,1911-1918,1993-2045`.
- **R2 là phụ thuộc tuỳ chọn**: chưa bind bucket → 503 có kiểm soát; thao tác R2 nền (xoá object cũ) best-effort qua `runInBackground`, không chặn phản hồi. — ✅ [S1] `apps/server/src/routes/student.ts:1751-1757`, [S26] `apps/server/src/lib/r2-media-store.ts`.
- **Workers body limit đo byte thật** (chunked/malformed không lọt) — precedent syllabus-templates. — ✅ [S1] `apps/server/src/routes/student.ts:412-417`.
- **Bộ nhớ cục bộ có thể vắng mặt** (private mode) — mirror bọc try/catch, autosave vẫn chạy không mirror. — 🔵 [S12] `apps/student/src/lib/quiz-attempt-store.ts:20-25`, [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-40` (cả hai vị trí đều thao tác mirror qua lớp bọc lỗi).
- **TanStack Query + Zod strict**: client parse schema chặt; key điều kiện (grade/annotations/practice/essay/media) phải optional phía wire để bundle cũ không throw. — ✅ [S7] `packages/api/src/contracts.ts:2877-2908`, [S11] `apps/student/src/lib/repos/quiz.ts`.
- **Annotation dùng offset UTF-16 trên HTML raw** của essay; essay freeze khi có annotation nên mapping chỉ cần quy đổi raw→plain. — ✅ [S6] `packages/db/src/schema/quiz-attempt-annotation.ts:1-40`, [S28] `apps/server/src/lib/quiz-annotation.ts:29-40`.
- **Thời gian**: `due` là ISO ngày (so ngày được), `dueAt` ISO datetime UTC chuyển từ giờ VN lúc giao; `submittedAt` trên target là ISO string (không phải timestamp int) — do submit ghi `new Date().toISOString()`. — ✅ [S3] `packages/db/src/schema/class-assignment.ts:35-38,68`, [S1] `apps/server/src/routes/student.ts:2005`.
- **Answers JSON**: key là chuỗi index `"0"`, `"1"`, …; giá trị được bọc an toàn khi ghi nên ký tự đặc biệt (`0.0`, khoảng trắng) round-trip nguyên vẹn; dữ liệu thô KHÔNG normalize (normalize chỉ khi chấm). — ✅ [S1] `apps/server/src/routes/student.ts:1606-1612`, [S8] `packages/api/src/lib/grade-quiz.ts:22-36`; test [S23] `apps/server/src/routes/student-quiz.test.ts:1294-1337`.

## 12. Open Questions (tóm tắt — chi tiết ở `reverse-gaps.md`)

| OQ | Chủ đề | Nhãn |
|----|--------|------|
| OQ-1 | Hạn nộp không bị server chặn — nộp trễ vẫn hợp lệ; có cần cửa sổ chốt cứng? | 🟡 |
| OQ-2 | Một-attempt-no-retake v1 — vì sao và khi nào cần làm lại? | 🟡 |
| OQ-3 | Bài chưa mở trả 404 chung thay vì trang "sắp mở" | 🟡 |
| OQ-4 | Chưa có chỉ số nghiệp vụ đo được (analytics) | 🟡 |
| OQ-5 | Poll chờ chấm dừng sau ~10 phút — học viên phải tải lại | 🟡 |
| OQ-6 | C caps: 500/đáp án, 10.000/essay, 4096B body thường — căn cứ nghiệp vụ? | 🟡 |
| OQ-7 | Dữ liệu legacy: đề Speaking đã nộp thiếu file — hiển thị dự phòng có còn cần? | 🟡 |
| OQ-8 | practice dùng chung bảng quiz_attempt — ranh giới có nên tách bảng? | 🟡 |
| OQ-9 | Kích hoạt chấm AI lúc nộp — điều kiện bật/tắt theo tổ chức? | 🟡 |
| OQ-10 | Trạng thái "active" của test suy từ grep tĩnh — xác nhận CI khi audit | 🟡 |
