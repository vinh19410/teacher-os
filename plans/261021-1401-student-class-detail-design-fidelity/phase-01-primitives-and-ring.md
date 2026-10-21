---
phase: 1
title: "Primitive Tabs/Badge/Avatar cho student + sửa Ring"
status: pending
effort: "1.5h"
dependencies: []
---

# Phase 1: Primitive và Ring

## Files

- Create: `apps/student/src/components/ui/tabs.tsx`, `badge.tsx`, `avatar-initials.tsx` — port từ `apps/web/src/components/ui/{tabs,badge}.tsx` và `Avatar` của design (`size-8 rounded-full bg-muted text-xs font-medium`, nhận `initials`; không dùng `Avatar` ảnh của web vì ở đây chỉ có chữ tắt).
- Modify: `apps/student/src/components/class/ring-stat.tsx`.
- Create: `apps/student/test/class-primitives.test.tsx` (Tabs: role tablist/tab, `aria-selected`; Badge variants).

## Steps

1. Port `Tabs` giữ API `{ tabs: {id,label}[]; active; onChange }` để `data-testid="class-tab-{id}"` truyền được (thêm prop `testIdPrefix` tuỳ chọn) — e2e/unit đang bấm `getByRole("tab", { name })`.
2. Port `Badge` chỉ gồm `default | secondary | outline | destructive` (+ prop `dot`) — không mang alias v1.
3. `RingStat`: đổi `stroke-surface` → `stroke-muted`, `stroke-hot` → `stroke-primary`; bỏ `rounded-lg` thừa (còn `rounded-xl`), `text-card-foreground`; thêm `CircleCheck` cho "Chuyên cần" ở `class-detail-view` (phase 2).
4. Chạy `pnpm check` để biome sắp xếp class.

## Verification

- `pnpm --filter student test -- class-primitives` xanh.
- Mở trang bằng dev stack: vòng ring có cung màu `primary` trên track `muted`, light và dark.
