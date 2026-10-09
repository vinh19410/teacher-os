---
phase: 1
title: "Token verdict + ngoại lệ DESIGN.md"
status: completed
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Token verdict + ngoại lệ DESIGN.md

## Goal
Thêm cặp token chấm điểm xanh lá/đỏ, dùng riêng cho màn chấm/soi bài, và ghi ngoại lệ vào
`DESIGN.md` mà không thay đổi `--success`/`--danger`.

## Files to Create / Modify
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `DESIGN.md`

## Tasks & Steps
1. Trong `:root` (dark, gần `--success`/`--danger` ở dòng ~41), thêm:
   ```css
   --verdict-correct: #4ade80;
   --verdict-wrong: #f87171;
   --verdict-on: #0a0a0a;
   ```
   Trong `.light` (dòng ~154), thêm:
   ```css
   --verdict-correct: #166534;
   --verdict-wrong: #b91c1c;
   --verdict-on: #ffffff;
   ```
2. Thêm nền soft cạnh `--success-soft` (dòng ~87). Dark dùng `transparent 86%`. Ở light, khai báo
   lại trong `.light` với `transparent 90%` để chữ trên nền soft vẫn ≥4.5:1 (đã đo: 6.14 / 5.45).
   ```css
   --verdict-correct-soft: color-mix(in oklab, var(--verdict-correct), transparent 86%);
   --verdict-wrong-soft: color-mix(in oklab, var(--verdict-wrong), transparent 86%);
   ```
3. Trong block `@theme` (gần `--color-success` dòng ~192), map sang utility Tailwind:
   `--color-verdict-correct`, `--color-verdict-wrong`, `--color-verdict-on`,
   `--color-verdict-correct-soft`, `--color-verdict-wrong-soft`.
4. `DESIGN.md`:
   - Mục **Tokens**, ngay sau dòng "Trạng thái đơn sắc + cam": thêm bullet **Ngoại lệ chấm điểm**.
     Nội dung: `--verdict-correct`/`--verdict-wrong` (xanh lá/đỏ) chỉ dùng để biểu thị đúng/sai ở
     màn soi bài/chấm điểm, luôn kèm icon ✓/✗ và không dùng cho trạng thái khác. Ghi kèm bảng contrast từ `plan.md`.
   - Mục **Quy tắc component**: thêm bullet **Soi bài (review)**: khối câu có viền trái 3px + nền
     soft theo verdict; skipped = viền đứt `--meta`; đáp án đã chọn không dùng `text-hot`.
   - Mục **Don't**: sửa dòng "Không thêm màu thứ hai cho trạng thái" thành "...trừ cặp verdict của
     màn soi bài (xem Tokens)". Ghi rõ đỏ `--verdict-wrong` không thay cho `--destructive`.

## Verification
- `pnpm check` (biome) pass.
- Mở bất kỳ trang nào ở cả 2 theme. Trong devtools,
  `getComputedStyle(document.documentElement).getPropertyValue('--verdict-correct')` trả đúng giá trị.
- `grep -n "verdict" DESIGN.md` thấy đủ 3 chỗ sửa.
