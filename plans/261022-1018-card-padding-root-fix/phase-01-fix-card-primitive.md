---
phase: 1
title: "Sửa Card primitive + test khoá hợp đồng"
status: pending
---

# Phase 1 — Sửa Card primitive

## Files

- Sửa: `apps/web/src/components/ui/card.tsx`
- Tạo: `apps/web/src/components/ui/card.test.tsx`

## Steps

1. Trong `Card`, đổi class gốc thành `rounded-xl border bg-card p-6 text-card-foreground shadow-sm`.
2. Cập nhật doc comment: Card tự lo padding (24px) và là block flow; con tự quản khoảng cách — không có
   CardHeader/CardContent như shadcn.
3. Viết `card.test.tsx` (theo mẫu các `*.test.tsx` cạnh bên):
   - render `<Card>x</Card>` → class chứa `p-6`, không chứa `gap-6`/`flex-col`.
   - `className="p-0"` → twMerge bỏ `p-6` (override vẫn thắng).
   - `className="py-4"` → còn padding ngang (`p-6` + `py-4` cùng tồn tại, twMerge giữ cả hai).

## Validation

```bash
pnpm --filter web test -- card
```

## Risk / rollback

Rủi ro: call site viết sau #378 có thể đã dựa vào `flex-col gap-6` (xem phase 2). Rollback = revert 1 file.
