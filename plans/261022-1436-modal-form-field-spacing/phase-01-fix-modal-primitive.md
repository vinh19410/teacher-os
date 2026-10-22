---
phase: 1
title: "Sửa Modal + Field primitive + test khoá hợp đồng"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1 — Sửa Modal + Field primitive

## Goal

Form là con trực tiếp của Modal tự nhận nhịp `flex-col gap-4`; Field tách label/control 8px.

## Files

- Sửa: `apps/web/src/components/ui/modal.tsx`
- Sửa: `apps/web/src/components/ui/field.tsx`
- Tạo: `apps/web/src/components/ui/modal.test.tsx`
- Sửa: `apps/web/src/components/ui/field.test.tsx`

## Steps

1. `modal.tsx:93` đổi thân modal thành
   `flex flex-col gap-4 p-6 [&>form]:flex [&>form]:flex-col [&>form]:gap-4`. Thêm comment 1 dòng: form con
   trực tiếp là một flex item duy nhất nên phải nhận lại nhịp gap của body.
2. `field.tsx` wrapper `flex flex-col gap-1` → `flex flex-col gap-2`.
3. Smoke Tailwind: `pnpm --filter web build` rồi grep CSS output có selector `>form` với `gap` (xác nhận
   Tailwind v4 sinh arbitrary variant). Không thấy → dừng, đổi sang `*:[form]:` hoặc rule trong globals.css.
4. `modal.test.tsx` (theo mẫu `card.test.tsx`): render `<Modal open title="x"><form data-testid="f"/></Modal>`,
   lấy `parentElement` của form → `toHaveClass` đủ 3 class `[&>form]:flex`, `[&>form]:flex-col`,
   `[&>form]:gap-4` và `gap-4`. Thêm case `open={false}` → không render.
5. `field.test.tsx`: assert wrapper có `gap-2`, không có `gap-1`.

## Validation

```bash
pnpm --filter web test -- modal field
```

## Risk / rollback

Field dùng ở 20 file — `gap-2` làm cao thêm 4px mỗi field; chấp nhận, kiểm ở phase 3. Rollback = `git revert`.
