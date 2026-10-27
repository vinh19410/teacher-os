---
phase: 2
title: "Cột phải chỉnh sửa + cổng xác nhận"
status: completed
effort: 7h
---

# Phase 2 — Cột phải chỉnh sửa + cổng xác nhận

<!-- Updated: Red Team & Validation Session 1 - controlled React state, normalizeLegacyRichText for Tiptap, useData().refresh() before navigate, import.tsx + import.test.tsx updates -->

## Goal

Biến cột phải màn `[6]` (`/assignments/tests/import`) thành trình chỉnh sửa tay 0 Credit (tiêu đề, kỹ năng, thời gian, passage Tiptap, từng câu hỏi/phương án/đáp án/giải thích), giữ nguyên nhãn vàng `(!) Cần rà soát lại` khi sửa câu, hiển thị hộp kiểm xác nhận `[11]` khi `reviewCount > 0`, khóa nút `"Lưu vào Ngân hàng đề"` tới khi tích xác nhận, và đồng bộ `useData().refresh()` trước khi điều hướng sang `/assignments/tests/$id`.

## Files to Create or Modify

- `apps/web/src/lib/repos/exam-imports.ts`: thêm `saveExamImportDraft`, `publishExamImport`, và kiểu lỗi `ExamImportPublishError`.
- `apps/web/src/components/exam-import/review-confirmation.tsx` (+ `review-confirmation.test.tsx`): hộp kiểm xác nhận câu gắn nhãn `(!) Cần rà soát lại`.
- `apps/web/src/components/exam-import/exam-import-actions.tsx`: cụm 2 nút `"Lưu bản nháp"` (secondary, luôn bật khi không bận) và `"Lưu vào Ngân hàng đề"` (primary, khóa khi `reviewCount > 0 && !confirmed`, có `aria-describedby` giải thích lý do khóa).
- `apps/web/src/components/exam-import/question-review-card.tsx`: chuyển sang thẻ chỉnh sửa câu hỏi (stem, loại câu, phương án, đáp án đúng, giải thích), giữ nguyên badge `<Badge variant="warn" dot data-testid="question-needs-review">(!) Cần rà soát lại</Badge>` và viền `border-warn` khi `question.needsReview === true`.
- `apps/web/src/components/exam-import/extracted-exam-panel.tsx` (+ `extracted-exam-panel.test.tsx`): form controlled state cho `title`, `skill`, `timeLimitMinutes`, từng part (`RichTextEditor` với `normalizeLegacyRichText`), danh sách `QuestionReviewCard`, `ReviewConfirmation`, và `ExamImportActions`.
- `apps/web/src/routes/_auth/assignments/tests/import.tsx` (+ `import.test.tsx`): nối `saveExamImportDraft` và `publishExamImport`, gọi `await refresh()` từ `useData()` trước khi `navigate({ to: "/assignments/tests/$id", params: { id: testId } })`.

## Tasks & Steps

### Task 2.1 — Client repo `saveExamImportDraft` và `publishExamImport`
- **Goal:** Cung cấp hàm gọi `PATCH /api/exam-imports/:id/draft` và `POST /api/exam-imports/:id/publish` có parse schema và map lỗi 422 rõ ràng.
- **Target files and symbols:** `apps/web/src/lib/repos/exam-imports.ts` (`saveExamImportDraft`, `publishExamImport`, `ExamImportPublishError`).
- **Steps:**
  1. Thêm `saveExamImportDraft({ jobId, draft, baseUrl?, signal? }): Promise<ExamImportJob>` gửi `PATCH /api/exam-imports/${jobId}/draft` với `Content-Type: application/json`, trả `examImportJobSchema.parse(await res.json())`.
  2. Thêm `publishExamImport({ jobId, draft, reviewConfirmed, baseUrl?, signal? }): Promise<{ testId: string; status: "ready" | "draft" }>` gửi `POST /api/exam-imports/${jobId}/publish`; khi 422 map `code` sang `ExamImportPublishError` (`review_confirmation_required`, `too_many_parts`, `skill_mixed_not_allowed`, `invalid_draft`).
- **Success criteria:** Typecheck `apps/web` pass với các hàm repo mới.
- **Verify:** `no verification needed` (kiểm chứng ở Task 2.2 và 2.3).

