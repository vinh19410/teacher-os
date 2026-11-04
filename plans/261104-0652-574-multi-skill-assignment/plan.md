---
title: "Cho phép gộp nhiều kỹ năng (trắc nghiệm + Writing) trong một bài tập (#574)"
description: "Bổ sung phần Writing tuỳ chọn (writing_part, writing_type, writing_prompt) trên assignment_prompt tự chấm để giáo viên soạn và giao một bài gồm cả trắc nghiệm (tự chấm) lẫn Writing (chấm tay/AI) trên cùng một lượt làm quiz_attempt."
status: pending
priority: P1
effort: "12h"
issue: 574
branch: feat/574-multi-skill-assignment
tags: [feature, assignments, quiz, grading, web, student, server, database]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Cho phép gộp nhiều kỹ năng (trắc nghiệm + Writing) trong một bài tập (#574)

> **Handover Contract (`--advice` + `--tdd`):** Plan này được viết theo chuẩn handover cho executor độc lập — mỗi phase tách thành các task tuần tự có đường dẫn file/symbol tường minh, bước thực thi đầy đủ, điều kiện pass cơ học ở `Verify`, và khối `Failure Protocol` bắt buộc dừng + gọi `kongming` ngay khi một bước `Verify` lệch kỳ vọng.

## Overview

Giáo viên phản ánh trên staging (Cô Mỹ, issue #574): mỗi bài tập hiện chỉ chọn được một kỹ năng nên không gộp được trắc nghiệm (Grammar / Vocabulary / Reading / Listening) và Writing trong cùng một bài giao về nhà.

### Kết quả khảo sát `test-builder-shell.tsx` (`assignment_test`)

Đã kiểm chứng trực tiếp trong source: **`test-builder-shell.tsx` không đáp ứng được nhu cầu #574** vì hai giới hạn kiến trúc:
1. `assignment_test` khóa cứng **1 kỹ năng duy nhất** từ DB (`packages/db/src/schema/assignment-test.ts:19-41`), Zod (`PRACTICE_SKILLS` tại `packages/api/src/contracts.ts:324-330,1063-1134`), API (`PUT /api/assignments/tests/:id/parts` trả 400 nếu `prompt.skill !== test.skill` tại `apps/server/src/routes/assignments/tests.ts:201-204`), đến UI (`TestBuilderShell`).
2. `assignment_test` **không giao được cho lớp** (`class_assignment` chỉ có FK `prompt_id -> assignment_prompt.id` tại `packages/db/src/schema/class-assignment.ts:28-30`), và ngay ở luồng tự luyện (`student-practice.ts:135-182`) `StudentQuizDetail` chỉ lấy `passage`/`prompt`/`audioName` từ part đầu tiên.

### Kiến trúc lựa chọn (đã qua `kongming` review + Red-Team 3 persona — Approach A)

Bảng `quiz_attempt` (`packages/db/src/schema/quiz-attempt.ts:43-105`) **đã có sẵn đồng thời** hai nhóm cột độc lập trên cùng một dòng:
- Trắc nghiệm tự chấm: `questions_snapshot`, `answers`, `correct_count`.
- Tự luận Writing chấm tay / AI: `essay`, `grade_scores`, `grade_feedback`, `graded_at` (cùng `ai_grading_draft` 1:1 và `quiz_attempt_annotation` theo offset UTF-16 trên `quiz_attempt.essay`).

Do đó, giải pháp tối giản, bền vững 6 tháng và không phá vỡ bất kỳ luồng đơn kỹ năng nào là bổ sung **phần Writing đính kèm tuỳ chọn (`writing`)** ngay trên `assignment_prompt` thuộc nhóm kỹ năng tự chấm (`reading | listening | grammar | vocabulary`):
- Giữ nguyên bất biến **1 `assignment_prompt` → 1 `class_assignment` → 1 `quiz_attempt`**.
- Thêm 3 cột additive D1-safe trên `assignment_prompt`: `writing_part TEXT NULL`, `writing_type TEXT NULL`, `writing_prompt TEXT NOT NULL DEFAULT ''` (`writing_part IS NOT NULL` là cờ bài gộp). Không tái sử dụng cột `prompt` và không tạo giá trị `skill: "mixed"`.
- Tách schema ghi (`assignmentWritingSectionSchema` có `richTextField(5000)` + kiểm tra catalog) với schema đọc trên wire học viên (`studentWritingSectionSchema = z.object({ part: z.string(), type: z.string(), prompt: z.string() }).strict()`); khai báo `writing: assignmentWritingSectionSchema.nullable().optional()` trên `assignmentPromptBaseSchema` để `AssignmentPromptCreate` giữ tương thích ngược 100%.
- Gom mọi rẽ nhánh chấm tay / essay qua helper thuần dùng chung `essayTaskOf(row)` và `hasGradableTask(row)` trong `@teacher-os/api/lib/ielts-band`.
- Ở `apps/student`, tách một instance `useQuizAttemptStore` thứ hai dành riêng cho `essay` với mirror key riêng (`quiz-attempt:{attemptId}:essay`), `valueMax = QUIZ_ESSAY_MAX`, đồng bộ cross-halt khi 401/409 và giữ mirror qua SPA unmount khi còn thay đổi chưa kết thúc gửi để không đụng key `"0"` của câu trắc nghiệm đầu tiên và không rơi chữ khi bấm `Thoát`.
- Khoá bất biến toàn bộ phần Writing (409 `WRITING_SECTION_LOCKED`) trên `PATCH /api/assignments/prompts/:id` một khi đề đã được tham chiếu bởi `class_assignment`, `assignment_test_part` hoặc `study_pack_item` (tránh đổi đề Writing dưới chân các bài đã nộp hoặc lọt ngược vào Test/Study Pack). Chặn gắn đề gộp vào `assignment_test` (400) và `study_pack` (422), đồng thời giảm `D1_PROMPT_CLONE_INSERT_CHUNK` từ `4` xuống `3` để giữ an toàn dưới ngưỡng 100 bind params của Cloudflare D1.
- Guard bài viết rỗng trong `runAiGrading` (chuyển thẳng `manual_pending` 0 Credit giống nhánh Speaking thiếu transcript) để học viên nộp bài gộp bỏ trống phần Writing không làm cháy ví Credit / suất chấm nhanh tháng của trung tâm.

### Extension Trace

Nếu sau này sản phẩm cần biến thể kế tiếp là gộp **Trắc nghiệm + Speaking** trong một bài giao lớp:
- **Contract giữ ổn định:** quan hệ 1 `assignment_prompt` → 1 `class_assignment` → 1 `quiz_attempt`, cùng ranh giới dữ liệu trên `quiz_attempt` (`questions_snapshot`/`answers`/`correct_count` độc lập với `media_*`/`grade_scores`/`ai_grading_draft`).
- **Phần thay đổi cục bộ:** thêm nhóm cột `speaking_*` nullable trên `assignment_prompt`, mở rộng helper phân giải phần chấm tay từ `essayTaskOf` sang gradable-task descriptor (`writing` hoặc `speaking`, tối đa 1 phần chấm tay mỗi đề vì `grade_scores` và `ai_grading_draft` là 1:1 với `quiz_attempt`), và bật `SpeakingSubmissionPanel` dưới `QuizPaper`.
- **Quyết định YAGNI hiện tại:** chỉ hiện thực hoá nhánh Writing có nhu cầu thực tế từ staging (#574), không dựng registry đa phần trừu tượng khi chưa có case thứ hai.

## Advisor Scope Lock (`kongming`)

- **Locked Scope:**
  1. Đề thuộc 1 trong 4 kỹ năng tự chấm (`reading`, `listening`, `grammar`, `vocabulary`) được phép đính kèm tối đa 1 phần Writing tuỳ chọn (`part: "task1" | "task2"`, `type` thuộc catalog `ASSIGNMENT_PART_TYPES.writing[part]`, `prompt` rich text không rỗng).
  2. Luồng giao bài lớp học trọn vòng: soạn đề ở `/assignments/new` → xem trước (`/assignments/preview` cả 2 tab + aside) → giao lớp ở `/classes/$classId` (có đủ chip lọc `Grammar`/`Vocabulary` + nhãn `+ Writing`) → học viên làm bài cả 2 phần và nộp 1 lần ở `/learn/quizzes/$assignmentId` → tự chấm ngay phần trắc nghiệm + đẩy phần Writing vào hàng đợi chấm `/grading` & chấm nháp AI (bỏ qua trừ Credit nếu bài viết rỗng) → giáo viên chấm Writing (thấy kèm điểm trắc nghiệm) → học viên xem đồng thời điểm trắc nghiệm và điểm/nhận xét/highlight Writing ở màn kết quả, màn `/detail` và dòng `/history` (giữ trong tab kỹ năng tự chấm chính với chuỗi điểm `X/Y · Band Z` + nút `Xem nhận xét`).
  3. Migration additive D1-safe, contract `.strict()` tương thích ngược (chỉ gắn key mới khi là đề gộp), khoá 409 `WRITING_SECTION_LOCKED` khi đề đã gắn `class_assignment`/`assignment_test_part`/`study_pack_item`, và chặn gắn đề gộp vào `assignment_test` (400) lẫn `study_pack` (422).
- **Explicit Non-Goals:**
  - Không làm bài gộp với Speaking hoặc nhiều hơn 1 bài Writing trong cùng 1 đề.
  - Không thêm `skill: "mixed"`, không thêm `class_assignment.testId`, không mở rộng `assignment_test` / `study_pack` / chế độ tự luyện (`practice`) cho đề gộp.
  - Không quy đổi gộp điểm phần trăm trắc nghiệm và band IELTS Writing thành một con số điểm trung bình duy nhất (luôn hiển thị tách bạch hai thành phần `X/Y` và `Band Z`).
  - Không tách thành 2 dòng trên `/history` (bài gộp nằm ở tab kỹ năng chính, hiển thị `X/Y` khi chờ chấm và `X/Y · Band Z` sau khi chấm).
  - Không hỗ trợ làm lại (retake), đồng hồ đếm giờ riêng từng phần, hay AI exam-import sinh đề gộp.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Schema DB + Zod contracts (write/read tách bạch) + helper `essayTaskOf`/`hasGradableTask` an toàn với `.strict()`, `check-types` và D1 | P1 |
| 2 | Server routes (prompts, tests, study-packs, snapshot, student quiz/essay/submit/summary/detail/history, grading, AI grading guard rỗng, dashboard reminders) hỗ trợ trọn vẹn bài gộp | P1 |
| 3 | Cổng học viên (`apps/student` + `@teacher-os/ui`) hiển thị 2 phần rõ ràng, autosave độc lập 2 store an toàn qua reload/SPA nav/401/409, và hiển thị kết quả cả 2 phần ở summary, `/detail` và `/history` | P1 |
| 4 | Cổng giáo viên (`apps/web`) bật/soạn/xem trước (cả tab mô phỏng) phần Writing, giao bài + gắn nhãn `+ Writing`, xem điểm trắc nghiệm ở `/grading/$attemptId`, và pass E2E trọn luồng | P1 |

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Phase 1: Schema, Contracts & Shared Helpers](./phase-01-schema-contracts.md) | Pending | 2.5h |
| 2 | [Phase 2: Server Routes, Snapshot & Grading Pipeline](./phase-02-server-routes-grading.md) | Pending | 3.5h |
| 3 | [Phase 3: Student Take, Dual-Store Autosave & Result Review](./phase-03-student-take-review.md) | Pending | 3h |
| 4 | [Phase 4: Teacher Authoring, Preview, Grading UI & E2E](./phase-04-web-authoring-grading-e2e.md) | Pending | 3h |

## Success Criteria

- [ ] Giáo viên tạo được đề Grammar/Vocabulary/Reading/Listening kèm phần Writing (Task 1/Task 2) ngay tại `/assignments/new`, xem trước (cả xem đề lẫn làm thử mô phỏng) thấy đủ cả 2 phần, và giao cho lớp trong 1 bước.
- [ ] Học viên mở bài giao thấy cả phần câu hỏi trắc nghiệm lẫn đề + khung viết bài Writing; autosave câu hỏi (`/answer`) và bài viết (`/essay`) hoạt động độc lập, không ghi đè `answers[0]`, không rớt chữ khi rời trang bằng SPA nav.
- [ ] Khi học viên bấm Nộp bài 1 lần: điểm trắc nghiệm (`correctCount/totalCount`) có ngay lập tức, trạng thái bài hiện chờ giáo viên chấm phần viết, và hệ thống tạo hàng đợi chấm `/grading` + kích hoạt chấm nháp AI đúng 1 lần (nếu bài viết trống thì chuyển `manual_pending` không trừ Credit).
- [ ] Giáo viên thấy nút `Chấm bài` ở tab Bài tập lớp học và trong `/grading`, mở `/grading/$attemptId` thấy dòng tóm tắt kết quả trắc nghiệm `X/Y câu đúng` cạnh đề Writing + bài viết (hỗ trợ highlight + AI draft), chấm và trả bài thành công.
- [ ] Học viên mở màn kết quả (`/learn/quizzes/attempt/$attemptId`), màn giải thích chi tiết (`/detail`) và trang `/history` thấy đầy đủ cả điểm/đáp án trắc nghiệm lẫn bài viết + band/nhận xét/highlight của giáo viên.
- [ ] Toàn bộ test cũ + mới (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`) và Playwright E2E bài gộp (`specs/hybrid-multi-skill-assignment.spec.ts`) xanh 100%, UI kiểm chứng ở 3 viewport (`1440×900`, `768×1024`, `375×812`) sáng/tối.

## Validation Log

### Verification Results (2026-11-04 — Standard Tier: Fact Checker + Contract Verifier)
- **Tier:** Standard (4 phases, Fact Checker + Contract Verifier)
- **Claims checked:** 58 file paths, symbols, line ranges, schemas, and caller chains
- **Verified:** 47 | **Failed (resolved in plan v2):** 11 | **Unverified:** 0
- **Resolved factual & caller items:**
  1. Đổi toàn bộ path test `apps/student` về `apps/student/test/{quiz-paper.test.tsx,quiz-attempt-store.test.ts,attempt-summary.test.tsx,assignment-status.test.ts,quiz-take-view.test.tsx}` (kèm `// @vitest-environment jsdom` cho test tương tác DOM).
  2. Đổi path E2E về `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts` (khớp `testDir: "./specs"` trong `apps/e2e/playwright.config.ts:27`).
  3. Đổi file contract test ở Phase 1 thành `Create: packages/api/src/hybrid-writing.contracts.test.ts`.
  4. Sửa props `<QuizEssayInput />` trong Phase 3 khớp `packages/ui/src/components/quiz/quiz-essay-input.tsx:31-40` (`readOnly={reviewMode} maxLength={QUIZ_ESSAY_MAX}`).
  5. Bổ sung đầy đủ các caller bị sót: `study-pack-clone.ts` + `packs.tsx`, `student-history.ts` + `history-list.tsx`, `assignment-quiz-sim.ts` + `preview-quiz-simulation.tsx`, `kernel-command.test.ts`.

### Whole-Plan Consistency Sweep (Post-Validation)
- Files reread: `plan.md`, `phase-01-schema-contracts.md`, `phase-02-server-routes-grading.md`, `phase-03-student-take-review.md`, `phase-04-web-authoring-grading-e2e.md`
- Decision deltas checked: 13
- Reconciled stale references: 11
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-04
**Findings:** 15 deduplicated (13 accepted, 2 rejected)
**Severity breakdown:** 7 Critical, 6 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Tách `studentWritingSectionSchema` khỏi `assignmentWritingSectionSchema` để tránh `ZodError` do lệch `DOMParser` vs regex trên wire học viên | Critical | Accept | Phase 1, Phase 2 |
| 2 | Dùng `.nullable().optional()` thay vì `.default(null)` trên `assignmentPromptBaseSchema` để `AssignmentPromptCreate` không làm đỏ `check-types` ở Phase 1 + cập nhật `kernel-command.test.ts` | Critical | Accept | Phase 1, Phase 4 |
| 3 | Truyền đúng `readOnly={reviewMode} maxLength={QUIZ_ESSAY_MAX}` cho `<QuizEssayInput />` và hiện `minWords` ở header Phần 2 | Critical | Accept | Phase 3 |
| 4 | Chuẩn hoá đường dẫn test về `apps/student/test/*`, `apps/e2e/specs/*`, kèm pragma `// @vitest-environment jsdom` | Critical | Accept | Phase 1, Phase 3, Phase 4 |
| 5 | Chặn đề gộp trong `study_pack` (`validateStudyPackItems` 422 + `packs.tsx`), kiểm tra `assignmentTestPart`/`studyPackItem` ở 409 lock, hạ `D1_PROMPT_CLONE_INSERT_CHUNK` 4 → 3 | Critical | Accept | Phase 2, Phase 4 |
| 6 | Gắn `grade`, `part`, `annotations` trên `GET /attempts/:attemptId/detail` và render `EssayWithHighlights` + `AttemptGradeCard` ở `$attemptId.detail.tsx` | Critical | Accept | Phase 2, Phase 3 |
| 7 | Bảo vệ `essayStore` khi SPA unmount (`dispose` giữ mirror nếu còn `pending`/`inflight`, cho phép flush cuối), cross-halt 401/409, khoá `submitDisabled`, dọn cả 2 mirror ở `$attemptId.tsx` | Critical | Accept | Phase 3 |
| 8 | Guard bài viết rỗng trong `runAiGrading` (chuyển `manual_pending` 0 Credit, không gọi LLM/trừ ví) + strip HTML bằng `htmlToPlainText` trên `writingPrompt` | High | Accept | Phase 2 |
| 9 | Cập nhật `student-history.ts` (`X/Y` chờ chấm, `X/Y · Band Z` đã chấm, `hasWriting`) + `history-list.tsx` (`canReview`) + thêm predicate `orgId` vào join `student-class.ts` & `dashboard-reminders.ts` | High | Accept | Phase 1, Phase 2, Phase 3 |
| 10 | Khoá bất biến toàn bộ `writing` (`part`, `type`, `prompt`) với 409 `WRITING_SECTION_LOCKED` ngay khi đề đã gắn `classAssignment` / `assignmentTestPart` / `studyPackItem` | High | Accept | Phase 2 |
| 11 | Cập nhật `composerValueShape`, `composerDraftHasContent`, `isPreviewDraft`, `restoreRich(writing.prompt)`, giữ `writing` khi đổi giữa 2 auto-skill + thêm `bodyLimit`/`Content-Type` trên `assignments/index.ts` | High | Accept | Phase 2, Phase 4 |
| 12 | Mở rộng `buildQuizSim` + `PreviewQuizSimulation` cho 4 auto-skill và phần Writing; thêm chip lọc `Grammar`/`Vocabulary` ở `ClassAssignmentsTab` | High | Accept | Phase 4 |
| 13 | Giữ nguyên raw `attempt.essay` trên `GET /assignments/:assignmentId/quiz` cho đề gộp để tránh `essayToPlain` không idempotent làm lệch offset khi resume | Medium | Accept | Phase 2 |
| 14 | Thay đổi RBAC toàn cục của role `ta` trên các route đơn kỹ năng sẵn có (`POST /prompts`, `POST /classes/:id/assignments`, `annotations`) | High | Reject | Out of scope #574 (giữ nguyên contract RBAC hiện hành) |
| 15 | Bỏ `.strict()` trên toàn bộ response schema học viên/giáo viên | Medium | Reject | Trái precedent `contracts.ts:2624-2647` (giữ `.strict()` + chỉ đính kèm key mới trên đề gộp) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-schema-contracts.md`, `phase-02-server-routes-grading.md`, `phase-03-student-take-review.md`, `phase-04-web-authoring-grading-e2e.md`
- Decision deltas checked: 13 accepted findings
- Reconciled stale references: 13 (0 references left to `apps/e2e/tests/`, `disabled={reviewMode}`, `.default(null)` on `writing`, or partial `writing.prompt` unlock after assignment)
- Unresolved contradictions: 0

<!-- slug: 574-multi-skill-assignment -->
