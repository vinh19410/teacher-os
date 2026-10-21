---
title: "Phase 4: Factory route nội dung và contract mới"
status: todo
---

# Phase 4: Factory route nội dung và contract mới

## Goal

Thêm hai nhóm route theo ngữ cảnh (`/syllabus-templates/...` và `/classes/:id/curriculum/...`) dùng chung một bộ handler nội dung qua factory, và giữ route cũ làm alias để web cũ không gãy khi deploy.

## Context

- Design: D4, D5, D6 trong [design-decisions.md](./reports/design-decisions.md).
- Hiện tại 8 handler nội dung (module và lesson) nằm trong `routes/syllabus.ts` dưới `/syllabi/:id/...` và dùng `c.req.param("id")` làm id syllabus. Với route `/classes/:id/curriculum/...` thì `:id` là **id lớp**, nên handler trong factory chỉ được dùng `resolved.id` do `resolve()` trả về, tuyệt đối không dùng `c.req.param("id")` làm id syllabus.
- Thứ tự đăng ký trong cùng một nhóm: `modules/reorder` trước `modules/:mid`; `lessons/reorder` trước `lessons/:lid`.
- Handler lesson upsert cũ trả `{ error: "lesson not found" }` (404) khi lesson không thuộc module và syllabus; các handler khác trả `{ error: "syllabus not found" }` khi syllabus không tìm thấy. Giữ đúng các thông báo này.
- D4: hành vi ghi `status` của lesson **không đổi** ở cả ba nhóm (thêm: `input.status ?? "upcoming"`; sửa: `input.status ?? lesson.status`). Factory không có tham số chính sách `status`.
- Bảo mật: alias `/syllabi/:id/replace-content` hiện cho ghi đè nội dung của một bản copy lớp. Alias này phải dùng `findTemplate` (bản copy → 404), giống `remove`. Nếu một test cũ phụ thuộc hành vi đó, dừng và hỏi kongming, không tự bỏ test.
- Mọi route ghi mới (tạo template, import, replace-content) giữ giới hạn body 2 MiB như `POST /syllabi` hiện tại; các route module/lesson nhỏ dùng `.max()` của zod sẵn có, không thêm giới hạn mới.

## Files

- Create: `apps/server/src/routes/syllabus-content-routes.ts`
- Modify: `apps/server/src/routes/syllabus.ts`
- Modify: `apps/server/src/kernel.test.ts` (chỉ thêm khối describe mới)

## Route table

| Nhóm | Đường dẫn gốc | Resolver |
|---|---|---|
| Template | `/syllabus-templates/:id` | `findTemplate(db, id, orgId)` |
| Giáo trình của lớp | `/classes/:id/curriculum` | `findClassCurriculum(db, id, orgId)` (join `class` để chắc lớp thuộc `orgId`) |
| Alias cũ | `/syllabi/:id` | `findSyllabus(db, id, orgId)` |

Tám đường dẫn nội dung dưới mỗi gốc (đăng ký theo đúng thứ tự này): `POST /modules`, `POST /modules/reorder`, `POST /modules/:mid`, `POST /modules/:mid/remove`, `POST /modules/:mid/lessons`, `POST /modules/:mid/lessons/reorder`, `POST /modules/:mid/lessons/:lid`, `POST /modules/:mid/lessons/:lid/remove`.

Route chỉ của template: `POST /syllabus-templates` (tạo, giới hạn body 2 MiB như `POST /syllabi`), `POST /syllabus-templates/:id/replace-content`, `POST /syllabus-templates/:id/remove`.

Route chỉ của lớp: `POST /classes/:id/curriculum/import` (body `importSyllabusSchema`), `POST /classes/:id/curriculum/remove` (body `removeCurriculumSchema`).

## Tasks

### Task 4.1: Tạo factory `mountContentRoutes`

