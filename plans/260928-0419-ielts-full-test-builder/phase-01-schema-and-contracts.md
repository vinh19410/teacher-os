---
phase: 1
title: "Schema & Contracts"
status: pending
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Schema & Contracts

## Goal
Tạo 2 bảng DB mới (`assignment_test`, `assignment_test_part`), contracts zod + DTO snapshot, và preset slot cho 4 skill — sao cho `pnpm check-types` toàn workspace xanh ngay cuối phase (kể cả web stub `emptyKernelData`).

## Key Insights
- Precedent trong repo: cây syllabus 3 bảng với cột `position` (`packages/db/src/schema/`) — làm theo pattern này.
- `KernelSnapshot` là interface tĩnh tại `packages/api/src/contracts.ts:1031` — thêm field là additive, nhưng web sẽ vỡ typecheck cho tới khi `emptyKernelData` (`apps/web/src/lib/kernel-state.ts:3`) được bổ sung. Phải làm cùng phase.
- FK `promptId` dùng `onDelete: "restrict"`: prompt đang nằm trong test không được xóa khỏi ngân hàng — lỗi rõ ràng hơn là orphan/client hiện lỗ. (Xem trước: hiện chưa có endpoint xóa prompt; restrict vẫn đúng để chặn tương lai.)
- KHÔNG đụng `assignmentPromptCreateSchema` (contracts.ts:410) và shape `questions` JSON hiện có.

## Files to Create / Modify

- Create: `packages/db/src/schema/assignment-test.ts`
- Modify: `packages/db/src/schema/index.ts` (export barrel)
- Create: `packages/db/src/migrations/0029_<generated_name>.sql` (sinh bằng `pnpm db:generate`)
- Modify: `packages/api/src/contracts.ts` (thêm `ASSIGNMENT_TEST_PRESETS`, zod schemas, DTOs, `KernelSnapshot`)
- Modify: `apps/web/src/lib/kernel-state.ts` (`emptyKernelData` thêm `assignmentTests: []`)
- Modify: `apps/web/src/lib/mock-data.ts` (mở rộng type `KernelHydratedData` dòng 218 — thêm `assignmentTests: KernelAssignmentTestRow[]`)

## Tasks & Steps

### Task 1.1 — Bảng `assignment_test` và `assignment_test_part`
- Goal: schema Drizzle cho 2 bảng, ràng buộc đúng, export qua barrel.
- Target files: `packages/db/src/schema/assignment-test.ts` (mới), `packages/db/src/schema/index.ts` (thêm export).
- Steps:
  1. Tạo `assignment-test.ts` định nghĩa `assignmentTest`: `id` (text PK, gen như các bảng khác trong repo), `orgId` FK `organization` `onDelete: "cascade"`, `title` text NOT NULL, `description` text, `skill` text NOT NULL (giá trị theo key của `ASSIGNMENT_PART_TYPES`: reading/listening/writing/speaking), `timeLimitSeconds` integer NULLABLE (null = không giới hạn — hợp cho Writing/Speaking sau này), `collection` text (vd "IELTS Trainer 2 Academic"), `testGroup` text (vd "TEST 5"), `status` text NOT NULL DEFAULT 'draft' ('draft' | 'ready'), `createdAt`/`updatedAt` theo pattern bảng khác.
  2. Định nghĩa `assignmentTestPart`: `id` text PK, `testId` FK `assignmentTest` `onDelete: "cascade"`, `promptId` FK `assignmentPrompt` `onDelete: "restrict"`, `part` text NOT NULL (slot id: 'p1'|'p2'|'p3' cho reading...), `position` integer NOT NULL, `qStartOverride` integer NULLABLE. **Unique index trên `(testId, part)`**.
  3. Export 2 bảng qua `packages/db/src/schema/index.ts`.
- Success criteria: import 2 bảng từ barrel không lỗi; unique index `(testId, part)` có trong schema definition.
- Verify: `pnpm check-types` exit 0.

### Task 1.2 — Migration SQL
- Goal: migration 0029 tạo 2 bảng, giữ comment DEPLOY ORDER theo pattern `packages/db/src/migrations/0028_salty_purifiers.sql`.
- Target files: `packages/db/src/migrations/` (file mới sinh).
- Steps:
  1. Chạy `pnpm db:generate` tại repo root để sinh migration từ schema mới.
  2. Mở file sinh ra, thêm đầu file comment tiếng Việt theo mẫu 0028: "DEPLOY ORDER (bắt buộc): chạy db:migrate:deploy TRƯỚC khi deploy worker — worker mới SELECT bảng chưa tồn tại sẽ 500."
  3. Kiểm tra SQL chứa `CREATE UNIQUE INDEX` trên `(test_id, part)` và FK `prompt_id` REFERENCES với `ON DELETE RESTRICT`.
