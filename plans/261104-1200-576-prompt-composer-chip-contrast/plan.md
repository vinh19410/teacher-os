---
title: "fix(ui): tăng độ tương phản trạng thái đang chọn trong ChipFilter và prompt-composer (#576)"
description: "Tăng tương phản trạng thái đang chọn cho ChipFilter theo token DESIGN.md (border-primary bg-primary text-primary-foreground), xử lý count badge và dark mode, đồng bộ revenue-chart toggle, kèm TDD unit tests và kiểm chứng hiển thị đa viewport."
status: pending
priority: P2
effort: "1h"
tags: [ui, contrast, chip-filter, prompt-composer, accessibility, design-v2]
created: 2026-11-04
---

# 576-prompt-composer-chip-contrast

## Overview

Trong hệ thống design v2 (`DESIGN.md`), chip đang chọn cần có độ tương phản rõ ràng (mực đậm light mode `oklch(0.205 0 0)` / sáng dark mode `oklch(0.922 0 0)`). Tuy nhiên, `ChipFilter` (`packages/ui/src/components/web-kit/chip-filter.tsx:42-46`) trước đây dùng `border-transparent bg-secondary text-secondary-foreground` khi `opt === value`. Trên nền `bg-background` (`oklch(1 0 0)`), `--secondary` (`oklch(0.97 0 0)`) chỉ đạt tương phản ~1.06:1 và bị mất viền, khiến người dùng (feedback Cô Mỹ trên sheet staging) trong form tạo bài (`prompt-composer.tsx`) gần như không nhận biết được kỹ năng, part/task, dạng câu hỏi hay band nào đang được chọn.

Kế hoạch này thực hiện theo quy chuẩn handover `--advice` và quy trình `--tdd`:
1. Viết unit tests trước tại `apps/web/src/components/ui/chip-filter.test.tsx` kiểm chứng hành vi hiện tại và ràng buộc tương phản.
2. Cập nhật `ChipFilter` dùng:
   - Đang chọn: `border-primary bg-primary text-primary-foreground`, badge đếm `text-primary-foreground/80`.
   - Chưa chọn: `border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50`, badge đếm `text-muted-foreground`.
   - Hiệu ứng chuyển động: `transition-[color,background-color,border-color,box-shadow]`.
   - Chuyển `bg-background` và `dark:bg-input/30` từ base class vào nhánh chưa chọn để tránh xung đột với `bg-primary` ở dark mode.
3. Đồng bộ nút toggle kỳ doanh thu trong `apps/web/src/components/tuition/revenue-chart.tsx` (từng dùng cùng mẫu mờ `bg-secondary` và comment "pattern ChipFilter v2").
4. Cập nhật tài liệu `DESIGN.md` và `CHANGELOG.md` (mục `## 2026-11-04` / `### Fixed`).
5. Kiểm tra visual ở 3 viewport (`1440×900`, `768×1024`, `375×812`) cho cả light và dark mode, chụp screenshot lưu vào `plans/261104-1200-576-prompt-composer-chip-contrast/screenshots/`, chạy toàn bộ gate (`pnpm check`, `pnpm check-types`, unit tests qua `pnpm --filter @teacher-os/ui test` và `pnpm --filter web test`).

## Advisor Scope Lock

- **Locked Scope:**
  - `packages/ui/src/components/web-kit/chip-filter.tsx` (`ChipFilter` selected, unselected, badge, transition).
  - `apps/web/src/components/ui/chip-filter.test.tsx` (TDD unit tests kiểm tra selected, unselected, aria-pressed, badge contrast và accessibility).
  - `apps/web/src/components/tuition/revenue-chart.tsx` (đồng bộ toggle kỳ doanh thu khớp chuẩn ChipFilter mới).
  - `DESIGN.md` (cập nhật mô tả trạng thái chọn của ChipFilter và quy chuẩn badge đếm).
  - `CHANGELOG.md` (ghi nhận fix theo chuẩn conventional dưới mục 2026-11-04).
