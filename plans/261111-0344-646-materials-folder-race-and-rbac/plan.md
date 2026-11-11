---
title: "Chặn race chu trình thư mục tài liệu & tách phân quyền tài liệu khỏi chấm bài (#646)"
description: "Bảo vệ nguyên tử cây thư mục tài liệu bằng SQL WITH RECURSIVE, hiển thị thư mục bị cô lập ở client, tách canReadMaterials/canWriteMaterials và ẩn nút ghi cho role ta trên cả 3 bề mặt web UI."
status: completed
priority: P1
effort: "4h"
issue: 646
branch: fix/646-materials-folder-race-and-rbac
tags: [bugfix, backend, frontend, auth, database]
blockedBy: []
blocks: []
created: 2026-11-11
---

# Chặn race chu trình thư mục tài liệu & tách phân quyền tài liệu khỏi chấm bài (#646)

Tracking: #646

## Plan Context

- **Mode:** `--tdd --advice` (handover-ready plan under `kongming` advisory supervision; every phase file carries explicit per-task `Goal`, `Target files and symbols`, `Steps`, `Success criteria`, mechanical `Verify`, and literal `Failure Protocol`).
- **Validation:** `auto` (`ak-vibe` pipeline).
- **Worktree:** `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac` (`fix/646-materials-folder-race-and-rbac`, base `develop`).

## Overview

Module Ngân hàng tài liệu hiện có hai nhóm lỗi độc lập cần xử lý dứt điểm:

1. **TOCTOU chu trình & trần độ sâu thư mục + mất thư mục trên UI:** `POST /api/materials/folders` và `PATCH /api/materials/folders/:id` (`apps/server/src/routes/materials.ts:625-705`) kiểm tra chu trình và trần 5 cấp trên mảng đọc sẵn trong JS trước khi ghi SQL rời, ngoài ra `PATCH` luôn ghi đè lại cả `name` lẫn `parentId` đọc cũ. Dưới tải đồng thời (`Promise.all`), hai thao tác di chuyển chéo `A → B` và `B → A` (hoặc đổi tên đua với di chuyển) tạo chu trình trực tiếp hoặc làm mất cập nhật trong SQLite/D1. Trên web, `flattenFolderTree` (`apps/web/src/lib/material-folders.ts:19-45`) chỉ duyệt từ `parentId = null`, khiến các thư mục dính vòng biến mất hoàn toàn khỏi giao diện.
2. **Liên kết ngầm quyền Tài liệu với Chấm bài & bẫy nút ghi cho `ta`:** `apps/server/src/routes/materials.ts:20,160-164` dùng ké `canReviewGrade`/`canPublishGrade`, còn 3 bề mặt web (`/materials`, `SessionMaterialsModal`, `MaterialPicker`/`MaterialBankBrowser`) vẫn hiển thị nút và câu dẫn tạo/tải/sửa/xóa tài liệu cho `ta` dù server luôn trả `403 FORBIDDEN`.

Giải pháp nhúng trực tiếp điều kiện `WITH RECURSIVE` nguyên tử vào câu ghi SQL trên server (không ghi bẩn rồi hoàn tác), cập nhật từng phần (partial `.set`) cho `name` và `parentId` ở `PATCH`, bổ sung vòng quét gốc chu trình trong `flattenFolderTree` kèm sửa khởi tạo cha trong `FolderDialog`, tách riêng `canReadMaterials`/`canWriteMaterials` tại `packages/auth/src/role.ts`, và ẩn toàn bộ thao tác ghi + hộp thoại ghi khi `!canWriteMaterials(role)` trên cả 3 bề mặt UI.

## Extension Trace

