---
title: "Card v2 padding root fix (#412)"
date: 2026-10-22
---

# Card v2 padding root fix (#412)

# Card v2 mất padding ngang — sửa tận gốc ở primitive

## Vấn đề & nguyên nhân
`apps/web/src/components/ui/card.tsx` đổi ở #378 thành `flex flex-col gap-6 … py-6` — mất padding ngang (shadcn Card trông chờ CardHeader/CardContent px-6 nhưng apps/web không có) và `gap-6` cộng dồn margin con. 73 call site/30 file truyền nội dung trực tiếp theo hợp đồng v1.

## Cách sửa
- Primitive: block flow `p-6` + `card.test.tsx` khoá hợp đồng (6 case, classList không substring).
- Audit 73 call site (3 agent) → adjudicate tập trung: 6 call site tại 5 file được sửa (gap-4 chỗ vỡ thật, pin flex-row chỗ header ngang, dọn mt-* stacking); 66 chỗ tự cấp spacing (SectionTitle mb-3) hoặc override tường minh — thêm gap sẽ đè đôi.
- twMerge smoke thực nghiệm trước khi commit test: `p-6 py-4` giữ cả hai.

## Process notes
- Red-team 3 lens trước implement: 19 findings → 8 cụm accept — quan trọng nhất: phase 2 phải audit TOÀN BỘ consumer + heuristic mở rộng (depth-2 margin, flex không hướng, divider), design:compare là capture-only.
- kongming 6 checkpoint đều GO; bắt được 1 lỗi đếm "7 thay đổi" → 6 call site (đếm kép edit operation ở invoice :266).
- design:compare chạy lại ghi đè PNG của 6 plan khác → phải `git checkout --` khôi phục trước khi stage; stage chọn lọc, không `git add -A`.
- Subagent type `code-reviewer`/`scout` lỗi "No model selected" trong worktree này — dùng default `task` agent với persona nhúng được.

## Verification
web test 1558/1558; check-types 7/7; pnpm check exit 0; e2e 177 pass/1 flaky/0 fail; 10 composite 3 viewport 0 vỡ. PR #414 → develop (beta).

## Follow-up
- `/reports` + `/assignments/$id` không có trong screens.json — thiếu baseline visual (static audit đã bù).
- `dashboard.tsx:195` p-6 redundant; dọn dịp khác.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
