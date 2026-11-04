---
title: "Plan #571: Bật ô giải thích đáp án trong composer giáo viên và khóa 4 lỗi ẩn từ Red-Team"
date: 2026-11-04
summary: "Hoàn tất kế hoạch TDD bàn giao --advice cho #571, vá thêm 4 lỗi Critical từ Red-Team (handleKeyDown bắt nhầm phím trong RichTextEditor, PATCH Full-Test Builder gửi thừa skill/part, errorEntries thiếu explanation, sai endpoint /detail)"
---

# Plan #571: Bật ô giải thích đáp án trong composer giáo viên và khóa 4 lỗi ẩn từ Red-Team

## Chuyện gì đã xảy ra

Khi lập kế hoạch TDD cho issue #571 ("giáo viên không nhập được giải thích đáp án cho câu trắc nghiệm"), việc truy vết call-stack (`/ak-debug`) kết hợp Red-Team 2 góc nhìn (`Security Adversary` + `Assumption Destroyer`) phát hiện việc chỉ thêm prop `showExplanation` vào `PromptComposer` sẽ để lọt 4 lỗi nghiêm trọng:
1. `AnswerKeyGrid.handleKeyDown` (`packages/ui/.../answer-key-grid.tsx:351`) quên đưa `editingRichText` vào cổng chặn phím tắt đáp án — gõ chữ `t/f/n` hoặc `a–h` trong ô giải thích sẽ `preventDefault()` và ghi đè đáp án đúng của câu hỏi; nhấn `Enter` ở Link Popover portal tự thêm câu mới.
2. `TestBuilderShell` (`test-builder-shell.tsx:394-401,846-870`) gửi cả `skill` và `part` trong `PATCH /api/assignments/prompts/:id`, bị `assignmentPromptUpdateSchema` (`.strict()`) trả 400, đồng thời `composerFromPrompt` bỏ rơi `explanation`.
3. `AnswerKeyGrid` whitelist cứng `errorEntries` không có `"explanation"` nên lỗi vượt trần 2000 ký tự không render ra DOM.
4. `buildQuizSim` chặn `grammar`/`vocabulary`, `PreviewQuizSimulation` chưa truyền `explanation` vào review mode, và `quizReviewExplanation` chưa coi `"<p></p>"` là rỗng.

## Quyết định

- Gói trọn các bản sửa bảo vệ dữ liệu & tương tác bàn phím liên quan trực tiếp tới `showExplanation` vào Phase 1 (TDD Red → Green), kèm Phase 2 kiểm chứng integration API (`/attempts/:id/detail`) + E2E Playwright (gõ `pressSequentially`, tách browser context học viên) + 3 viewport + `design:compare`.
- Giữ ranh giới rõ với #579 (empty-state phía học viên khi đề không có giải thích) và không mở rộng sang RBAC server.

## Bước tiếp theo

- Nhận xác nhận Go từ `kongming`, commit/push plan + journal (`ak-git cp`), cập nhật issue #571 sang `in progress` và thực thi `/ak-fix --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
