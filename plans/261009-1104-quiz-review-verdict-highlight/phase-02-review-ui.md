---
phase: 2
title: "UI review: khối câu, lựa chọn, chip, navigator, compact list"
status: pending
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 2: UI review — khối câu, lựa chọn, chip, navigator, compact list

## Goal
Màn soi bài cho thấy đúng/sai ở 4 cấp: khối câu, lựa chọn/ô điền, chip verdict và navigator. Tất
cả dùng chung một nguồn class + icon, và chế độ take không thay đổi.

## Files to Create / Modify
- Create: `packages/ui/src/components/quiz/quiz-verdict.tsx`. Đây là nguồn style verdict duy nhất,
  thay cho 3 map đang trùng lặp: `QUIZ_REVIEW_CHIP_CLASSES`, `VERDICT_BUTTON_CLASSES`, `VERDICT_TEXT_CLASSES`.
- Modify: `packages/api/src/lib/grade-quiz.ts` (export helper so khớp đáp án)
- Modify: `packages/ui/src/components/quiz/quiz-question-item.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-review-item.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-navigator.tsx`
- Modify: `packages/ui/src/components/quiz/attempt-compact-list.tsx`
- Modify: `packages/ui/src/components/assignments/cloze-stem.tsx` (prop `verdict?`)
- Modify: `packages/ui/src/components/assignments/pin-overlay.tsx` (prop `verdicts?`)
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx` (truyền verdict xuống PinOverlay)

## Tasks & Steps

### 1. Nguồn style chung `quiz-verdict.tsx`
- Export `VerdictIcon({ verdict, className })`: SVG inline 1 nét (✓ check, ✗ cross, – dash cho
  skipped), `aria-hidden`, `stroke="currentColor"`, size theo `className`. Dùng SVG chứ không dùng
  ký tự để `toHaveText` của chip không bị lẫn icon.
- Export các map `Record<QuizVerdict, string>`:
  - `VERDICT_BLOCK_CLASSES`: correct = `border-l-[3px] border-l-verdict-correct bg-verdict-correct-soft`.
    wrong = `border-l-[3px] border-l-verdict-wrong bg-verdict-wrong-soft`. skipped =
    `border-l-[3px] border-l-meta border-dashed bg-transparent`. Nếu viền đứt áp cho cả 4 cạnh
    thì đổi sang viền đứt toàn khối `border-dashed border-line-strong`.
  - `VERDICT_CHIP_CLASSES`: correct = `border-verdict-correct/50 bg-verdict-correct-soft text-verdict-correct`.
    wrong tương tự với `verdict-wrong`. skipped = `border-dashed border-line-strong text-muted-fg`.
  - `VERDICT_SOLID_CLASSES` (navigator): correct = `border-transparent bg-verdict-correct text-verdict-on`.
    wrong = `bg-verdict-wrong text-verdict-on`. skipped = `border-dashed border-line-strong bg-surface text-muted-fg`.
  - `VERDICT_TEXT_CLASSES`: `text-verdict-correct` / `text-verdict-wrong` / `text-muted-fg`.
- Giữ `QUIZ_REVIEW_CHIP_CLASSES` trong `quiz-review-item.tsx` dưới dạng re-export alias của
  `VERDICT_CHIP_CLASSES` nếu còn caller ngoài. Đã grep: chỉ dùng nội bộ, nên có thể xoá hẳn.

### 2. Helper so khớp đáp án (DRY với grader)
- Trong `grade-quiz.ts`, export `isAcceptedAnswer(value: string, key: string, alts: string): boolean`.
  Helper dùng lại `normalize` + tách `ALT_SEPARATOR` hiện có. Viết lại `candidatesFor` bằng helper
  mới để grader và UI dùng cùng một rule.
- Unit test grader hiện có phải pass nguyên vẹn.

### 3. `QuizQuestionItem` (review mode)
- Fieldset: khi `reviewMode && review`, thêm `VERDICT_BLOCK_CLASSES[review.verdict]` và
  `data-verdict={review.verdict}`. Câu hiện tại (`current`) trong review chuyển sang
  `outline-2 outline-hot outline-offset-2` thay vì `bg-accent-soft`, để không đè nền verdict.
- Dòng số câu: render `QuizReviewChip` (bước 4) cạnh `{question.number}.` ở review.
- Hàng radio, chỉ trong review (take giữ nguyên logic hiện tại):
  - `selected && verdict==="correct"`: viền + nền `verdict-correct` soft, chữ `text-verdict-correct`
    font-medium, icon ✓ cuối hàng.
  - `selected && verdict==="wrong"`: viền + nền `verdict-wrong` soft, chữ `text-verdict-wrong`
    `line-through`, icon ✗ và nhãn nhỏ "Bạn chọn".
  - `!selected && verdict!=="correct" && isAcceptedAnswer(row.value, key, alts)`: viền
    `border-verdict-correct` (2px), chữ `text-verdict-correct`, icon ✓ và nhãn nhỏ "Đáp án đúng".
  - Hàng khác: `text-muted-fg`, không viền nổi.
  - **Bỏ `text-hot`** cho hàng đã chọn ở review. Radio `accent-hot` đổi thành `accent-[var(--verdict-*)]`
    theo verdict, hoặc ẩn radio ở review và dùng icon thay thế. Chọn cách nào gọn hơn khi code.
  - Nhãn "Bạn chọn"/"Đáp án đúng" là text thật (screen reader đọc được), mono 10px uppercase theo
    quy tắc Badge của `DESIGN.md`.
- Câu cloze: truyền `verdict={reviewMode ? review?.verdict : undefined}` xuống `ClozeStemText`.

### 4. `QuizReviewItem` + chip
- Tách `QuizReviewChip({ info })`: pill `px-2.5 py-1 text-[13px] font-[590]` (to hơn mức 12px hiện
  tại), có `VerdictIcon` size-3.5. Giữ `data-testid="quiz-review-chip"` và nội dung
  `quizReviewChipText` **không đổi** (e2e kiểm "Đúng" / "A" / "Chưa trả lời").
- Chip chuyển lên dòng số câu (bước 3). `QuizReviewItem` còn lại dòng "Đáp án: X" + Giải thích.
  "X" tô `text-verdict-correct` font-medium. Khi `wrong`, thêm dòng
  "Bạn trả lời: <answer>" với `line-through text-verdict-wrong`.
- Giữ `data-testid="quiz-review-item"` + `data-verdict` trên khối (e2e dùng).
- Bỏ khung `border-line-soft bg-surface` của khối review vì đã có nền ở cấp câu. Thay bằng
  `border-t border-line-soft pt-2` để tránh lồng nhiều tầng nền.

### 5. `ClozeStemText` / `PinOverlay`
- `cloze-stem.tsx`: thêm prop `verdict?: QuizVerdict`. Khi có thì ghi đè class input: correct =
  `border-b-verdict-correct text-verdict-correct`, wrong = `border-b-verdict-wrong text-verdict-wrong line-through`,
  skipped = `border-b-meta border-dashed`. Thêm `disabled:opacity-100` để fieldset disabled không làm mờ.
- `pin-overlay.tsx`: thêm prop `verdicts?: Record<number, QuizVerdict>` (key theo offset, giống
  `answers`), áp cùng class cho input pin. `quiz-paper.tsx` truyền
  `verdicts={reviewMode ? verdictsFromReview : undefined}`, dựng từ prop `review`.

### 6. `QuizNavigator`
- Thay `VERDICT_BUTTON_CLASSES` bằng `VERDICT_SOLID_CLASSES`. Trong nút (`relative`), thêm
  `VerdictIcon` size-2.5 ở góc trên phải (`absolute -top-1 -right-1`, nền `bg-bg` tròn) khi có verdict.
- `aria-label`, `data-verdict` và dòng status giữ nguyên. Dòng status bọc số trong span màu
  verdict: "Đúng **N** câu" xanh, "Sai **N**" đỏ. `textContent` phải giữ đúng chuỗi cũ.

### 7. `AttemptCompactList` (trang kết quả)
- Dùng `VERDICT_TEXT_CLASSES` mới + `VerdictIcon` trước đáp án học viên. Khi `wrong`, đáp án học
  viên thêm `line-through` và "Đáp án: X" tô xanh.

## Verification
- `pnpm check && pnpm check-types`
- `pnpm --filter student test` (quiz-review-item, quiz-paper, quiz-navigator, attempt-summary)

- `pnpm --filter @teacher-os/api test` (grade-quiz.test.ts)
- `pnpm --filter web test` gồm `preview-quiz-simulation.test.tsx`
