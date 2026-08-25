---
title: "Syllabus modal mirror class flow"
description: "Popup 'Tạo syllabus mới' chọn loại lớp (ielts/communication) trước, sau đó chọn kỹ năng — song hành với popup 'Tạo lớp mới'. Persist `type` + `skills[]` vào bảng syllabus."
status: completed
priority: P1
effort: "0.5-1d"
tags: [ui, syllabus, contract, migration]
created: 2026-08-24
---

# Syllabus modal mirror class flow

## Overview

Popup **"Tạo syllabus mới"** hiện tại có 1 dropdown `skill` (single) và không có khái niệm "loại lớp". Popup **"Tạo lớp mới"** thì chọn `classType` (chip ielts/communication) trước, gate `skills[]` (multi-chip) chỉ hiện khi ielts.

Yêu cầu người dùng: syllabus modal phải chọn **loại lớp trước** → sau đó **chọn kỹ năng**, mirror UX của add-class modal. Người dùng đã xác nhận cả ba quyết định phạm vi:

- Loại lớp **persist vào DB syllabus** (thêm cột `type`)
- `skill: string` → `skills: string[]` (multi-select ChipMulti)
- `communication` → ẩn field kỹ năng, lưu `skills=[]`

Pattern DB migration đã có tiền lệ chuẩn: `packages/db/src/migrations/0007_class_type_skills.sql` (áp dụng đúng logic đó cho bảng syllabus).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | AddSyllabusModal mirror UX của AddClassModal (chip loại lớp → gate chip kỹ năng) | P1 |
| 2 | Persist `type` (ielts/communication) và `skills[]` (JSON) vào bảng `syllabus`, backfill dữ liệu cũ an toàn | P1 |
| 3 | Đồng bộ contract, kernel snapshot, web repo, mock-data type, và mọi consumer hiển thị `syllabus.skill` | P1 |
| 4 | Zero regression: syllabus list filter, syllabus detail tag, syllabus-progress header vẫn render đúng | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: DB schema and migration](./phase-01-db-schema-and-migration.md) | Pending |
| 2 | [Phase 2: API contract and server](./phase-02-api-contract-and-server.md) | Pending |
| 3 | [Phase 3: Web adapter and types](./phase-03-web-adapter-and-types.md) | Pending |
| 4 | [Phase 4: AddSyllabusModal UI](./phase-04-addsyllabusmodal-ui.md) | Pending |
| 5 | [Phase 5: Downstream consumers and acceptance](./phase-05-downstream-consumers-and-acceptance.md) | Pending |

Dependency: 1 → 2 → 3 → 4 → 5. Không parallelize — data-shape contract chảy tuyến tính.

## Non-goals

- **Không** đổi filter chip trang list thành filter theo `type`. Vẫn filter theo skill. Phase 5 **được** derive chip từ `IELTS_SKILLS` (thêm Listening đang thiếu) — đó không phải đổi sang filter-by-type.
- **Không** đổi UX `AssignSyllabusModal` / `AddClassModal` dropdown / `POST assign-syllabus` để filter hoặc 409 khi `class.type !== syllabus.type`. Type trên syllabus phục vụ create-modal + tag hiển thị. Residual: giáo viên vẫn gán communication syllabus vào lớp IELTS (hành vi cũ). Follow-up plan riêng nếu cần.
- **Không** viết chức năng edit syllabus.type/skills sau khi tạo (hiện tại syllabus chỉ có create, không có edit metadata endpoint).

## Non-scope reductions (--yagni not passed)

Full requested scope được deliver, không cắt.

## Deploy coupling (per advisory + red-team)

Migration 0008 `RENAME COLUMN skill→skills` + Zod `syllabusCreateSchema` đổi `skill` → `type`/`skills` là breaking **ba** bề mặt cùng lúc:

