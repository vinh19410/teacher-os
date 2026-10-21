---
title: "Phase 2: Tách server thành router và service, không đổi hành vi"
status: todo
---

# Phase 2: Tách server thành router và service, không đổi hành vi

## Goal

Chuyển toàn bộ code syllabus và curriculum ra khỏi `apps/server/src/routes/kernel.ts` sang `lib/syllabus-curriculum.ts` và `routes/syllabus.ts` mà **không đổi bất kỳ hành vi nào**. Phase này merge riêng (PR 1).

## Context

- Mẫu có sẵn: `assignmentRoutes(deps)` trong `apps/server/src/routes/assignments/index.ts` được mount bằng `kernel.route("/assignments", ...)`; router con tự có `readBody` và `unauthorized` cục bộ.
- Middleware Origin và content-type nằm ở `kernel.use("*")` (đầu `kernelRoutes`), nên router mount sau đó vẫn được bảo vệ. Không được mount router này ở app khác.
- `hasDuplicateIds` và `sameIdSet` chỉ dùng ở hai handler reorder.
- Thứ tự đăng ký quan trọng: route literal `modules/reorder` phải đăng ký trước `modules/:mid`, và `lessons/reorder` trước `lessons/:lid`.

## Files

- Create: `apps/server/src/lib/syllabus-curriculum.ts`
- Create: `apps/server/src/routes/syllabus.ts`
- Modify: `apps/server/src/routes/kernel.ts`
- Không được sửa: `apps/server/src/kernel.test.ts`

## Tasks

### Task 2.1: Đọc đủ phần sẽ di chuyển

- **Goal:** không di chuyển code chưa đọc.
- **Target files:** `apps/server/src/routes/kernel.ts` dòng 189-331, 775-911, 1527-2097.
- **Steps:**
  1. Đọc toàn bộ ba khoảng trên bằng Read (đặc biệt 1685-1930, chưa được đọc khi lập plan).
  2. Ghi ra (trong ghi chú làm việc, không cần file) danh sách mọi biến closure mà các handler dùng ngoài `deps`: ví dụ `readBody`, `unauthorized`, `findClass`, `bodyLimit`.
- **Success criteria:** có danh sách closure đầy đủ.
- **Verify:** no verification needed (đọc).

### Task 2.2: Tạo `lib/syllabus-curriculum.ts`

- **Goal:** các hàm thuần nhận `db`, không phụ thuộc closure của `kernelRoutes`.
- **Target files:** `apps/server/src/lib/syllabus-curriculum.ts` (mới).
- **Steps:**
  1. Chuyển nguyên văn (không đổi logic, không đổi tên) vào file mới và `export`: `MAX_IMPORT_NODES`, `buildImportBatch`, `selectTemplateTree`, `findSyllabus`, `findModule`, `hasDuplicateIds`, `sameIdSet`.
  2. Import các kiểu và bảng cần thiết: `Db` từ `../app`, `BatchItem` từ `drizzle-orm/batch`, `syllabus`, `syllabusLesson`, `syllabusModule` từ `@teacher-os/db/schema/syllabus`, `and`, `asc`, `eq`, `inArray` từ `drizzle-orm`.
  3. Giữ nguyên các comment giải thích (batch order, status reset).
- **Success criteria:** file biên dịch độc lập.
- **Verify:** `pnpm --filter server check-types` exits 0 (có thể còn cảnh báo biến thừa ở kernel.ts cho tới Task 2.4; nếu lỗi chỉ nằm ở kernel.ts thì tiếp tục).

### Task 2.3: Tạo `routes/syllabus.ts`

- **Goal:** một router chứa mọi handler syllabus và curriculum, đường dẫn tuyệt đối y hệt cũ.
- **Target files:** `apps/server/src/routes/syllabus.ts` (mới).
- **Steps:**
  1. Khai báo `export function syllabusRoutes(deps: { getDb(): Db })` trả về `Hono<Env>` với `Env = { Variables: { kernelCtx: KernelCtx } }` (copy kiểu từ `assignments/index.ts`).
  2. Trong hàm, định nghĩa cục bộ `unauthorized(c)` và `readBody(c, schema)` giống hệt bản trong `kernel.ts` (dòng ~143-165).
  3. Định nghĩa cục bộ `findClassPointer(db, classId, orgId)` chỉ chọn `{ id, syllabusId }` từ `classTable` với `and(eq(id), eq(orgId))`. Không import `findClass` từ kernel.
  4. Chuyển nguyên văn các handler, giữ nguyên thứ tự đăng ký: `GET /syllabi`; middleware `POST /syllabi` kèm `bodyLimit` 2 MiB; `POST /syllabi`; `POST /syllabi/:id/replace-content`; `POST /syllabi/:id/modules`; `/modules/reorder`; `/modules/:mid`; `/modules/:mid/remove`; `/modules/:mid/lessons`; `/lessons/reorder`; `/lessons/:lid`; `/lessons/:lid/remove`; `POST /syllabi/:id/remove`; `POST /classes/:id/import-syllabus`; `POST /classes/:id/remove-curriculum`. Thay `findClass(...)` bằng `findClassPointer(...)` ở hai handler lớp (chỉ dùng trường `syllabusId`).
  5. Thay các lời gọi helper bằng import từ `../lib/syllabus-curriculum`.
