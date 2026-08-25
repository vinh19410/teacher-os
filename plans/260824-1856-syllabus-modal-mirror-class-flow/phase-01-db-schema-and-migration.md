---
phase: 1
title: "DB schema and migration"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: DB schema and migration

## Overview

Thêm cột `type` (ClassType) và đổi `skill: text` → `skills: text` (JSON array) trên bảng `syllabus`. Backfill dữ liệu cũ theo đúng pattern đã dùng cho bảng `class` ở migration 0007.

## Requirements

- Functional: schema Drizzle phản ánh `type NOT NULL DEFAULT 'ielts'` và `skills NOT NULL DEFAULT '[]'`
- Data: row cũ với `skill='Writing'` → `skills='["Writing"]'`, `type='ielts'`
- Data: row cũ với `skill=''` → `skills='[]'`, `type='ielts'` (mặc định — không có tín hiệu communication trong syllabus cũ)
- Non-functional: SQL 0008 chạy được trên libsql + D1. **Không** idempotent — ADD/RENAME/json_array không replay an toàn. Không bịa script `check-types` cho `@teacher-os/db`.

## Architecture

Drizzle schema là nguồn sự thật. `db:generate` sinh SQL. Nhưng vì cần data-migration (JSON backfill), thao tác `RENAME COLUMN` + `UPDATE ... json_array(...)`, kịch bản: generate skeleton rồi tay chỉnh SQL giống 0007 (đó là hình mẫu đã merged).

## Related Code Files

- Modify: `packages/db/src/schema/syllabus.ts`
- Create: `packages/db/src/migrations/0008_syllabus_type_skills.sql`
- Modify: `packages/db/src/migrations/meta/_journal.json` (drizzle-kit sinh tự động)
- Create: `packages/db/src/migrations/meta/0008_snapshot.json` (drizzle-kit sinh tự động)

## Implementation Steps
1. Sửa `packages/db/src/schema/syllabus.ts` — bảng `syllabus`:
   - Xóa `skill: text("skill").notNull().default("")`
   - Thêm `type: text("type").notNull().default("ielts")`
   - Thêm `skills: text("skills").notNull().default("[]")` (JSON array dạng text — giống bảng class)
2. **Viết tay** `packages/db/src/migrations/0008_syllabus_type_skills.sql` theo pattern 0007. **Không** apply file SQL mà `db:generate` sinh lần đầu (drizzle-kit có thể `CREATE __new_syllabus` + DROP — xóa data `skill` trước khi kịp backfill; xem `0006_pink_ender_wiggin.sql`).
   ```sql
   ALTER TABLE "syllabus" ADD "type" text NOT NULL DEFAULT 'ielts';
   --> statement-breakpoint
   ALTER TABLE "syllabus" RENAME COLUMN "skill" TO "skills";
   --> statement-breakpoint
   UPDATE "syllabus" SET "skills" = json_array("skills") WHERE "skills" <> '';
   --> statement-breakpoint
   UPDATE "syllabus" SET "skills" = '[]' WHERE "skills" = '';
   ```
   Mọi row cũ mặc định `type='ielts'` (không detect "Giao tiếp" — syllabus cũ không có tín hiệu đó). `skill=''` → `skills='[]'` + `type='ielts'` — cosmetic drift đã chấp nhận trên issue #77. SuperRefine Phase 2 chỉ chặn **create mới**, không validate row cũ.
3. Cập nhật `meta/_journal.json` + snapshot: chạy `pnpm --filter @teacher-os/db db:generate` **chỉ** để sinh journal/snapshot nếu thiếu. Nếu generate emit thêm 0009 hoặc rewrite 0008 thành table-rebuild → **STOP**, không commit file generate, sửa journal tay cho khớp 0008 viết tay.
4. Nếu có local `.wrangler` / libsql sandbox DB, chạy migration để verify không lỗi.

<!-- Updated: Validation Session 1 - hand-write 0008, not idempotent -->
## Success Criteria

- [x] `packages/db/src/schema/syllabus.ts` compile
- [x] File `0008_syllabus_type_skills.sql` tồn tại, snapshot JSON sinh đúng
- [x] `pnpm --filter @teacher-os/db db:generate` không sinh migration bổ sung (0009) và không rewrite 0008 thành DROP TABLE
- [x] Local D1/libsql apply migration thành công (nếu có sandbox)
- [x] Không thêm script `check-types` vào `@teacher-os/db`

## Risk Assessment

- **Risk:** Row cũ có `skill` chứa ký tự đặc biệt (dấu ngoặc kép) làm `json_array()` lỗi.
  - **Signal:** SQL error khi chạy migration cục bộ.
  - **Response:** SQLite `json_array()` tự escape; nếu vẫn lỗi, dùng `UPDATE ... SET skills = json_array(trim(skills))` hoặc dùng `printf('["%s"]', replace(skills, '"', '""'))` — replan phase.
- **Risk:** Deploy D1 production đã có nhiều row, migration `RENAME COLUMN` bị chặn.
  - **Signal:** Migration deploy fail.
  - **Response:** Chấp nhận downtime nhỏ hoặc dùng `ADD COLUMN skills` + `UPDATE` + drop `skill` sau (2 migrations).
