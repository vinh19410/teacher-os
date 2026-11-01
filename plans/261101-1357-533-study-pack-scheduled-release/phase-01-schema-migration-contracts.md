---
phase: 1
title: "Phase 1: Schema, migration 0060, gỡ #526 & contracts"
status: completed
priority: P1
effort: "3.5h"
dependencies: []
---

# Phase 1: Schema, migration 0060, gỡ #526 & contracts

## Goal

Tạo nền dữ liệu cho bộ đề (`study_pack`, `study_pack_item`, `class_study_pack`, `study_pack_exercise`), cột lịch hiển thị (`available_at`, `class_study_pack_id`) trên `class_assignment`, cột `library_ref` trên `assignment_prompt`, gỡ sạch bảng/code cron của `#526` đồng bộ với `/readyz`, và thêm contract Zod dùng chung.

## Files

- Create:
  - `packages/db/src/schema/study-pack.ts`
  - `packages/db/src/migrations/0060_study_pack.sql`
  - `apps/server/src/study-pack-migration.test.ts`
- Modify:
  - `packages/db/src/schema/class-assignment.ts`
  - `packages/db/src/schema/assignment-prompt.ts`
  - `packages/db/src/schema/index.ts`
  - `packages/db/src/migrations/meta/_journal.json`
  - `packages/api/src/contracts.ts`
  - `apps/server/src/routes/kernel.ts`
  - `apps/server/src/routes/snapshot.ts`
  - `apps/server/src/index.ts`
  - `apps/server/package.json`
  - `packages/infra/alchemy.run.ts`
  - `apps/server/src/lib/notifications/templates.ts`
  - `apps/web/src/routes/_auth/notifications/index.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.tsx`
  - `apps/e2e/src/boot.ts`
- Delete (gỡ đồng bộ `#526` để `/readyz` và `pnpm check-types` xanh ngay từ Phase 1):
  - `packages/db/src/schema/self-study-plan.ts`
  - `apps/server/src/lib/self-study-plan.ts`
  - `apps/server/src/lib/self-study-plan.test.ts`
  - `apps/server/src/routes/self-study-plan.ts`
  - `apps/server/src/routes/self-study-plan.test.ts`
  - `apps/web/src/lib/repos/self-study-plan.ts`
  - `apps/web/src/components/classes/self-study-plan-section.tsx`
  - `apps/web/src/components/classes/self-study-plan-section.test.tsx`
  - `apps/e2e/specs/self-study-plan.spec.ts`

## Tasks

### Task 1.1 — Định nghĩa Drizzle schema cho Study Pack và cập nhật `class_assignment`, `assignment_prompt`
- **Goal:** Schema `@teacher-os/db` phản ánh đúng cấu trúc bảng mới, bỏ `self_study_plan*` và `plan_item_id`, khớp tuyệt đối với kiểm tra `/readyz` (`apps/server/src/routes/readiness.ts`).
- **Target files:**
  - `packages/db/src/schema/study-pack.ts`
  - `packages/db/src/schema/class-assignment.ts`
  - `packages/db/src/schema/assignment-prompt.ts`
  - `packages/db/src/schema/index.ts`
  - `packages/db/src/schema/self-study-plan.ts` (delete)
