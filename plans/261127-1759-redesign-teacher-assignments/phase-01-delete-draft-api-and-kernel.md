---
phase: 1
title: "Backend DELETE /api/assignments/prompts/:id & Web Kernel"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Backend `DELETE /api/assignments/prompts/:id` & Web Kernel

## Goal

Cung cấp endpoint xóa bản nháp nguyên tử `DELETE /api/assignments/prompts/:id` (chống `ON DELETE CASCADE` phá dữ liệu học viên, chặn `ta`, chặn org khác/library/demo/ready) và nối hoàn chỉnh action `delete-assignment-prompt` trên kernel command bus phía web.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts`
- Create: `apps/server/src/routes/assignments/prompt-delete.test.ts`
- Modify: `apps/server/src/lib/assignments/assignment-service.ts`
- Modify: `apps/server/src/routes/assignments/index.ts`
- Modify: `apps/web/src/lib/data-actions.ts`
- Modify: `apps/web/src/lib/repos/kernel.ts`
- Modify: `apps/web/src/lib/data-store-reducer.ts`
- Modify: `apps/web/src/lib/use-kernel-form-submit.ts`
- Modify: `apps/web/src/lib/repos/assignment-prompts.test.ts`

## Tasks & Steps

### Task 1.1 — Thêm mã lỗi xóa bản nháp vào `ASSIGNMENT_PROMPT_ERROR_CODES`
- **Goal:** Có hằng số mã lỗi dùng chung giữa server và web cho trạng thái từ chối xóa bản nháp (`409`).
- **Target files and symbols:** `packages/api/src/contracts.ts` (`ASSIGNMENT_PROMPT_ERROR_CODES`).
- **Steps:**
  1. Mở `packages/api/src/contracts.ts` quanh `ASSIGNMENT_PROMPT_ERROR_CODES` (dòng ~1513).
  2. Thêm hai khóa:
     - `DELETE_NOT_DRAFT: "PROMPT_DELETE_NOT_DRAFT"`
     - `DELETE_REFERENCED: "PROMPT_DELETE_REFERENCED"`
- **Success criteria:** `ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_NOT_DRAFT` và `ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED` export ra từ `@teacher-os/api/contracts`.
- **Verify:** `no verification needed` (kiểm chứng trực tiếp qua Task 1.2 & Phase 1 typecheck).

### Task 1.2 — Viết test TDD đỏ cho `DELETE /api/assignments/prompts/:id`
- **Goal:** Có bộ test thất bại trước khi triển khai, chứng minh đầy đủ kiểm tra quyền, tenant isolation, status gate và chống xóa nhầm đề có tham chiếu.
- **Target files and symbols:** `apps/server/src/routes/assignments/prompt-delete.test.ts`.
- **Steps:**
  1. Tạo `apps/server/src/routes/assignments/prompt-delete.test.ts` dùng cùng pattern libsql in-memory + `migrate` + `buildApp` của `prompt-content-lock.test.ts`.
  2. Seed 2 org (`org-1`, `org-2`), user `teacher` (`org-1`), user `ta` (`org-1`), user `teacher-2` (`org-2`), lớp + học viên + prompt test.
  3. Viết các test case cho `DELETE /api/assignments/prompts/:id`:
     - Xóa bản nháp sạch của `org-1` → `200 { id }`, select lại bảng `assignment_prompt` trả 0 dòng.
     - User vai trò `ta` → `403`, bản nháp vẫn còn.
     - Prompt không tồn tại / thuộc `org-2` / có `libraryRef != null` / id bắt đầu bằng `demo-prompt:` → `404`.
     - Prompt `status === "ready"` → `409` với `code: ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_NOT_DRAFT`, prompt vẫn còn.
     - Prompt đã có dòng `class_assignment` + `class_assignment_target` rồi bị lật `status = "draft"` → `409` với `code: ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED`, cả `assignment_prompt`, `class_assignment`, `class_assignment_target` đều còn nguyên vẹn.
     - Bản nháp được tham chiếu bởi `assignment_test_part` → `409` với `code: ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED`.
     - Bản nháp được tham chiếu bởi `study_pack_item` (`sourceKind = "org_prompt"`) → `409` với `code: ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED`.
- **Success criteria:** Chạy file test thất bại với `404` vì route `DELETE /api/assignments/prompts/:id` chưa tồn tại.
- **Verify:** `pnpm --filter server exec vitest run src/routes/assignments/prompt-delete.test.ts` exits non-zero (HTTP 404/assertion failure; passing test here is a failure).

### Task 1.3 — Triển khai `deleteAssignmentPrompt` nguyên tử và route `DELETE /prompts/:id`
- **Goal:** Server thực thi `DELETE` nguyên tử trong 1 câu SQL kèm phân loại lỗi 404/409 chính xác và chặn `ta` trả `403`.
- **Target files and symbols:**
  - `apps/server/src/lib/assignments/assignment-service.ts` (`deleteAssignmentPrompt`)
  - `apps/server/src/routes/assignments/index.ts` (`assignmentRoutes`)
- **Steps:**
  1. Trong `apps/server/src/lib/assignments/assignment-service.ts`, thêm `export async function deleteAssignmentPrompt(db: Db, orgId: string, promptId: string): Promise<AssignmentServiceResult<{ id: string }>>`:
     - Thực hiện `db.delete(assignmentPrompt).where(and(eq(assignmentPrompt.id, promptId), eq(assignmentPrompt.orgId, orgId), isNull(assignmentPrompt.libraryRef), notLike(assignmentPrompt.id, "demo-prompt:%"), eq(assignmentPrompt.status, "draft"), sql\`NOT EXISTS (SELECT 1 FROM ${classAssignment} WHERE ${classAssignment.promptId} = ${assignmentPrompt.id})\`, sql\`NOT EXISTS (SELECT 1 FROM ${assignmentTestPart} WHERE ${assignmentTestPart.promptId} = ${assignmentPrompt.id})\`, sql\`NOT EXISTS (SELECT 1 FROM ${studyPackItem} WHERE ${studyPackItem.sourceKind} = 'org_prompt' AND ${studyPackItem.sourceId} = ${assignmentPrompt.id})\`)).returning({ id: assignmentPrompt.id })`.
     - Nếu `deleted[0]` tồn tại → trả `{ ok: true, data: { id: deleted[0].id } }`.
     - Ngược lại truy vấn `assignmentPrompt` theo `and(eq(assignmentPrompt.id, promptId), eq(assignmentPrompt.orgId, orgId), isNull(assignmentPrompt.libraryRef), notLike(assignmentPrompt.id, "demo-prompt:%"))`:
       - Không có dòng → trả `{ ok: false, status: 404, error: "prompt not found" }`.
       - `row.status !== "draft"` → trả `{ ok: false, status: 409, error: "only draft prompts can be deleted", code: ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_NOT_DRAFT }`.
       - Còn lại → trả `{ ok: false, status: 409, error: "prompt is referenced and cannot be deleted", code: ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED }`.
  2. Trong `apps/server/src/routes/assignments/index.ts`:
     - Import `canPublishGrade` từ `@teacher-os/auth/role` và `deleteAssignmentPrompt` từ `../../lib/assignments/assignment-service`.
     - Thêm `routes.delete("/prompts/:id", async (c) => { ... })`:
       - Kiểm `const ctx = c.get("kernelCtx"); if (!ctx) return unauthorized(c);`
       - Kiểm `if (ctx.role !== undefined && !canPublishGrade(ctx.role)) return c.json({ error: "forbidden", code: "FORBIDDEN" }, 403);`
       - Gọi `deleteAssignmentPrompt(deps.getDb(), ctx.orgId, c.req.param("id"))`.
       - Nếu `!result.ok` trả `c.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, result.status)`.
       - Trả `c.json(result.data satisfies CreatedResponse)`.
- **Success criteria:** Toàn bộ test trong `prompt-delete.test.ts` pass xanh.
- **Verify:** `pnpm --filter server exec vitest run src/routes/assignments/prompt-delete.test.ts` exits 0.

### Task 1.4 — Nối action `delete-assignment-prompt` trên web kernel & map thông báo lỗi
- **Goal:** Frontend có `KernelAction` xóa bản nháp hoàn chỉnh kèm mapping lỗi 409 tiếng Việt và auto-refresh snapshot khi xung đột.
- **Target files and symbols:**
  - `apps/web/src/lib/data-actions.ts` (`KernelAction`)
  - `apps/web/src/lib/repos/kernel.ts` (`kernelCommand`)
  - `apps/web/src/lib/data-store-reducer.ts` (`reducer`)
  - `apps/web/src/lib/use-kernel-form-submit.ts` (`lockFailureMessage`, `useKernelFormSubmit`)
  - `apps/web/src/lib/repos/assignment-prompts.test.ts`
- **Steps:**
  1. Thêm `| { type: "delete-assignment-prompt"; promptId: string }` vào `KernelAction` trong `data-actions.ts`.
  2. Thêm `case "delete-assignment-prompt": return { path: \`/api/assignments/prompts/${encodeURIComponent(action.promptId)}\`, method: "DELETE", body: undefined };` vào `kernelCommand` trong `repos/kernel.ts`.
  3. Thêm `case "delete-assignment-prompt":` vào nhóm pass-through trong `data-store-reducer.ts` trả về `state`.
  4. Trong `use-kernel-form-submit.ts`, xử lý `ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_NOT_DRAFT` và `ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED` trong `lockFailureMessage`, đồng thời kích hoạt `void refresh()` khi nhận hai mã lỗi 409 này.
  5. Bổ sung unit test cho `kernelCommand({ type: "delete-assignment-prompt", promptId: "ap-1" })` trong `apps/web/src/lib/repos/assignment-prompts.test.ts`.
- **Success criteria:** Mapping command và error handling biên dịch sạch, test pass.
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos/assignment-prompts.test.ts && pnpm check-types` exits 0.

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
