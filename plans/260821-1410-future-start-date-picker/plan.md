---
title: "Future-only start date picker in create class modal"
description: "Đổi field Ngày bắt đầu trong modal Tạo lớp mới sang native date picker và chặn ngày không nằm sau hôm nay."
status: completed
priority: P2
effort: "1.5h"
branch: develop
tags: [frontend, form, validation]
blockedBy: []
blocks: []
created: 2026-08-21
---

# Future-only start date picker

## Overview

Đổi field “Ngày bắt đầu” trong popup “Tạo lớp mới” từ text input sang native `<input type="date">`. Chỉ cho submit ngày mai trở đi theo local calendar. Giữ `startDate` là string, không thêm thư viện, không đổi layout hoặc API/DB.

## Verified Evidence

| Claim | Evidence |
| --- | --- |
| Modal owner có `startDate` text default `"19/08"` | `apps/web/src/components/modals/add-class-modal.tsx:49` |
| Submit hiện gọi `run({ type: "add-class", payload: ... startDate: startDate.trim() })` | `apps/web/src/components/modals/add-class-modal.tsx:90` `apps/web/src/components/modals/add-class-modal.tsx:101` |
| Field “Ngày bắt đầu” render `<Input>` chưa có `type`/`min` | `apps/web/src/components/modals/add-class-modal.tsx:210` |
| Lỗi form đã render tiếng Việt qua `role="alert"` | `apps/web/src/components/modals/add-class-modal.tsx:218` |
| `Input` nhận native `InputHTMLAttributes<HTMLInputElement>` | `apps/web/src/components/ui/field.tsx:53` |
| API contract giữ `startDate: z.string().default("")` | `packages/api/src/contracts.ts:58` |
| DB column là text string default `""` | `packages/db/src/schema/class.ts:28` |
| Server ghi raw `input.startDate` | `apps/server/src/routes/kernel.ts:253` |
| Snapshot/web adapter truyền raw `startDate` | `apps/server/src/routes/snapshot.ts:204` `apps/web/src/lib/repos/classes.ts:49` |
| Class detail hiển thị raw `cls.startDate` | `apps/web/src/routes/_auth/classes/$classId.tsx:89` |
| Kernel command spread nguyên payload `add-class` | `apps/web/src/lib/repos/kernel.ts:54` |

## Phases

| Phase | Name | Status | Dependencies |
| --- | --- | --- | --- |
| 1 | [Date picker and future validation](./phase-01-date-picker-and-future-validation.md) | Completed | None |

Fewer than 3 phases: skip runtime task hydration. Một phase đủ vì chỉ một UI owner file đổi code; test file optional cùng phase.

## Data Flow

1. User mở modal `AddClassModal`.
2. Modal tính ngày mai bằng local calendar fields, format `YYYY-MM-DD`, dùng làm default/min.
3. User chọn ngày qua native date input. Browser trả string `YYYY-MM-DD`.
4. Submit validate local: empty/invalid/today/past => `setError("Vui lòng chọn ngày bắt đầu sau hôm nay.")`, render qua existing `role="alert"`, không gọi `run`.
5. Valid future date => giữ payload shape hiện tại, `startDate` string đi vào `run` -> `dispatch` -> `kernelCommand` -> `/api/classes`.
6. Server/API/DB/snapshot/display giữ raw string, không migration.

## File Ownership

| File | Action | Owner |
| --- | --- | --- |
| `apps/web/src/components/modals/add-class-modal.tsx` | Modify | Phase 1 |
| `apps/web/src/lib/kernel-runtime.contract.test.ts` | Modify if source-contract coverage needed | Phase 1 |

No parallel phases. No overlapping writes.

## Success Criteria

- [x] Input “Ngày bắt đầu” có `type="date"`.
- [x] `min` bằng ngày mai theo local calendar, không dùng `toISOString()` cho local date.
- [x] Default/open-state hợp lệ: ngày mai hoặc tự sửa ngày rỗng/không-future khi modal mở.
- [x] Submit không gọi `run` nếu `startDate` rỗng, invalid, hôm nay, hoặc quá khứ.
- [x] Lỗi tiếng Việt render qua existing `role="alert"`; `noValidate` bảo đảm React guard chạy trước native constraint.
- [x] Payload `add-class` vẫn có `startDate: string`; không đổi contract/server/DB.
- [x] Focused tests/typecheck pass.

## Validation Matrix

| Level | Command / check | Covers |
| --- | --- | --- |
| Static contract | Update/run `apps/web/src/lib/kernel-runtime.contract.test.ts` if needed | `type="date"`, `min`, alert, no `"19/08"` regression |
| Existing payload unit | `pnpm --filter web test -- apps/web/src/lib/repos/kernel.test.ts` | `add-class` payload still posts as-is |
| Focused web suite | `pnpm --filter web test` | no modal/runtime regression |
| Type/build | `pnpm --filter web check-types` | React props/helper typing |
| Repo gate if focused pass | `pnpm run check-types` | workspace type consistency |

## Backwards Compatibility

- Existing classes can keep legacy date strings because display renders raw `startDate`.
- New submissions use ISO `YYYY-MM-DD` string from native date input; contract already allows any string.
- No DB migration, no server validation change, no API payload shape change.

## Completion Evidence

| Metric | Result |
| --- | --- |
| Phase/checklist mapping | 1/1 phase complete; all phase TODOs and acceptance criteria checked; unresolved mappings: 0 |
| Focused validation | 25/25 pass |
| Web suite | 186/186 pass |
| Repository gates | `pnpm test`, `pnpm check-types`, `pnpm build` pass |
| Biome | Changed files pass |
| Review round 2 | 9/10; 0 critical issues; warnings only on full-form `noValidate` and source-contract coverage |
| Docs impact | none — internal modal behavior only; no API/DB/architecture/setup change |

## Risks / Mitigations / Rollback

| Risk | Likelihood x Impact | Mitigation |
| --- | --- | --- |
| UTC drift makes min today/yesterday in some timezone | Medium x High | Build tomorrow from `getFullYear()`, `getMonth()`, `getDate() + 1`; do not use `toISOString()` |
| Modal stays mounted across midnight; old selected tomorrow becomes today | Low x Medium | Recompute submit boundary fresh in `submit`; optionally repair stale/empty date when `open` becomes true |
| Native date input can be cleared despite `min` | Medium x Medium | Explicit submit validation before `run` |
| Tests become brittle if only regex-source tests | Medium x Low | Keep source checks focused on stable acceptance text; avoid checking formatting |
| Date display becomes mixed (`19/08` old, `2026-08-22` new) | High x Low | Accepted because display is raw string and contract is unchanged; do not reformat existing detail UI in this scope |

Rollback: revert Phase 1 file edits; no migration/data rollback required.

## Open Questions

None.
