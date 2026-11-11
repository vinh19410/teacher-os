---
phase: 1
title: "Phase 1: Auth RBAC & Server Atomic Folder Guards"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Auth RBAC & Server Atomic Folder Guards

<!-- Updated: Red Team Session 1 - Symmetric partial PATCH .set, exact WITH RECURSIVE SQL, cross-org & HTTP gate RBAC tests -->

## Goal

Tách riêng hàm phân quyền đọc/ghi tài liệu trong `@teacher-os/auth/role` khỏi quyền chấm bài và khóa nguyên tử mọi thao tác tạo/di chuyển/đổi tên thư mục trên server bằng SQL `WITH RECURSIVE` để không bao giờ tạo chu trình, vượt trần 5 cấp hay mất thao tác đổi tên/di chuyển đồng thời.

## Files to Create / Modify

- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/packages/auth/src/role.ts`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/packages/auth/src/role.test.ts`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/packages/db/src/schema/material.ts`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/server/src/routes/materials.ts`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/server/src/routes/materials.test.ts`

## Tasks & Steps

### Task 1.1 — Viết test đỏ cho `canReadMaterials` / `canWriteMaterials` (TDD Red)
- **Goal:** Có bộ kiểm thử ma trận vai trò cho miền Tài liệu trước khi viết hàm mới.
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/packages/auth/src/role.test.ts` (import `MATERIAL_READ_ROLES`, `MATERIAL_WRITE_ROLES`, `canReadMaterials`, `canWriteMaterials` từ `./role`).
- **Steps:**
  1. Mở `packages/auth/src/role.test.ts`, thêm import `canReadMaterials`, `canWriteMaterials`, `MATERIAL_READ_ROLES`, `MATERIAL_WRITE_ROLES` từ `./role`.
  2. Thêm khối `describe("canWriteMaterials / canReadMaterials (#646)", ...)` kiểm tra:
     - `MATERIAL_WRITE_ROLES` khớp chính xác `["teacher", "owner", "admin", "class_teacher"]` và `MATERIAL_READ_ROLES` khớp `["teacher", "owner", "admin", "class_teacher", "ta"]`.
     - `teacher`, `owner`, `admin`, `class_teacher` trả `true` cho cả `canWriteMaterials` và `canReadMaterials`.
     - `ta` trả `false` cho `canWriteMaterials` và `true` cho `canReadMaterials`.
     - `"student"`, `""`, `"TEACHER"`, `"unknown"`, `null`, `undefined` trả `false` cho cả hai hàm.
- **Success criteria:** File test gọi trực tiếp các symbol mới và thất bại khi chạy do chưa được export.
- **Verify:** `pnpm --filter @teacher-os/auth test` exits non-zero (expected red state: `canWriteMaterials is not a function` hoặc import undefined; passing test ở bước này là lỗi).