- **Biên ổn định:** Allowlist miền Tài liệu (`MATERIAL_READ_ROLES`, `MATERIAL_WRITE_ROLES`, `canReadMaterials`, `canWriteMaterials`) trong `packages/auth/src/role.ts` và hook `useCanWriteMaterials()` trong `apps/web/src/lib/repos/materials.ts`.
- **Biến thể kế tiếp khả dĩ:** Tách riêng quyền cho `study-pack` / `self-study-plan` hoặc bổ sung vai trò biên tập học liệu (`content_editor` được sửa tài liệu nhưng không chốt điểm chấm bài).
- **Điểm cần đổi khi mở rộng:** Chỉ cập nhật mảng `MATERIAL_WRITE_ROLES` trong `packages/auth/src/role.ts` và bảng test `packages/auth/src/role.test.ts`; không phải đụng lại `materials.ts`, `grading.ts`, schema DB hay 3 bề mặt UI.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tách `canReadMaterials` / `canWriteMaterials` độc lập khỏi `GRADING_*` ở `packages/auth` và `apps/server/src/routes/materials.ts` | P1 |
| 2 | Chặn nguyên tử chu trình & độ sâu > 5 bằng SQL `WITH RECURSIVE` ở `POST`/`PATCH` thư mục, cập nhật riêng từng trường `name`/`parentId` ở `PATCH` | P1 |
| 3 | Render an toàn mọi thư mục cô lập/chu trình theo gốc chu trình ở `flattenFolderTree`, kẹp thụt lề UI (`FolderPanel`, `FolderSelect`, `MaterialBankBrowser`) và sửa state mặc định `FolderDialog` | P1 |
| 4 | Ẩn toàn bộ nút/hộp thoại ghi tài liệu với `viewer.role = "ta"` trên `/materials`, `SessionMaterialsModal`, và `MaterialPicker`/`MaterialBankBrowser` | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Auth RBAC & Server Atomic Folder Guards](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Client Folder Tree Recovery & Move Dialog Fix](./phase-02-client-folder-tree-recovery.md) | Pending |
| 3 | [Phase 3: Web TA Read-Only Surfaces & Verification](./phase-03-web-ta-readonly-surfaces.md) | Pending |

## Success Criteria