- Success criteria: file migration mới tồn tại, chứa 2 CREATE TABLE + unique index + RESTRICT.
- Verify: `grep -l "assignment_test_part" packages/db/src/migrations/0029_*.sql` in ra đúng 1 file; `grep -c "CREATE TABLE" <file>` in ra `2`; `grep "RESTRICT" <file>` in ra dòng FK prompt.

### Task 1.3 — Contracts: presets, zod schemas, DTOs, snapshot
- Goal: nguồn chân lý API cho test entity, đặt cạnh catalog hiện có.
- Target files: `packages/api/src/contracts.ts`.
- Steps:
  1. Thêm `ASSIGNMENT_TEST_PRESETS: Record<Skill, { slots: { part: string; label: string }[] }>` cạnh `ASSIGNMENT_PART_TYPES` (dòng 271): reading → `[p1,p2,p3]`, listening → `[s1,s2,s3,s4]`, writing → `[task1,task2]`, speaking → `[part1,part2,part3]`. Label hiển thị kiểu "Passage 1", "Section 2", "Task 1"...
  2. Thêm `assignmentTestCreateSchema` (zod `.strict()`): title 1..200, description ≤2000 optional, skill trong 4 giá trị, timeLimitSeconds int >0 ≤ 3*3600 nullable, collection ≤200 optional, testGroup ≤100 optional.
  3. Thêm `assignmentTestUpdateSchema` (partial của create + status 'draft'|'ready').
  4. Thêm `assignmentTestPartsSetSchema`: mảng items `{ part: string (phải thuộc slots của skill), promptId: string, qStartOverride?: int >0 }`, tối đa bằng số slot của preset, không trùng `part`.
  5. Thêm DTO `KernelAssignmentTestPartRow` (`{ testId, promptId, part, position, qStartOverride }`) và `KernelAssignmentTestRow` (`{ id, title, description, skill, timeLimitSeconds, collection, testGroup, status, parts: KernelAssignmentTestPartRow[] }`).
  6. Thêm `assignmentTests: KernelAssignmentTestRow[]` vào `KernelSnapshot` (contracts.ts:1031).
- Success criteria: các export mới dùng được từ cả server và web (typecheck), validation từ chối slot sai preset.
- Verify: `pnpm check-types` exit 0. (Nếu packages/api có test file contracts — chạy `pnpm -F @teacher-os/api test` nếu script tồn tại.)

### Task 1.4 — Web stub `emptyKernelData` + mở rộng `KernelHydratedData`
- Goal: snapshot rỗng vẫn thỏa type mới — tránh vỡ typecheck + crash empty state.
- Target files: `apps/web/src/lib/mock-data.ts` (dòng 218, type `KernelHydratedData`), `apps/web/src/lib/kernel-state.ts` (dòng 3, `emptyKernelData`).
- Steps:
  1. TRƯỚC TIÊN mở rộng type `KernelHydratedData` trong `mock-data.ts` — nó là `Pick<MockData, ...> & { enrollments; classAssignments }`; thêm `assignmentTests: KernelAssignmentTestRow[]` vào khối `& {...}` (đúng precedent `enrollments`/`classAssignments`). Nếu bỏ qua bước này, key mới trong `emptyKernelData` sẽ là excess-property error và `pnpm check-types` ĐỎ.
  2. Thêm `assignmentTests: []` vào object `emptyKernelData` (kernel-state.ts:3).
  3. Chạy lại toàn bộ vitest web: `kernel-runtime.contract.test.ts:42` đã assert sự tồn tại của `emptyKernelData` — mọi test cũ phải vẫn xanh.
- Success criteria: `KernelHydratedData` có field mới; `emptyKernelData` chứa key mới; không test nào vỡ.
- Verify: `pnpm -F web test` exit 0 và `pnpm check-types` exit 0.

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

## Risk Assessment
- **Drift migration ↔ schema**: luôn sinh migration bằng `pnpm db:generate`, không viết tay CREATE TABLE.
- **Bỏ quên một mắt xích snapshot-chain** (contracts → loadSnapshot → KernelHydratedData mock-data.ts → emptyKernelData → mapKernelSnapshot → repo mapper → fixtures): phase này chịu trách nhiệm contracts + loadSnapshot-side DTO + KernelHydratedData + emptyKernelData; phần còn lại ở phase 2.

## Security Considerations
- Bảng mới bắt buộc `orgId` — mọi query sau này phải org-scoped như các bảng khác (không có cross-org read).
- Không có field chứa dữ liệu nhạy cảm; passage text là nội dung đề thi bình thường.

## Todo

- [ ] Task 1.1 — 2 bảng schema + barrel export
- [ ] Task 1.2 — Migration 0029 + comment DEPLOY ORDER
- [ ] Task 1.3 — Contracts (presets, zod, DTOs, KernelSnapshot)
- [ ] Task 1.4 — `emptyKernelData` stub + vitest xanh
- [ ] `pnpm check-types` toàn workspace exit 0
