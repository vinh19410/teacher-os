---
phase: 1
title: "Phase 1: Schema, migration 0060 & contracts"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Schema, migration 0060 & contracts

## Goal

Tạo nền dữ liệu cho bộ đề và cột lịch hiển thị trên `class_assignment`; gỡ bảng/cột của plan cron #526 bằng migration mới; thêm contract Zod dùng chung.

## Files

- Create: `packages/db/src/schema/study-pack.ts`, `packages/db/src/migrations/0060_study_pack.sql`
- Modify: `packages/db/src/schema/class-assignment.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/migrations/meta/_journal.json` (+ snapshot do `drizzle-kit generate`)
- Delete: `packages/db/src/schema/self-study-plan.ts` (sau khi phase 4 gỡ hết import)
- Modify: `packages/api/src/contracts.ts`, `packages/api/src/vietnam-date.ts` (chỉ nếu cần helper `vietnamDateTimeToMs`; ưu tiên dùng lại helper #526 đã thêm)

## Schema

- `study_pack`: `id`, `org_id` **nullable** (NULL = thư viện hệ thống; FK cascade), `title`, `description`, `status` (`draft|ready`), `source_pack_id` (provenance khi clone), `created_by`, `created_at`, `updated_at`. Index `(org_id)`, `(status)`.
- `study_pack_item`: `id`, `pack_id` (FK cascade), `day_index` (1..`MAX_PACK_DAYS`), `position`, `source_kind` (`org_prompt|library_test_part|library_exercise`), `source_id`, `note`. Unique `(pack_id, day_index, source_kind, source_id)`; index `(pack_id, day_index, position)`.
- `class_study_pack`: `id`, `org_id`, `class_id`, `pack_id`, `start_date` (ISO), `release_time`/`due_time` (HH:MM VN, mặc định `06:00`/`17:00`), `status` (`active|cancelled`), `created_by`, `created_at`, `cancelled_at`. Index `(class_id, status)`. Cho phép nhiều pack/lớp (không partial unique như #526).
- `class_assignment`: thêm `available_at` (`timestamp_ms`, nullable; NULL = hiện ngay như bài giao tay) và `class_study_pack_id` (text nullable, index). **Bỏ** `plan_item_id`.
- `assignment_prompt`: thêm `library_ref` (text nullable, dạng `kind:id`) + unique `(org_id, library_ref)` để clone thư viện idempotent.
- Hằng số: `STUDY_PACK_SKILLS = ["reading","listening","grammar","vocabulary"]`, `MAX_PACK_DAYS = 366`, `MAX_PACK_ITEMS_PER_DAY = 10`.

## Migration 0060

1. **Backup trước** (rule: backup trước đổi schema): ghi vào PR/hướng dẫn lệnh export D1 các bảng `self_study_plan*`.
2. `DROP TABLE self_study_plan_item, self_study_plan_day, self_study_plan` (đúng thứ tự FK).
3. Thêm cột mới; với SQLite `DROP COLUMN plan_item_id` cần drop index `class_assignment_plan_item_idx` trước.
4. Tạo bảng mới + index.

## Contracts (`packages/api/src/contracts.ts`)

- `studyPackItemInputSchema`, `studyPackCreateSchema/UpdateSchema` (`.strict()`, giới hạn ngày/item), `assignStudyPackSchema` (`classId`, `packId`, `startDate`, `releaseTime`, `dueTime`), response schemas.
- Cho phép additive `availableAt?: string | null` trên `studentAssignmentSchema` chỉ nếu UI cần (mặc định **không** lộ).
- Gỡ contract/`self_study_released` của #526 ở phase 4 (tránh vỡ build giữa chừng).

## Steps (TDD)

1. Viết test migration (theo mẫu `*-migration.test.ts` hiện có trong `apps/server/src`): bảng cũ biến mất, cột mới có, bản ghi `class_assignment` cũ vẫn đọc được.
2. Viết test contract: item skill `writing`/`speaking` bị từ chối; `day_index` ngoài khoảng bị từ chối.
3. Cài schema + migration (`drizzle-kit generate`, rà SQL tay), cập nhật `schema/index.ts`.

## Verify

`pnpm --filter @teacher-os/db test` (hoặc tên package thực tế), `pnpm --filter @teacher-os/api test`, `pnpm check-types`.

## Risk / rollback

Drop bảng không hoàn tác được → bắt buộc backup; rollback = khôi phục từ backup và revert migration trước khi release.