- [x] `packages/auth/src/role.ts` export `MATERIAL_WRITE_ROLES`, `MATERIAL_READ_ROLES`, `canWriteMaterials`, `canReadMaterials` với bảng tra riêng; `apps/server/src/routes/materials.ts` không còn tham chiếu `canReviewGrade` hay `canPublishGrade`; `materials.test.ts` phủ cả HTTP gate cho role không thuộc allowlist, `class_teacher`, `ta` và cô lập `parentId` chéo org.
- [x] `apps/server/src/routes/materials.test.ts` chứng minh bằng `Promise.all`: đua chéo `A → B` và `B → A` trả `[200, 400]` (`FOLDER_CYCLE`); đua đổi tên thuần + di chuyển thuần bảo toàn cả hai thay đổi, đua trùng tên khi di chuyển trả `[200, 409]` (`FOLDER_NAME_TAKEN`); đua vượt trần 5 cấp ở `POST` và `PATCH` trả `400 FOLDER_TOO_DEEP`; di chuyển thư mục đang kẹt vòng sang cha hợp lệ hoặc gốc thành công (`200`).
- [x] `flattenFolderTree` trả đủ mọi thư mục trong chu trình `x ↔ y` kèm nhánh con `b → x` giữ đúng thứ tự cha–con (`[["x", 0], ["b", 1], ["y", 1]]`); `FolderPanel`, `FolderSelect` (giữ `\u00A0\u00A0`) và `MaterialBankBrowser` kẹp thụt lề tối đa `MATERIAL_FOLDER_MAX_DEPTH - 1`; `FolderDialog` ở mode `move` khởi tạo `parentId = null` khi cha hiện tại nằm trong `exclude` hoặc không tồn tại.
- [x] Với `viewer.role = "ta"`, cả 3 bề mặt (`/materials`, `SessionMaterialsModal`, `MaterialPicker` + `MaterialBankBrowser`) ẩn toàn bộ nút ghi/upload/sửa/xóa, câu nhắc upload và đóng cổng render dialog ghi, trong khi vẫn giữ các thao tác đọc/mở/tải và `Chọn từ ngân hàng` ở `MaterialPicker`.
- [x] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` (`@teacher-os/auth`, `server`, `web`), `pnpm design:compare` và kiểm tra trực quan 3 viewport (`1440×900`, `768×1024`, `375×812`, light/dark) đều đạt.

## Red Team Review

### Session — 2026-11-11
**Findings:** 10 deduplicated across 3 hostile lenses (10 accepted, 0 rejected)
**Severity breakdown:** 3 Critical, 5 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `PATCH /materials/folders/:id` clobbers `name` on pure moves and `catch` reads rolled-back `parentId` on move `UNIQUE` collision | Critical | Accept | Phase 1 (Task 1.3, Task 1.4) |
| 2 | `WITH RECURSIVE` SQL needed explicit `sub` base case (`SELECT id, 1 FROM material_folder WHERE id = :id AND org_id = :orgId`), valid `EXISTS (SELECT 1 FROM anc)` syntax, full snake_case mapping, and `PATCH` `!row` wiring | Critical | Accept | Phase 1 (Task 1.4) |
| 3 | `materials/index.test.tsx` cyclic-move test must seed `mockSearch.current = { folderId: "x" }` because mocked `useNavigate` does not mutate search params | Critical | Accept | Phase 3 (Task 3.1) |
| 4 | Add cross-org `parentId` injection tests, HTTP-level `gate` RBAC tests (`class_teacher`, unknown role `403 FORBIDDEN`, full `ta` write denials), and order-independent `Promise.all` depth assertions | High | Accept | Phase 1 (Task 1.3) |
| 5 | Check `!Number.isFinite(folderDepth(...))` as `FOLDER_CYCLE` before `FOLDER_TOO_DEEP` and keep 1x retry inside the `nameTaken` `try/catch` | High | Accept | Phase 1 (Task 1.4) |
| 6 | `flattenFolderTree` unvisited sweep should start at the `byName`-minimum node on each component's cycle so child folders (`b -> x` where `"B" < "X"`) are not detached to `depth: 0` | High | Accept | Phase 2 (Task 2.1, Task 2.2) |
| 7 | Derive `effectiveParentId` at render time in `FolderDialog` and invalidate `materialsAllQueryKey` on `FOLDER_CYCLE`/`FOLDER_TOO_DEEP` errors in `useMaterialWrite` | High | Accept | Phase 2 (Task 2.2) |
| 8 | Preserve `\u00A0\u00A0` NBSP indentation in `FolderSelect`, and clamp `depth` + provide neutral TA empty-bank copy in `MaterialBankBrowser` (`material-picker.tsx`) | High | Accept | Phase 2 (Task 2.2), Phase 3 (Task 3.1, Task 3.2) |
| 9 | `FolderDialog` move initializer must also reset `parentId` to `null` when `mode.folder.parentId` points to a missing/deleted folder (`!folders.some(...)`) | Medium | Accept | Phase 2 (Task 2.2) |
| 10 | Extend `startMaterialsBankServer` in `materials-harness.ts` for `snapshot` override, apply `activeView` to all 3 `view` sites + clear `error`/`dialog` on `!canWrite`, and memoize `subscribe` + pass `getServerSnapshot` in `useCanWriteMaterials` | Medium | Accept | Phase 3 (Task 3.1, Task 3.2) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-client-folder-tree-recovery.md`, `phase-03-web-ta-readonly-surfaces.md`
- Decision deltas checked: 10
- Reconciled stale references: 10 (reconciled `Overview`, `Goals`, `Success Criteria`, `Files to Create / Modify`, SQL snippets, NBSP `\u00a0\u00a0`, cycle-root order `[["x", 0], ["b", 1], ["y", 1]]`, `effectiveParentId`, and `materials-harness.ts` across all 4 files)
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Standard (3 phases — Fact Checker + Contract Verifier, 30 claims checked per role; all 8 initial mismatches remediated inline during Red Team Session 1)
- **Claims checked:** 30
- **Verified:** 30 | **Failed:** 0 | **Unverified:** 0

### Key Decisions Confirmed (Auto Mode)
1. **Atomic SQL over write-then-revert:** `WITH RECURSIVE` inside `UPDATE ... WHERE` and `INSERT ... SELECT ... WHERE` prevents dirty reads, livelock, and unique-constraint revert failures.
2. **Symmetric partial `PATCH`:** Only columns explicitly present in `body.data` (`nameChanged`, `parentChanged`) are written in `.set(...)`, preserving concurrent orthogonal updates.
3. **Cache-subscribed `useCanWriteMaterials()`:** `useSyncExternalStore` on `queryClient.getQueryCache()` with `"teacher"` fallback supports both full `DataProvider` apps and bare `QueryClientProvider` unit tests without adding fields to `KernelSnapshot.viewer`.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-client-folder-tree-recovery.md`, `phase-03-web-ta-readonly-surfaces.md`
- Decision deltas checked: 3
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: 646-materials-folder-race-and-rbac -->
