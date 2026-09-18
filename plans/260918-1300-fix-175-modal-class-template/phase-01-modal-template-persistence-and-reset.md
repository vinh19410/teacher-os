---
title: "Phase 1: Modal Template Persistence and Reset"
description: "Cập nhật resetForm() trong AddClassModal, cập nhật data-store-reducer, và thêm unit/contract test."
status: completed
priority: P2
effort: 20m
plan: plans/260918-1300-fix-175-modal-class-template/plan.md
---

# Phase 1: Modal Template Persistence and Reset

## Context

Các file cần sửa đổi:
- `apps/web/src/components/modals/add-class-modal.tsx`: Sửa `resetForm()` để reset `templateId`, `classType`, `level`, `mode`, `total`.
- `apps/web/src/lib/data-store-reducer.ts`: Cập nhật `syllabusId: action.payload.templateId || ""`.
- `apps/web/src/lib/data-store-reducer.test.ts`: Bổ sung test kiểm tra `add-class` với `templateId`.
- `apps/web/src/lib/kernel-runtime.contract.test.ts`: Bổ sung contract test khóa chặt `AddClassModal` wiring và `resetForm`.

## Tasks

- [x] Cập nhật `apps/web/src/components/modals/add-class-modal.tsx`:
  - Trong `resetForm()`: thêm `setTemplateId("")`, `setClassType("ielts")`, `setLevel("Band 7.0")`, `setMode("Online")`, `setTotal("12")`.
- [x] Cập nhật `apps/web/src/lib/data-store-reducer.ts`:
  - Gán `syllabusId: action.payload.templateId || ""` thay vì hardcode `""`.
- [x] Cập nhật `apps/web/src/lib/data-store-reducer.test.ts`:
  - Thêm assert cho `added.syllabusId === "sy1"` trong test `add-class appends with sessionsDone 0, c- id, and JSON-string schedule`.
- [x] Cập nhật `apps/web/src/lib/kernel-runtime.contract.test.ts`:
  - Thêm contract test kiểm tra `AddClassModal`:
    - `resetForm` gọi `setTemplateId("")`.
    - Modal render `<Field label="Template giáo trình">` và gửi `templateId` trong payload `add-class`.
- [x] Chạy kiểm thử:
  - `pnpm test`
  - `pnpm check`
  - `pnpm check-types`
