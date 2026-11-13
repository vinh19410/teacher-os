---
type: reverse-source-map
feature: student-quiz
status: draft
updated: 2026-11-12
---
# student-quiz — Danh mục nguồn (provenance)

| ID | Nguồn (file) | Dòng | Loại | Confidence | Phần feature suy ra từ đây |
|----|--------------|------|------|------------|----------------------------|
| S1 | `apps/server/src/routes/student.ts` | 1-2410 (khối quiz: 386-423 guard, 716-920 guards dùng chung, 1333-1549 đọc/start, 1552-1686 autosave, 1691-1909 media, 1911-2051 submit, 2053-2405 review) | code TS (route Hono) | high | FR-sq-001..018, NFR, BR, Error Matrix 6.1, Flow F1/F2/F3/F5, States |
| S2 | `packages/db/src/schema/quiz-attempt.ts` | 1-108 | schema Drizzle | high | Mục 8, ERD, BR-sq-001..005, States State 1 |
| S3 | `packages/db/src/schema/class-assignment.ts` | 1-78 | schema Drizzle | high | Mục 8, ERD, FR-sq-001 (lượt giao), đóng dấu submit |
| S4 | `packages/db/src/schema/assignment-prompt.ts` | 1-67 | schema Drizzle | high | Mục 8, FR-sq-002 (note/transcript), BR-sq-006 |
| S5 | `packages/db/src/schema/assignment-test.ts` | 1-78 | schema Drizzle | high | ranh giới practice, ERD |
| S6 | `packages/db/src/schema/quiz-attempt-annotation.ts` | 1-40 | schema Drizzle | high | Mục 8, BR-sq-009, Constraints (UTF-16) |
| S7 | `packages/api/src/contracts.ts` | khối quiz ~2391-2908 (2391-2420 caps + essay, 2423-2454 media caps, 2554-2660 grade/media DTO, 2729-2741 action/answer, 2743-2806 take detail, 2820-2877 summary item, 2885-2908 detail) | hợp đồng Zod | high | caps, schema wire, FR-sq-002/004/005, NFR-sq-012 |
| S8 | `packages/api/src/lib/grade-quiz.ts` + `grade-quiz.test.ts` | 1-178 (+test 1-263) | thư viện dùng chung + test | high | BR-sq-010, NFR-sq-009, Flow F3 (chấm), FR-sq-012 |
| S9 | `packages/api/src/lib/quiz-media.ts` | 1-109 | thư viện dùng chung | high | FR-sq-008, NFR-sq-007, wording Screen |
| S10 | `packages/api/src/lib/infer-question-types.ts` | 1-89 | thư viện dùng chung | high | FR-sq-002 (tfng/ynng), SC-sq-07 |
| S11 | `apps/student/src/lib/repos/quiz.ts` | 1-431 | client API | high | FR-sq-006/010/014, NFR-sq-010, Flow F2/F4/F5 |
| S12 | `apps/student/src/lib/quiz-attempt-store.ts` | 1-553 | client engine | high | FR-sq-006/018, NFR-sq-005, States State 4, Flow F2 |
| S13 | `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx` | 1-62 | route TSX | high | FR-sq-007, Screens, Flow F1 |
| S14 | `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` | 1-343 | route TSX | high | Screens, FR-sq-011/014, wording 6.2, Flow F3/F4 |
| S15 | `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` | 1-281 | route TSX | high | FR-sq-013, Screens, Flow F4 |
| S16 | `apps/student/src/components/quiz/quiz-take-view.tsx` | 1-621 | component TSX | high | wording 6.2, FR-sq-011/015/018, Flow F1/F3 |
| S17 | `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx` | 1-181 | component TSX | high | wording 6.2, FR-sq-003/007/015, Flow F1/F3 |
| S18 | `apps/student/src/components/quiz/speaking-submission-panel.tsx` + `speaking-upload-state.ts` | 1-578 + 1-150 | component TSX + máy trạng thái | high | FR-sq-008/009, wording 6.2, States State 3, Flow F5 |
| S19 | `apps/student/src/components/quiz/quiz-media-player.tsx` | 1-136 | component TSX | high | FR-sq-010, wording 6.2, Flow F5 |
| S20 | `apps/student/src/components/quiz/quiz-runtime-header.tsx` | 1-91 | component TSX | high | FR-sq-018, wording 6.2 |
| S21 | `apps/student/src/lib/assignment-status.ts` | 1-298 | client lib | high | BR-sq-007 (nhãn trễ), tổng quan |
| S22 | `apps/student/src/components/overview/assignment-row.tsx` | 1-77 | component TSX | high | điểm vào, SC-sq-01 |
| S23 | `apps/server/src/routes/student-quiz.test.ts` | 1-1571 — 23 test active | test vitest | high | truy vết FR/BR/E, FR-sq-003/004/016/017 |
| S24 | `apps/server/src/routes/student-quiz-media.test.ts` | 1-762 — 14 test active | test vitest | high | FR-sq-008/009/010, BR-sq-004 |
| S25 | `apps/server/src/routes/student-quiz-explanation.test.ts` | 1-648 — 12 test active | test vitest | high | FR-sq-002/013, BR-sq-006 |
| S26 | `apps/server/src/lib/media-response.ts` + `media-store.ts` + `r2-media-store.ts` | 1-46 + 1-74 + 1-48 | server lib | high | NFR-sq-006/007/008, FR-sq-010 |
| S27 | `apps/server/src/lib/assignment-visibility.ts` | 1-16 | server lib | high | FR-sq-001, BR-sq-007/008 |
| S28 | `apps/server/src/lib/quiz-grade.ts` + `quiz-annotation.ts` | 1-37 + 1-78 | server lib | high | BR-sq-005/009, FR-sq-012/013 |
| S29 | `apps/server/src/lib/ai-grading/run-grading.ts` | 1-574 (kích hoạt tại 560-574) | server lib (boundary) | high | Actors, OQ-9, ranh giới grading |
| S30 | `packages/db/src/migrations/0030_previous_drax.sql`, `0031_classy_victor_mancha.sql`, `0032_mature_saracen.sql`, `0033_adorable_felicia_hardy.sql`, `0035_ambiguous_freak.sql`, `0041_known_ink.sql`, `0054_productive_spencer_smythe.sql`, `0059_self_study_plan.sql`, `0060_study_pack.sql` | — | SQL migration | high | Mục 8, ERD, evolution bảng |
| S31 | `apps/e2e/specs/student-quiz-take-review.spec.ts` + `helpers-quiz.ts` | 1-1255 + 1-266 — 11 test active | test Playwright E2E | high | SC-sq-01..10, BR-sq-001, FR-sq-006/007 |
| S32 | `apps/server/src/routes/student-practice.ts` + `student-history.ts` | 1-471 + 1-554 | code TS (ranh giới) | high | ranh giới 1.2, OQ-8, States (mode practice) |
| S33 | `apps/server/src/app.ts` | mount 433/440/443, CORP media 311-318 | code TS | high | NFR-sq-006, kiến trúc mount |

## Ghi chú nguồn

- __Confidence:__ toàn bộ là source code + test active trên branch `develop` (commit d6c0f6b5) → high. Không có nguồn mojibake; encoding UTF-8 OK.
- __Test__: grep toàn bộ test trong phạm vi (`student-quiz*.test.ts` 23+14+12 test, `grade-quiz.test.ts` 14 test, e2e `student-quiz-take-review.spec.ts` 11 test) — **không có** `skip`/`todo`/`.only`/`test.fails` nào (match duy nhất của pattern là `skippedCount` — false positive). — ✅ kiểm bằng grep ngày 2026-11-12.
- __R3 negative search (dead code)__: không tìm thấy helper/export chết trong vùng quiz: mọi export của `quiz-media.ts`, `grade-quiz.ts`, `infer-question-types.ts` đều có caller (route hoặc client); nhánh render "Bài này được nộp khi chưa có file bài nói." [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:185` là dự phòng cho dữ liệu legacy (server hiện chặn nộp thiếu file — BR-sq-004) → OQ-7.
- __Ranh giới đọc__: practice [S32] và grading [S29] chỉ đọc đủ để vẽ ranh giới; chi tiết nghiệp vụ của chúng thuộc feature khác.
