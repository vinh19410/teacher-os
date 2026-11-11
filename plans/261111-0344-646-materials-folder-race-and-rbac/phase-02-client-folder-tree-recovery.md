---
phase: 2
title: "Phase 2: Client Folder Tree Recovery & Move Dialog Fix"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Client Folder Tree Recovery & Move Dialog Fix

<!-- Updated: Red Team Session 1 - Cycle-root pre-order preservation, NBSP preservation in FolderSelect, dangling parentId reset in FolderDialog -->

## Goal

Đảm bảo mọi thư mục trong DB (kể cả thành phần bị kẹt chu trình lịch sử và cây con của chúng) luôn hiển thị đúng quan hệ cha–con trên giao diện web với độ thụt lề an toàn, đồng thời sửa `FolderDialog` ở chế độ di chuyển để người dùng gỡ vòng hoặc thư mục cha mồ côi về thư mục gốc chỉ bằng một cú bấm.

## Files to Create / Modify

- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/lib/material-folders.ts`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/lib/material-folders.test.ts`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/materials/folder-select.tsx`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/materials/material-dialogs.tsx`

## Tasks & Steps

### Task 2.1 — Cập nhật unit test đỏ cho `flattenFolderTree` với dữ liệu chu trình và cây con của chu trình (TDD Red)
- **Goal:** Thay assertion cũ vốn bỏ rơi `x, y` bằng kiểm thử yêu cầu hiển thị đầy đủ các thư mục trong chu trình và giữ đúng quan hệ cha–con cho nhánh con bám vào chu trình (kể cả khi tên nhánh con xếp trước theo bảng chữ cái).
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/lib/material-folders.test.ts` (`describe("flattenFolderTree")`).
- **Steps:**
  1. Trong `apps/web/src/lib/material-folders.test.ts`, sửa test `"keeps folders whose parent is missing as roots and survives cycles"`:
     - Với `[folder("a", "A", "ghost"), folder("x", "X", "y"), folder("y", "Y", "x"), folder("z", "Z", "x")]`, assert `rows.map((r) => [r.folder.id, r.depth])` bằng `[["a", 0], ["x", 0], ["y", 1], ["z", 1]]`.
     - Với `[folder("x", "X", "y"), folder("y", "Y", "x"), folder("b", "B", "x")]` (`b` là con của `x`, tên `"B"` đứng trước `"X"`), assert `rows.map((r) => [r.folder.id, r.depth])` bằng `[["x", 0], ["b", 1], ["y", 1]]` (điểm vào luôn là nút nhỏ nhất theo `byName` nằm **trên chính chu trình**, nên con `b` không bị tách lên `depth = 0`).
- **Success criteria:** Chạy vitest trên `material-folders.test.ts` báo fail vì code cũ chỉ trả `[["a", 0]]`.
- **Verify:** `pnpm --filter web exec vitest run src/lib/material-folders.test.ts` exits non-zero with assertion failure (`expected [ [ 'a', 0 ] ] to deeply equal ...`; passing test ở bước này là lỗi).

### Task 2.2 — Cài đặt quét chu trình theo gốc chu trình trong `flattenFolderTree`, kẹp thụt lề NBSP ở `FolderSelect` và sửa `FolderDialog` (TDD Green)
- **Goal:** Hiển thị đầy đủ mọi thành phần chu trình từ nút gốc nhỏ nhất trên chu trình đó trong `flattenFolderTree`, giữ nguyên khoảng trắng không ngắt dòng (`\u00A0\u00A0`) kèm kẹp độ sâu ở `FolderSelect`, và đặt `parentId = null` mặc định khi mở `FolderDialog` di chuyển thư mục có cha nằm trong `exclude` hoặc cha không tồn tại.
- **Target files and symbols:**
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/lib/material-folders.ts` (`flattenFolderTree`)
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/materials/folder-select.tsx` (`FolderSelect`)
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/materials/material-dialogs.tsx` (`FolderDialog`)
- **Steps:**
  1. Trong `apps/web/src/lib/material-folders.ts`:
     - Tạo `const byId = new Map(folders.map((f) => [f.id, f]));`.
     - Sau `walk(null, 0);`, mọi nút chưa có trong `seen` chắc chắn thuộc một thành phần có chu trình (vì nút có `parentId === null` hoặc `!byId.has(parentId)` đã được gán `parent = null` và thăm hết cùng cây con của chúng).
     - Duyệt `for (const start of [...folders].sort(byName))`: nếu `seen.has(start.id)` thì `continue`. Lần ngược `parentId` qua `byId` từ `start.id` với tập `trace = new Set<string>()` cho tới khi gặp lại một nút `entry` đã nằm trong `trace`; gom toàn bộ các nút trên chu trình chứa `entry`, chọn nút nhỏ nhất theo `byName` làm `cycleRoot`, rồi đánh dấu `seen.add(cycleRoot.id)`, `rows.push({ folder: cycleRoot, depth: 0 })`, và gọi `walk(cycleRoot.id, 1)`. Cập nhật docblock hàm phản ánh hành vi mới.
  2. Trong `apps/web/src/components/materials/folder-select.tsx`: import `MATERIAL_FOLDER_MAX_DEPTH` từ `@teacher-os/api/material-contracts`; khi render `<option>`, tính `const clampedDepth = Math.min(depth, MATERIAL_FOLDER_MAX_DEPTH - 1)` và giữ nguyên hai ký tự non-breaking space U+00A0 (`"\u00a0\u00a0".repeat(clampedDepth)`) cùng `clampedDepth > 0 ? "└ " : ""` (tuyệt đối KHÔNG thay `\u00a0\u00a0` bằng dấu cách ASCII `"  "` vì `<option>` sẽ gộp mất thụt lề).
  3. Trong `apps/web/src/components/materials/material-dialogs.tsx`:
     - Ở `useMaterialWrite`: ngoài `err.status === 404 || err.status === 409`, bổ sung invalidate `materialsAllQueryKey` khi `isMaterialRequestError(err) && (err.materialCode === "FOLDER_CYCLE" || err.materialCode === "FOLDER_TOO_DEEP")` (import `isMaterialRequestError` từ `@/lib/repos/materials`) để thua race chu trình/độ sâu cũng tự làm mới cây thư mục.
     - Ở `FolderDialog`: tính `exclude` trước `useState`; đồng thời tính `const effectiveParentId = parentId !== null && !exclude?.has(parentId) && folders.some((f) => f.id === parentId) ? parentId : null;` ở thời điểm render và dùng `effectiveParentId` cho cả `value` của `<FolderSelect>` lẫn payload `createMaterialFolder` / `updateMaterialFolder` để không bao giờ bị lệch với `"Thư mục gốc"` kể cả khi `folders` vừa refetch lúc dialog đang mở.
- **Success criteria:** `material-folders.test.ts` pass xanh hoàn toàn.
- **Verify:** `pnpm --filter web exec vitest run src/lib/material-folders.test.ts` exits 0 and prints `passed`.

## Todo

- [ ] Sửa và mở rộng test chu trình + nhánh con chu trình trong `apps/web/src/lib/material-folders.test.ts`
- [ ] Cập nhật `flattenFolderTree` trong `apps/web/src/lib/material-folders.ts` để chọn gốc chu trình theo `byName` và duyệt `depth = 0` giữ đúng thứ tự cha–con
- [ ] Kẹp `depth` với `"\u00a0\u00a0"` trong `apps/web/src/components/materials/folder-select.tsx` và sửa khởi tạo `parentId` khi `exclude` hoặc cha mồ côi trong `apps/web/src/components/materials/material-dialogs.tsx`

## Verification

- `pnpm --filter web exec vitest run src/lib/material-folders.test.ts` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
