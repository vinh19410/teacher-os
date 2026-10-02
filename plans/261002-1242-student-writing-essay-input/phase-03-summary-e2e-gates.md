---
phase: 3
title: "Màn kết quả Writing + e2e + gate cuối"
status: done
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
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` (RT A: inject `detail.essay` vào answers cho Writing)
- Modify: `apps/student/test/attempt-summary.test.tsx` (RT I: test component `AttemptSummaryBody` extract ở 3.1)
- Modify: `apps/e2e/specs/helpers-quiz.ts`
- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts`
- Modify: `CHANGELOG.md` (tạo mục mới `## 2026-10-02` → `### Added`; mục ngày mới nhất hiện tại là `## 2026-10-01`)

## Tasks & Steps

### 3.1 Summary nhánh Writing
- [x] RT I: extract logic render thành component export được (ví dụ `AttemptSummaryBody`) khỏi route file — `AttemptSummaryPage` hiện là function nội bộ, test `attempt-summary.test.tsx` compose JSX thủ công nên không test được page thật. Route chỉ wrap component này.
- [x] Khi `(summary.essay ?? null) !== null`: không render `AttemptScoreCard`, link chi tiết và "Bảng đáp án". Thay vào đó render:
  - Heading "Bài viết của bạn" và dòng meta "{countWords(essay)} từ".
  - Khối bài viết read-only: `whitespace-pre-wrap rounded-md border border-line bg-bg p-4 text-[15px] leading-[1.7]`. Bài trống thì hiện "Bạn đã nộp bài trống." với `text-muted-fg`.
  - Ghi chú `text-muted-fg text-sm`: "Giáo viên sẽ chấm bài viết của bạn."
- [x] Giữ nguyên dòng "Bạn đã nộp bài lúc … · hoàn thành trong …".
- [x] Test component (trên `AttemptSummaryBody` extract): Writing summary hiện bài, số từ, và không có "Xem giải thích chi tiết". Summary Reading (`essay: null` hoặc không có field) vẫn hiện score card.

### 3.5 Route detail review (RT A — consumer `QuizPaper` bị bỏ sót trong plan gốc)
- [x] `$attemptId.detail.tsx` render `QuizPaper` ở `mode="review"` với `answers` build từ `attempt.questions` — với Writing thì `{}` nên textarea essay sẽ TRỐNG dù bài đã nộp. Sửa: với attempt Writing, inject `detail.essay ?? ""` vào answers key `"0"` để `QuizEssayInput` review-only hiện đúng bài đã nộp (tận dụng payload `essay` mà detail đã kế thừa từ Phase 1).
- [x] Không đổi API `QuizPaper`, không redirect route.

### 3.2 Seed helper
- [x] `QuizSeedPrompt` thêm `prompt?: string`, ghi vào cột `prompt` (thay chuỗi `""` đang ghi cứng), mặc định `""`.

### 3.3 E2E
- [x] Thêm fixture ở CUỐI mảng prompts (để không lệch các index `assignmentIds` đang dùng): `title: "Đề writing: marriage and age"`, `skill: "writing"`, `part: "task1"`, `type: "chart"`, `prompt: "<p>The graph shows … Summarise the information …</p>"`, `passage: ""`, `note: ""`, `questions: []`. Nếu spec có assert đếm tổng số đề thì cập nhật +1.
- [x] Test `"writing paper: essay autosaves with live word count, survives reload, guards a short submit, and shows on summary"`:
  1. `signIn`, `openPaper(page, titleWriting)`, bắt đầu làm bài.
  2. Không có text "không có câu hỏi tự chấm". Textarea "Bài viết của bạn" visible.
  3. Gõ "The graph shows a clear upward trend." Chờ `essay-word-count` chứa "7 từ" và "tối thiểu 150". Chờ header về "Đã lưu".
  4. `page.reload()`, bấm tiếp tục ở resume dialog. Textarea còn đúng nội dung.
  5. RT G: SPA-return round-trip — điều hướng ra trang khác rồi vào lại đề (không reload): resume dialog hiện với bài đã lưu từ server (nhờ invalidate sau flush ở 2.6). Tiếp tục, textarea còn nguyên.
  6. Bấm "Nộp bài": dialog "Bài viết chưa đủ số từ" xuất hiện. Xác nhận nộp.
  7. Ở summary: thấy "Bài viết của bạn", nội dung bài, "7 từ", không có "Xem giải thích chi tiết".
- [x] Chạy lại toàn bộ spec để chắc các test Reading cũ vẫn xanh.

### 3.4 Changelog + gate
- [x] `CHANGELOG.md` tạo mục mới `## 2026-10-02` (mục mới nhất hiện là `## 2026-10-01`) → `### Added`: "Trang làm bài học viên có ô nhập bài viết cho đề Writing: autosave, đếm từ theo mục tiêu Task 1/Task 2, và màn kết quả hiện lại bài đã nộp."
- [x] Gate cuối:
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