- **Steps:**
  1. Tạo `packages/db/src/schema/study-pack.ts` gồm 4 bảng:
     - `libraryExercise` (`study_pack_exercise`): `id` (PK), `skill` (`"reading" | "grammar" | "vocabulary"`), `part` (text default `""`), `type` (text default `""`), `title` (text), `band` (text default `"7.0"`), `intro` (text default `""`), `passage` (text default `""`), `questions` (text default `"[]"`), `optionBank` (text default `"[]"`), `note` (text default `""`), `status` (`"draft" | "ready"` default `"draft"`), `createdBy` (text nullable), `createdAt` (`timestamp_ms`), `updatedAt` (`timestamp_ms`). Index: `study_pack_exercise_skill_status_idx` trên `(skill, status)`.
     - `studyPack` (`study_pack`): `id` (PK), `orgId` (`text("org_id").references(() => organization.id, { onDelete: "cascade" })`, nullable — `NULL` = bộ đề hệ thống), `title` (text), `description` (text default `""`), `status` (`"draft" | "ready"` default `"draft"`), `sourcePackId` (`text("source_pack_id")`, nullable, không đặt FK), `createdBy` (text nullable), `createdAt` (`timestamp_ms`), `updatedAt` (`timestamp_ms`). Index: `study_pack_org_idx` trên `(org_id)`, `study_pack_status_idx` trên `(status)`.
     - `studyPackItem` (`study_pack_item`): `id` (PK), `packId` (`text("pack_id").notNull().references(() => studyPack.id, { onDelete: "cascade" })`), `dayIndex` (`integer("day_index").notNull()`), `position` (`integer("position").notNull().default(0)`), `sourceKind` (`text("source_kind").notNull()` — `"org_prompt" | "library_test_part" | "library_exercise"`), `sourceId` (`text("source_id").notNull()`), `note` (`text("note").notNull().default("")`). Unique index: `study_pack_item_pack_day_source_uq` trên `(packId, dayIndex, sourceKind, sourceId)`; index: `study_pack_item_pack_day_pos_idx` trên `(packId, dayIndex, position)`.
     - `classStudyPack` (`class_study_pack`): `id` (PK), `orgId` (`text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" })`), `classId` (`text("class_id").notNull().references(() => classTable.id, { onDelete: "cascade" })`), `packId` (`text("pack_id").notNull().references(() => studyPack.id, { onDelete: "restrict" })`), `title` (`text("title").notNull()`), `startDate` (`text("start_date").notNull()`), `releaseTime` (`text("release_time").notNull().default("06:00")`), `dueTime` (`text("due_time").notNull().default("17:00")`), `status` (`text("status").notNull().default("active")` — `"active" | "cancelled"`), `createdBy` (`text("created_by")`), `createdAt` (`timestamp_ms`), `cancelledAt` (`integer("cancelled_at", { mode: "timestamp_ms" })`). Index: `class_study_pack_org_idx` trên `(orgId)`, `class_study_pack_class_status_idx` trên `(classId, status)`, và partial unique index `uniqueIndex("class_study_pack_class_pack_active_uq").on(table.classId, table.packId).where(sql\`${table.status} = 'active'\`)`.
  2. Trong `packages/db/src/schema/class-assignment.ts`: giữ `dueAt`, thay `planItemId: text("plan_item_id")` và `index("class_assignment_plan_item_idx")` bằng `availableAt: integer("available_at", { mode: "timestamp_ms" })`, `classStudyPackId: text("class_study_pack_id")`, và `index("class_assignment_study_pack_idx").on(table.classStudyPackId)`.
  3. Trong `packages/db/src/schema/assignment-prompt.ts`: thêm `libraryRef: text("library_ref")` và `uniqueIndex("assignment_prompt_org_library_ref_uq").on(table.orgId, table.libraryRef)`.
  4. Trong `packages/db/src/schema/index.ts`: thay `export * from "./self-study-plan";` bằng `export * from "./study-pack";` và xoá file `packages/db/src/schema/self-study-plan.ts`.
- **Success criteria:** `@teacher-os/db` export đầy đủ `studyPack`, `studyPackItem`, `classStudyPack`, `libraryExercise`, `classAssignment.availableAt`, `classAssignment.classStudyPackId`, `assignmentPrompt.libraryRef`.
- **Verify:** no verification needed (sẽ kiểm chứng ở Task 1.2 & Task 1.4).