### Task 2.2 — Component `ReviewConfirmation` và `ExamImportActions`
- **Goal:** Render hộp kiểm xác nhận khi `reviewCount > 0` và khóa/mở khóa nút `"Lưu vào Ngân hàng đề"` đúng AC-003.
- **Target files and symbols:** `apps/web/src/components/exam-import/review-confirmation.tsx`, `apps/web/src/components/exam-import/exam-import-actions.tsx`, `apps/web/src/components/exam-import/review-confirmation.test.tsx`.
- **Steps:**
  1. Tạo `ReviewConfirmation({ reviewCount, confirmed, onConfirmedChange, id })`: nếu `reviewCount <= 0` trả `null`; nếu `reviewCount > 0` render khung cảnh báo có checkbox với label `"Tôi đã kiểm tra và xác nhận các câu gắn nhãn Cần rà soát lại"` (kèm số lượng câu cần rà soát).
  2. Tạo `ExamImportActions({ reviewCount, confirmed, savingDraft, publishing, onSaveDraft, onPublish })`: nút `"Lưu bản nháp"` bật khi `!savingDraft && !publishing`; nút `"Lưu vào Ngân hàng đề"` `disabled` khi `(reviewCount > 0 && !confirmed) || savingDraft || publishing`, gắn `aria-describedby` tới phần tử giải thích lý do khóa khi chưa tích xác nhận.
  3. Viết test `apps/web/src/components/exam-import/review-confirmation.test.tsx`.
- **Success criteria:** Test xác nhận: `reviewCount = 0` không render checkbox và nút xuất bản mở sẵn; `reviewCount > 0` render checkbox, chưa tích thì nút `"Lưu vào Ngân hàng đề"` bị `disabled`, tích xong thì nút bật.
- **Verify:** `pnpm --filter web test -- review-confirmation` exits 0.

### Task 2.3 — Chỉnh sửa trên `QuestionReviewCard`, `ExtractedExamPanel` và nối vào `import.tsx`
- **Goal:** Giáo viên sửa được tên đề, kỹ năng, thời gian, passage (Tiptap), câu hỏi/đáp án/giải thích, bấm `"Lưu bản nháp"` (0 Credit) hoặc tích xác nhận rồi bấm `"Lưu vào Ngân hàng đề"` để tạo đề và điều hướng sang `/assignments/tests/$id`.
- **Target files and symbols:** `apps/web/src/components/exam-import/question-review-card.tsx`, `apps/web/src/components/exam-import/extracted-exam-panel.tsx`, `apps/web/src/components/exam-import/extracted-exam-panel.test.tsx`, `apps/web/src/routes/_auth/assignments/tests/import.tsx`, `apps/web/src/routes/_auth/assignments/tests/import.test.tsx`.
- **Steps:**
  1. Cập nhật `QuestionReviewCard` nhận `onChange?: (next: ReviewedQuestion) => void`: cho phép sửa `stem`, `opts` (nếu có), `answer`, `explanation`, `type`; giữ nguyên `needsReview: question.needsReview` (không tự xóa khi sửa) cùng `<Badge variant="warn" dot data-testid="question-needs-review">(!) Cần rà soát lại</Badge>` và viền `border-warn`.
  2. Cập nhật `ExtractedExamPanel` quản lý state bản nháp từ `draft` (khởi tạo `part.passage` qua `normalizeLegacyRichText`), cho phép sửa `title`, `skill`, `timeLimitMinutes`, `passage` (qua `RichTextEditor`), từng câu hỏi, đồng thời reset/giữ state `confirmed` và render `ReviewConfirmation` + `ExamImportActions`.
  3. Trong `apps/web/src/routes/_auth/assignments/tests/import.tsx`, truyền handlers lưu nháp (`saveExamImportDraft` → cập nhật `state.job` + hiện thông báo `"Đã lưu bản nháp (0 Credit)."`) và xuất bản (`publishExamImport` → `await refresh()` từ `useData()` → điều hướng `/assignments/tests/$id`). Cập nhật mock trong `import.test.tsx` và thêm `extracted-exam-panel.test.tsx`.
- **Success criteria:** Toàn bộ unit test `review-confirmation`, `extracted-exam`, `import` trong `apps/web` pass; `pnpm check-types` pass.
- **Verify:** `pnpm --filter web test -- review-confirmation extracted-exam import` exits 0.

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
