---
phase: 2
title: "Rà call site phụ thuộc layout v2"
status: pending
---

# Phase 2 — Rà call site

Mục tiêu: tìm call site nào đã **dựa vào** `flex flex-col gap-6` của Card v2 (con không có margin, xếp sát
nhau khi Card về block flow) và thêm `flex flex-col gap-*` tại chỗ.

## Ưu tiên rà (file có `<Card` bị sửa sau #378)

- `apps/web/src/components/class-detail/class-roster-tab.tsx`
- `apps/web/src/components/classes/class-assignments-tab.tsx`
- `apps/web/src/routes/_auth/classes/$classId.tsx`
- `apps/web/src/routes/_auth/classes/index.tsx`
- `apps/web/src/routes/_auth/grading/$attemptId.tsx`
- `apps/web/src/routes/_auth/grading/index.tsx`
- `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`
- `apps/web/src/routes/_auth/syllabus/index.tsx`

## Steps

1. `grep -rn --include='*.tsx' '<Card' apps/web/src | grep -v test` — với mỗi call site không truyền
   `flex`, kiểm con trực tiếp: ≥2 khối con không có `mt-*`/`mb-*`/`space-y-*` → thêm `flex flex-col gap-4`
   (hoặc gap theo design) vào className.
2. Call site truyền `py-4` để "giảm padding" trong v2 (`test-builder-shell.tsx`, `test-part-slot.tsx`):
   giữ nguyên — sau phase 1 chúng có lại padding ngang 24px. Nếu design muốn 16px đều thì đổi sang `p-4`.
3. Không đụng call site đã có `p-*` tường minh.

## Validation

```bash
pnpm --filter web test
pnpm check-types
```