1. DB: worker cũ `SELECT skill` trên cột đã rename → 500 toàn `GET /api/kernel` (DataProvider unmount workspace).
2. API: schema mới strip `skill`, default `skills=[]`, superRefine reject ielts+[] → client cũ 400 mọi "Tạo syllabus".
3. Web: dispatcher/modal mới gửi `type`/`skills` mà API cũ không persist.

**Release unit:** một alchemy deploy gồm migration 0008 + worker + web. Không dual-write/compat layer (0007 đã ship RENAME cùng pattern). Không expand/contract. Không để hở qua đêm giữa web và API.

## Risk overview

| Risk | Mitigation |
|------|-----------|
| SQLite `ALTER TABLE RENAME COLUMN` + JSON backfill có thể lỗi trên D1 nếu dữ liệu cũ có ký tự đặc biệt trong `skill` | Follow pattern 0007 (`json_array(...)`, `UPDATE ... WHERE`); test migration trên local libsql trước khi deploy. 0008 **không** idempotent — viết tay, không replay `json_array` lên row đã wrap. |
| Web reducer `add-syllabus` (`data-store-reducer.ts:151-157`) spread `payload` gồm `id` | Giữ `id` trên `KernelAction` (fixture reducer + `data-store-reducer.test.ts:128` assert `created.id`). Không gọi `id` là dead field. |
| `syllabus/index.tsx` L27-28 ternary `filter === "Tất cả" ? syllabi : filter by skill` sẽ vỡ nếu thay cả ternary | Phase 5 **giữ** short-circuit `"Tất cả"`; chỉ đổi predicate thành `s.skills.includes(filter)`. |
| `syllabus-progress.tsx` L46 render `syllabus.skill` | Đổi thành `skills.join(", ")` hoặc `CLASS_TYPE_LABELS[type]` nếu rỗng (Phase 5). |
| Snapshot parse `skills` rỗng/`""` | **Bắt buộc** tái sử dụng `parseSkills` + `knownClassTypes` (`snapshot.ts:55-67,196-197`). Cấm `JSON.parse` trần và cấm bịa `safeParseJsonArray`. |
| Migration chạy khi bảng `syllabus` có row với `skill` là chuỗi rỗng | Pattern 0007 đã cover: `UPDATE ... SET skills = '[]' WHERE skills = ''` |

## Success Criteria

- [ ] Modal "Tạo syllabus mới": chip "Loại lớp" (ielts/communication) hiển thị trước chip "Kỹ năng"
- [ ] Chọn `communication` → chip "Kỹ năng" ẩn, submit thành công với `skills=[]`
- [ ] Chọn `ielts` → chip "Kỹ năng" (multi-select) hiển thị; validation "Chọn ít nhất một kỹ năng" khi chưa chọn
- [ ] `POST /api/syllabi` với `{type:"ielts", skills:["Writing"]}` tạo row hợp lệ; snapshot echo lại nguyên vẹn
- [ ] Migration chạy sạch trên DB có row cũ (skill="Writing" | skill="") → backfill sang skills=["Writing"] | skills=[], type="ielts"
- [ ] `packages/api`, `apps/server`, `apps/web`: `pnpm check-types` pass. `@teacher-os/db` **không** có script `check-types` — verify schema bằng `pnpm --filter @teacher-os/db db:generate` không sinh migration lạ + TypeScript workspace (không bịa script).
- [ ] `pnpm test` pass (bao gồm `createSyllabus` helper `apps/server/src/kernel.test.ts:240-258`, `syllabus.test.ts`, `classes.test.ts`, `data-store-reducer.test.ts`, `apps/web/test/fixtures/mock-data.ts`)
- [ ] `pnpm build` pass toàn workspace
- [ ] Trang `/syllabus` giữ chip "Tất cả"; filter skill (kể cả Listening) vẫn hoạt động; communication (`skills=[]`) chỉ hiện ở "Tất cả"
- [ ] Trang `/syllabus/$id` render tag skills đúng
- [ ] `syllabus-progress.tsx` không crash khi `skills=[]`
- [ ] Không log warn "unknown syllabus type" trên console

