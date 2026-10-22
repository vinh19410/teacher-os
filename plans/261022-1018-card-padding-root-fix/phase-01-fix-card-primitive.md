---
phase: 1
title: "Sửa Card primitive + test khoá hợp đồng"
status: done
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
   - render `<Card>x</Card>` → assert qua `toHaveClass` trên DOM node (không substring): class chứa `p-6`,
     và KHÔNG chứa `gap-6`/`flex-col`.
   - Case regression padding ngang: nếu class gốc thay `p-6` bằng `px-6 py-6`/`px-2 …` (mất `p-6`) → test
     fail (assert `p-6` bắt được cả hai dạng).
   - `className="p-0"` → twMerge bỏ `p-6` (override vẫn thắng).
   - `className="py-4"` → còn padding ngang (`p-6` + `py-4` cùng tồn tại, twMerge giữ cả hai).
   - `<Card variant="white">` render cùng class với default (variant là no-op — khoá để không ai gắn nghĩa
     mới cho variant mà không phá test).
4. Trước khi commit test: smoke thực nghiệm twMerge — `node -e "console.log(require('tailwind-merge').twMerge('p-6 py-4'))"`
   (sau `pnpm install`) phải in ra cả `p-6` và `py-4`. Nếu drop `p-6` → dừng, áp fallback trong plan.md
   (`px-6 py-6`) và cập nhật test tương ứng.

## Validation

```bash
pnpm --filter web test -- card
```

## Risk / rollback

Rủi ro: call site viết sau #378 có thể đã dựa vào `flex-col gap-6` (xem phase 2). Rollback = `git revert`
commit primitive **cùng lúc** với các commit phase 2 (revert riêng card.tsx sẽ để className `gap-*` của
call site thắng qua twMerge, đổi spacing ngoài ý muốn).
