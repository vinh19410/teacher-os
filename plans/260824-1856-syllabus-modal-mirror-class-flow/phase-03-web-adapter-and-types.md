---
phase: 3
title: "Web adapter and types"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Web adapter and types

## Overview

Update mock-data `Syllabus` type, repo `mapSyllabi`, reducer `add-syllabus` case, dispatcher payload type, và các test liên quan để phản ánh `type` + `skills[]`.

## Requirements

- Functional: `mapSyllabi` map `row.type` và `row.skills` từ kernel snapshot vào display `Syllabus` shape
- Functional: reducer optimistic `add-syllabus` phản ánh đúng `type` + `skills` để cache có shape khớp trước khi refresh
- Functional: dispatcher `data-actions.ts` payload đổi `skill: string` → `skills: string[]`, thêm `type: ClassType`
- Non-functional: TS compile toàn `apps/web`, mọi callsite consume `syllabus.skill` fail compile — Phase 5 sẽ xử

## Architecture

- **Display type** (`apps/web/src/lib/mock-data.ts` L121-128): `Syllabus.skill: string` → `Syllabus.skills: string[]`, thêm `type: ClassType`
- **Repo mapping** (`apps/web/src/lib/repos/syllabus.ts` L16-38): `skills: Array.isArray(row.skills) ? row.skills : row.skill ? [row.skill] : []`, `type: row.type === "communication" ? "communication" : "ielts"` — defensive nếu snapshot cũ còn `skill`.
- **Reducer** (`apps/web/src/lib/data-store-reducer.ts` L151-157): `add-syllabus` payload spread không đủ — phải mirror `type` và `skills` cho consistency với dispatcher
- **Dispatcher** (`apps/web/src/lib/repos/kernel.ts` L59-65): `add-syllabus` body → thêm `type`, `skills`

## Related Code Files

- Modify: `apps/web/src/lib/mock-data.ts`
- Modify: `apps/web/src/lib/repos/syllabus.ts`
- Modify: `apps/web/src/lib/repos/kernel.ts` (dispatcher body)
- Modify: `apps/web/src/lib/data-store-reducer.ts` (case "add-syllabus")
- Modify: `apps/web/src/lib/data-actions.ts` (KernelAction type — add-syllabus payload)
- Modify: `apps/web/src/lib/repos/syllabus.test.ts` (fixture + assert)
- Modify: `apps/web/src/lib/repos/kernel.test.ts` (fixture)
- Modify: `apps/web/src/lib/data-store-reducer.test.ts` (nếu test cover add-syllabus)
- Modify: `apps/web/src/lib/syllabus-peel.contract.test.ts`
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (nếu chạm syllabus fixture)
- Modify: `apps/web/src/lib/repos/classes.test.ts` (KernelSyllabusRow fixture `skill: "Writing"` tại L80)
- Modify: `apps/web/test/fixtures/mock-data.ts` (seed `skill: ""` tại L170 — **không** nằm trong `src/lib/mock-data.ts`)

## Implementation Steps

1. `mock-data.ts`: đổi `Syllabus.skill` → `skills`, thêm `type: ClassType`. Import `ClassType` đã có. **Không** có seed trong file này.
2. `apps/web/test/fixtures/mock-data.ts:165-173`: seed `skill: ""` → `{ type: "ielts", skills: [] }`.
3. `repos/syllabus.ts` `mapSyllabi`: emit `type` + `skills` với fallback ở Architecture.
4. `data-actions.ts` `add-syllabus` payload: đổi `skill: string` → `skills: string[]`, thêm `type: ClassType`. **Giữ `id: string`** — reducer `data-store-reducer.ts:151-154` spread payload; test `:128` assert `created.id === payload.id`. Không phải dead field.
5. `repos/kernel.ts` L59-65 dispatcher: thêm `type`, `skills` vào request body; bỏ `skill`. Không gửi `id` trên wire (đã drop).
6. `data-store-reducer.ts` case `add-syllabus` L151-157: set explicit `{id, name, type, level, skills, description, totalLessons, modules: []}` (không dựa vào spread thiếu field).
7. Cập nhật tests:
   - `syllabus.test.ts` fixture: `skill` → `skills: [...]`, thêm `type: "ielts"`
   - `repos/kernel.test.ts` fixture + payload
   - `data-store-reducer.test.ts` add-syllabus (`skill` → `skills` + `type`; giữ assert `id`)
   - `classes.test.ts:80` KernelSyllabusRow
   - `apps/web/test/fixtures/mock-data.ts:170`
   - `syllabus-peel.contract.test.ts` / `kernel-runtime.contract.test.ts` chỉ nếu assert `.skill`
8. Chạy `pnpm --filter @teacher-os/web test` cho repo/reducer. `check-types` web **sẽ đỏ** ở UI consumer đến hết Phase 5 — kỳ vọng.

<!-- Updated: Validation Session 1 - fixtures + keep id -->

## Success Criteria

- [x] `Syllabus` display type có `type: ClassType` và `skills: string[]`
- [x] `mapSyllabi` map đúng cả `type` và `skills`
- [x] Dispatcher `add-syllabus` gửi `type` + `skills` trong body
- [x] Reducer set `type` + `skills` từ payload (KHÔNG lấy default)
- [x] `apps/web` test contract xanh cho syllabus repo layer

## Risk Assessment

- **Risk:** Consumer UI (Phase 5) truy cập `syllabus.skill` → TS compile fail bù trừ toàn app.
  - **Signal:** `pnpm check-types` báo lỗi consumer.
  - **Response:** Đó là kỳ vọng — Phase 5 dọn.
- **Risk:** Seed `apps/web/test/fixtures/mock-data.ts:170` + `classes.test.ts:80` còn `skill` string; bỏ sót → tests/typecheck đỏ.
  - **Signal:** `test` / `check-types` báo TS error trong fixture.
  - **Response:** Grep `skill:` trên KernelSyllabusRow / Syllabus fixtures (không chỉ `src/lib/mock-data.ts`).
