---
phase: 2
title: "Gỡ endpoint + contract settings phía server"
status: completed
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Gỡ endpoint + contract settings phía server

## Goal
Xoá `/api/kernel/settings` (GET/PUT/POST) và contract zod tương ứng; giữ nguyên schema/bảng DB `workspace_settings`.

## Files to Create / Modify
- Modify: `apps/server/src/routes/kernel.ts`
  - xoá handler `kernel.get("/kernel/settings", …)` (:332), hàm `saveSettings`, và `kernel.put/post("/kernel/settings", saveSettings)` (:462-463);
  - xoá import `workspaceSettingsSchema`, `workspaceSettingsUpdateSchema` (:29-30) và `workspaceSettings` từ `@teacher-os/db/schema/settings` (:45).
- Modify: `packages/api/src/contracts.ts:1422-1467` — xoá `workspaceSettingsSchema`, `WorkspaceSettings`, `workspaceSettingsUpdateSchema`, `WorkspaceSettingsUpdate`.
- Modify: `apps/server/src/kernel.test.ts`
  - xoá import `WorkspaceSettings` (:13);
  - xoá `describe("workspace settings persistence (issue #179)")` (:4193-4292);
  - viết lại 2 test origin guard đang dùng `/api/kernel/settings` (trong `describe("kernel origin + content-type guards")`, ~:1553-1586) — xem bước 3.
- Không đụng: `packages/db/src/schema/settings.ts`, `packages/db/src/schema/index.ts:17`, migrations.

## Tasks & Steps
- [x] 1. Xoá handler + import trong `kernel.ts`.
- [x] 2. Xoá 4 export trong `contracts.ts`; `grep -rn "workspaceSettings\|WorkspaceSettings" apps packages/api/src --include='*.ts' --include='*.tsx'` chỉ còn khớp `packages/db` (không có).
- [x] 3. Origin guard tests: guard là `kernel.use("*")` (`kernel.ts:91-95`, chỉ áp POST/PUT/PATCH/DELETE) chạy trước routing. PUT/PATCH `/api/classes` không khớp route nào trong kernel router (`/classes` chỉ có GET `:798` và POST `:811`) → sau guard trả 404. Lưu ý kernel router vẫn còn PUT/PATCH qua mount `/assignments` (`kernel.ts:2120`) — đừng chọn path đó cho test.
  - "PUT and PATCH without Origin header are 403": đổi path sang `/api/classes` (giữ method PUT/PATCH) → vẫn 403.
  - "PUT with a foreign Origin is 403; allowed Origin reaches validation": đổi thành "…allowed Origin passes the guard" — foreign Origin → 403; Origin hợp lệ → **assert cứng `toBe(404)`** (không dùng `not.toBe(403)` — assertion lỏng sẽ nuốt cả 500/401, làm mất giá trị regression của CSRF guard). Kèm comment: 404 đến từ routing (không còn route PUT trên kernel router); nếu sau này thêm route PUT thì phải xem lại test này có chủ đích. Sửa comment tiếng Việt tương ứng.
- [x] 4. Thêm assertion khoá việc gỡ endpoint với **teacher session** (student session bị chặn 403 ở bootstrap `app.ts:84-91` trước khi tới kernel): GET + PUT + POST `/api/kernel/settings` → 404 (Origin hợp lệ).

## Verification
- `pnpm --filter server test -- kernel` xanh.
- `pnpm check-types` xanh (packages/api + web + server).
- `pnpm check` (biome) xanh.
