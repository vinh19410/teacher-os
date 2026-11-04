---
title: "Ship #571: Bật ô giải thích đáp án trong composer giáo viên và bảo toàn round-trip tới học viên"
date: 2026-11-04
summary: "Hoàn tất triển khai TDD, tối ưu memo ExplanationRowField cho đề 40 câu, xử lý 3/3 finding từ LocalCodeReviewer và chuẩn bị mở PR beta vào develop"
---

# Ship #571: Bật ô giải thích đáp án trong composer giáo viên và bảo toàn round-trip tới học viên

## Chuyện gì đã xảy ra

1. Hoàn tất cả 2 phase của kế hoạch `#571` theo TDD Red → Green:
   - Bật `showExplanation` trên `QuestionKeyEditor` trong `PromptComposer` (`apps/web`).
   - Khóa `AnswerKeyGrid.handleKeyDown` (phủ cả `[contenteditable="true"]`, `[role="toolbar"]`, và portal Link Popover), `rowIsEmpty`, `errorEntries` + trần `richTextField(2000)`, `ClozeEditor.hasItemContent`, `quizReviewExplanation` (`<p></p>` rỗng).
   - Bảo toàn `explanation` qua `composerFromPrompt`, `TestBuilderShell` (`PATCH` lược bỏ `skill`/`part`), draft stores, `buildQuizSim` (`isAutoSkill`) + `PreviewQuizSimulation`.
2. Khi chạy hồi quy E2E 40 câu (`assignment-test-create.spec.ts`), phát hiện việc gõ trên từng câu re-render đồng loạt tất cả `RichTextEditor` / `RichTextToolbar` trong lưới phẳng; trích xuất `ExplanationRowField = memo(...)` ở cấp module kèm `useCallback` + `latestRef` giúp spec 40 câu pass gọn trong 2.4 phút.
3. Giải quyết 3/3 finding từ `LocalCodeReviewer` (`0 Critical / 2 Important / 1 Minor`): bổ sung `HTML_ENTITY_RE` + `PAIRED_OR_VOID_TAG_RE` đồng bộ giữa `rich-text-legacy.ts` và `rich-text-body.tsx` (idempotent cả với chuỗi 1 dòng có `<`/`>`/`&`), mở rộng `editingRichText` phủ `[role="toolbar"]`, và dùng `Promise.all` thu thập `quizPayloads` trong E2E.

## Quyết định

- Ship theo chế độ `beta` vào nhánh `develop`, giữ nguyên `package.json` version (theo thông lệ PR vào `develop`).
- Ghi nhận trung thực giới hạn bộ nhớ trên máy chia sẻ khi chạy `pnpm design:compare` (`Mem available < 1 GB`, `/assignments/new` không nằm trong `screens.json`) kèm kết quả kiểm chứng trực tiếp Chromium trên 4 viewport × 2 theme của `/assignments/new`.

## Bước tiếp theo

- Merge `origin/develop`, push nhánh `fix/571-assignment-answer-explanation`, mở PR vào `develop`, chạy `ak-review-pr --fix --reply --advice`, gắn label `ready to ship beta`, merge và theo dõi CI `develop` tới xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
