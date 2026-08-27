---
phase: 4
title: "Curriculum parity + contract tests + e2e"
status: pending
priority: P2
effort: "3-5h"
dependencies: [3]
---

# Phase 4: Curriculum parity + contract tests + e2e

## Overview

Mang bộ nút Xóa/mũi tên sang surface thứ hai (bản copy lớp trong class detail) bằng cách DÙNG CHUNG component/action, không viết tay lại; cập nhật các source-lock contract tests CÙNG commit với source; thêm 1 spec e2e Playwright smoke.

## Requirements

- Functional: `apps/web/src/components/class-detail/curriculum-management-section.tsx` có đầy đủ hành động như syllabus template detail.
- Non-functional: hai surface consume cùng component **nhận** `run/isPending/busy` qua props (Kongming risk #5 + issue #91). Extract **không** gọi `useDirectKernelAction` bên trong. `$classId.tsx:49` đã có hook; section hiện tự gọi hook `:37` — phải bỏ, truyền props giống `ClassScheduleTable`.

## Architecture

Extract hàng actions + confirm modal từ Phase 3 thành component dùng chung. Syllabus detail và curriculum section cùng import, cùng props hook. Contract tests parse-source (`syllabus-peel.contract.test.ts`, `kernel-runtime.contract.test.ts`) cập nhật cùng commit.

Confirm trên class-copy dùng copy tiến độ (Phase 3). Giữ nguyên modal "Gỡ giáo trình".

## Related Code Files

- Modify: `apps/web/src/components/class-detail/curriculum-management-section.tsx` — bỏ hook riêng
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — truyền `run/isPending/busy`
- Create: shared component/hook hành động (cạnh modals hoặc components/syllabus/)
- Modify: contract tests khóa source bị chạm; `apps/server/src/kernel.test.ts` nếu Phase 1 sót
- Create: `apps/e2e/specs/` spec mới (mẫu `class-operations.spec.ts` + helpers)

## Implementation Steps

1. Extract row/module actions từ `$syllabusId.tsx`, mount lại (không đổi behavior). Shared child `.not.toMatch(/useDirectKernelAction/)`.
2. Mount cùng component trong curriculum-management-section; nhận props từ `$classId.tsx`; giữ confirm "Gỡ giáo trình".
3. Contract/source-lock: thêm `$syllabusId.tsx` + curriculum section vào direct-action lock `disabled={busy || isPending(...)}` (`kernel-runtime.contract.test.ts:253-300`). Sửa assertions cùng commit.
4. E2E spec — copy nguyên văn pattern `class-operations.spec.ts:98-144`:
   - `page.request.post("http://localhost:8000/api/...", { headers: { "content-type": "application/json", Origin: "http://localhost:8001" } })` — **absolute :8000**, không relative (Playwright baseURL :8001 → 404)
   - assert status; **`page.reload()`** trước UI (`['kernel']` staleTime Infinity)
   - seed syllabus 2 modules × 2 lessons; UI click ↓ module 1 → assert thứ tự; **xóa 1 module** (không chỉ lesson) → assert 0 orphan + count
   - helper mới trong `helpers.ts` nếu extract, vẫn giữ absolute URL + Origin + reload
5. Chạy `pnpm --filter web test`, `pnpm --filter server test`, `pnpm check-types`, build, e2e.

## Success Criteria

- [x] Parity: mọi thao tác trên template cũng làm được trên bản lớp
- [x] Toàn bộ gate lệnh xanh (test/type/build/e2e)
- [x] Không còn chuỗi stale referencing hành động cũ ("Sửa" duy nhất) trong contract tests
- [x] Shared child không gọi `useDirectKernelAction`

## Risk Assessment

- Refactor extract regression UI cũ → e2e + smoke detail sheet trước khi cook xong phase.
- Relative POST e2e 404 / stale snapshot → bước 4 bắt buộc absolute + reload.
<!-- Updated: Validation Session 1 / Red Team Session 2 -->
