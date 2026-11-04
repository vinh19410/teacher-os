# Phase 1: Fix Button Contrast & Unit Tests

Tăng độ tương phản chữ cho 3 nút CTA chính trong `apps/student` ("Nộp bài", "Bắt đầu học", "Tham gia lớp") bằng cách loại bỏ class `text-bg` không tồn tại và thay bằng `text-primary-foreground` cùng `hover:bg-primary/90`.

## Overview

Theo thiết kế v2, `--color-primary` là màu mực đen (`oklch(0.205)`) ở light mode và sáng (`oklch(0.922)`) ở dark mode. Token `--color-primary-foreground` tương ứng là `oklch(0.985)` ở light mode và `oklch(0.205)` ở dark mode. Sử dụng `text-primary-foreground` trên nền `bg-primary` đảm bảo độ tương phản WCAG AA (≥ 4.5:1) ở cả hai chế độ.

Phase này thực hiện qua 4 task TDD có cấu trúc handover:
1. Task 1.1: Viết test TDD Red kiểm tra các nút và quét không có `text-bg`.
2. Task 1.2: Sửa 3 component nguồn sang class chuẩn.
3. Task 1.3: Cập nhật `CHANGELOG.md`.
4. Task 1.4: Chạy toàn bộ test suites và typecheck gates.

## Files to Create / Modify

- `apps/student/src/components/quiz/quiz-runtime-header.tsx`
- `apps/student/src/components/vocab/vocab-suggestion-list.tsx`
- `apps/student/src/components/overview/class-card.tsx`
- `apps/student/test/quiz-navigator.test.tsx`
- `apps/student/src/components/vocab/vocab-suggestion-list.test.tsx`
- `apps/student/test/overview.test.tsx`
- `CHANGELOG.md`


## Task Checklist

- [x] Task 1.1: Thêm TDD Red tests kiểm tra độ tương phản nút và regression guard
- [x] Task 1.2: Sửa 3 component nguồn sang class chuẩn (TDD Green)
- [x] Task 1.3: Cập nhật CHANGELOG.md
- [x] Task 1.4: Kiểm tra chất lượng và chạy gates
## Tasks & Steps

### Task 1.1 — Thêm TDD Red tests kiểm tra độ tương phản nút và regression guard
- **Goal**: Thêm assertions kiểm tra nút "Nộp bài", "Bắt đầu học", "Tham gia lớp" không chứa `text-bg`, có chứa `text-primary-foreground` (hoặc cấu hình variant tương đương), và kiểm tra quét repo không chứa `text-bg` trong `apps/*/src`.
- **Target files and symbols**:
  - `apps/student/test/quiz-navigator.test.tsx` (describe block `QuizRuntimeHeader`)
  - `apps/student/src/components/vocab/vocab-suggestion-list.test.tsx` (test cho suggestion card)
  - `apps/student/test/overview.test.tsx` (test cho `ClassCard` invited state)
- **Steps**:
  1. Trong `apps/student/test/quiz-navigator.test.tsx`:
     - Tại test case kiểm tra nút Nộp bài của `QuizRuntimeHeader`, assert rằng markup render ra không chứa `text-bg` và chứa `text-primary-foreground`.
  2. Trong `apps/student/src/components/vocab/vocab-suggestion-list.test.tsx`:
     - Render suggestion list với 1 item mẫu, query nút "Bắt đầu học" theo `getByTestId("vocab-suggestion-accept-...")` hoặc getByRole("button", { name: /Bắt đầu học/i }).
     - Assert `btn.classList.contains("text-bg") === false` và `btn.classList.contains("text-primary-foreground") === true`.
  3. Trong `apps/student/test/overview.test.tsx`:
     - Tại test case `ClassCard` với trạng thái được mời (`Tham gia lớp`), assert rằng markup chứa `text-primary-foreground` và không chứa `text-bg`.
  4. Thêm một test regression guard quét toàn bộ file trong `apps/student/src` (hoặc assertions trong test suite) đảm bảo không có file nào chứa token `text-bg`.
