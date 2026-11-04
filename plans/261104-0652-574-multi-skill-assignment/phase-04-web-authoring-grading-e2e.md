---
phase: 4
title: "Phase 4: Teacher Authoring, Preview, Grading UI & E2E"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2, 3]
---

# Phase 4: Teacher Authoring, Preview, Grading UI & E2E

<!-- Updated: Red-Team & Validation Session 1 - exact apps/e2e/specs/* path, draft-store shape/content validation + restoreRich, packs.tsx filter, buildQuizSim + PreviewQuizSimulation for 4 auto skills + writing, ClassAssignmentsTab Grammar/Vocabulary filter chips, kernel-command.test.ts -->

## Goal
Hoàn thiện toàn bộ bề mặt giáo viên (`apps/web`): bật/tắt và soạn phần Writing tuỳ chọn ngay trong `/assignments/new` cho 4 kỹ năng tự chấm (ẩn khi nhúng trong `TestBuilderShell`, lọc khỏi `packs.tsx`), hiển thị đầy đủ 2 phần ở cả aside xem trước lẫn 2 tab của `/assignments/preview`, hiện nhãn `+ Writing` và đủ chip lọc `Grammar`/`Vocabulary` ở lớp học, mở khoá nút `Chấm bài` cho bài gộp, hiển thị dòng kết quả trắc nghiệm `X/Y câu đúng` trên trang chấm `/grading/$attemptId`, và kiểm chứng bằng Playwright E2E trọn luồng + 3 viewport sáng/tối.

## Files to Create / Modify
- Modify: `apps/web/src/lib/mock-data.ts`
- Modify: `apps/web/src/lib/repos/assignment-prompts.ts`
- Modify: `apps/web/src/lib/repos/assignment-prompts.test.ts`
- Modify: `apps/web/src/lib/repos/kernel-command.test.ts`
- Modify: `apps/web/src/lib/assignment-draft-store.ts`
- Modify: `apps/web/src/lib/assignment-preview-draft.ts`
- Modify: `apps/web/src/lib/assignment-quiz-sim.ts`
- Modify: `apps/web/src/components/assignments/prompt-composer.tsx`
- Modify: `apps/web/src/components/assignments/prompt-composer.test.tsx`
- Modify: `apps/web/src/components/assignments/composer-transitions.ts`
- Modify: `apps/web/src/components/assignments/composer-transitions.test.ts`
- Modify: `apps/web/src/routes/_auth/assignments/new.tsx`
- Modify: `apps/web/src/routes/_auth/assignments/new.test.tsx`
- Modify: `apps/web/src/routes/_auth/assignments/packs.tsx`
- Modify: `apps/web/src/components/assignment-tests/test-builder-shell.tsx`
- Modify: `apps/web/src/components/assignments/student-preview-paper.tsx`
- Modify: `apps/web/src/components/assignments/student-preview-paper.test.tsx`
- Modify: `apps/web/src/components/assignments/prompt-preview-aside.tsx`
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.tsx`
- Modify: `apps/web/src/routes/_auth/assignments/preview.tsx`
- Modify: `apps/web/src/routes/_auth/assignments/index.tsx`
- Modify: `apps/web/src/components/classes/class-assignments-tab.tsx`
- Modify: `apps/web/src/components/classes/class-assignments-tab.test.tsx`
- Modify: `apps/web/src/components/grading/submission-view.tsx`
- Create: `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts`

## Tasks

### Task 4.1 — TDD Red & Green: Repo mapper, draft store, composer transitions, `packs.tsx` và `PromptComposer` / `/assignments/new`
- **Goal:** Giáo viên chọn kỹ năng tự chấm (`reading | listening | grammar | vocabulary`) tại `/assignments/new` có thể bật khối `"Phần Writing đi kèm"`, chọn Task 1 / Task 2 + dạng đề + soạn đề Writing bằng `RichTextEditor`; draft store & preview handoff validate/bảo toàn dữ liệu an toàn; chuyển đổi giữa hai kỹ năng tự chấm giữ nguyên `writing`, chuyển sang Writing/Speaking cảnh báo và xoá `writing`; `TestBuilderShell` và `packs.tsx` loại trừ đề gộp.
- **Target files and symbols:**
  - `apps/web/src/lib/mock-data.ts` (`AssignmentPrompt.writing`)
  - `apps/web/src/lib/repos/assignment-prompts.ts` & `assignment-prompts.test.ts` & `kernel-command.test.ts`
  - `apps/web/src/lib/assignment-draft-store.ts` (`composerValueShape`, `composerDraftHasContent`) & `assignment-preview-draft.ts` (`isPreviewDraft`)
  - `apps/web/src/components/assignments/composer-transitions.ts` & `composer-transitions.test.ts`
  - `apps/web/src/components/assignments/prompt-composer.tsx` & `prompt-composer.test.tsx`
  - `apps/web/src/routes/_auth/assignments/new.tsx` & `new.test.tsx`
  - `apps/web/src/routes/_auth/assignments/packs.tsx` (`eligiblePrompts`)
  - `apps/web/src/components/assignment-tests/test-builder-shell.tsx` (`composerToPromptPayload`, `pickerPrompts`)
- **Steps:**
  1. Viết unit/component test trước (Red) trong `assignment-prompts.test.ts`, `kernel-command.test.ts`, `composer-transitions.test.ts`, `prompt-composer.test.tsx`, `new.test.tsx`:
     - `mapAssignmentPrompts` giữ nguyên `writing: { part, type, prompt }` hoặc `null`; `kernel-command` gửi đúng payload `writing` lên `/api/assignments/prompts`.
     - `composerValueShape` từ chối `writing` sai kiểu (`"bad"` hoặc thiếu `prompt: string`), chấp nhận `null`/`undefined` hoặc `{ part, type, prompt }`; `composerDraftHasContent` trả `true` khi chỉ mới nhập `writing.prompt`.
     - `PromptComposer`: khi `isAutoSkill(value.skill)` và `!lockPart`, hiện nút `"Thêm phần Writing"`; bấm bật tạo `{ part: "task2", type: "discuss", prompt: "" }`, hiện `ChipFilter` chọn Task 1 / Task 2, dạng đề Writing, `RichTextEditor` cho đề Writing (kèm lỗi `errors.writingPrompt` nếu bật mà để trống) và nút `"Bỏ phần Writing"`. Khi `skill === "writing"` hoặc `lockPart === true`, ẩn hoàn toàn.
     - `composer-transitions.ts`: đổi `skill` giữa `grammar` ↔ `vocabulary` giữ nguyên `current.writing`; đổi `skill` từ `grammar` sang `writing` hoặc `speaking` cảnh báo nếu `writing.prompt` đã có chữ (hoặc phần chính có chữ) và reset `writing: null`; đổi `part`/`type` của phần trắc nghiệm KHÔNG bật confirm giả nếu phần trắc nghiệm đang trống (chỉ có `writing.prompt`).
     - `new.tsx`: nếu `value.writing != null` mà `isEmptyRichText(value.writing.prompt)`, `hasCoreContent` trả `false` và `actionCopyFor` báo `"Thiếu đề phần Writing"` (chặn lưu cả `draft` lẫn `ready`). Khi đủ câu hỏi + `writing.prompt`, gửi `writing` trong payload `create-assignment-prompt`. Bọc `restoreRich` (`normalizeLegacyRichText`) cho `writing.prompt` khi khôi phục từ preview/draft.
  2. Chạy `pnpm --filter web test -- prompt-composer new.test composer-transitions assignment-prompts kernel-command` để xác nhận Red.
  3. Hiện thực đầy đủ các thay đổi trên, đồng thời:
     - Trong `TestBuilderShell`: gửi `writing: null` ở `composerToPromptPayload` và lọc `prompt.writing == null` trong `pickerPrompts`.
     - Trong `packs.tsx`: lọc `prompt.writing == null` trong `eligiblePrompts` để đề gộp không xuất hiện trong bộ chọn Study Pack.
- **Success criteria:** Toàn bộ test composer, transitions, draft-store, mapper, command và `/assignments/new` pass.
- **Verify:** `pnpm --filter web test -- prompt-composer new.test composer-transitions assignment-prompts kernel-command` exits 0.

### Task 4.2 — TDD Red & Green: Preview (cả tab Xem đề & Mô phỏng), Ngân hàng đề, Tab Bài tập lớp học và Màn chấm `/grading/$attemptId`
- **Goal:** Hiển thị trực quan phần Writing đính kèm ở mọi màn hình giáo viên: xem trước 2 phần ở cả 2 tab, badge `+ Writing` trong ngân hàng và lớp học, đủ bộ lọc `Grammar`/`Vocabulary` khi giao bài lớp, nút `Chấm bài` cho học viên đã nộp bài gộp, và dòng kết quả trắc nghiệm trên trang chấm.
- **Target files and symbols:**
  - `apps/web/src/components/assignments/student-preview-paper.tsx` & `student-preview-paper.test.tsx`
  - `apps/web/src/components/assignments/prompt-preview-aside.tsx`
  - `apps/web/src/lib/assignment-quiz-sim.ts` & `apps/web/src/components/assignments/preview-quiz-simulation.tsx` & `apps/web/src/routes/_auth/assignments/preview.tsx`
  - `apps/web/src/routes/_auth/assignments/index.tsx`
  - `apps/web/src/components/classes/class-assignments-tab.tsx` & `class-assignments-tab.test.tsx`
  - `apps/web/src/components/grading/submission-view.tsx`
- **Steps:**
  1. Viết test trước (Red) trong `student-preview-paper.test.tsx`, `class-assignments-tab.test.tsx`, và test cho `SubmissionView` (nối vào file test grading hiện hữu trong `apps/web/src/components/grading/` hoặc `apps/web/src/routes/_auth/grading/`):
     - `StudentPreviewPaper`: khi truyền `skill="grammar"`, `items` và `writing={{ part: "task2", type: "discuss", prompt: "<p>Essay topic</p>" }}`, hiển thị cả danh sách câu trắc nghiệm lẫn khối `"Phần 2 · Writing"` chứa `"Essay topic"`.
     - `ClassAssignmentsTab`: có đủ chip lọc `"Grammar"` và `"Vocabulary"` trong modal/form giao bài; khi bài giao lớp trỏ tới một prompt `grammar` có `writing != null`, hiển thị badge `+ Writing`, VÀ dòng học viên đã nộp (`attemptId` khác null) hiển thị nút `"Chấm bài"` (hoặc `"Đã chấm · Band X"`) dẫn tới `/grading/$attemptId`.
     - `SubmissionView`: khi `submission.objective` là `{ correctCount: 8, totalCount: 10 }`, hiển thị `data-testid="hybrid-objective-score"` chứa `"8/10"` câu đúng; khi `objective` là `undefined`, không hiển thị khối này.
  2. Chạy test để xác nhận Red.
  3. Hiện thực UI tuân thủ chặt chẽ `DESIGN.md`:
     - Truyền `writing` từ `PromptPreviewAside` và `/assignments/preview` xuống `StudentPreviewPaper`.
     - Mở rộng `buildQuizSim` trong `apps/web/src/lib/assignment-quiz-sim.ts` hỗ trợ đủ 4 kỹ năng tự chấm (`isAutoSkill(skillId)` khi có ít nhất 1 câu hỏi) và đính kèm `writing` vào sim; trong `PreviewQuizSimulation`, giữ state `essay` cục bộ và truyền `writingSection`, `essay`, `onEssayChange` xuống `<QuizPaper />` để tab `"Làm thử & Soi bài"` hiển thị trọn vẹn cả 2 phần mà không bị rơi về `<Card>` fallback thừa của `/assignments/preview`.
     - Ở `/assignments/index.tsx` và `ClassAssignmentsTab`: hiển thị badge `+ Writing` cạnh tên kỹ năng khi `prompt.writing != null`; bổ sung `"Grammar"` và `"Vocabulary"` vào `PICKER_SKILL_OPTIONS`, `handleSkillChipChange` và `SKILL_ICON` trong `ClassAssignmentsTab`, đồng thời hiển thị tóm tắt số câu + đề Writing ở khung preview đề đang chọn; đổi điều kiện `gradable` sang `promptRow ? hasGradableTask(promptRow) : isGradableSkill(skill)`.
     - Ở `SubmissionView`: nếu `sub.objective` có mặt, render khung thông tin gọn (`rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm`, `data-testid="hybrid-objective-score"`) ngay đầu trang: `"Phần trắc nghiệm: {sub.objective.correctCount}/{sub.objective.totalCount} câu đúng (chấm tự động)"` với `tabular-nums`.
- **Success criteria:** Toàn bộ unit/component test của `apps/web` xanh 100%.
- **Verify:** `pnpm --filter web test` exits 0 và không có test nào fail.

### Task 4.3 — Playwright E2E trọn luồng + Kiểm chứng UI 3 viewport & Local Gates
- **Goal:** Chứng minh luồng thực tế chạy thông suốt trên trình duyệt thật (giáo viên → học viên → giáo viên chấm → học viên xem kết quả + chi tiết + lịch sử), kiểm chứng responsive/theme ở 3 viewport (`1440×900`, `768×1024`, `375×812`) theo `REVIEW.md`, và pass toàn bộ local gate.
- **Target files and symbols:** `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts` (mới).
- **Steps:**
  1. Đọc `apps/e2e/specs/teacher-grade-submission.spec.ts` và `apps/e2e/specs/assignment-prompt-create.spec.ts` để tái dùng đúng helper đăng ký/đăng nhập giáo viên & học viên, tạo lớp, gán học viên và cổng override `8100/8101/8103/8104/8105`.
  2. Tạo `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts` kiểm tra trọn vòng:
     - Giáo viên vào `/assignments/new`, chọn `Grammar`, nhập tiêu đề + 2 câu hỏi trắc nghiệm có đáp án, bấm `"Thêm phần Writing"`, chọn `Task 2`, nhập đề Writing, chọn `Sẵn sàng giao`, lưu đề.
     - Giáo viên mở lớp, lọc/chọn đề vừa tạo (thấy nhãn `+ Writing`), giao bài cho lớp.
     - Học viên mở bài tập vừa giao ở cổng student, trả lời 2 câu trắc nghiệm (1 đúng, 1 sai) VÀ gõ bài luận Writing, bấm `Nộp bài` (xác nhận nếu thiếu từ).
     - Màn kết quả học viên hiển thị ngay `1/2` câu đúng, dòng `Đang chờ giáo viên chấm`, và bài luận đã viết.
     - Giáo viên vào lớp → tab Bài tập → bấm `Chấm bài` → vào `/grading/$attemptId`, thấy `Phần trắc nghiệm: 1/2 câu đúng`, đề Writing và bài luận học viên; chấm điểm 4 tiêu chí Writing + nhận xét và lưu.
     - Học viên tải lại màn kết quả thấy đồng thời `1/2` câu đúng VÀ Band Writing + nhận xét giáo viên; bấm `Xem giải thích chi tiết` sang `/detail` vẫn thấy đúng đáp án câu 1 (không bị ghi đè) cùng phần bài viết + Band Writing.
  3. Chụp và kiểm chứng giao diện 3 viewport (`1440×900`, `768×1024`, `375×812`) ở cả Light & Dark cho màn `/assignments/new` (bật phần Writing), màn làm bài gộp của học viên và `/grading/$attemptId` (lưu ảnh bằng chứng vào `plans/reports/574-*.png`, kiểm tra cơ học sự tồn tại của file ảnh, không tràn ngang ở 375px/320px và focus ring rõ ràng); chạy `pnpm design:compare` nếu thay đổi chạm màn có baseline design-v2.
  4. Chạy toàn bộ local gates: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, và Playwright E2E spec mới cùng `assignment-prompt-create.spec.ts` & `teacher-grade-submission.spec.ts`.
- **Success criteria:** E2E xanh, 3 viewport sáng/tối đạt chuẩn `DESIGN.md` + `REVIEW.md`, `biome check`, `check-types` và `pnpm test` toàn monorepo exit 0.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/hybrid-multi-skill-assignment.spec.ts specs/assignment-prompt-create.spec.ts specs/teacher-grade-submission.spec.ts && pnpm exec biome check . && pnpm check-types && pnpm test` exits 0.

## Verification
- `pnpm --filter web test` exits 0.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/hybrid-multi-skill-assignment.spec.ts` exits 0.
- `pnpm exec biome check . && pnpm check-types && pnpm test` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