### Task 1.2 — Viết migration `0060_study_pack.sql`, cập nhật `_journal.json` và gỡ sạch tham chiếu `#526`
- **Goal:** Migration `0060_study_pack.sql` nâng cấp DB đã chạy `0059` mà không rebuild bảng `class_assignment`, và toàn bộ tham chiếu `#526` được gỡ sạch để `/readyz` trả 200.
- **Target files:**
  - `packages/db/src/migrations/0060_study_pack.sql`
  - `packages/db/src/migrations/meta/_journal.json`
  - `apps/server/src/routes/kernel.ts`
  - `apps/server/src/routes/snapshot.ts`
  - `apps/server/src/index.ts`
  - `apps/server/package.json`
  - `packages/infra/alchemy.run.ts`
  - `apps/server/src/lib/notifications/templates.ts`
  - `apps/web/src/routes/_auth/notifications/index.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.tsx`
  - `apps/e2e/src/boot.ts`
- **Steps:**
  1. Tạo `packages/db/src/migrations/0060_study_pack.sql` với các câu lệnh tách bởi `--> statement-breakpoint`:
     - `DELETE FROM notification_record WHERE type = 'self_study_released';`
     - `DROP INDEX IF EXISTS class_assignment_plan_item_idx;`
     - `ALTER TABLE class_assignment DROP COLUMN plan_item_id;`
     - `ALTER TABLE class_assignment ADD available_at integer;`
     - `ALTER TABLE class_assignment ADD class_study_pack_id text;`
     - `CREATE INDEX class_assignment_study_pack_idx ON class_assignment (class_study_pack_id);`
     - `ALTER TABLE assignment_prompt ADD library_ref text;`
     - `CREATE UNIQUE INDEX assignment_prompt_org_library_ref_uq ON assignment_prompt (org_id, library_ref);`
     - `DROP TABLE IF EXISTS self_study_plan_item;`
     - `DROP TABLE IF EXISTS self_study_plan_day;`
     - `DROP TABLE IF EXISTS self_study_plan;`
     - `CREATE TABLE study_pack_exercise ...`, `CREATE TABLE study_pack ...`, `CREATE TABLE study_pack_item ...`, `CREATE TABLE class_study_pack ...` và toàn bộ index khớp hệt Task 1.1.
  2. Thêm entry `idx: 60` (`tag: "0060_study_pack"`) vào `packages/db/src/migrations/meta/_journal.json`.
  3. Đổi `isNull(classAssignment.planItemId)` sang `isNull(classAssignment.classStudyPackId)` tại `apps/server/src/routes/kernel.ts:769` và 3 truy vấn trong `apps/server/src/routes/snapshot.ts:438,455,478`; đồng thời thêm `isNull(assignmentPrompt.libraryRef)` vào `assignmentPromptRows` trong `apps/server/src/routes/snapshot.ts:276-286`.
  4. Xoá các file `#526` (`self-study-plan.ts` + test ở server/web/e2e), gỡ `scheduled` trong `apps/server/src/index.ts`, gỡ `crons` trong `packages/infra/alchemy.run.ts`, gỡ export `./lib/self-study-plan` trong `apps/server/package.json`, gỡ `selfStudyReleasedEvents` trong `templates.ts`, gỡ `self_study_released` trong `notifications/index.tsx` và `contracts.ts`, gỡ `/__e2e/self-study-tick` trong `apps/e2e/src/boot.ts`, và tạm gỡ `SelfStudyPlanSection` khỏi `apps/web/src/routes/_auth/classes/$classId.tsx` (sẽ gắn `ClassStudyPackSection` ở Phase 5). **Giữ nguyên** `apps/server/src/routes/holidays.ts` (`loadExistingHolidayDates`) và `packages/api/src/vietnam-date.ts` (`vietnamDateTimeMs`).
- **Success criteria:** Không còn bất kỳ tham chiếu nào tới `self_study_plan`, `planItemId`, `runSelfStudyPlanTick`, hay `self_study_released` trong source code.
- **Verify:** `pnpm --filter @teacher-os/db test` exits 0.

