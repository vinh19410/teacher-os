---
phase: 2
title: "Web kernel actions & data layer"
status: pending
priority: P1
effort: "2-3h"
dependencies: [1]
---

# Phase 2: Web kernel actions & data layer

## Overview

Mở rộng `KernelAction` union và hàm mapping `kernelCommand()` để web có thể gọi 4 endpoints mới qua command bus hiện có. Không UI — phase này chỉ là dữ liệu/phương tiện cho Phase 3-4.

## Requirements

- Functional: 4 discriminant riêng, **mọi field required** (cấm `?`):
  - `{ type: "delete-module"; syllabusId: string; moduleId: string }`
  - `{ type: "delete-lesson"; syllabusId: string; moduleId: string; lessonId: string }`
  - `{ type: "reorder-modules"; syllabusId: string; moduleIds: string[] }`
  - `{ type: "reorder-lessons"; syllabusId: string; moduleId: string; lessonIds: string[] }`
- Non-functional: `kernelCommand` exhaustive (không `default`) ép thiếu case = lỗi biên dịch. **Không** claim compiler bắt outcome reporting / reducer / contract tests.
- 409 `{ error: "set-mismatch" }` trên 4 action mới: refetch như heal-409 nhưng toast "Thứ tự đã đổi — đang tải lại, hãy thao tác lại". Check-in 409 giữ "Dữ liệu đã được cập nhật trước đó".

## Architecture

Không thêm query key — `["kernel"]`, write xong refetch. Consumer UI: `useDirectKernelAction`.

`kernelCommand()` (`apps/web/src/lib/repos/kernel.ts:37-142`) map action → method/path/body; body reorder `{ moduleIds }` / `{ lessonIds }` khớp canonical Phase 1.

Inventory (Contract Verifier, không phải "all callers"):
- Exhaustive switch (1): `kernelCommand` kernel.ts:37-142
- Non-exhaustive (1): `reducer` data-store-reducer.ts:38-270 (`default: return state` :268-269) — **bắt buộc** thêm 4 case, cấm OR no-op
- Transport không switch: `postKernelCommand`, bus `run`/`runOne`, `DataProvider.dispatch`
- Hooks: `useDirectKernelAction.run`, `useKernelFormSubmit.run`
- Direct-action contract lock hiện **không** gồm `$syllabusId.tsx` (`kernel-runtime.contract.test.ts:253-300`) — Phase 3/4 phải mở

## Related Code Files

- Modify: `apps/web/src/lib/data-actions.ts` — 4 variants required-fields
- Modify: `apps/web/src/lib/repos/kernel.ts` (`kernelCommand()` :37-142)
- Modify: `apps/web/src/lib/data-store-reducer.ts` — 4 case + `recomputeTotalLessons` trên delete
- Modify: `apps/web/src/lib/kernel-outcome.ts` + `kernel-outcome.test.ts` — nhánh 409 set-mismatch
- Modify: `apps/web/src/lib/repos/kernel.test.ts` — mapping safeParse

## Implementation Steps

1. 4 KernelAction variants, field required như Requirements.
2. 4 case `kernelCommand`; body reorder `{ moduleIds }` / `{ lessonIds }`.
3. 4 case reducer: delete-module gỡ module+lessons rồi `recomputeTotalLessons`; delete-lesson gỡ 1 lesson rồi recompute; reorder hoán mảng theo ids. Test fixture cùng commit. **Cấm** comment "no-op OK".
4. Unit test: `expect(reorderModulesSchema.safeParse(kernelCommand(action).body).success)` cho 4 action; path/body lock trong `kernel.test.ts`.
5. `postKernelCommand` (`kernel.ts:214-215`) ném `HttpError(status)` **không đọc JSON** — `{ error: "set-mismatch" }` không tới `planDirectOutcome`. Nhánh toast **phải thread `action.type`**: `reportDirectOutcome(result, successText, refresh, action)` (hoặc wrapper). Nếu `result.status===409` và type ∈ delete/reorder-* → toast "Thứ tự đã đổi — đang tải lại, hãy thao tác lại" + heal refetch. Check-in/cancel 409 **không đổi**. Cấm đổi mọi 409 thành toast mới — `kernel-runtime.contract.test.ts:308-313` khóa duplicate-guard cho write hiện có. Cập nhật `kernel-outcome.test.ts` theo action type. Không parse body trước khi throw trừ khi đổi `HttpError` (ngoài scope).

## Success Criteria

- [x] `pnpm check-types` xanh + unit test safeParse mapping xanh
- [x] Mapping review khớp path/body contracts Phase 1 (so từng dòng)
- [x] 409 set-mismatch không hiện toast "đã được cập nhật trước đó"

## Risk Assessment

- `data-store-reducer.ts` no-op im lặng → bắt buộc 4 case, không dựa compile error.
- Recyle 409 toast → bước 5.
<!-- Updated: Validation Session 1 / Red Team Session 2 -->