- **Success criteria:** mọi handler cũ có mặt đúng một lần trong file mới; không handler nào còn trong `kernel.ts` sau Task 2.4.
- **Verify:** `rg -c "^\s*routes\.(get|post)\(" apps/server/src/routes/syllabus.ts` prints `15` (13 đăng ký trong khối `/syllabi` gồm cả middleware bodyLimit của `POST /syllabi`, cộng `import-syllabus` và `remove-curriculum`). Con số 15 lấy từ bản gốc: 13 lệnh `kernel.post("...")` (import-syllabus, remove-curriculum và 11 route `/syllabi`) cộng `kernel.get("/syllabi")` và khối `kernel.post(` kèm middleware. Nếu số khác 15, STOP theo Failure Protocol.

### Task 2.4: Cắm router vào `kernel.ts` và dọn

- **Goal:** `kernel.ts` chỉ còn mount và `POST /classes`.
- **Target files:** `apps/server/src/routes/kernel.ts`.
- **Steps:**
  1. Xoá các helper đã chuyển (dòng 189-331 trừ phần còn được `POST /classes` dùng) và các handler đã chuyển.
  2. `POST /classes` (dòng ~712-773) giữ nguyên nhưng import `buildImportBatch`, `selectTemplateTree`, `findSyllabus`, `MAX_IMPORT_NODES` từ `../lib/syllabus-curriculum`.
  3. Thêm `import { syllabusRoutes } from "./syllabus";` và `kernel.route("/", syllabusRoutes(deps));` ngay trước dòng `kernel.route("/assignments", ...)`.
  4. Xoá import không còn dùng (biome sẽ báo): `syllabusCreateSchema`, `moduleUpsertSchema`, v.v.
  5. Chạy `pnpm exec biome check apps packages` để biome tự sửa thứ tự import; xem `git diff --stat` chỉ gồm 3 file nguồn.
- **Success criteria:** `kernel.ts` không còn từ `syllabusModule` ngoài import dùng bởi code khác; không còn `kernel.post("/syllabi`.
- **Verify:** `rg -c 'kernel\.(post|get)\("/syllabi' apps/server/src/routes/kernel.ts` prints `0` (hoặc không in gì) và exit code 1.

### Task 2.5: Chạy toàn bộ test và đo

- **Goal:** chứng minh không đổi hành vi.
- **Steps:**
  1. `pnpm --filter server test`.
  2. `pnpm --filter server check-types`.
  3. `pnpm exec biome check apps packages`.
  4. `git diff --stat -- apps/server/src/kernel.test.ts`.
  5. `wc -l apps/server/src/routes/kernel.ts`.
- **Success criteria:** mọi test xanh với số test bằng baseline; `kernel.test.ts` không đổi; `kernel.ts` còn ≤ 1616 dòng.
- **Verify:**
  - `pnpm --filter server test` exits 0 and the `Tests` line reports the same total as `reports/phase-01-baseline.md` with `0 failed`.
  - `git diff --stat -- apps/server/src/kernel.test.ts` prints nothing.
  - `wc -l apps/server/src/routes/kernel.ts` prints a number ≤ 1616.

## Success Criteria

- [ ] `kernel.ts` ≤ 1616 dòng, không còn handler syllabus hay curriculum (trừ `POST /classes`).
- [ ] `kernel.test.ts` không đổi và toàn bộ test xanh.
- [ ] `pnpm exec biome check apps packages` và `pnpm --filter server check-types` exit 0.
- [ ] Không thay đổi hành vi: thứ tự route, thông báo lỗi, mã trạng thái và thứ tự batch giữ nguyên.

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