### Task 1.2 — Cài đặt `canReadMaterials` / `canWriteMaterials` độc lập (TDD Green)
- **Goal:** Export hằng và hàm phân quyền riêng cho miền Tài liệu, tách rời hoàn toàn khỏi `GRADING_*`.
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/packages/auth/src/role.ts` (`MATERIAL_WRITE_ROLES`, `MATERIAL_READ_ROLES`, `canWriteMaterials`, `canReadMaterials`).
- **Steps:**
  1. Cuối `packages/auth/src/role.ts`, định nghĩa:
     - `export const MATERIAL_WRITE_ROLES = ["teacher", "owner", "admin", "class_teacher"] as const;`
     - `export const MATERIAL_READ_ROLES = [...MATERIAL_WRITE_ROLES, "ta"] as const;`
     - Hai bảng tra riêng `MATERIAL_WRITE_ROLE_MAP: Record<string, true>` và `MATERIAL_READ_ROLE_MAP: Record<string, true>` (không tham chiếu `GRADING_PUBLISH_ROLES` hay `GRADING_PUBLISH_ROLE_MAP`).
     - `export function canWriteMaterials(role: string | null | undefined): boolean` và `export function canReadMaterials(role: string | null | undefined): boolean` dùng `typeof role === "string" && MAP[role] === true`.
- **Success criteria:** Toàn bộ test của `@teacher-os/auth` xanh.
- **Verify:** `pnpm --filter @teacher-os/auth test` exits 0 and prints `passed`.

### Task 1.3 — Viết test đỏ cho đua đồng thời thư mục, cô lập chéo org và cổng RBAC HTTP trên Server (TDD Red)
- **Goal:** Tái hiện bằng `Promise.all` các lỗi đua chu trình, đổi tên + di chuyển, trùng tên khi di chuyển đồng thời, vượt trần độ sâu 5 cấp, cô lập `parentId` chéo org và cổng `gate` HTTP trong `materials.test.ts`.
- **Target files and symbols:** `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/server/src/routes/materials.test.ts` (describe `"material bank and session materials"`).
- **Steps:**
  1. Mở rộng kiểm thử RBAC HTTP trong `apps/server/src/routes/materials.test.ts`:
     - Seed thêm thành viên có `membership.role = "class_teacher"` (được phép tạo/sửa/xóa tài liệu & thư mục → `200`/`201`) và thành viên có `membership.role = "suspended"` (vai trò lạ không thuộc `MATERIAL_READ_ROLES` → `GET /api/materials` và `GET /api/classes/class-1/sessions/${SESSION_DATE}/materials` trả `403` với `code: "FORBIDDEN"` trực tiếp từ `gate`, không phải `STUDENT_ON_TEACHER_APP`).
     - Kiểm tra `ta-1` nhận `403` `code: "FORBIDDEN"` trên đủ các route ghi còn lại: `PATCH /api/materials/folders/:id`, `DELETE /api/materials/folders/:id`, `PATCH /api/materials/:id`, `DELETE /api/materials/:id`, `POST /api/classes/class-1/sessions/${SESSION_DATE}/materials`, `PUT /api/classes/class-1/sessions/${SESSION_DATE}/materials/files`, `DELETE /api/classes/class-1/sessions/${SESSION_DATE}/materials/:materialId`.
     - Kiểm tra cô lập chéo org cho `parentId`: `teacher-2` (`org-2`) gọi `POST /api/materials/folders` hoặc `PATCH` thư mục của `org-2` với `parentId` trỏ tới `folder.id` của `org-1` → trả `404 FOLDER_NOT_FOUND`.
  2. Thêm test `"concurrent folder moves, renames, and creates enforce cycle, depth, and partial-update invariants atomically (#646)"`:
     - **Kịch bản 1 (đua chéo `A → B` và `B → A`):** Tạo 2 thư mục gốc `Race A`, `Race B`; chạy `Promise.all` hai lệnh `PATCH` đặt cha chéo nhau; assert mã trả về đã sắp xếp là `[200, 400]`, phản hồi `400` có `code === "FOLDER_CYCLE"`, và đọc `GET /api/materials/folders` xác nhận đúng 1 thư mục ở gốc (`parentId === null`) và thư mục kia trỏ vào nó.
     - **Kịch bản 2 (đua đổi tên thuần + di chuyển thuần trên cùng thư mục + va chạm tên khi đua di chuyển):**
       - Tạo `P` ở gốc và `Child` dưới `P`; chạy `Promise.all([PATCH /folders/${Child.id} { name: "Child Renamed" }, PATCH /folders/${Child.id} { parentId: null }])` → cả hai `200`, trạng thái cuối cùng bảo toàn **cả hai** thay đổi (`name === "Child Renamed"` VÀ `parentId === null`, không bên nào ghi đè bên nào).
       - Tạo hai thư mục cùng tên `"Clash"` ở hai cha khác nhau rồi `Promise.all` di chuyển cả hai vào cùng thư mục đích `Dest` → mã trả về đã sắp xếp là `[200, 409]` với `code === "FOLDER_NAME_TAKEN"` (không bao giờ rơi xuống `500`).
     - **Kịch bản 3 (đua vượt trần 5 cấp không phụ thuộc thứ tự ở cả `PATCH` và `POST`):**
       - Với `PATCH`: Tạo chuỗi 3 cấp `L1 -> L2 -> L3` và cây 3 cấp `S1 -> S2 -> S3` + thư mục gốc `R0`. Chạy `Promise.all([PATCH L1 { parentId: R0.id }, PATCH S1 { parentId: L2.id }])` (từng lệnh lẻ đạt cấp 4 và cấp 5 hợp lệ, ghép lại thành cấp 6) → mã trả về đã sắp xếp là `[200, 400]`, lệnh `400` có `code === "FOLDER_TOO_DEEP"`, độ sâu tối đa trong DB `<= 5`.
       - Với `POST`: Tạo chuỗi 4 cấp `D1 -> D2 -> D3 -> D4` và thư mục gốc `D0`. Chạy `Promise.all([PATCH D1 { parentId: D0.id }, POST /folders { name: "D5", parentId: D4.id }])` → đúng 1 lệnh thành công (`200` hoặc `201`) và lệnh kia trả `400` với `code === "FOLDER_TOO_DEEP"`, độ sâu tối đa trong DB `<= 5`.
     - **Kịch bản 4 (phá vòng dữ liệu lệch lịch sử & chặn xác nhận lại vòng cũ):** Chèn trực tiếp 2 dòng chu trình `cyc-x ↔ cyc-y` vào `db` (`schema.materialFolder`): gửi `PATCH /folders/cyc-x { parentId: "cyc-y" }` trả `400 FOLDER_CYCLE`; gửi `PATCH /folders/cyc-x { parentId: validRoot.id }` trả `200`, gỡ chu trình sạch sẽ (`cyc-x.parentId = validRoot.id`, `cyc-y.parentId = "cyc-x"`).
- **Success criteria:** Test mới thất bại trên code hiện tại (đua chéo trả `[200, 200]`, đua đổi tên + di chuyển làm mất tên hoặc mất `parentId`).
- **Verify:** `pnpm --filter server exec vitest run src/routes/materials.test.ts` exits non-zero with assertion failure on concurrent folder tests (passing test ở bước này là lỗi).

### Task 1.4 — Cài đặt guard SQL `WITH RECURSIVE` nguyên tử, partial `PATCH` & tách RBAC trong `materials.ts` (TDD Green)
- **Goal:** Chặn nguyên tử mọi vi phạm chu trình/độ sâu ngay trong câu SQL `INSERT`/`UPDATE`, tách riêng cập nhật `name` và `parentId` để không ghi đè chéo, và chuyển `gate` sang `canReadMaterials`/`canWriteMaterials`.
- **Target files and symbols:**
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/server/src/routes/materials.ts` (`gate`, `routes.post("/materials/folders")`, `routes.patch("/materials/folders/:id")`)
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/packages/db/src/schema/material.ts` (docblock trên `materialFolder`)
- **Steps:**
  1. Trong `apps/server/src/routes/materials.ts:20`, đổi `import { canPublishGrade, canReviewGrade } from "@teacher-os/auth/role"` sang `import { canReadMaterials, canWriteMaterials } from "@teacher-os/auth/role"`. Cập nhật docblock ở dòng 137-138 và `gate` ở dòng 160-164 dùng `canReadMaterials(ctx.role)` / `canWriteMaterials(ctx.role)`.
  2. Cập nhật docblock `packages/db/src/schema/material.ts:19-21` ghi rõ route kiểm nguyên tử độ sâu tối đa và chống vòng lặp bằng `WITH RECURSIVE` ngay trong câu ghi SQL.
  3. Cài đặt chính xác hai câu SQL nguyên tử trong `materialRoutes`:
     - **`folderMoveGuard(orgId: string, id: string, nextParent: string)`** (dùng trong `.where(...)` của `db.update(materialFolder)`):
       ```ts
       function folderMoveGuard(orgId: string, id: string, nextParent: string) {
         return sql`(
           WITH RECURSIVE
             anc(id, parent_id, depth) AS (
               SELECT id, parent_id, 1
               FROM ${materialFolder}
               WHERE id = ${nextParent} AND org_id = ${orgId}
               UNION ALL
               SELECT p.id, p.parent_id, anc.depth + 1
               FROM ${materialFolder} p
               JOIN anc ON p.id = anc.parent_id
               WHERE p.org_id = ${orgId} AND anc.depth <= ${MATERIAL_FOLDER_MAX_DEPTH}
             ),
             sub(id, level) AS (
               SELECT id, 1
               FROM ${materialFolder}
               WHERE id = ${id} AND org_id = ${orgId}
               UNION ALL
               SELECT c.id, sub.level + 1
               FROM ${materialFolder} c
               JOIN sub ON c.parent_id = sub.id
               WHERE c.org_id = ${orgId} AND c.id != ${id} AND sub.level <= ${MATERIAL_FOLDER_MAX_DEPTH}
             )
           SELECT CASE
             WHEN EXISTS (SELECT 1 FROM anc)
               AND EXISTS (SELECT 1 FROM sub)
               AND NOT EXISTS (SELECT 1 FROM anc WHERE anc.id = ${id})
               AND (SELECT max(depth) FROM anc) <= ${MATERIAL_FOLDER_MAX_DEPTH}
               AND (SELECT max(depth) FROM anc) + (SELECT max(level) FROM sub) <= ${MATERIAL_FOLDER_MAX_DEPTH}
             THEN 1
             ELSE 0
           END
         ) = 1`;
       }
       ```
     - **`insertChildFolder(db: Db, orgId: string, id: string, parentId: string, name: string): Promise<FolderRow | null>`**:
       ```ts
       async function insertChildFolder(
         db: Db,
         orgId: string,
         id: string,
         parentId: string,
         name: string,
       ): Promise<FolderRow | null> {
         const rows = (await db.all(sql`
           INSERT INTO ${materialFolder} (id, org_id, parent_id, name)
           SELECT ${id}, ${orgId}, ${parentId}, ${name}
           WHERE (
             WITH RECURSIVE anc(id, parent_id, depth) AS (
               SELECT id, parent_id, 1
               FROM ${materialFolder}
               WHERE id = ${parentId} AND org_id = ${orgId}
               UNION ALL
               SELECT p.id, p.parent_id, anc.depth + 1
               FROM ${materialFolder} p
               JOIN anc ON p.id = anc.parent_id
               WHERE p.org_id = ${orgId} AND anc.depth <= ${MATERIAL_FOLDER_MAX_DEPTH}
             )
             SELECT CASE
               WHEN EXISTS (SELECT 1 FROM anc)
                 AND (SELECT max(depth) FROM anc) + 1 <= ${MATERIAL_FOLDER_MAX_DEPTH}
               THEN 1
               ELSE 0
             END
           ) = 1
           RETURNING id, org_id, parent_id, name, created_at
         `)) as Array<{
           id: string;
           org_id: string;
           parent_id: string | null;
           name: string;
           created_at: number | Date;
         }>;
         const raw = rows[0];
         if (!raw) return null;
         return {
           id: raw.id,
           orgId: raw.org_id,
           parentId: raw.parent_id,
           name: raw.name,
           createdAt:
             raw.created_at instanceof Date
               ? raw.created_at
               : new Date(Number(raw.created_at)),
         };
  4. Cài đặt phân loại lỗi 0 dòng cho cả `POST` (`classifyCreateFailure`) và `PATCH` (`classifyMoveFailure`), đặt cả lần ghi đầu lẫn lượt thử lại 1 lần nằm BÊN TRONG cùng khối `try { ... } catch` bắt `nameTaken`:
     - Với `POST` (`parentId !== null`): khi `insertChildFolder` trả `null`, đọc `loadFolders(db, ctx.orgId)`; nếu `!byId.has(parentId)` trả `404 FOLDER_NOT_FOUND`; tính `const pDepth = folderDepth(byId, parentId);`; nếu `!Number.isFinite(pDepth)` trả `400 FOLDER_CYCLE`; nếu `pDepth + 1 > MATERIAL_FOLDER_MAX_DEPTH` trả `400 FOLDER_TOO_DEEP`; nếu hợp lệ (blocker thoáng qua vừa biến mất), thử lại `insertChildFolder` 1 lần bên trong cùng khối `try`, nếu vẫn `null` thì đọc lại phân loại lần nữa. Trong `catch`, kiểm `nameTaken(db, ctx.orgId, parentId, name)` → `409 FOLDER_NAME_TAKEN`.
     - Với `PATCH /materials/folders/:id`:
       - Đặt `const nameChanged = body.data.name !== undefined;` và `const parentChanged = body.data.parentId !== undefined;`.
       - Đặt `const nextName = nameChanged ? body.data.name! : current.name;` và `const nextParent = parentChanged ? body.data.parentId! : current.parentId;`.
       - Nếu `!nameChanged && !parentChanged`: trả ngay `c.json({ folder: toFolderView(current) })` (schema đã chặn `{}` nhưng giúp kiểu TS chặt chẽ cho `.set(...)`).
       - Khi `parentChanged && nextParent !== null`: luôn chạy kiểm sớm JS (`!byId.has(nextParent)` → `404 FOLDER_NOT_FOUND`, `const pDepth = folderDepth(byId, nextParent);`, `subtree(folders, id).ids.has(nextParent) || !Number.isFinite(pDepth)` → `400 FOLDER_CYCLE`, `pDepth + subtree(folders, id).height > MATERIAL_FOLDER_MAX_DEPTH` → `400 FOLDER_TOO_DEEP`) kể cả khi `nextParent === current.parentId`.
       - Kiểm sớm `if (await nameTaken(db, ctx.orgId, nextParent, nextName, id)) return materialError(c, 409, "FOLDER_NAME_TAKEN");`.
       - Bên trong `try { ... }`, viết hàm nội bộ `runUpdate()` gọi `db.update(materialFolder).set({ ...(nameChanged ? { name: body.data.name } : {}), ...(parentChanged ? { parentId: body.data.parentId } : {}) }).where(and(eq(materialFolder.id, id), eq(materialFolder.orgId, ctx.orgId), parentChanged && nextParent !== null ? folderMoveGuard(ctx.orgId, id, nextParent) : undefined)).returning()`.
       - Nếu `runUpdate()` trả 0 dòng (`!row`):
         - Nếu `!(parentChanged && nextParent !== null)`: trả `404 FOLDER_NOT_FOUND`.
         - Ngược lại, đọc lại `loadFolders(db, ctx.orgId)` để phân loại theo thứ tự: `!byId.has(id)` → `404 FOLDER_NOT_FOUND`; `!byId.has(nextParent)` → `404 FOLDER_NOT_FOUND`; `const rDepth = folderDepth(byId, nextParent);`; `subtree(reloaded, id).ids.has(nextParent) || !Number.isFinite(rDepth)` → `400 FOLDER_CYCLE`; `rDepth + subtree(reloaded, id).height > MATERIAL_FOLDER_MAX_DEPTH` → `400 FOLDER_TOO_DEEP`. Nếu cả 4 kiểm tra đều hợp lệ, gọi lại `runUpdate()` 1 lần ngay trong `try`; nếu vẫn `!row` thì phân loại lại lần nữa.
       - Trong `catch` của `PATCH`: đọc lại dòng `fresh` của `id` trong `ctx.orgId`; nếu `!fresh` trả `404 FOLDER_NOT_FOUND`; tính `const collisionParent = parentChanged ? body.data.parentId! : fresh.parentId;` và `const collisionName = nameChanged ? body.data.name! : fresh.name;`; nếu `await nameTaken(db, ctx.orgId, collisionParent, collisionName, id)` đúng thì trả `409 FOLDER_NAME_TAKEN`, ngược lại `throw error`.
- **Success criteria:** Toàn bộ test trong `materials.test.ts` pass và `materials.ts` không còn import `canPublishGrade`/`canReviewGrade`.
- **Verify:** `pnpm --filter server exec vitest run src/routes/materials.test.ts` exits 0 and `grep -c "canReviewGrade\|canPublishGrade" apps/server/src/routes/materials.ts` prints `0` (grep exit code 1).

## Todo

- [x] Viết unit test ma trận role cho `canReadMaterials` / `canWriteMaterials` trong `packages/auth/src/role.test.ts`
- [x] Cài đặt `MATERIAL_WRITE_ROLES`, `MATERIAL_READ_ROLES`, `canWriteMaterials`, `canReadMaterials` trong `packages/auth/src/role.ts`
- [x] Viết test đua đồng thời `Promise.all` (chu trình, rename+move, va chạm tên, độ sâu, gỡ chu trình cũ, cô lập chéo org & RBAC HTTP) trong `apps/server/src/routes/materials.test.ts`
- [x] Cài đặt guard SQL `WITH RECURSIVE` nguyên tử, partial `PATCH` và tách `canReadMaterials`/`canWriteMaterials` trong `apps/server/src/routes/materials.ts` + cập nhật docblock `packages/db/src/schema/material.ts`

## Verification

- `pnpm --filter @teacher-os/auth test` exits 0.
- `pnpm --filter server exec vitest run src/routes/materials.test.ts` exits 0.
- `pnpm --filter server check-types` exits 0.

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
