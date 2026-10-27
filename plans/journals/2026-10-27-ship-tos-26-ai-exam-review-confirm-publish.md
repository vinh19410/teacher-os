# Ship Journal — TOS-26 (#472): Chỉnh sửa tay 0 Credit và bắt buộc xác nhận câu Cần rà soát lại trước khi xuất bản

- **Date:** 2026-10-27
- **Issue:** #472 (`TOS-26`)
- **Branch:** `ai-handle-issue-472`
- **Plan:** `plans/261027-0434-tos-26-ai-exam-review-confirm-publish/plan.md`

## Tóm tắt kỹ thuật

1. **Database & Contracts (`packages/db`, `packages/api`):**
   - Thêm cột `published_test_id` (nullable `text`) vào bảng `exam_import_job` kèm migration `0052_exam_import_published_test.sql`, cập nhật `_journal.json` và `0052_snapshot.json` khớp với `/readyz` (`REQUIRED_COLUMN_TOTAL`).
   - Mở rộng `EXAM_IMPORT_ERROR_CODES` (`REVIEW_CONFIRMATION_REQUIRED`, `TOO_MANY_PARTS`, `SKILL_MIXED_NOT_ALLOWED`, `INVALID_DRAFT`, `INVALID_STATE`), định nghĩa `examImportDraftUpdateSchema`, `examImportPublishSchema`, `examImportPublishResponseSchema`, và hỗ trợ rich text cho `passage`/`explanation` trên `extractedExamDraftSchema`.

2. **Server API & Idempotent Batch Publish (`apps/server`):**
   - `PATCH /api/exam-imports/:id/draft`: kiểm tra `canImportExam`, CSRF Origin fail-closed + `Content-Type: application/json`, chỉ cho phép trên job `completed` cùng org, hợp nhất qua `mergeReviewedDraft` để bảo toàn `confidence` và cờ `needsReview` gốc (sửa tay không tự xóa nhãn, chặn xóa bớt câu để hạ `needsReview` về 0), ghi `draft_json` với chi phí **0 Credit** (không chạm `wallet.ts`).
   - `POST /api/exam-imports/:id/publish` (`publishExamImportToBank`): kiểm tra cổng xác nhận 2 lớp (trả 422 `REVIEW_CONFIRMATION_REQUIRED` khi còn câu `needsReview` mà `reviewConfirmed !== true`), chặn `skill === "mixed"` và vượt số slot trong `ASSIGNMENT_TEST_PRESETS`, chuẩn hóa `type`/đáp án MCQ theo catalog Ngân hàng đề, chạy `db.batch` nguyên tử chèn `assignment_prompt[]` + `assignment_test` + `assignment_test_part[]` + cập nhật `published_test_id` với ID tất định ở lần xuất bản đầu tiên để chống race TOCTOU. Đề `listening` chưa có audio lưu `status = "draft"`, các kỹ năng khác lưu `status = "ready"`.
   - `apps/server/src/routes/snapshot.ts`: cập nhật `parseQuestions` forward trường `explanation`.

3. **Frontend & E2E (`apps/web`, `apps/e2e`):**
   - Chuyển `ExtractedExamPanel` và `QuestionReviewCard` sang form chỉnh sửa tay 0 Credit (bọc `normalizeLegacyRichText` cho `RichTextEditor` Tiptap, giữ nguyên badge vàng `(!) Cần rà soát lại` khi sửa câu).
   - Tạo `ReviewConfirmation` và `ExamImportActions` (khóa nút `"Lưu vào Ngân hàng đề"` kèm `aria-describedby` khi `reviewCount > 0 && !confirmed`, luôn mở nút `"Lưu bản nháp"`).
   - Trong `import.tsx`, gọi `await onRefreshKernel()` (`useData().refresh`) trước khi `navigate({ to: "/assignments/tests/$id" })` để tránh lỗi `notFound()` do cache `['kernel']` cũ.
   - Thêm E2E spec `apps/e2e/specs/ai-exam-import-ac-003.spec.ts` kiểm chứng toàn bộ AC-003 và chụp screenshot 3 viewport (`1440×900`, `768×1024`, `375×812`).
