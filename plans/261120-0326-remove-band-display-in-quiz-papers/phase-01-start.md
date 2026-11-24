---
phase: 1
title: "Phase 1: Bỏ Band trong QuizPaper & QuizTakeView Start Gate"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Bỏ Band trong QuizPaper & QuizTakeView Start Gate

## Goal

Loại bỏ hiển thị `· Band {detail.band}` khỏi component dùng chung `QuizPaper` và thẻ Start Gate của `QuizTakeView`, kèm unit test TDD xác nhận không còn hiển thị chữ `Band` trong giao diện làm bài, soi bài và xem trước tương tác.

## Files to Create / Modify

- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx` (lines 577–581)
- Modify: `packages/ui/src/components/quiz/quiz-paper.test.tsx`
- Modify: `apps/student/src/components/quiz/quiz-take-view.tsx` (lines 441–460)
- Modify: `apps/student/test/quiz-take-view.test.tsx`
- Modify: `apps/admin/src/components/library/test-preview-overlay.test.tsx` (thêm assertion phủ định `Band` — <!-- Updated: Red-Team Finding 5 -->)
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx` (thêm assertion phủ định `Band` — <!-- Updated: Red-Team Finding 5 -->)

## TDD Test Matrix

<!-- Updated: Red-Team Finding 5 - tách case Auto/Practice thuần khỏi Hybrid, bổ sung TestPreviewOverlay & PreviewQuizSimulation -->

| # | Target | Test Case | Expected Before (Red) | Expected After (Green) |
|---|--------|-----------|-----------------------|------------------------|
| 1 | `QuizPaper` (`packages/ui`) | Listening/Reading với `band: "7.0"`, không có `level`, `mode="take"` | Chứa `Band 7.0` | Chỉ chứa `Listening` / `Reading`, không chứa `Band` hay `7.0` |
| 2 | `QuizPaper` (`packages/ui`) | Listening với `band: "7.0"` và `level: "IELTS Academic"`, `mode="review"` | Chứa `Listening · IELTS Academic · Band 7.0` | Chứa `Listening · IELTS Academic`, không chứa `Band` |
| 3a | `QuizTakeView` (`apps/student`) | Start gate (`attempt: null`) cho Practice Auto thuần (`source={{ kind: "practice", testId: "test-listen-1" }}`, `writing: undefined`, `band: "7.0"`) | Chứa `2 câu hỏi · Band 7.0` | Chứa chính xác `2 câu hỏi` (không có `·` thừa hay `Band`) |
| 3b | `QuizTakeView` (`apps/student`) | Start gate (`attempt: null`) cho Hybrid assignment (`writing` có giá trị, `band: "6.5"`) | Chứa `2 câu hỏi + Bài viết · Band 6.5` | Chứa chính xác `2 câu hỏi + Bài viết`, không chứa `Band` |
| 4 | `QuizTakeView` (`apps/student`) | Start gate (`attempt: null`) cho Writing (`skill: "writing"`, `part: "task2"`, `writing: undefined`, `questions: []`, `band: "7.0"`) | Chứa `Bài viết · tối thiểu 250 từ · Band 7.0` | Chứa chính xác `Bài viết · tối thiểu 250 từ`, không chứa `Band` |
| 5 | `QuizTakeView` (`apps/student`) | Start gate (`attempt: null`) cho Speaking (`skill: "speaking"`, `part: "part2"`, `writing: undefined`, `questions: []`, `band: "7.5"`) | Chứa `Bài nói · Part 2 · nộp 1 file audio/video (tối đa 50 MB) · Band 7.5` | Chứa chính xác `Bài nói · Part 2 · nộp 1 file audio/video (tối đa 50 MB)`, không chứa `Band` |
| 6 | `TestPreviewOverlay` (`apps/admin`) | Preview đề có `band: "7.0"` | Chứa `Band 7.0` | Không chứa `Band 7.0` |
| 7 | `PreviewQuizSimulation` (`apps/web`) | Simulation đề có `band: "6.0"` | Chứa `Band 6.0` | Không chứa `Band 6.0` |