- **Goal:** một nơi duy nhất chứa tám handler nội dung.
- **Target files:** `apps/server/src/routes/syllabus-content-routes.ts` (mới).
- **Steps:**
  1. Đọc lại tám handler hiện có trong `routes/syllabus.ts` (sau phase 2) để chép đúng logic.
  2. Khai báo `export function mountContentRoutes(router: Hono<Env>, opts: { basePath: string; resolve: (c: Context<Env>, db: Db, orgId: string) => Promise<{ id: string } | undefined>; deps: { getDb(): Db }; readBody; unauthorized })`. Truyền `readBody` và `unauthorized` từ router cha để không viết lại lần nữa.
  3. Với mỗi handler: lấy `ctx` (401 nếu thiếu), `readBody`, gọi `const sy = await opts.resolve(c, db, ctx.orgId); if (!sy) return c.json({ error: "syllabus not found" }, 404);` (riêng lesson upsert: `{ error: "lesson not found" }`), rồi chạy logic cũ thay mọi `id` bằng `sy.id`. Mọi truy vấn và lệnh ghi giữ `orgId`.
  4. Giữ nguyên logic `status` cũ, chép nguyên văn.
  5. Đăng ký theo thứ tự trong bảng route.
- **Success criteria:** factory không đọc `:id` từ URL; chỉ dùng `sy.id`.
- **Verify:** `rg -n 'req\.param\(|\.param\(\)' apps/server/src/routes/syllabus-content-routes.ts` prints only lines whose argument is `"mid"` or `"lid"` (không có `"id"`), và `rg -c 'req\.param\("id"\)' apps/server/src/routes/syllabus-content-routes.ts` prints `0` hoặc không in gì (exit code 1).

### Task 4.2: Mount ba nhóm và gom handler dùng chung

- **Goal:** `routes/syllabus.ts` mount factory ba lần và đăng ký các route riêng.
- **Target files:** `apps/server/src/routes/syllabus.ts`.
- **Steps:**
  1. Xoá tám handler nội dung cũ khỏi `routes/syllabus.ts`; thay bằng ba lần gọi `mountContentRoutes` theo bảng route (alias cũ dùng `findSyllabus`).
  2. Tách handler dùng chung thành hàm có tên trong file này để đăng ký ở cả đường mới và đường cũ: `createTemplateHandler`, `replaceContentHandler`, `removeTemplateHandler`, `importCurriculumHandler`, `removeCurriculumHandler`. Đăng ký:
     - `POST /syllabus-templates` và `POST /syllabi` (cùng middleware bodyLimit 2 MiB trên cả hai đường);
     - `POST /syllabus-templates/:id/replace-content` và `POST /syllabi/:id/replace-content`;
     - `POST /syllabus-templates/:id/remove` và `POST /syllabi/:id/remove`;
     - `POST /classes/:id/curriculum/import` và `POST /classes/:id/import-syllabus`;
     - `POST /classes/:id/curriculum/remove` và `POST /classes/:id/remove-curriculum`.
  3. Hàm dùng chung nhận resolver làm tham số; `replace-content` và `remove` luôn dùng `findTemplate` ở cả đường mới lẫn alias (bản copy → 404).
  4. `importCurriculumHandler`: resolver lớp lọc `orgId`; nếu insert vi phạm unique `syllabus_class_unique` mà `findClassCurriculum` không thấy hàng (khác org), trả `409 { error: "class already has a curriculum" }`, không để lọt 500.
  5. Thêm comment ngắn trên mỗi nhóm alias: "Alias tạm cho web cũ, xoá ở phase gỡ alias".
- **Success criteria:** không còn handler lặp; route cũ và mới cùng gọi một hàm.
- **Verify:** `pnpm --filter server test` exits 0 with `0 failed` (test cũ vẫn chạy qua alias vì `kernel.test.ts` chưa được chuyển ở Task 4.4); `pnpm --filter server check-types` exits 0.

### Task 4.3: Test route theo ngữ cảnh

