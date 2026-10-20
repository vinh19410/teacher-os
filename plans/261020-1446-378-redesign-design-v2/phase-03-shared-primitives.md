---
phase: 3
title: "Primitive dùng chung theo v2"
status: pending
priority: P1
effort: "7h"
dependencies: [2]
---

# Phase 3: Primitive dùng chung theo v2

## Goal

Đưa bộ primitive của `design-v2/src/lib/ui.tsx` vào code thật (API hiện có giữ tương thích)
để các phase màn hình chỉ cần thay bố cục.

## Files to Create / Modify

- Modify: `apps/web/src/components/ui/button.tsx` (+ `packages/ui/src/components/button.tsx`) —
  variant `default|outline|secondary|ghost|destructive|link`, size `default|sm|icon|icon-sm`
  đúng class v2; giữ alias variant cũ (`primary→default`, `secondary→outline`,
  `danger→destructive`) để không phải sửa mọi call site một lúc.
- Modify: `apps/web/src/components/ui/card.tsx` — `Card` (`rounded-xl border bg-card py-6
  shadow-sm gap-6`), `CardHeader(title, description, action)`, `CardContent`; bỏ variant `neu`.
- Modify: `apps/web/src/components/ui/page-head.tsx` — `title` + mô tả muted bên dưới + `action`
  (prop `kicker` cũ map thành mô tả, không còn mono cam).
- Modify: `badge.tsx`, `tag.tsx` — Badge v2 (`default|secondary|outline|destructive`,
  `rounded-md text-xs font-medium`), `TuitionBadge` chấm emerald/amber/muted + overdue destructive;
  `invoice-status-cell.tsx` dùng nó.
- Modify: `tabs.tsx` — segmented `bg-muted p-[3px] rounded-lg`, item active `bg-background shadow-sm`;
  giữ `role="tablist"/"tab"` + `aria-selected`.
- Modify: `modal.tsx` — overlay `bg-black/50`, panel `rounded-lg border bg-background shadow-lg`,
  nút đóng ghost `X`.
- Modify: `data-table.tsx` — bảng v2 (`rounded-xl border bg-card`, header `h-10 text-muted-foreground
  font-medium`, hàng `border-b hover:bg-muted/50`).
- Modify: `field.tsx`, `packages/ui/src/components/input.tsx`, `textarea.tsx`, `label.tsx`,
  `currency-input.tsx` — `inputCls` v2 (`h-9 rounded-md border bg-transparent shadow-xs
  focus-visible:ring-[3px] ring-ring/50`, `dark:bg-input/30`).
- Modify: `chip-filter.tsx`, `chip-multi.tsx` — chip outline `rounded-md`, chọn = `bg-secondary`
  hoặc `aria-pressed` style v2; giữ badge đếm `aria-hidden`, `role="group"`.
- Modify: `avatar.tsx`, `progress.tsx` (track `bg-muted`, fill `bg-primary`), `section-label.tsx`
  (→ `SectionTitle` v2).
- Create: `apps/web/src/components/ui/stat.tsx` — `Stat(label, value, sub, hot)` v2
  (thay `StatCard`; `hot` = `text-destructive`); `alert.tsx`; `kbd.tsx`.
- Modify: `packages/ui/src/components/illustrations.tsx` — đối chiếu `design-v2/src/lib/art.tsx`
  (TeacherDesk, StudentSpot…) dùng `currentColor`/token v2.
- Modify: unit test của từng primitive (`*.test.tsx` bên cạnh), đặc biệt
  `student-tuition-summary.test.tsx` assert class cũ.

## Tasks & Steps

1. Đọc `design-v2/src/lib/ui.tsx` + `art.tsx`; lập bảng primitive v2 ↔ file thật.
2. Sửa từng primitive, giữ props/aria/testid; thêm alias variant cũ.
3. Student dùng chung: nếu student có bản sao primitive riêng, chuyển import sang
   `@teacher-os/ui` hoặc web components tương ứng (không nhân bản).
4. Cập nhật unit test assert class (không đổi assert hành vi).

## Verification

- `pnpm --filter web test -- components/ui && pnpm --filter student test`
- `pnpm check && pnpm check-types`
- `pnpm design:compare --screens t-students,t-tuition --side app --label new` — bảng/badge/tab
  khớp v2 ở mức primitive (bố cục màn chưa đổi là bình thường).