- **Success criteria**: Khi chạy test trước khi sửa component nguồn, các bài test mới phải fail (TDD Red) vì component vẫn đang chứa `text-bg`.
- **Verify**: `pnpm --filter student exec vitest run test/quiz-navigator.test.tsx test/overview.test.tsx src/components/vocab/vocab-suggestion-list.test.tsx` exit non-zero (TDD Red; pass ở bước này là sai lệch).

### Task 1.2 — Sửa 3 component nguồn sang class chuẩn (TDD Green)
- **Goal**: Loại bỏ `text-bg` và `hover:bg-primary hover:text-primary-foreground`, chuyển sang `text-primary-foreground` và `hover:bg-primary/90`.
- **Target files and symbols**:
  - `apps/student/src/components/quiz/quiz-runtime-header.tsx` (function `QuizRuntimeHeader`, line 70)
  - `apps/student/src/components/vocab/vocab-suggestion-list.tsx` (function `SuggestionCard`, line 50)
  - `apps/student/src/components/overview/class-card.tsx` (function `ClassCard`, line 109)
- **Steps**:
  1. Trong `apps/student/src/components/quiz/quiz-runtime-header.tsx`:
     - Đổi:
       ```tsx
       className="rounded-lg bg-primary text-bg hover:bg-primary hover:text-primary-foreground"
       ```
       thành:
       ```tsx
       className="rounded-lg"
       ```
       (Do `Button` mặc định đã có variant `bg-primary text-primary-foreground shadow-xs hover:bg-primary/90`).
  2. Trong `apps/student/src/components/vocab/vocab-suggestion-list.tsx`:
     - Đổi:
       ```tsx
       className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-bg text-xs transition-colors duration-150 hover:bg-primary hover:text-primary-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-40"
       ```
       thành:
       ```tsx
       className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-xs transition-colors duration-150 hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-40"
       ```
  3. Trong `apps/student/src/components/overview/class-card.tsx`:
     - Đổi:
       ```tsx
       className="mt-3 flex h-10 w-full items-center justify-center rounded-lg bg-primary font-medium text-bg text-sm tracking-[0.02em] transition-colors duration-150 hover:bg-primary hover:text-primary-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
       ```
       thành:
       ```tsx
       className="mt-3 flex h-10 w-full items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground text-sm tracking-[0.02em] transition-colors duration-150 hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
       ```
- **Success criteria**: Cả 3 file không còn chứa `text-bg`. Các unit test đã viết ở Task 1.1 chuyển sang pass 100%.
- **Verify**: `pnpm --filter student exec vitest run test/quiz-navigator.test.tsx test/overview.test.tsx src/components/vocab/vocab-suggestion-list.test.tsx` exit 0 và toàn bộ test pass.

### Task 1.3 — Cập nhật CHANGELOG.md
- **Goal**: Ghi nhận thay đổi vào `CHANGELOG.md` theo chuẩn conventional commits và tiền lệ repo bằng tiếng Việt.
- **Target files and symbols**: `CHANGELOG.md`
- **Steps**:
  1. Thêm mục vào dưới ngày `2026-11-04` (hoặc tạo mới nếu chưa có):
     - Mô tả việc sửa lỗi độ tương phản các nút CTA "Nộp bài", "Bắt đầu học", "Tham gia lớp" do class `text-bg` không tồn tại, thay bằng `text-primary-foreground` và `hover:bg-primary/90` (#586).
- **Success criteria**: `CHANGELOG.md` có nội dung thay đổi rõ ràng, khớp tiền lệ #517.
- **Verify**: `git diff CHANGELOG.md` hiển thị nội dung tiếng Việt chuẩn.

### Task 1.4 — Kiểm tra chất lượng và chạy gates
- **Goal**: Đảm bảo toàn bộ test của ứng dụng student, typecheck và lint/format đều đạt yêu cầu.
- **Target files and symbols**: toàn bộ repo.
- **Steps**:
  1. Chạy `pnpm --filter student test`.
  2. Chạy `pnpm --filter student check-types`.
  3. Chạy `pnpm exec biome check .`.
- **Success criteria**: Toàn bộ các lệnh đều exit 0 không có cảnh báo hay lỗi.
- **Verify**: `pnpm --filter student test && pnpm --filter student check-types && pnpm exec biome check .` exit 0.

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
