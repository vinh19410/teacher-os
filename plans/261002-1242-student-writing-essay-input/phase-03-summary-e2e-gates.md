---
phase: 3
title: "Màn kết quả Writing + e2e + gate cuối"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Màn kết quả Writing + e2e + gate cuối

## Goal
Sau khi nộp đề Writing, màn kết quả hiện lại bài đã viết thay vì score card 0/0. Toàn bộ luồng viết, autosave, reload, nộp và xem lại được chứng minh trên trình duyệt thật. Mọi gate local đều xanh.

## Bối cảnh
- Summary: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` (`AttemptSummaryPage`), gồm `AttemptScoreCard`, link "Xem giải thích chi tiết" và `AttemptCompactList`.
- E2E: `apps/e2e/specs/student-quiz-take-review.spec.ts` và helper `apps/e2e/specs/helpers-quiz.ts`. Seed hiện ghi cứng cột `prompt` là `""`, nên phải thêm field tuỳ chọn.
- Port e2e: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103` (AGENTS.md).

## Files to Create / Modify
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`
- Modify: `apps/student/test/attempt-summary.test.tsx` (nếu test đó render page; nếu chỉ test formatter thì thêm test component cho nhánh Writing)
- Modify: `apps/e2e/specs/helpers-quiz.ts`
- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts`
- Modify: `CHANGELOG.md` (mục `## 2026-10-02` → `### Added`)

## Tasks & Steps

### 3.1 Summary nhánh Writing
- [ ] Khi `summary.essay !== null`: không render `AttemptScoreCard`, link chi tiết và "Bảng đáp án". Thay vào đó render:
  - Heading "Bài viết của bạn" và dòng meta "{countWords(essay)} từ".
  - Khối bài viết read-only: `whitespace-pre-wrap rounded-md border border-line bg-bg p-4 text-[15px] leading-[1.7]`. Bài trống thì hiện "Bạn đã nộp bài trống." với `text-muted-fg`.
  - Ghi chú `text-muted-fg text-sm`: "Giáo viên sẽ chấm bài viết của bạn."
- [ ] Giữ nguyên dòng "Bạn đã nộp bài lúc … · hoàn thành trong …".
- [ ] Test component: Writing summary hiện bài, số từ, và không có "Xem giải thích chi tiết". Summary Reading (`essay: null`) vẫn hiện score card.

### 3.2 Seed helper
- [ ] `QuizSeedPrompt` thêm `prompt?: string`, ghi vào cột `prompt` (thay chuỗi `""` đang ghi cứng), mặc định `""`.

### 3.3 E2E
- [ ] Thêm fixture ở CUỐI mảng prompts (để không lệch các index `assignmentIds` đang dùng): `title: "Đề writing: marriage and age"`, `skill: "writing"`, `part: "task1"`, `type: "chart"`, `prompt: "<p>The graph shows … Summarise the information …</p>"`, `passage: ""`, `note: ""`, `questions: []`. Nếu spec có assert đếm tổng số đề thì cập nhật +1.
- [ ] Test `"writing paper: essay autosaves with live word count, survives reload, guards a short submit, and shows on summary"`:
  1. `signIn`, `openPaper(page, titleWriting)`, bắt đầu làm bài.
  2. Không có text "không có câu hỏi tự chấm". Textarea "Bài viết của bạn" visible.
  3. Gõ "The graph shows a clear upward trend." Chờ `essay-word-count` chứa "7 từ" và "tối thiểu 150". Chờ header về "Đã lưu".
  4. `page.reload()`, bấm tiếp tục ở resume dialog. Textarea còn đúng nội dung.
  5. Bấm "Nộp bài": dialog "Bài viết chưa đủ số từ" xuất hiện. Xác nhận nộp.
  6. Ở summary: thấy "Bài viết của bạn", nội dung bài, "7 từ", không có "Xem giải thích chi tiết".
- [ ] Chạy lại toàn bộ spec để chắc các test Reading cũ vẫn xanh.

### 3.4 Changelog + gate
- [ ] `CHANGELOG.md` mục `## 2026-10-02` → `### Added`: "Trang làm bài học viên có ô nhập bài viết cho đề Writing: autosave, đếm từ theo mục tiêu Task 1/Task 2, và màn kết quả hiện lại bài đã nộp."
- [ ] Gate cuối:
  - `pnpm check`
  - `pnpm check-types`
  - `pnpm --filter server test`
  - `pnpm --filter student test`
  - `pnpm --filter web test`
  - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-quiz-take-review`

## Verification
- Tất cả lệnh ở 3.4 đều xanh. Ghi lại output tóm tắt vào PR body.

## Follow-up (ngoài scope)
- Mở issue "Giáo viên đọc/chấm bài viết Writing học viên đã nộp", link về issue của plan này.