## Boundary reminder

- **Plan-only:** không edit code source. Sau khi plan được review/duyệt, chạy `/ak:cook plans/260824-1856-syllabus-modal-mirror-class-flow` để implement.

## Validation Log

### Session — 2026-08-24 (vibe autonomous)

Issue #77 đã confirm 3 quyết định phạm vi (persist `type`, `skills[]`, communication → `[]`). Không interview thêm — không có quyết định sản phẩm mới làm đổi implementation.

### Verification Results
- **Tier:** Full (5 phases)
- **Claims checked:** 92
- **Verified:** 81 | **Failed:** 8 | **Unverified:** 3

#### Failures applied
1. `@teacher-os/db` không có `check-types` — sửa AC.
2. Seed không ở `apps/web/src/lib/mock-data.ts` — thật: `apps/web/test/fixtures/mock-data.ts:170`.
3. `id` trên add-syllabus **không** dead (`data-store-reducer.ts:151-154`, test `:128`).
4. Fixture POST server là `createSyllabus` `kernel.test.ts:240-258`, không phải L821+.
5. Sót fixture: `apps/web/src/lib/repos/classes.test.ts:80`, `apps/web/test/fixtures/mock-data.ts:170`.
6. Snapshot endpoint thật: `GET /api/kernel` (`kernel.ts:228-232`), không có `/api/kernel/snapshot`.
7. `parseSkills` đã tồn tại (`snapshot.ts:55-64`) — không bịa helper.
8. Phase 4 SC typecheck mâu thuẫn Phase 3/5 — bỏ typecheck khỏi Phase 4.

#### Failures rejected as product (already decided)
- Backfill `skill=''` → `type=communication`: issue chấp nhận `type=ielts` + `skills=[]` (cosmetic drift). SuperRefine chỉ áp create, không áp row cũ.

### Whole-Plan Consistency Sweep
- Files reread: plan.md + phase-01..05
- Decision deltas checked: 11
- Reconciled stale references: see Red Team Review
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-08-24
**Findings:** 16 unique after dedup (7 accepted, 9 rejected)
**Severity breakdown:** 0 Critical accepted, 4 High considered, rest Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Reuse `parseSkills` + `knownClassTypes`; cấm JSON.parse trần | High | Accept | Phase 2 |
| 2 | Sửa `createSyllabus` helper L240-258, không L821+ | High | Accept | Phase 2 |
| 3 | Seed + `classes.test.ts` fixtures | High | Accept | Phase 3 |
| 4 | Deploy unit = migration + worker + web | Medium | Accept | plan.md, Phase 2 |
| 5 | 0008 viết tay; không apply SQL drizzle-kit generate as-is; không idempotent | Medium | Accept | Phase 1 |
| 6 | Giữ `id` trên KernelAction; giữ ternary "Tất cả" | Medium | Accept | Phase 3, 5 |
| 7 | Bỏ typecheck Phase 4; empty communication = Tag "Giao tiếp" | Medium | Accept | Phase 4, 5 |
| 8 | Enforce type khi assign syllabus↔class | High | Reject | Non-goal đã confirm |
| 9 | Max-bound name/description / thêm delete | Medium | Reject | Ngoài scope; class create cũng không max name |
| 10 | Backfill rỗng → communication | Medium | Reject | Issue chấp nhận ielts+[] |
| 11 | Expand/contract dual-write skill\|skills | High | Reject | 0007 đã ship RENAME cùng bước; compat layer ngoài scope |
| 12 | Time Travel / stop-the-world runbook đầy đủ | Medium | Reject | Document release unit; không thêm ops plan |

<!-- Updated: Validation Session 1 + Red Team 2026-08-24 -->

<!-- slug: syllabus-modal-mirror-class-flow -->
