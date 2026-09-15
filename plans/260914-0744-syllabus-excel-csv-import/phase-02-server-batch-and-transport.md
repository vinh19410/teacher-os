---
phase: 2
title: "Server batch & transport wiring"
status: completed
priority: P1
effort: 4h
dependencies: [1]
---

# Phase 2: Server batch & transport wiring

## Goal

Server `POST /api/syllabi` insert syllabus + modules + lessons trong **một `db.batch`** khi body có `modules`; web kernel action `add-syllabus` truyền `modules` qua `kernelCommand`; có test server + test mapping.

## Files to Create / Modify

- Modify: `apps/server/src/routes/kernel.ts` (handler `kernel.post("/syllabi", ...)` dòng ~1257)
- Modify: `apps/server/src/kernel.test.ts` (thêm describe block mới)
- Modify: `apps/web/src/lib/data-actions.ts` (payload `add-syllabus`, dòng ~88–98)
- Modify: `apps/web/src/lib/repos/kernel.ts` (case `"add-syllabus"` trong `kernelCommand`, dòng ~80–91)
- Modify: `apps/web/src/lib/repos/kernel.test.ts` (thêm case mapping)

## Key Insights

- **Vì sao extend endpoint** (kongming): endpoint riêng tạo trạng thái "shell syllabus rỗng" khi timeout giữa 2 bước → teacher retry → syllabus rỗng trùng tên. `db.batch` gom toàn bộ cây vào một lệnh.
- **Atomicity là giả định kế thừa, không được test trong plan này**: tài liệu Cloudflare ghi D1 `batch` chạy như transaction; pattern `buildImportBatch` (kernel.ts:226–287, issue #79) đã chạy production với cùng shape. Lưu ý: test + e2e chạy **libsql** (in-memory / local.db), prod chạy **D1** — plan không test rollback trực tiếp; test dưới đây chỉ chứng minh schema reject **trước khi** chạm DB.
- Batch 500 statement là **một** round-trip tới DB — xa ngưỡng timeout 15s của `postKernelCommand`; flow phục hồi "unknown outcome" đã có sẵn trong `useKernelFormSubmit` (reconcile/submitBlocked), không cần code mới.
- **Type của `db.batch`** (drizzle 0.45.2): tham số bắt buộc tuple `[BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]` — mảng thường `[]` + push sẽ fail `pnpm check-types`. Cả 4 call site hiện có đều annotate tuple tường minh (kernel.ts:247, 383, 490, 596); `BatchItem` đã import sẵn (kernel.ts:43).
- Reducer fixture là "historical fixture" (comment tại `data-store-reducer.ts:37`) — payload type tự propagate từ union `KernelAction` ở `data-actions.ts`; **không** dựng cây modules trong reducer; assert thật nằm ở server test.
- `JSON.stringify` tự bỏ field `undefined` → body không có `modules` khi không upload (flow cũ giữ nguyên byte-for-byte).

## Tasks & Steps

### Task 2.1 — Server: batch insert khi có `modules`

- Goal: `POST /api/syllabi` với `modules` tạo toàn bộ cây trong một batch; không có `modules` thì hành vi cũ.
- Target files and symbols: `apps/server/src/routes/kernel.ts` — handler `kernel.post("/syllabi", ...)` (dòng 1257–1277).
- Steps:
  1. Sau `readBody(c, syllabusCreateSchema)` như hiện trạng, thay đoạn insert đơn bằng:
     - Khai báo statements với **type tuple** (bắt buộc):
       ```ts
       const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
       	db.insert(syllabus).values({ /* nguyên vẹn statement insert syllabus hiện có */ }),
       ];
       ```
     - Nếu `input.modules` có giá trị: với mỗi module tại index `mi`, khai báo `const moduleId = crypto.randomUUID();` rồi push `db.insert(syllabusModule).values({ id: moduleId, orgId: ctx.orgId, syllabusId, title: m.title, description: m.description, position: mi })`; với mỗi lesson của module đó tại index `li`, push `db.insert(syllabusLesson).values({ id: crypto.randomUUID(), orgId: ctx.orgId, moduleId, title: l.title, objectives: l.objectives, materials: l.materials, status: l.status, position: li })`.
     - `status` lấy từ payload (đã default `"upcoming"` qua zod); KHÔNG reset về upcoming (khác class-copy — đây là nội dung template do teacher khai báo).
  2. Gọi `await db.batch(statements)` (batch 1 statement khi không có modules cũng hợp lệ — giữ một code path).
  3. Response giữ nguyên: `return c.json({ id: syllabusId } satisfies CreatedResponse, 201);`
  4. KHÔNG đổi `readBody`, guard Origin/content-type, hay bất kỳ handler nào khác.
- Success criteria: body có `modules` → 201 và cây hiện ra trong `GET /api/syllabi`; body không `modules` → 201 như cũ.
- Verify: chạy sau Task 2.2 — `pnpm --filter server test` exits 0.

### Task 2.2 — Server tests cho create-with-content

- Goal: phủ create-with-content, cap 500, status validation, backward-compat.
- Target files and symbols: `apps/server/src/kernel.test.ts` — thêm `describe("syllabus create with imported content (excel/csv import)")`, đặt sau describe class-type (khoảng dòng 369–530). Dùng sẵn `createTestApp()` + helpers `insertUser`, `call` (kernel.test.ts:58, 89, 104).
- Steps — các `test`:
  1. `"create with modules persists the ordered tree"`: `call("/api/syllabi", { method: "POST", session, body: { name, type: "ielts", skills: ["Writing"], totalLessons: 0, modules: [{ title: "M1", description: "d1", lessons: [{ title: "B1", objectives: "o1", materials: "m1", status: "done" }, { title: "B2", objectives: "", materials: "", status: "upcoming" }] }, { title: "M2", description: "", lessons: [] }] } })` → 201 có `{id}`; sau đó `call("/api/syllabi", { session })` → snapshot có đúng syllabus với 2 modules đúng thứ tự (M1, M2), M1 có 2 lessons đúng thứ tự với objectives/materials/status như gửi.
  2. `"schema rejects oversized payload before any write"`: build 501 lesson objects → status 400, body `{ error: "invalid body" }` (zod chặn tại readBody — trước khi statement nào chạy; KHÔNG claim test này chứng minh atomicity), và `GET /api/syllabi` không có syllabus mới.
  3. `"invalid lesson status in modules is 400"`: status `"finished"` → 400.
  4. `"create without modules still works (backward compat)"`: body 6 field cũ → 201.
- Success criteria: 4 test xanh.
- Verify: `pnpm --filter server test` exits 0, output chứa `passed` cho describe mới.

### Task 2.3 — Kernel action + transport wiring

- Goal: action `add-syllabus` mang được `modules` từ modal tới server.
- Target files and symbols:
  - `apps/web/src/lib/data-actions.ts` — variant `add-syllabus` (dòng 88–98): thêm vào payload `modules?: SyllabusModuleContent[]` và import type từ `@teacher-os/api/contracts`.
  - `apps/web/src/lib/repos/kernel.ts` — case `"add-syllabus"` (dòng 80–91): thêm 1 dòng `modules: action.payload.modules,` vào body (giữ nguyên việc KHÔNG truyền `id`).
  - `apps/web/src/lib/data-store-reducer.ts`: KHÔNG cần sửa — reducer import `KernelAction` từ `data-actions.ts` nên type tự propagate; fixture không dựng cây modules.
- Steps:
  1. Sửa 2 file theo trên, đúng thứ tự liệt kê.
  2. Không thêm action type mới — dùng lại `add-syllabus`.
- Success criteria: `pnpm check-types` pass; grep thấy `modules` trong cả 2 file.
- Verify: `pnpm check-types` exits 0.

### Task 2.4 — Mapping test cho `kernelCommand`

- Goal: khóa contract mapping bằng test.
- Target files and symbols: `apps/web/src/lib/repos/kernel.test.ts` — thêm test cạnh test "add-syllabus drops the client id" hiện có (dòng ~426).
- Steps — 2 test:
  1. `"add-syllabus passes modules through to the create body"`: gọi `kernelCommand({ type: "add-syllabus", payload: {...6 field, modules: [{ title: "M", description: "", lessons: [] }] } })` → `body.modules` deep-equal mảng đã truyền.
  2. `"add-syllabus omits modules when not provided"`: payload không modules → `body.modules === undefined`.
- Success criteria: 2 test xanh.
- Verify: `pnpm --filter web test -- kernel` exits 0, output chứa `passed`.

## Verification (cổng cuối phase)

- `pnpm --filter server test` → exit 0.
- `pnpm --filter web test -- kernel` → exit 0.
- `pnpm check-types` → exit 0.

## Risk Assessment

- **Opaque 400**: `readBody` vứt zod path/message — đã chấp nhận (không sửa trong scope); test 2.2 assert đúng chuỗi `invalid body`.
- **Snapshot amplification (đã biết, chấp nhận trong scope)**: kernel bus refetch toàn bộ snapshot `/api/kernel` sau mỗi write (`repos/kernel.ts:505–510`), collection `syllabi` chứa full cây modules/lessons. Import 1-click làm cây lớn dễ hơn trước (trước đây phải bấm 500 lần). Không thay đổi kiến trúc trong plan này — ghi nhận follow-up: cap tổng nodes per-org hoặc lazy-load cây syllabus khi snapshot phình thật.
- Giới hạn batch DB: cap 500 đã khớp `MAX_IMPORT_NODES` (kernel.ts:217) — schema chặn trước khi chạm DB.
- Nếu `pnpm check-types` fail ở `db.batch`: kiểm tra đã annotate tuple `[BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]` chưa (xem Key Insights).

## Security Considerations

- Guard Origin + Content-Type JSON giữ nguyên — request upload vẫn là JSON thường, không mở multipart.
- orgId lấy từ `kernelCtx` (server-side, kernel.ts:1258–1268), client không gửi orgId — modules insert luôn org-scoped; body giả mạo không thể inject vào org khác.
- Ids do server sinh (`crypto.randomUUID()`), client id không được tin (nguyên tắc hiện có `findModule`).
- `.max()` string trong schema (Phase 1) chặn body khổng lồ lọt qua zod.

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
