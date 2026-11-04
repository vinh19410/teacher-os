---
phase: 1
title: "Phase 1: Snapshot 0060, unique index clone 0061 & idempotent clone route"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Snapshot 0060, unique index clone 0061 & idempotent clone route

<!-- Updated: Red Team RT-3, RT-4 -->

## Goal

Khôi phục `packages/db/src/migrations/meta/0060_snapshot.json` khớp chính xác trạng thái schema của `0060_study_pack.sql`, sau đó khai báo unique index `study_pack_org_source_pack_uq` trên `(org_id, source_pack_id)`, sinh migration `0061` thuần DDL bằng `drizzle-kit generate`, và bảo vệ `POST /api/study-packs/:id/clone` trước hai request chạy song song theo quy trình TDD.

## Files to Create / Modify

- Create:
  - `packages/db/src/migrations/meta/0060_snapshot.json`
  - `packages/db/src/migrations/0061_<generated_tag>.sql` (sinh bởi `drizzle-kit generate`)
  - `packages/db/src/migrations/meta/0061_snapshot.json` (sinh bởi `drizzle-kit generate`)
- Modify:
  - `packages/db/src/schema/study-pack.ts`
  - `packages/db/src/migrations/meta/_journal.json`
  - `apps/server/src/routes/study-pack.ts`
  - `apps/server/src/study-pack-migration.test.ts`
  - `apps/server/src/routes/study-pack.test.ts`

## Tasks & Steps

### Task 1.1 — Tạo `0060_snapshot.json` từ schema `0060` hiện tại và xác minh chuỗi snapshot
- **Goal:** Tạo file `packages/db/src/migrations/meta/0060_snapshot.json` phản ánh đúng trạng thái schema tại thời điểm `0060_study_pack.sql` (trước khi sửa `packages/db/src/schema/study-pack.ts`) với `prevId` nối liền từ `0059_snapshot.json`.
- **Target files and symbols:**
  - `packages/db/src/migrations/meta/0060_snapshot.json` (tạo mới)
  - `packages/db/src/migrations/meta/0059_snapshot.json` (đọc trường `"id": "4d17ba7a-97d2-436c-917b-406277baccfa"`)
  - `packages/db/src/schema/index.ts` (nguồn sinh snapshot)
- **Steps:** <!-- Updated: Red Team RT-3 - dùng đường dẫn tương đối trong packages/db và dọn sạch ngay để không dính lỗi ENOENT của drizzle-kit hay rác biome -->
  1. Trước khi chỉnh sửa bất kỳ file nào trong `packages/db/src/schema/`, chạy `pnpm --filter @teacher-os/db exec drizzle-kit generate --dialect sqlite --schema ./src/schema/index.ts --out ./.tmp-snap-0060` để `drizzle-kit` xuất bản chụp chuẩn tại `packages/db/.tmp-snap-0060/meta/0000_snapshot.json`.
  2. Đọc JSON từ `packages/db/.tmp-snap-0060/meta/0000_snapshot.json`, gán `prevId = "4d17ba7a-97d2-436c-917b-406277baccfa"` (khớp chính xác `id` của `0059_snapshot.json`), ghi ra `packages/db/src/migrations/meta/0060_snapshot.json` (indent 2 dấu cách, kết thúc bằng newline), rồi xóa ngay thư mục tạm `packages/db/.tmp-snap-0060`.
  3. Chạy kiểm tra đối chiếu bằng `drizzle-kit generate` và `drizzle-kit check` trong `packages/db` để chứng minh không phát sinh bất kỳ thay đổi schema dư thừa nào so với `0060`.
