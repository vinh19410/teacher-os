---
title: "Tab 'Học viên có sẵn': bỏ input gói — enroll chỉ còn chọn học viên"
description: "Bỏ 3 input 'Số buổi gói', 'Đơn giá (VND)', 'Hình thức' khỏi tab 'Học viên có sẵn' của modal thêm học viên; server derive gói từ lớp (theo pattern D1) thay vì nhận từ input."
status: completed
priority: P2
effort: 3h
issue: 251
branch: vinh19410/feat/enroll-existing-drop-package-inputs
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-09-23
---

# Tab "Học viên có sẵn": bỏ input gói — enroll chỉ còn chọn học viên

## Overview

Modal "Thêm học viên" (`apps/web/src/components/modals/add-student-modal.tsx`) mở từ trang lớp có 2 tab. Tab **"Học viên có sẵn"** hiện hiển thị thêm 3 input gói — "Số buổi gói", "Đơn giá (VND)", "Hình thức" (block `enrollPackageFields`, dòng 203–238, render tại dòng 310) — và gửi `{total, price, mode}` lên `POST /api/classes/:id/enroll`.

Yêu cầu: tab này chỉ còn là **danh sách học viên có sẵn có ô search** ("Tìm học viên" theo tên/SĐT đã có sẵn tại dòng 272–278) + nút Lưu. Ba input gói bị bỏ.

Quyết định thiết kế cốt lõi: nhánh "tạo học viên mới có lớp" đã **derive gói từ lớp** (comment `D1` tại `apps/server/src/routes/kernel.ts:550-561` — `cls.sessionsTotal`, `cls.tuitionFee ?? 0`, `cls.mode`). Nhánh enroll-existing là nhánh duy nhất còn nhận package fields từ input. Nếu chỉ bỏ UI mà vẫn POST default (10 / 400000 / Online) thì server tạo `sessionPackage` **sai so với lớp** (sai số buổi/đơn giá/hình thức → dữ liệu tuition sai). Do đó plan này align enroll theo D1: schema chỉ còn `studentId`, server derive gói từ `cls`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tab "Học viên có sẵn" chỉ còn: ô "Tìm học viên" + danh sách (đã có sẵn) + Lưu — không còn 3 input gói | P1 |
| 2 | `POST /classes/:id/enroll` derive `sessionPackage` từ lớp (`sessionsTotal`, `tuitionFee ?? 0`, `mode`) như nhánh D1 | P1 |
| 3 | Client không còn gửi `total/price/mode` khi enroll; `enrollStudentSchema` chỉ còn `studentId` | P2 |
| 4 | Toàn bộ unit/contract/e2e liên quan xanh; hành vi mới được khoá bằng test | P1 |

### Non-goals

- Không đổi tab "Tạo học viên mới" và form tạo học viên tại /students.
- Không đổi DB schema (`enrollment`, `sessionPackage` giữ nguyên).
- Không xây filter mới — search tên/SĐT hiện có đã đáp ứng yêu cầu.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [API & server: enroll derive gói từ lớp (D1)](./phase-01-start.md) | Completed |
| 2 | [Web: dọn tab "Học viên có sẵn"](./phase-02-web-simplify-existing-tab.md) | Completed |
| 3 | [E2E & verification gate](./phase-03-e2e-verification.md) | Completed |

## Success Criteria

- [x] Mở modal từ trang lớp, tab "Học viên có sẵn": không còn "Số buổi gói"/"Đơn giá (VND)"/"Hình thức"; search + chọn học viên + Lưu enroll thành công.
- [x] Sau enroll, gói của học viên được enroll đúng `sessionsTotal`/`tuitionFee`/`mode` của lớp (không còn default cứng 10/400000/Online).
- [x] `pnpm --filter server test`, `pnpm --filter web test` xanh; `pnpm check-types`, `pnpm check` sạch.
- [x] E2E `student-package-validation` (bản cập nhật) + `enroll-existing-student` xanh.

## Verification

```bash
pnpm --filter server test
pnpm --filter web test
pnpm check-types
pnpm check
cd apps/e2e && pnpm exec playwright test student-package-validation enroll-existing-student
```

## Validation Log

### Verification Results
- Claims checked: 10
- Verified: 10 | Failed: 0 | Unverified: 0
- Tier: Standard
- Key verified claims:
  - `packages/api/src/contracts.ts:25-31`: `enrollStudentSchema` contains `total/price/mode` defaults.
  - `apps/server/src/routes/kernel.ts:646-657`: `sessionPackage` insertion uses `input.total`, `input.price`, `input.mode`.
  - `apps/server/src/routes/kernel.ts:550-561`: D1 pattern creates package from `cls.sessionsTotal`, `cls.tuitionFee ?? 0`, `cls.mode`.
  - `apps/server/src/kernel.test.ts:3506,3878,3977,4892`: four points testing `/enroll` package inputs.
  - `apps/web/src/components/modals/add-student-modal.tsx:203-238,310`: `enrollPackageFields` block and render point.
  - `apps/web/src/lib/data-actions.ts:83-93`: `enroll-student` action contains `payload` with package fields.
  - `apps/web/src/lib/repos/kernel.ts:52-62`: `kernelCommand` extracts `action.payload.total/price/mode`.
  - `apps/web/src/lib/data-store-reducer.ts:127-161`: `enroll-student` stores package from `action.payload`.
  - `apps/e2e/specs/student-package-validation.spec.ts:106-160`: D4 test asserts 3 package inputs visible and tests 0 total rejection.
  - Baseline build, server/web tests, typecheck, biome pass with 0 errors.

## Red Team Review

### Personas Evaluated
1. **Security Adversary**: Removing client package fields prevents malicious or unintended tampering of package price/sessions from web clients. Server derives package authoritative state strictly from the class entity (`cls`). Zod non-strict schema safely ignores unknown incoming fields without breaking compatibility.
2. **Assumption Destroyer**: If a student is enrolled, does the class always have valid `sessionsTotal` and `mode`? Yes, class schema enforces `sessionsTotal: z.number().int().min(1)` and `mode: z.enum(["Online", "Offline"])`. `tuitionFee` defaults to `null`, handled as `cls.tuitionFee ?? 0`.
3. **Failure Mode Analyst**: What happens if an older client sends `total/price/mode` during rolling deployment? Zod default stripping discards them safely; handler derives from class. What happens in reducer if class is not yet in state? Reducer gracefully attaches student without crashing `pkg`.

### Whole-Plan Consistency Sweep
- All 3 phases cross-checked for interface consistency.
- Action `enroll-student` and schema `enrollStudentSchema` aligned: `{ studentId: string }`.
- Reducer and server both derive package values from class attributes (`sessionsTotal`, `tuitionFee ?? 0`, `mode`).
- No unresolved contradictions.
