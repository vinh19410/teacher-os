---
phase: 2
title: "Dọn call site: wrapper rỗng, margin thừa, class trùng"
status: pending
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2 — Dọn call site

## Goal

Không còn khoảng trống kép sau khi form thành flex container.

## Files (tất cả trong `apps/web/src/components/modals/`)

- Wrapper trạng thái `<div className="flex flex-col gap-2">` chứa `{error && …}{notice && …}` → thêm
  `empty:hidden`: `add-class-modal.tsx:377`, `add-invoice-modal.tsx:179`, `add-module-modal.tsx:74`,
  `add-lesson-modal.tsx:133`, `add-syllabus-modal.tsx:237`, `edit-class-fee-modal.tsx:69`,
  `edit-lesson-modal.tsx:135`, `enroll-student-modal.tsx:122`, `edit-module-modal.tsx:78`.
- Bỏ `mb-3`: `grade-modal.tsx:230`, `create-report-modal.tsx:121`.
- Xoá class layout thừa trên form: `edit-class-fee-modal.tsx:61` (`flex flex-col gap-5` → bỏ),
  `invite-student-modal.tsx:86` (`flex flex-col gap-4 py-2` → `py-2`).

## Steps

1. Grep lại trước khi sửa (số dòng có thể lệch):
   `grep -n -A1 'className="flex flex-col gap-2">$' apps/web/src/components/modals/*.tsx` — chỉ sửa wrapper
   mà mọi con đều là điều kiện `{x && …}`. `invoice-payment-modal.tsx:156` có con luôn render → không sửa.
2. Rà từng form trong 13 modal còn sót `mt-*`/`mb-*`/`space-y-*` ở **con trực tiếp** của form (cộng dồn với
   gap) — hiện chỉ thấy 2 `mb-3` trên; `add-class` `mt-1`/`space-y-0.5` nằm lồng trong khối conflict, giữ.
3. Kiểm `empty:hidden` thật sự rỗng: React không render text cho `false`/`null` → `:empty` khớp. Nếu một
   wrapper có whitespace text node (JSX xuống dòng không tạo node) → vẫn khớp; xác nhận bằng test phase 3.

## Validation

```bash
pnpm check && pnpm check-types
pnpm --filter web test -- modal
```

## Risk / rollback

Test modal hiện có (`add-class-modal*.test.tsx`, `enroll-student-modal.test.tsx`…) query theo role/text,
không theo class — rủi ro thấp. Rollback = `git revert`.
