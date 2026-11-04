# Phase 1: TDD ChipFilter Contrast Fix & Verification

Author: AgentKit Handover Contract (`--advice`)
Status: pending
Priority: P2

## Goal

Nâng cấp độ tương phản hiển thị của chip đang chọn trong `ChipFilter` theo đúng chuẩn design v2 (`border-primary bg-primary text-primary-foreground`), giải quyết triệt để vấn đề người dùng khó nhận biết chip đang chọn trong form tạo bài (`prompt-composer.tsx`) và các thanh lọc, đảm bảo badge đếm rõ ràng và dark mode không bị xung đột style.

## Files to Create or Modify

- `apps/web/src/components/ui/chip-filter.test.tsx` (Tạo mới: TDD unit test suite)
- `packages/ui/src/components/web-kit/chip-filter.tsx` (Sửa: selected/unselected classes, badge styling, transition)
- `apps/web/src/components/tuition/revenue-chart.tsx` (Sửa: đồng bộ toggle kỳ doanh thu khớp pattern mới)
- `DESIGN.md` (Sửa: cập nhật dòng 84-87 về ChipFilter)
- `CHANGELOG.md` (Sửa: thêm entry fix tương phản ChipFilter vào `## 2026-11-04` / `### Fixed`)
- `plans/261104-1200-576-prompt-composer-chip-contrast/screenshots/` (Chụp ảnh kiểm chứng visual)

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

## Tasks & Steps

### Task 1.1 — TDD Test Suite cho ChipFilter (Red Phase)
- **Goal**: Xây dựng test suite hoàn chỉnh cho `ChipFilter` kiểm chứng selected styling, unselected styling, aria-pressed, counts badge và accessibility.
- **Target files and symbols**: `apps/web/src/components/ui/chip-filter.test.tsx`
- **Steps**:
  1. Thêm file `apps/web/src/components/ui/chip-filter.test.tsx` với cấu hình `// @vitest-environment jsdom`.
  2. Import `{ cleanup, render, screen }` từ `@testing-library/react`, `{ renderToStaticMarkup }` từ `react-dom/server`, và `{ ChipFilter }` từ `./chip-filter` (re-export từ `@teacher-os/ui`).
  3. Viết test case:
     - `renders all options and sets aria-pressed="true" on the active option`: render `<ChipFilter options={["Reading", "Writing"]} value="Writing" onChange={() => undefined} />`, kiểm tra button "Writing" có `aria-pressed="true"`, "Reading" có `aria-pressed="false"`.
     - `applies solid primary fill on selected chip and input border on unselected chip without border-transparent or bg-secondary`: kiểm tra chip đang chọn có `border-primary`, `bg-primary`, `text-primary-foreground` và KHÔNG có `border-transparent`, `bg-secondary`, `bg-background`, `dark:bg-input/30`. Chip chưa chọn có `border-input`, `bg-background`, `text-foreground`, `hover:bg-accent`, `dark:bg-input/30`, `dark:hover:bg-input/50`.
     - `renders count badge with high contrast on selected chip (text-primary-foreground/80) and text-muted-foreground on unselected chip`: render với prop `counts={{ Reading: 5, Writing: 12 }}`. Kiểm tra badge của chip Writing có `text-primary-foreground/80`, của Reading có `text-muted-foreground`, và cả hai đều có `aria-hidden="true"`.
     - `preserves accessible name as label only even when count is present`: accessible name của button vẫn là "Writing" và "Reading" chính xác.
- **Success criteria**: File test tồn tại và chạy bằng vitest.
- **Verify**: Chạy `pnpm --filter web test chip-filter.test.tsx`.
  - Pass condition kỳ vọng ở bước red phase: Lệnh thoát với exit code khác 0 và báo lỗi assertion do code hiện tại còn `bg-secondary` và chưa có `border-primary bg-primary`.

### Task 1.2 — Sửa styling trong packages/ui/src/components/web-kit/chip-filter.tsx (Green Phase)
- **Goal**: Cập nhật `ChipFilter` đạt độ tương phản cao (>15:1) khi chọn, tách `bg-background dark:bg-input/30` khỏi base class, và chỉnh màu badge đếm khi chọn.
- **Target files and symbols**: `packages/ui/src/components/web-kit/chip-filter.tsx` (`ChipFilter`)
- **Steps**:
  1. Chuyển `bg-background` và `dark:bg-input/30` từ base class sang nhánh unselected.
  2. Cập nhật nhánh selected:
     `selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50"`
  3. Cập nhật transition:
     `transition-[color,background-color,border-color,box-shadow]`
  4. Cập nhật badge đếm:
     `className={cn("ml-1.5 tabular-nums", selected ? "text-primary-foreground/80" : "text-muted-foreground")}`