- **Explicit Non-Goals:**
  - Không thay đổi API props của `ChipFilter` (`options`, `value`, `onChange`, `className`, `ariaLabel`, `counts`).
  - Không đổi cấu trúc accessible name (`aria-hidden` trên badge giữ nguyên để e2e/voice control không vỡ).
  - Không sửa các component chuyên biệt khác như `attendance-status-picker.tsx` (vốn dùng màu trạng thái nghiệp vụ).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Viết TDD test suite cho `ChipFilter` tại `apps/web/src/components/ui/chip-filter.test.tsx` | P2 |
| 2 | Cập nhật `ChipFilter` (`packages/ui/src/components/web-kit/chip-filter.tsx`) đạt tương phản cao theo chuẩn `DESIGN.md` ở cả light và dark theme | P2 |
| 3 | Đồng bộ toggle kỳ doanh thu trong `revenue-chart.tsx` và cập nhật docs (`DESIGN.md`, `CHANGELOG.md`) | P2 |
| 4 | Chạy toàn bộ test suites và kiểm tra trực quan 3 viewport (`1440×900`, `768×1024`, `375×812`) trên cả light/dark | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD ChipFilter Contrast Fix & Verification](./phase-01-chip-filter-contrast-and-prompt-composer.md) | pending |

## Success Criteria

- [ ] Unit tests tại `apps/web/src/components/ui/chip-filter.test.tsx` pass 100%, kiểm chứng đầy đủ class `border-primary`, `bg-primary`, `text-primary-foreground`, loại bỏ `bg-secondary` và `border-transparent` trên chip đang chọn.
- [ ] Badge đếm `counts` sử dụng `text-primary-foreground/80` khi chọn và `text-muted-foreground` khi chưa chọn, giữ `aria-hidden="true"`.
- [ ] Dark mode hiển thị đúng khối sáng trên nền tối, không bị `dark:bg-input/30` ghi đè trạng thái đã chọn.
- [ ] `prompt-composer.test.tsx` và các test hiện có tiếp tục pass.
- [ ] `pnpm check` (biome) và `pnpm check-types` pass không có lỗi.
- [ ] Visual inspection ở 3 viewport (`1440×900`, `768×1024`, `375×812`) cả light/dark theme hiển thị sắc nét.

## Red Team Review

### Session — 2026-11-04
**Reviewers:** Security Adversary + Assumption Destroyer (Kongming Advisory Supervised)
**Findings:** 6 (6 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 3 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `dark:bg-input/30` nếu để ở base class sẽ cạnh tranh với `bg-primary` ở dark theme trong Tailwind merge | High | Accept | Chuyển `dark:bg-input/30` vào nhánh unselected |
| 2 | Badge count nếu giữ `text-muted-foreground` trên nền `bg-primary` sẽ mất tương phản trên cả light và dark | High | Accept | Đổi badge thành `text-primary-foreground/80` khi `opt === value` |
| 3 | `revenue-chart.tsx` sao chép pattern `ChipFilter v2` cũ với `bg-secondary` và comment sai lệch | Medium | Accept | Đồng bộ luôn class và comment trong `revenue-chart.tsx` |
| 4 | Đặt test tại `packages/ui` có thể thiếu cấu hình DOM/jsdom | Medium | Accept | Đặt test tại `apps/web/src/components/ui/chip-filter.test.tsx` cùng chỗ với `chip-multi.test.tsx` |
| 5 | Lệnh filter pnpm sai tên package (`--filter ui` thay vì `--filter @teacher-os/ui`) | High | Accept | Sửa thành `--filter @teacher-os/ui` trong toàn bộ verify steps |
| 6 | Kiểm tra 3 viewport cần có artifact chụp ảnh cụ thể | Medium | Accept | Thêm bước chụp screenshot 3 viewport light/dark vào `plans/…/screenshots/` |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-chip-filter-contrast-and-prompt-composer.md`
- Decision deltas checked: 6
- Reconciled stale references: 0
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 6
- **Verified:** 6 | **Failed:** 0 | **Unverified:** 0
- **Key decisions confirmed:**
  1. Scope tập trung vào `ChipFilter`, `revenue-chart.tsx`, test suite mới và tài liệu.
  2. Styling đã chọn dùng `border-primary bg-primary text-primary-foreground`, chưa chọn dùng `border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50`.
  3. Mọi lệnh verify đều có pass condition cơ học chính xác.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-chip-filter-contrast-and-prompt-composer.md`
- Decision deltas checked: 6
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: 576-prompt-composer-chip-contrast -->