- **Goal:** khoá hành vi của hai nhóm route mới.
- **Target files:** `apps/server/src/kernel.test.ts` (thêm `describe("syllabus routes by context (templates vs class curriculum)", ...)` sau khối pointer invariant của phase 3).
- **Steps:**
  1. Smoke happy path cho **mỗi** đường nội dung (8 đường) ở nhóm `/syllabus-templates/:id`: tạo module, reorder module, sửa module, thêm lesson, reorder lesson, sửa lesson, xoá lesson, xoá module. Một test tuần tự là đủ.
  2. Cùng tám bước cho nhóm `/classes/:id/curriculum` trên một lớp đã import template.
  3. Chéo ngữ cảnh: dùng id của **bản copy lớp** ở `/syllabus-templates/:copyId/modules` → 404; dùng id của **template** ở `/classes/:templateId/...` (không phải lớp) → 404; `/classes/:lopKhac/curriculum/modules` khi lớp khác chưa có copy → 404 với `{ error: "syllabus not found" }`.
  4. Chéo org: session của org khác gọi cả ba nhóm trên tài nguyên của org đầu → 404, và không có hàng nào thay đổi (đếm `syllabus_module` trước và sau).
  5. Alias không mở lỗ: `POST /api/syllabi/:copyId/replace-content` → 404 và nội dung bản copy không đổi; `POST /api/syllabi/:copyId/remove` → 404.
  6. Import và gỡ qua đường mới: `POST /classes/:id/curriculum/import` → 201 và con trỏ đúng; lần hai → 409; `POST /classes/:id/curriculum/remove` → `{ ok: true }`; invariant con trỏ (helper phase 3) đúng sau mỗi bước.
  7. Một test bảo vệ alias: `POST /api/classes/:id/import-syllabus` rồi `POST /api/syllabi/:copyId/modules` vẫn thành công (alias còn sống đến phase 8). Chỉ test này còn gọi route cũ.
- **Success criteria:** các test mới xanh.
- **Verify:** `pnpm --filter server exec vitest run src/kernel.test.ts -t "syllabus routes by context"` exits 0, prints `passed` with `0 failed`, and the `skipped` count is 0 (nếu in `skipped` > 0 hoặc `0 tests`, bộ lọc `-t` không khớp: dừng).

### Task 4.4: Chuyển test cũ sang route mới

- **Goal:** `kernel.test.ts` không phụ thuộc alias (trừ một test bảo vệ ở Task 4.3), để phase 8 chỉ còn xoá code.
- **Target files:** `apps/server/src/kernel.test.ts`.
- **Steps:**
  1. `import-syllabus` → `curriculum/import`, `remove-curriculum` → `curriculum/remove` (thay cơ học).
  2. `POST /api/syllabi` → `/api/syllabus-templates`; `/api/syllabi/${id}/replace-content|remove` → `/api/syllabus-templates/${id}/...`; `/api/syllabi/${id}/modules...` với `id` template → `/api/syllabus-templates/${id}/modules...`; với `id` bản copy → `/api/classes/${classId}/curriculum/modules...`. Làm từng khối `describe`, chạy test sau mỗi khối.
  3. Không đổi `GET /api/syllabi`.
- **Success criteria:** test xanh; chỉ test bảo vệ alias còn gọi route cũ.
- **Verify:** `rg -c "/api/syllabi/|/import-syllabus|/remove-curriculum" apps/server/src/kernel.test.ts` prints a number ≤ 4 (các dòng của test bảo vệ và test alias bị chặn); `pnpm --filter server test` exits 0 with `0 failed`.

### Task 4.5: Toàn bộ kiểm tra

- **Steps:** `pnpm --filter server test`; `pnpm --filter server check-types`; `pnpm exec biome check apps/server packages`; `wc -l apps/server/src/routes/syllabus.ts apps/server/src/routes/syllabus-content-routes.ts`.
- **Success criteria:** xanh; không file nào > 800 dòng (`docs.maxLoc`).
- **Verify:** `pnpm --filter server test` exits 0 with `0 failed`; `wc -l apps/server/src/routes/syllabus.ts apps/server/src/routes/syllabus-content-routes.ts` prints two numbers, each < 800 (nếu một file ≥ 800, tách helper vào `lib/` rồi chạy lại).

## Success Criteria

- [ ] Ba nhóm route hoạt động; test chéo ngữ cảnh và chéo org xanh.
- [ ] Hành vi `status` của lesson không đổi ở cả ba nhóm.
- [ ] Alias `replace-content` không ghi được lên bản copy lớp.
- [ ] Test đã chuyển sang route mới; một test bảo vệ alias.
- [ ] Không file nguồn mới nào ≥ 800 dòng.

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
