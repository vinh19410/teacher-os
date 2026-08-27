---
title: "Phase 1: DB schema và migration 0009"
status: todo
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: DB schema và migration 0009

> Context: [reports/design-decisions.md](./reports/design-decisions.md) (D1, D3 mục 1-3), [reports/scout-report.md](./reports/scout-report.md) (§4 schema, §7 hai domain status), [reports/research-report.md](./reports/research-report.md) (§3 modeling, §5 edge cases).

## Overview

Đưa discriminator template/per-class-copy vào bảng `syllabus` ở Drizzle schema và viết **phần structural** của migration 0009: 2 cột mới + unique partial index. Phần backfill copy-on-import (cho class hiện có) viết tiếp ở [Phase 2](./phase-02-db-schema-and-migration.md) trong cùng file 0009 — hai phase chia sẻ một file migration, phase này tạo khung, phase 2 hoàn thiện; **cả hai land cùng một commit** trước khi bất kỳ DB persistent nào chạy migration (red-team A).

Sau phase này: schema Drizzle ↔ DB đồng bộ (db:generate parity), index tồn tại, mọi row hiện hữu vẫn `class_id NULL` (= template) nên server cũ chạy không đổi.

## Requirements

- [x] `packages/db/src/schema/syllabus.ts`: bảng `syllabus` thêm `classId: text("class_id")` nullable (không default) và `sourceTemplateId: text("source_template_id")` nullable.
- [x] `sourceTemplateId` khai báo self-reference `references((): AnyColumn => syllabus.id, { onDelete: "set null" })` — SQLite không `ALTER TABLE ADD FK` nên với DB cũ đây là **logical FK** (enforce ở handler import, D3).
- [x] Unique partial index: `syllabus_class_unique ON syllabus(class_id) WHERE class_id IS NOT NULL` — một live curriculum/class + guard import trùng + bảo đảm subquery backfill ≤1 row (D1).
- [x] KHÔNG tạo index `syllabus_template_idx` — dead index (red-team L): không query server nào lọc theo discriminator (loadSnapshot select-all theo org, template filter là client-side, import check theo PK); index trên PK + predicate vô dụng, chỉ tăng write-cost.
- [x] `syllabus_module` / `syllabus_lesson` **không đổi** — module/lesson treo vào syllabus copy bằng FK sẵn có (D1).
- [x] Migration 0009 viết tay theo convention 0007/0008 (không apply output drizzle-kit as-is); `_journal.json` + `0009_snapshot.json` cập nhật. Mọi statement cách nhau bằng `--> statement-breakpoint` (drizzle migrator CHỈ split trên token này — thiếu marker = migration fail).
- [x] **Ràng buộc apply (red-team A):** file 0009 chỉ được apply ở dạng HOÀN CHỈNH (structural + backfill phase 2 cùng commit). Không bao giờ restart `alchemy dev` / deploy khi file đang ở dạng structural-only — alchemy auto-apply theo migrationsDir và ledger theo tên sẽ skip vĩnh viễn phần backfill append sau (bẫy 0006 trong runbook `docs/production-release-runbook.md:196-204`; chính là sự cố 0008 ngày 2026-08-25: ledger ghi applied, schema thiếu cột).

## Architecture

Same-table + discriminator (D1, research §3a): chi phí migration thấp nhất, tái dùng toàn bộ CRUD route một Hono family, org scoping không đổi. Rủi ro "query quên discriminate" hóa giải bằng helper luôn append điều kiện + partial index ở listing. Không có version column — bản copy chính là version pin (YAGNI).

## Related Code Files

- `packages/db/src/schema/syllabus.ts:5-24` — bảng `syllabus` (id, orgId, name, level, type, skills, description, totalLessons, createdAt; index `syllabus_org_idx`).
- `packages/db/src/migrations/0007_class_type_skills.sql`, `0008_syllabus_type_skills.sql` — pattern viết tay + backfill `UPDATE ... WHERE`.
- `packages/db/src/migrations/meta/_journal.json` — đăng ký 0009.

## Implementation Steps

1. Sửa `schema/syllabus.ts`: thêm 2 cột + 1 unique partial index trong mảng constraint:
   ```ts
   classId: text("class_id"),
   sourceTemplateId: text("source_template_id").references((): AnyColumn => syllabus.id, { onDelete: "set null" }),
   // (table) => [
   //   index("syllabus_org_idx").on(table.orgId),
   //   uniqueIndex("syllabus_class_unique").on(table.classId).where(sql`class_id IS NOT NULL`),
   // ]
   ```
