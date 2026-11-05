---
title: "fix(student): tăng độ tương phản chữ trên các nút CTA dùng class text-bg (#586)"
description: "Thay thế class text-bg không tồn tại bằng text-primary-foreground và hover:bg-primary/90 trên nút Nộp bài, Bắt đầu học, và Tham gia lớp trong apps/student, kèm TDD unit tests và repo-wide regression guard."
status: completed
priority: P2
effort: "30m"
tags: [student, contrast, accessibility, design-v2, quiz, vocab, overview]
created: 2026-11-04
---

# 586-submit-button-contrast

## Overview

Trong hệ thống design v2 (`c308b43`, #378), token `--color-bg` đã bị loại bỏ, dẫn tới tiện ích Tailwind `text-bg` không sinh ra bất kỳ CSS rule nào cho `color`. Các nút mang class `bg-primary text-bg` sẽ kế thừa màu chữ `var(--foreground)` (mực đen `oklch(0.205 0 0)` ở chế độ sáng), khiến chữ trên nền tối `bg-primary` bị mờ, khó đọc, vi phạm chuẩn độ tương phản WCAG AA. Tiền lệ tương tự đã được sửa ở #517 đối với các nút Onboarding wizard.

Sheet "TeacherOS staging - Theo dõi lỗi" (dòng #18, issue #586) phản ánh chữ nút "Nộp bài" rất mờ. Quét toàn bộ codebase cho thấy hiện tượng này còn tồn tại ở 3 vị trí thuộc `apps/student`:
1. `apps/student/src/components/quiz/quiz-runtime-header.tsx:70` (nút **"Nộp bài"** trong header làm bài).
2. `apps/student/src/components/vocab/vocab-suggestion-list.tsx:50` (nút **"Bắt đầu học"** trong thẻ gợi ý bài từ vựng).
3. `apps/student/src/components/overview/class-card.tsx:109` (nút **"Tham gia lớp"** khi học viên nhận lời mời).

Kế hoạch này thực hiện theo quy chuẩn handover `--advice` và quy trình `--tdd`:
1. Viết test TDD Red trước: kiểm tra 3 nút có `text-primary-foreground`, không chứa `text-bg`, và có guard kiểm tra không còn `text-bg` trong `apps/*/src`.
2. Sửa code TDD Green:
   - Tại `quiz-runtime-header.tsx`: dùng variant mặc định của `Button` (`@teacher-os/ui`), chỉ giữ `className="rounded-lg"`.
   - Tại `vocab-suggestion-list.tsx`: thay `text-bg hover:bg-primary hover:text-primary-foreground` bằng `text-primary-foreground hover:bg-primary/90`.
   - Tại `class-card.tsx`: thay `text-bg hover:bg-primary hover:text-primary-foreground` bằng `text-primary-foreground hover:bg-primary/90`.
3. Cập nhật `CHANGELOG.md` bằng tiếng Việt theo tiền lệ.
4. Chạy toàn bộ local gates (`pnpm --filter student test`, `pnpm --filter student check-types`, `pnpm check`).

## Advisor Scope Lock

- **Locked Scope:**
  - `apps/student/src/components/quiz/quiz-runtime-header.tsx`
  - `apps/student/src/components/vocab/vocab-suggestion-list.tsx`
  - `apps/student/src/components/overview/class-card.tsx`
  - Unit tests: `apps/student/test/quiz-navigator.test.tsx`, `apps/student/src/components/vocab/vocab-suggestion-list.test.tsx`, `apps/student/test/overview.test.tsx`
  - `CHANGELOG.md`
- **Explicit Non-Goals:**
  - Không thêm lại token `--color-bg` hay can thiệp vào token hệ thống trong `packages/ui/src/styles/globals.css`.
  - Không refactor các nút `<button>` native sang component `Button` vì có thể gây lệch kích thước/padding hoặc thay đổi focus ring.
  - Không dọn dẹp các class trùng lặp ngoài phạm vi (như `rounded-md rounded-md` trên nút lân cận).
  - Không thêm E2E browser test vì 3 nút đã được bao phủ đầy đủ bằng unit tests kiểm tra DOM attributes và classList, tương tự tiền lệ.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Thêm TDD Red tests khẳng định cả 3 nút mang màu chữ chuẩn và không còn `text-bg` trong `apps/*/src` | P2 |
| 2 | Sửa 3 vị trí component để áp dụng `text-primary-foreground` và `hover:bg-primary/90` | P2 |
| 3 | Chạy toàn bộ quality gates (`pnpm --filter student test`, `pnpm --filter student check-types`, `pnpm check`) và cập nhật CHANGELOG | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Fix Button Contrast & Unit Tests](./phase-01-fix-button-contrast.md) | completed |

## Acceptance Criteria

- [x] Cả 3 nút ("Nộp bài", "Bắt đầu học", "Tham gia lớp") đều có màu chữ `text-primary-foreground` và hover `hover:bg-primary/90` (hoặc qua variant mặc định của `Button`), đảm bảo độ tương phản cao trên nền `bg-primary` ở cả light và dark mode.
- [x] Không còn bất kỳ xuất hiện nào của `\btext-bg\b` trong mã nguồn `apps/*/src`.
- [x] Các unit tests trong `apps/student` pass 100%.
- [x] `pnpm check` và `pnpm --filter student check-types` pass không có lỗi.

<!-- slug: 586-submit-button-contrast -->