- **Success criteria:** `packages/db/src/migrations/meta/0060_snapshot.json` tồn tại, `prevId` bằng `"4d17ba7a-97d2-436c-917b-406277baccfa"`, thư mục `packages/db/.tmp-snap-0060` không còn tồn tại, không có file `0061_*.sql` nào được sinh ra khi schema chưa đổi, và `drizzle-kit check` báo hợp lệ.
- **Verify:** `pnpm --filter @teacher-os/db exec drizzle-kit generate && pnpm --filter @teacher-os/db exec drizzle-kit check` thoát `0`, in ra `No schema changes, nothing to migrate` và `Everything's fine`.

### Task 1.2 — Viết test TDD (Red) cho unique index `study_pack_org_source_pack_uq` và đua song song `POST /api/study-packs/:id/clone`
- **Goal:** Bổ sung test kiểm chứng ràng buộc unique `(org_id, source_pack_id)` ở tầng DB migration + `/readyz` và kịch bản hai request `POST /api/study-packs/:id/clone` chạy đồng thời (`Promise.all`) phải thất bại trước khi cài đặt code sửa.
- **Target files and symbols:**
  - `apps/server/src/study-pack-migration.test.ts` (describe `"0060_study_pack.sql migration & /readyz (#533)"`, thêm helper `applyMigrationsAfter`)
  - `apps/server/src/routes/study-pack.test.ts` (describe `"study pack routes & student scheduled visibility (#533)"` tại dòng 77)
- **Steps:** <!-- Updated: Red Team RT-1, RT-3 - dùng applyMigrationsAfter để không chạy lại 0000, bật PRAGMA foreign_keys = ON -->
  1. Trong `apps/server/src/study-pack-migration.test.ts`:
     - Viết thêm helper `async function applyMigrationsAfter(client: Client, afterFileName: string)` chỉ chạy các file trong `migrationFiles()` có `fileName > afterFileName` (tuyệt đối không dùng `applyMigrationsUpTo` lần 2 trên cùng `client` vì sẽ chạy lại từ `0000_mushy_amazoness.sql`).
     - Sau khi kiểm tra bước nâng cấp `0059 -> 0060`, gọi `await applyMigrationsAfter(client, "0060_study_pack.sql")` trước khi gọi `/readyz`.
     - Thêm kiểm tra tồn tại index `study_pack_org_source_pack_uq` trong `sqlite_master` (`type = 'index'`), kiểm tra chèn 2 dòng `study_pack` có cùng `(org_id = 'org-1', source_pack_id = 'sys-1')` bị SQLite từ chối bởi lỗi `UNIQUE`, trong khi 2 dòng có `(org_id = 'org-1', source_pack_id = NULL)` và 2 dòng hệ thống `(org_id = NULL, source_pack_id = NULL)` đều chèn thành công.
     - Thêm 1 test kiểm tra mọi entry `tag` trong `packages/db/src/migrations/meta/_journal.json` đều có file `meta/<4-chữ-số-đầu>_snapshot.json` tương ứng và chuỗi `prevId` nối liên tục từ `0058` qua `0059`, `0060` tới snapshot cuối cùng.
  2. Trong `apps/server/src/routes/study-pack.test.ts`:
     - Bật `await client.execute("PRAGMA foreign_keys = ON")` ngay sau khi tạo in-memory client (dòng 82–85) để mô phỏng trung thực ràng buộc khóa ngoại của Cloudflare D1.
     - Trong block `describe("study pack routes & student scheduled visibility (#533)")`, bổ sung test gọi đồng thời `await Promise.all([callClone(), callClone()])` cho một bộ đề hệ thống mới chưa từng clone ở `orgA`: khẳng định cả hai response đều trả HTTP `201`, cùng `pack.id`, đủ danh sách `items`, và bảng `study_pack` chỉ có đúng `1` dòng `(org_id = orgAId, source_pack_id = sysPackId)`.
- **Success criteria:** Các assertion mới chạy và fail đúng ở kiểm tra thiếu `study_pack_org_source_pack_uq` / sinh 2 dòng clone song song (không bị nổ lỗi `table account already exists`).
- **Verify:** `pnpm --filter server exec vitest run src/study-pack-migration.test.ts src/routes/study-pack.test.ts` thoát khác `0` với lỗi assertion (test pass ở bước này là thất bại của pha Red).