2. Chạy `pnpm --filter @teacher-os/db db:generate` → nhận `0009_*.sql` + `meta/0009_snapshot.json`. Đổi tên file theo convention nếu cần (giữ số 0009).
3. Hand-edit `0009_*.sql` về đúng D3 (comment + thứ tự), phần structural — mỗi statement một dòng, ngăn cách `--> statement-breakpoint`:
   ```sql
   ALTER TABLE syllabus ADD class_id text;
   --> statement-breakpoint
   ALTER TABLE syllabus ADD source_template_id text;
   --> statement-breakpoint
   -- Logical FK: SQLite không ALTER ADD FK; enforce ở import handler (chỉ nhận class_id IS NULL).
   CREATE UNIQUE INDEX syllabus_class_unique ON syllabus(class_id) WHERE class_id IS NOT NULL;
   ```
4. Verify apply trên DB **in-memory dùng một lần** (pattern test `apps/server/src/comment-bank-existing-data-migration.test.ts:29-70`: libsql `file::memory:` + applyFile tuần tự) — KHÔNG dùng `db:migrate:deploy` (driver d1-http, không credentials, repo đã cấm — red-team A) và KHÔNG apply vào DB persistent nào (alchemy dev sẽ ghi ledger và khóa backfill phase 2).


## File Inventory

| File | Action | Size | Test impact |
|------|--------|------|-------------|
| `packages/db/src/schema/syllabus.ts` | modify | S | `db:generate` parity; snapshot mapping (phase 3) đọc type này |
| `packages/db/src/migrations/0009_syllabus_template_discriminator.sql` | create (structural; phase 2 append backfill) | M | apply in-memory; rehearsal phase 2/6 |
| `packages/db/src/migrations/meta/_journal.json` | modify | S | alchemy/test migrate |
| `packages/db/src/migrations/meta/0009_snapshot.json` | create | M | `db:generate` không drift |

## Test Scenario Matrix

| # | Scenario | Priority | Verify |
|---|----------|----------|--------|
| 1 | `db:generate` idempotent sau khi sửa schema (chạy lần 2 không sinh migration mới) | Critical | lệnh `db:generate` lần 2 → "No schema changes" |
| 2 | 0009 apply sạch trên DB in-memory dùng một lần | Critical | applyFile tuần tự qua journal; `.indexes syllabus` thấy unique index |
| 3 | Unique index chặn 2 row cùng `class_id`, cho phép nhiều NULL | High | insert thủ công 2 row cùng class_id → UNIQUE violation; 2 row NULL → OK |

## Success Criteria

- [x] `pnpm --filter @teacher-os/db db:generate` chạy lần 2 báo không có thay đổi (parity snapshot ↔ schema).
- [x] 0009 structural apply thành công trên in-memory DB; `syllabus_class_unique` tồn tại đúng cú pháp partial (`WHERE class_id IS NOT NULL`).
- [x] Không file schema nào ngoài `schema/syllabus.ts` bị đổi; không DB persistent nào bị apply 0009 dạng structural-only.

| Risk | Mitigation |
|------|------------|
| drizzle-kit emit cú pháp index khác handwritten (bỏ/misérialize `WHERE`) | So sánh SQL generate vs D3; hand-edit file 0009 như 0007/0008 đã làm; chấp nhận snapshot.json giữ dạng generate (tiền lệ 0008) |
| Self-FK trong Drizzle cần type annotation tránh circular | Dùng callback `(): AnyColumn => syllabus.id`; typecheck qua workspace `pnpm check-types` |
| Apply structural-only lên DB persistent (alchemy dev restart giữa phase 1-2) → ledger skip backfill vĩnh viễn | Ràng buộc apply ở Requirements; verify bằng `SELECT name FROM d1_migrations` không chứa 0009 trên mọi DB persistent sau phase này; phase 1+2 land cùng commit trước khi restart dev server |
| Thiếu `--> statement-breakpoint` giữa statement | Marker bắt buộc trong spec SQL; applyFile test bắt ngay (multi-statement chunk làm prepare fail) |

## Dependency Map

- **Input:** reports (design D1/D3, scout §4, research §3).
- **Output → Phase 2:** file 0009 nhận thêm block backfill.
- **Output → Phase 3:** schema type `classId`/`sourceTemplateId` cho `KernelSyllabusRow` + query import (`WHERE class_id IS NULL`).
- **Output → Phase 6:** rehearsal migration dùng file 0009 hoàn chỉnh.