## Implementation Steps

1. **Red (Tests first):**
   - Thêm test cases 1–2 vào `packages/ui/src/components/quiz/quiz-paper.test.tsx` kiểm tra header metadata của `QuizPaper` không chứa `Band` (cả khi có và không có `detail.level`, cả `mode="take"` và `mode="review"`).
   - Thêm test cases 3a, 3b, 4, 5 vào `apps/student/test/quiz-take-view.test.tsx` kiểm tra Start Gate (`attempt: null`) không hiển thị `Band` cho cả 4 trường hợp: Practice Auto thuần (nhớ đặt `writing: undefined`), Hybrid assignment, Writing (đặt `writing: undefined`, `questions: []`), và Speaking (đặt `writing: undefined`, `questions: []`).
   - Thêm assertion `not.toContain("Band 7.0")` vào `apps/admin/src/components/library/test-preview-overlay.test.tsx` và `not.toContain("Band 6.0")` vào `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`.
   - Chạy vitest hẹp để xác nhận các test mới FAIL đúng lý do.
2. **Green (Implementation):**
   - Trong `packages/ui/src/components/quiz/quiz-paper.tsx` (lines 577–581): bỏ ` · Band{" "}{detail.band}`, chỉ giữ:
     ```tsx
     <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
     	{SKILL_LABELS[skill] ?? skill}
     	{detail.level?.trim() ? ` · ${detail.level.trim()}` : ""}
     </p>
     ```
     Giữ nguyên kiểu `QuizPaperDetail` tương thích cấu trúc để không làm vỡ bất kỳ caller/DTO nào (`TestPreviewOverlay`, `PreviewQuizSimulation`, `QuizTakeView`, `AttemptDetailScreen`, `assignment-quiz-sim.ts`, `library-quiz-preview.ts`).
   - Trong `apps/student/src/components/quiz/quiz-take-view.tsx` (lines 441–460): bỏ ` · Band {detail.band}` ở cả 3 nhánh `isSpeaking`, `isWriting`, và mặc định (auto/hybrid).
3. **Verify:**
   - Chạy vitest cho tất cả test suites liên quan trực tiếp đến `QuizPaper` và `QuizTakeView`.

## Todo

- [x] Viết unit tests Red cho `QuizPaper` (`packages/ui/src/components/quiz/quiz-paper.test.tsx`)
- [x] Viết unit tests Red cho `QuizTakeView` Start Gate (`apps/student/test/quiz-take-view.test.tsx`)
- [x] Bổ sung assertion phủ định `Band` ở `test-preview-overlay.test.tsx` và `preview-quiz-simulation.test.tsx`
- [x] Sửa `packages/ui/src/components/quiz/quiz-paper.tsx` bỏ ` · Band {detail.band}`
- [x] Sửa `apps/student/src/components/quiz/quiz-take-view.tsx` bỏ ` · Band {detail.band}`
- [x] Chạy unit tests xác nhận toàn bộ Green

## Verification

<!-- Updated: Red-Team Finding 4 - bổ sung quiz-review-item.test.tsx, preview-quiz-simulation.test.tsx, preview-sim-tab.test.tsx -->

```bash
pnpm --filter @teacher-os/ui test src/components/quiz/quiz-paper.test.tsx && \
pnpm --filter student test test/quiz-paper.test.tsx test/quiz-take-view.test.tsx test/quiz-review-item.test.tsx && \
pnpm --filter admin test src/components/library/test-preview-overlay.test.tsx && \
pnpm --filter web test src/components/assignments/preview-quiz-simulation.test.tsx src/routes/_auth/assignments/preview-sim-tab.test.tsx
```

## Success Criteria

- Toàn bộ test mới và test cũ ở `packages/ui`, `apps/student`, `apps/admin`, `apps/web` đều pass.
- `QuizPaper` và Start Gate không còn render chữ `Band` ở bất kỳ kỹ năng hay chế độ nào (`take` / `review` / `practice` / `assignment` / `preview`).