- **Success criteria**: `ChipFilter` render theo đúng các class thiết kế mới.
- **Verify**: Chạy `pnpm --filter web test chip-filter.test.tsx`.
  - Pass condition: Lệnh thoát với exit code 0 và in `passed`.

### Task 1.3 — Đồng bộ revenue-chart toggle kỳ doanh thu
- **Goal**: Loại bỏ bản sao cũ dùng `bg-secondary` trong `apps/web/src/components/tuition/revenue-chart.tsx`.
- **Target files and symbols**: `apps/web/src/components/tuition/revenue-chart.tsx` (dòng 8-11, 160-167)
- **Steps**:
  1. Sửa comment ở đầu file `revenue-chart.tsx` để bỏ ghi chú cũ "selection toggle = chip secondary".
  2. Tại nút toggle `PERIODS.map`:
     - Chuyển `bg-background dark:bg-input/30` vào nhánh chưa chọn.
     - Nhánh đang chọn: `border-primary bg-primary text-primary-foreground`.
     - Nhánh chưa chọn: `border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50`.
     - Transition: `transition-[color,background-color,border-color,box-shadow]`.
- **Success criteria**: Nút toggle kỳ doanh thu hiển thị nhất quán với `ChipFilter`.
- **Verify**: Chạy `git grep "border-transparent bg-secondary" apps/web/src/components/tuition/revenue-chart.tsx` và `git grep "border-primary bg-primary" apps/web/src/components/tuition/revenue-chart.tsx`.
  - Pass condition: Lệnh grep tìm `border-transparent bg-secondary` thoát với exit code 1 (0 kết quả), và lệnh grep tìm `border-primary bg-primary` thoát với exit code 0 (có kết quả).

### Task 1.4 — Cập nhật DESIGN.md và CHANGELOG.md
- **Goal**: Cập nhật tài liệu thiết kế và lịch sử thay đổi của repository.
- **Target files and symbols**: `DESIGN.md` (dòng 84-87), `CHANGELOG.md`
- **Steps**:
  1. Trong `DESIGN.md`, cập nhật phần ChipFilter ghi rõ: chip lọc (`ChipFilter`) và chip chọn nhiều (`ChipMulti`) khi chọn dùng nền đặc `border-primary bg-primary text-primary-foreground`, chưa chọn dùng `border-input bg-background text-foreground dark:bg-input/30`, badge đếm dùng `text-primary-foreground/80` khi chọn và `text-muted-foreground` khi chưa chọn (`aria-hidden`).
  2. Trong `CHANGELOG.md`, thêm dòng vào `## 2026-11-04` / `### Fixed`:
     `- fix(ui): tăng độ tương phản chip đang chọn trong ChipFilter và prompt-composer (#576)`
- **Success criteria**: Tài liệu phản ánh chính xác mã nguồn.
- **Verify**: Chạy `git grep -F "#576" CHANGELOG.md` và `git grep -F "ChipFilter" DESIGN.md`.
  - Pass condition: Cả 2 lệnh thoát với exit code 0.

### Task 1.5 — Verification & Visual Checks
- **Goal**: Chạy toàn bộ kiểm tra chất lượng của repo (`pnpm check`, `pnpm check-types`, unit tests) và kiểm chứng visual tại 3 viewport (`1440×900`, `768×1024`, `375×812`) ở cả 2 theme.
- **Target files and symbols**: Toàn bộ repo
- **Steps**:
  1. Chạy `pnpm check` (biome formatting & linting).
  2. Chạy `pnpm check-types` (typecheck toàn bộ monorepo).
  3. Chạy `pnpm --filter web test prompt-composer.test.tsx chip-filter.test.tsx`.
  4. Chạy `pnpm --filter @teacher-os/ui test`.
  5. Chụp screenshot form tạo bài (`prompt-composer`) và danh sách bài tập ở 3 viewport (`1440×900`, `768×1024`, `375×812`) light/dark, lưu vào `plans/261104-1200-576-prompt-composer-chip-contrast/screenshots/`.
- **Success criteria**: Mọi kiểm tra exit 0 không lỗi, các file screenshot tồn tại và chip đang chọn nổi bật rõ ràng.
- **Verify**: `pnpm check && pnpm check-types && pnpm --filter @teacher-os/ui test && pnpm --filter web test prompt-composer.test.tsx chip-filter.test.tsx` thoát với exit code 0.