### Task 1.3 — Bổ sung contracts Zod cho Study Pack trong `packages/api/src/contracts.ts`
- **Goal:** Cung cấp đầy đủ hằng số, schema input/output cho Study Pack, Library Exercise, và Class Study Pack.
- **Target files:**
  - `packages/api/src/contracts.ts`
  - `packages/api/src/contracts.test.ts` (hoặc file test contract tương ứng)
- **Steps:**
  1. Trong `packages/api/src/contracts.ts`, gỡ các schema `selfStudyPlan*` của `#526` và thêm:
     - `STUDY_PACK_SKILLS = ["reading", "listening", "grammar", "vocabulary"] as const`
     - `STUDY_PACK_SOURCE_KINDS = ["org_prompt", "library_test_part", "library_exercise"] as const`
     - `MAX_PACK_DAYS = 366`, `MAX_PACK_ITEMS_PER_DAY = 10`, `MAX_PACK_TOTAL_ITEMS = 200`
     - `STUDY_PACK_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/`, `STUDY_PACK_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/`
     - `studyPackItemInputSchema`, `studyPackCreateSchema`, `studyPackUpdateSchema` (`.strict()`, kiểm tra `dayIndex` `1..MAX_PACK_DAYS`, tối đa `MAX_PACK_ITEMS_PER_DAY` bài/ngày, tổng số bài `<= MAX_PACK_TOTAL_ITEMS`, không trùng `(dayIndex, sourceKind, sourceId)`, khi `status === "ready"` phải có `items.length >= 1`).
     - `libraryExerciseCreateSchema`, `libraryExerciseUpdateSchema` (`skill` thuộc `["reading", "grammar", "vocabulary"]`, câu hỏi hợp lệ).
     - `assignStudyPackSchema` (`.strict()`: `packId`, `startDate` khớp `STUDY_PACK_DATE_REGEX`, `releaseTime` mặc định `"06:00"`, `dueTime` mặc định `"17:00"`, kiểm tra `dueTime > releaseTime`).
     - Các kiểu dữ liệu view: `StudyPackItemView`, `StudyPackSummaryView`, `StudyPackDetailView`, `ClassStudyPackAssignmentView`, `ClassStudyPackView`, `ClassStudyPacksResponse`.
- **Success criteria:** Schema từ chối `dayIndex` ngoài khoảng, quá 10 bài/ngày, quá 200 bài/pack, `dueTime <= releaseTime`, hoặc pack `ready` rỗng.
- **Verify:** `pnpm --filter @teacher-os/api test` exits 0.

### Task 1.4 — Viết test kiểm chứng migration `0060_study_pack.sql` và `/readyz`
- **Goal:** Chứng minh DB migrate qua `0059` (có dữ liệu `self_study_plan*` và `class_assignment`) chạy tiếp `0060_study_pack.sql` thành công, giữ nguyên `class_assignment` & `quiz_attempt` hiện hữu, và `/readyz` trả HTTP 200.
- **Target files:**
  - `apps/server/src/study-pack-migration.test.ts`
- **Steps:**
  1. Tạo `apps/server/src/study-pack-migration.test.ts`:
     - Khởi tạo DB tới `0059`, chèn dữ liệu mẫu cho `organization`, `class`, `assignment_prompt`, `class_assignment` (có `plan_item_id`), `quiz_attempt`, `self_study_plan`, `notification_record` (`self_study_released`).
     - Áp dụng `0060_study_pack.sql`.
     - Kiểm tra: 3 bảng `self_study_plan*` đã biến mất; cột `plan_item_id` đã bỏ; cột `available_at`, `class_study_pack_id`, `library_ref` đã có; 4 bảng `study_pack`, `study_pack_item`, `class_study_pack`, `study_pack_exercise` đã tạo; bản ghi `class_assignment` và `quiz_attempt` cũ vẫn còn nguyên; `/readyz` trả 200 `ok: true`; test contract từ chối input sai.
- **Success criteria:** Test migration và readiness pass hoàn toàn.
- **Verify:** `pnpm --filter server test -- study-pack-migration readiness` exits 0 and `pnpm check-types` exits 0.

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
