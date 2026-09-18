---
title: "Phase 1: Kernel schema, contract & POST route (db + api + server + web glue)"
description: "Tạo bảng assignment_prompt (drizzle + migration D1), contract zod + KernelAssignmentPromptRow + mở rộng KernelSnapshot, POST /api/assignments/prompts org-scoped, và web glue tối thiểu (collection key + mapper + MockData slice) để workspace stay-green."
status: pending
---

# Phase 1: Kernel schema, contract & POST route

## Goal

Ngân hàng đề có nơi lưu thật: bảng mới org-scoped, contract chia sẻ, endpoint tạo đề chạy được, và snapshot kernel mang theo danh sách đề để web đọc qua đúng một đường `['kernel']` duy nhất.

## Key Insights

- Bảng `assignment` hiện tại (packages/db/src/schema/assignment.ts:19) là **grading-only, bắt buộc `studentId`** — không thể tái dùng cho đề chưa giao lớp. Ngân hàng đề cần bảng riêng không FK học viên.
- Snapshot là đường đọc duy nhất của web (apps/web/src/lib/repos/kernel.ts:393-426). Mở rộng `KernelSnapshot` bắt buộc đồng bộ `SNAPSHOT_COLLECTION_KEYS` (apps/web/src/lib/repos/kernel.ts:354-377) — guard compile-time `MissingSnapshotKey extends never` sẽ **fail check-types** nếu thiếu, nên web glue tối thiểu phải land cùng phase này (khác plan #179 nơi settings không đi qua snapshot).
- Endpoint mount **bên trong** assignments sub-router (apps/server/src/routes/assignments/index.ts:13-18) để kế thừa Origin + JSON content-type CSRF guard của kernel router — không mount standalone.
- Precedent tạo mới gần nhất: `reportRoutes` POST (apps/server/src/routes/reporting/index.ts:54-103) — zod `.strict()`, verify quan hệ cùng org, `crypto.randomUUID()`, trả `CreatedResponse` 201.

## Files to Create / Modify

- Create: `packages/db/src/schema/assignment-prompt.ts` — bảng `assignment_prompt`
- Modify: `packages/db/src/schema/index.ts` — export bảng mới (theo pattern `export * from "./assignment";` dòng 1)
- Create: `packages/db/src/migrations/0017_*.sql` — sinh bằng `pnpm --filter db db:generate`
- Modify: `packages/api/src/contracts.ts` — schema tạo đề + row type + `KernelSnapshot.assignmentPrompts`
- Modify: `apps/server/src/routes/snapshot.ts` — select + map `assignment_prompt` vào snapshot
- Modify: `apps/server/src/routes/assignments/index.ts` — POST `/prompts`
- Modify (web glue, giữ check-types xanh): `apps/web/src/lib/repos/kernel.ts` (`SNAPSHOT_COLLECTION_KEYS` + `mapKernelSnapshot`), Create `apps/web/src/lib/repos/assignment-prompts.ts` (mapper), Modify `apps/web/src/lib/mock-data.ts` (interface + slice + seed rỗng), Modify `apps/web/src/lib/data-store-reducer.ts` (case inert theo fixture pattern của `create-report` dòng 81-84)

## Implementation Steps

1. **Schema** `packages/db/src/schema/assignment-prompt.ts`:

   ```ts
   /**
    * Ngân hàng đề Writing (design "Thêm đề vào ngân hàng", 2026-09-18).
    * Một row là MỘT đề chưa gắn lớp/học viên — giao bài (tạo row `assignment`)
    * là luồng riêng ở trang Lớp học, nên không có FK student/class ở đây.
    * genre là free id dạng đề (chart/table/.../discuss/...) — thêm dạng đề mới
    * không cần migration.
    */
   export const assignmentPrompt = sqliteTable(
     "assignment_prompt",
     {
       id: text("id").primaryKey(),
       orgId: text("org_id")
         .notNull()
         .references(() => organization.id, { onDelete: "cascade" }),
       task: text("task").notNull(), // "task1" | "task2"
       genre: text("genre").notNull(),
       title: text("title").notNull(),
       band: text("band").notNull().default("7.0"), // "6.0".."7.5"
       source: text("source").notNull().default(""),
       prompt: text("prompt").notNull(),
       note: text("note").notNull().default(""),
       status: text("status").notNull().default("draft"), // "draft" | "ready"
       createdAt: integer("created_at", { mode: "timestamp_ms" })
         .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
         .notNull(),
     },
     (table) => [index("assignment_prompt_org_idx").on(table.orgId)],
   );
   ```

2. **Migration**: `pnpm --filter db db:generate` — kiểm tra file SQL sinh ra chỉ CREATE TABLE + INDEX, không đụng bảng khác.

3. **Contract** `packages/api/src/contracts.ts` (đặt cạnh `assignmentGradeSchema` dòng 261):

   ```ts
   /**
    * Ngân hàng đề — tạo đề Writing để lưu vào bank (design 2026-09-18).
    * `status` luôn tường minh trên wire (giống reportCreateSchema):
    * "ready" = hiện khi giao từ trang Lớp học, "draft" = bản nháp riêng tư.
    */
   export const assignmentPromptCreateSchema = z
     .object({
       task: z.enum(["task1", "task2"]),
       genre: z.string().trim().min(1).max(40),
       title: z.string().trim().min(1).max(200),
       band: z.enum(["6.0", "6.5", "7.0", "7.5"]),
       source: z.string().trim().max(200),
       prompt: z.string().trim().min(1).max(5000),
       note: z.string().max(2000),
       status: z.enum(["draft", "ready"]),
     })
     .strict();
   export type AssignmentPromptCreate = z.infer<typeof assignmentPromptCreateSchema>;

   export interface KernelAssignmentPromptRow {
     id: string;
     task: string;
     genre: string;
     title: string;
     band: string;
     source: string;
     prompt: string;
     note: string;
     status: "draft" | "ready" | string;
   }
   ```

   Thêm vào `KernelSnapshot` (dòng 573-585): `assignmentPrompts: KernelAssignmentPromptRow[];`

4. **Snapshot** `apps/server/src/routes/snapshot.ts`: thêm select org-scoped `orderBy(asc(assignmentPrompt.createdAt), asc(assignmentPrompt.id))` vào `Promise.all` (dòng 91) và map thẳng field-for-field vào `snapshot.assignmentPrompts` (return cuối hàm, dòng 197-278).

5. **POST route** `apps/server/src/routes/assignments/index.ts` — thêm `routes.post("/prompts", ...)` theo đúng khung `readBody` có sẵn của file:
   - kernelCtx guard 401; `assignmentPromptCreateSchema.safeParse` → 400 `"invalid body"`;
   - `db.insert(assignmentPrompt).values({ id: crypto.randomUUID(), orgId: ctx.orgId, ...body.data })` `.returning({ id })` → 201 `CreatedResponse`;
   - không cần verify quan hệ (không FK student/class) — org scope đã chặn tenant-leak.

6. **Web glue (giữ xanh sau phase)**:
   - `apps/web/src/lib/repos/assignment-prompts.ts`: `mapAssignmentPrompts(snapshot): AssignmentPrompt[]` map field-for-field (pure, mirror repos/assignments.ts);
   - `mock-data.ts`: `export interface AssignmentPrompt { id; task; genre; title; band; source; prompt; note; status: "draft" | "ready" }`, thêm `assignmentPrompts: AssignmentPrompt[]` vào `MockData` (dòng 150) + vào `KernelHydratedData` pick (dòng 162-168) + seed mock rỗng `[]`;
   - `repos/kernel.ts`: thêm `"assignmentPrompts"` vào `SNAPSHOT_COLLECTION_KEYS` + `mapKernelSnapshot` gọi `mapAssignmentPrompts`;
   - `data-store-reducer.ts`: thêm `"create-assignment-prompt"` vào nhóm case inert (dòng 81-84) — snapshot refresh là nguồn truth.

## Verification

```bash
pnpm --filter db db:generate          # sinh migration, review SQL
pnpm check-types                      # guard SNAPSHOT_COLLECTION_KEYS phải xanh
cd apps/server && npx vitest run src/kernel.test.ts
pnpm check                            # biome sạch (không chạy qua pipe)
```

- POST hợp lệ → 201 `{id}`; GET `/api/kernel` snapshot có `assignmentPrompts` đủ field.
- Body thiếu field / enum sai / field lạ (strict) → 400; không session → 401.
- Hai org: đề org A không xuất hiện trong snapshot org B.