### Task 1.3 — Khai báo `study_pack_org_source_pack_uq`, sinh migration `0061` và bọc xử lý xung đột trong `POST /study-packs/:id/clone` (Green)
- **Goal:** Bổ sung unique index vào Drizzle schema, sinh migration `0061` sạch từ `0060_snapshot.json`, và xử lý race khi `db.batch` va chạm unique constraint trong route clone.
- **Target files and symbols:**
  - `packages/db/src/schema/study-pack.ts` (bảng `studyPack`)
  - `packages/db/src/migrations/0061_*.sql`, `packages/db/src/migrations/meta/0061_snapshot.json`, `packages/db/src/migrations/meta/_journal.json`
  - `apps/server/src/routes/study-pack.ts` (handler `routes.post("/study-packs/:id/clone", ...)`)
- **Steps:**
  1. Trong `packages/db/src/schema/study-pack.ts` tại định nghĩa index của `studyPack` (dòng 68–72), thêm:
     `uniqueIndex("study_pack_org_source_pack_uq").on(table.orgId, table.sourcePackId)`
  2. Chạy `pnpm --filter @teacher-os/db db:generate` để sinh `0061_<tag>.sql`, `meta/0061_snapshot.json` và cập nhật `meta/_journal.json`.
  3. Đọc trực tiếp file `packages/db/src/migrations/0061_<tag>.sql` vừa sinh: xác nhận nội dung CHỈ gồm duy nhất câu lệnh `CREATE UNIQUE INDEX \`study_pack_org_source_pack_uq\` ON \`study_pack\` (\`org_id\`,\`source_pack_id\`);` (không có `DROP TABLE`, `ALTER TABLE` hay xóa dữ liệu).
  4. Trong `apps/server/src/routes/study-pack.ts` tại `routes.post("/study-packs/:id/clone", ...)` (quanh dòng 326): bọc `await db.batch(statements)` trong `try { await db.batch(statements); } catch (err) { ... }` — trong nhánh `catch`, truy vấn lại `studyPack` theo `and(eq(studyPack.orgId, ctx.orgId), eq(studyPack.sourcePackId, sourcePack.id))`; nếu tìm thấy bản ghi thắng cuộc (`racedClone`), trả `return c.json({ pack: await loadStudyPackDetailFromRow(db, racedClone) }, 201)` (không so khớp chuỗi message lỗi để tránh lệ thuộc định dạng lỗi D1/libsql); nếu không tìm thấy thì `throw err`.
- **Success criteria:** Migration `0061` chỉ chứa 1 lệnh `CREATE UNIQUE INDEX`, `drizzle-kit check` pass, `/readyz` (`apps/server/src/routes/readiness.ts`) trả `200`, và cả 3 file test đều xanh hoàn toàn.
- **Verify:** `pnpm --filter @teacher-os/db exec drizzle-kit check && pnpm --filter server exec vitest run src/study-pack-migration.test.ts src/routes/study-pack.test.ts src/readiness.test.ts` thoát `0`.

## Todo

- [x] Task 1.1 — Tạo `0060_snapshot.json` và xác minh chuỗi snapshot
- [x] Task 1.2 — Viết test TDD (Red) cho `study_pack_org_source_pack_uq` và đua song song clone
- [x] Task 1.3 — Khai báo index, sinh migration `0061` và xử lý xung đột clone (Green)

## Success Criteria

- `0060_snapshot.json` và `0061_snapshot.json` hợp lệ theo `drizzle-kit check`.
- `0061_*.sql` thuần câu lệnh `CREATE UNIQUE INDEX \`study_pack_org_source_pack_uq\``.
- `study-pack-migration.test.ts`, `study-pack.test.ts` và `readiness.test.ts` đều pass với `PRAGMA foreign_keys = ON`.

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
