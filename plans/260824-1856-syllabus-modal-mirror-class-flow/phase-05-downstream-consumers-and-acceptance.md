---
phase: 5
title: "Downstream consumers and acceptance"
status: pending
priority: P1
effort: "1-1.5h"
dependencies: [4]
---

# Phase 5: Downstream consumers and acceptance

## Overview

Fix mọi callsite consume `syllabus.skill` (list route, detail route, syllabus-progress) sang `syllabus.skills[]`. Chạy acceptance E2E manual + verify success criteria toàn plan.

## Requirements

- Functional: `/syllabus` list vẫn filter chip hoạt động; syllabus có `skills=[]` (communication) không match filter cụ thể, chỉ hiện ở "Tất cả"
- Functional: syllabus card tag hiển thị tất cả skills (join `, `) hoặc "Giao tiếp" (`CLASS_TYPE_LABELS[type]`) nếu communication
- Functional: detail route `/syllabus/$id` header tag skills đúng
- Functional: `syllabus-progress.tsx` không crash khi `skills=[]`
- Non-functional: TS toàn app xanh, `pnpm test`, `pnpm build`, `pnpm check-types` xanh

## Architecture

Ba consumer chính:
1. **List route** `apps/web/src/routes/_auth/syllabus/index.tsx`:
   - L18 hardcode filter `["Tất cả", "Writing", "Speaking", "Reading"]` → `["Tất cả", ...IELTS_SKILLS]` (thêm Listening). Đây **không** vi phạm non-goal (non-goal = không filter theo `type`).
   - L27-28 **giữ ternary**: `filter === "Tất cả" ? syllabi : syllabi.filter((s) => s.skills.includes(filter))`. Không thay cả dòng thành `.filter` không short-circuit — `includes("Tất cả")` làm list trống.
   - L69: nhiều Tag skill; nếu `skills.length === 0` → 1 Tag `CLASS_TYPE_LABELS[sy.type]` ("Giao tiếp" hoặc "IELTS" cho row cũ rỗng).
2. **Detail route** `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`:
   - L102 `<Tag>{sy.skill}</Tag>` → cùng pattern với list
3. **Progress header** `apps/web/src/components/syllabus/syllabus-progress.tsx`:
   - L46 `{syllabus.level} · {syllabus.skill} · {syllabus.totalLessons} buổi` → `{syllabus.level} · {syllabus.skills.join(", ") || CLASS_TYPE_LABELS[syllabus.type]} · {syllabus.totalLessons} buổi`

## Related Code Files

- Modify: `apps/web/src/routes/_auth/syllabus/index.tsx`
- Modify: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`
- Modify: `apps/web/src/components/syllabus/syllabus-progress.tsx`
- Verify: mọi grep hit `\.skill\b` còn sót ngoài `.skills`

## Implementation Steps

1. Grep xác nhận không còn callsite `syllabus.skill` (single):
   ```bash
   grep -rn "\.skill\b" apps/web/src --include="*.tsx" --include="*.ts" | grep -v "\.skills"
   ```
2. `syllabus/index.tsx`:
   - L27-28: giữ `filter === "Tất cả" ? syllabi : ...includes(filter)`
   - L67-71: render tag skills:
     ```tsx
     {sy.skills.length > 0
       ? sy.skills.map((sk) => <Tag key={sk}>{sk}</Tag>)
       : <Tag>{CLASS_TYPE_LABELS[sy.type]}</Tag>}
     ```
3. `syllabus/$syllabusId.tsx` L102: apply pattern y hệt list.
4. `syllabus-progress.tsx` L46:
   ```tsx
   {syllabus.level} · {syllabus.skills.length > 0
     ? syllabus.skills.join(", ")
     : CLASS_TYPE_LABELS[syllabus.type]} · {syllabus.totalLessons} buổi
   ```
5. Import `CLASS_TYPE_LABELS` from `@/lib/mock-data` và `IELTS_SKILLS` from `@teacher-os/api/contracts` ở list route (verify export sẵn). `syllabus-progress.tsx` chỉ cần `CLASS_TYPE_LABELS`.
6. Chạy full suite:
   ```bash
   pnpm check-types
   pnpm test
   pnpm build
   ```
7. Chạy dev server, mở popup "Tạo syllabus" và thực hiện 2 acceptance scenarios (ielts + communication).

## Success Criteria

- [x] `grep "\.skill\b" apps/web/src` (loại trừ `.skills`) trả về rỗng — không còn consumer cũ
- [x] Trang `/syllabus` filter theo "Writing" chỉ show syllabus IELTS có Writing
- [x] Syllabus ielts với `skills=["Writing","Speaking"]` render 2 Tag riêng biệt
- [x] Syllabus communication render 1 Tag "Giao tiếp"
- [x] Detail page render đúng tag skills / "Giao tiếp"
- [x] `syllabus-progress.tsx` không crash khi `skills=[]`
- [x] `pnpm check-types`, `pnpm test`, `pnpm build` toàn workspace xanh
- [x] E2E manual: tạo syllabus ielts (2 skill) → tạo syllabus communication → cả 2 xuất hiện trong list, detail, progress render đúng

## Risk Assessment

- **Risk:** `CLASS_TYPE_LABELS` chưa xuất từ `mock-data.ts` (đã grep thấy: `apps/web/src/components/modals/add-class-modal.tsx:17` import nó).
  - **Signal:** TS error at import.
  - **Response:** Đã tồn tại (dùng bởi AddClassModal), nên import an toàn.
- **Risk:** Filter chip derive `IELTS_SKILLS` thêm Listening — **in scope**.
- **Risk:** Row cũ `skill=''` backfill `skills=[]` + `type='ielts'` hiện tag "IELTS" — cosmetic drift đã chấp nhận trên issue #77.

<!-- Updated: Validation Session 1 - keep Tất cả ternary; Listening in scope -->
