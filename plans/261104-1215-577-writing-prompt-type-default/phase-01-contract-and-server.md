# Phase 1: Contract & Server Validation

## Goal

Cập nhật Zod contract và server router để cho phép `type: ""` đối với đề Writing có `status: "draft"`, nhưng bắt buộc `type` hợp lệ thuộc catalog part đối với đề có `status: "ready"` (và mọi kỹ năng non-writing) ở cả `POST /api/assignments/prompts` và `PATCH /api/assignments/prompts/:id` (dựa trên trạng thái hiệu lực).

## Target files and symbols

- `packages/api/src/contracts.ts`: `assignmentPromptBaseSchema`, `assignmentPromptCreateSchema`, `assignmentPromptUpdateSchema`.
- `apps/server/src/routes/assignments/index.ts`: handler `POST /prompts` và `PATCH /prompts/:id`.

## Tasks & Steps

### Task 1.1 — Cập nhật Zod schemas cho assignment prompt type
- Goal: `assignmentPromptBaseSchema` cho phép chuỗi `type` rỗng (`max(20)`), và `assignmentPromptCreateSchema.superRefine` cho phép `type: ""` chỉ khi `skill === "writing"` và `status === "draft"`.
- Target files: `packages/api/src/contracts.ts`
- Steps:
  1. Trong `assignmentPromptBaseSchema` (dòng 751): đổi `type: z.string().trim().min(1).max(20)` thành `type: z.string().trim().max(20)`.
  2. Trong `assignmentPromptCreateSchema.superRefine` (dòng 785-793):
     - Lấy `const partTypes = config.types[value.part] ?? [];`
     - Nếu `value.status === "ready"`: nếu `!value.type || !partTypes.includes(value.type)`, gọi `ctx.addIssue({ code: "custom", path: ["type"], message: "invalid type" })`.
     - Nếu `value.status === "draft"`:
       - Nếu `value.skill === "writing"`: nếu `value.type` khác rỗng và không nằm trong `partTypes`, gọi `ctx.addIssue({ code: "custom", path: ["type"], message: "invalid type" })` (chấp nhận `value.type === ""`, nhưng từ chối giá trị rác ngoài catalog).
       - Nếu `value.skill !== "writing"`: bắt buộc `value.type` phải nằm trong `partTypes` (không được để rỗng).
- Success criteria:
  - `assignmentPromptCreateSchema.safeParse` trả về success với draft Writing có `type: ""`
  - Trả về failure với ready Writing có `type: ""`
  - Trả về failure với draft Reading có `type: ""`.
- Verify: `pnpm --filter @teacher-os/api test` exits 0 và không có lỗi schema.

### Task 1.2 — Kiểm tra trạng thái hiệu lực trong PATCH /api/assignments/prompts/:id
- Goal: Khi PATCH cập nhật prompt, router server phải thay thế check cũ và kiểm tra trạng thái hiệu lực (`effectiveStatus` và `effectiveType`) để đảm bảo không thể chuyển prompt sang `ready` nếu `type` vẫn đang là `""`.
- Target files: `apps/server/src/routes/assignments/index.ts`
- Steps:
  1. Trong câu query select `assignmentPrompt` theo `promptId` (dòng 171-184): bổ sung `status: assignmentPrompt.status`.
  2. THAY THẾ khối check cũ ở dòng 191-193 (`if (body.data.type !== undefined && !partTypes.includes(body.data.type)) return c.json({ error: "invalid type" }, 400);`) bằng logic trạng thái hiệu lực:
     ```ts
     const effectiveStatus = body.data.status ?? row.status;
     const effectiveType = body.data.type !== undefined ? body.data.type : row.type;
     if (effectiveStatus === "ready") {
       if (!effectiveType || !partTypes.includes(effectiveType)) {
         return c.json({ error: "invalid type" }, 400);
       }
     } else {
       if (row.skill === "writing") {
         if (effectiveType && !partTypes.includes(effectiveType)) {
           return c.json({ error: "invalid type" }, 400);
         }
       } else {
         if (!effectiveType || !partTypes.includes(effectiveType)) {
           return c.json({ error: "invalid type" }, 400);
         }
       }
     }
     ```
  3. Đảm bảo cập nhật DB ghi nhận `updates.type` và `updates.genre = row.skill === "writing" ? body.data.type : ""` như hiện tại.
- Success criteria:
  - Gửi PATCH chỉ có `{ status: "ready" }` lên một prompt draft có `type: ""` sẽ trả về HTTP 400 lỗi `invalid type`.
  - Gửi PATCH `{ type: "" }` lên một prompt draft Writing giữ status draft trả về HTTP 200 OK.
  - Gửi PATCH `{ status: "ready", type: "opinion" }` trả về HTTP 200 OK.
- Verify: `pnpm --filter server test -- apps/server/src/routes/assignments/tests.test.ts` exits 0 và in `passed`.

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
