---
title: "Phase 4: Web data layer"
status: todo
priority: P1
effort: "0.5d"
dependencies: [3]
---

# Phase 4: Web data layer

> Context: [reports/design-decisions.md](./reports/design-decisions.md) (D4 contracts/snapshot, D5 web changes), [reports/scout-report.md](./reports/scout-report.md) (§4 web data layer + line evidence, §6 web tests), [reports/research-report.md](./reports/research-report.md) (§5 edge cases — totalLessons compute live).

## Overview

Đưa tầng data web về contract mới (phase 3): action `assign-syllabus` → `import-syllabus` (kèm `remove-curriculum` mới), repo POST đúng endpoint, `mapSyllabi` pass-through `classId`/`sourceTemplateId`, `useSyllabus` expose `templates` (filter `classId === null`), `classesForSyllabus` derive "đang dùng" qua `sourceTemplateId`, mock-data types + fixture cập nhật. Runtime write-path là command bus + snapshot refresh (`data = mapKernelSnapshot(snapshot)` — data-provider.tsx:74-78); **reducer là historical fixture không nối runtime** (data-store-reducer.ts:37; kernel-runtime.contract.test.ts:41-42 cấm provider reference reducer) — phase này ở reducer CHỈ XOÁ case `assign-syllabus` chết (:164-170) + test tương ứng, KHÔNG thêm case mới (red-team B). Zero churn ở read path `syllabusById(cls.syllabusId)` — pointer giờ tên copy (D4).

## Requirements

- [x] `apps/web/src/lib/data-actions.ts` (:42-96): xoá action `assign-syllabus`; thêm `import-syllabus {classId, templateId}`; thêm `remove-curriculum {classId}`. `add-class` đổi payload `syllabusId` → `templateId`.
- [x] `apps/web/src/lib/repos/kernel.ts` (:52-74): `import-syllabus` → `POST /api/classes/:id/import-syllabus` body `{templateId}`; `remove-curriculum` → `POST /api/classes/:id/remove-curriculum`; `add-class` gửi `templateId`; xoá path assign cũ (:401-410 test rewrite).
- [x] `apps/web/src/lib/repos/syllabus.ts` (:16-45): `mapSyllabi` thêm `classId`, `sourceTemplateId` pass-through; **giữ** totalLessons recompute (:27), placeholder empty→undefined/—, status trio.
- [x] `apps/web/src/lib/repos/use-syllabus.ts` (:17-25): ngoài `syllabi` expose `templates = syllabi.filter(s => s.classId === null)` (memo); writes vẫn đi command bus.
- [x] `apps/web/src/lib/data-provider.tsx` (:53-55, 133-136): giữ `syllabusById`; `classesForSyllabus(templateId)` đổi semantics — classes có copy với `sourceTemplateId === templateId` (derive từ `data.syllabi`, không còn filter `class.syllabusId === id`). Lưu ý (red-team M): selector này hiện **0 caller** — consumer thật của semantics pointer cũ là 2 inline filter `data.classes.filter((c) => c.syllabusId === sy.id)` tại `syllabus/index.tsx:50` và `syllabus/$syllabusId.tsx:86` — 2 site đó là migration target bắt buộc (phase 5 sửa cùng UI).
- [x] `apps/web/src/lib/data-store-reducer.ts` (:151-261): **xoá case `assign-syllabus` (:164-170)** và test :223 tương ứng; KHÔNG thêm case import/remove (switch có `default: return state` — union mới compile không cần case; runtime pointer đến từ snapshot refresh, red-team B). **Giữ** totalLessons recompute cho add/edit module/lesson.
- [x] `apps/web/src/lib/mock-data.ts` (:95-129): display type `Syllabus` thêm `classId: string | null`, `sourceTemplateId: string | null` (D4); `ClassGroup.syllabusId` giữ `string` — unassigned map `null → ""` theo convention `classes.ts:59` (red-team B: KHÔNG đổi thành null).
- [x] Cập nhật tests: `data-store-reducer.test.ts` (xoá assign case :223), `repos/kernel.test.ts` (:231-240, :368-410), `repos/syllabus.test.ts` (:65-:115), `apps/web/test/fixtures/mock-data.ts`, **`repos/classes.test.ts:9,75-86` (fixture KernelSnapshot thiếu 2 field mới → typecheck đỏ nếu bỏ sót — red-team M)**.

## Architecture

Read path không đổi hình: snapshot → `mapSyllabusRows` → `mapSyllabi` (thêm 2 field) → `useSyllabus`/`DataProvider`. Điểm novel duy nhất: "đang dùng" chuyển từ pointer-equality sang provenance-join (`sourceTemplateId`) — derive client-side từ snapshot (D4), không cần endpoint riêng. Write path runtime: modal → dispatch → command bus POST → snapshot refetch kéo cây copy + pointer (data-provider.tsx:74-116); reducer KHÔNG tham gia (dead fixture — red-team B).

## Related Code Files

- `apps/web/src/lib/data-actions.ts` — action union.
- `apps/web/src/lib/repos/kernel.ts` — HTTP repo + `mapKernelSnapshot`.
- `apps/web/src/lib/repos/syllabus.ts` — `mapSyllabi`.
- `apps/web/src/lib/repos/use-syllabus.ts` — hook read.
- `apps/web/src/lib/data-provider.tsx` — context selectors.
- `apps/web/src/lib/data-store-reducer.ts` — reducer.
- `apps/web/src/lib/mock-data.ts` — display types + seed.
- Tests: `apps/web/src/lib/data-store-reducer.test.ts`, `apps/web/src/lib/repos/kernel.test.ts`, `apps/web/src/lib/repos/syllabus.test.ts`, `apps/web/test/fixtures/mock-data.ts`.

## Implementation Steps

1. `mock-data.ts`: type `Syllabus` + 2 field; cập nhật mock rows (template `classId: null`, copy gắn `classId` + `sourceTemplateId` cho ≥1 lớp demo).
2. `repos/syllabus.ts` `mapSyllabi`: pass 2 field qua (map từ row).
3. `repos/kernel.ts`: đổi `mapKernelSnapshot`/`mapSyllabusRows` truyền 2 field; thay command assign bằng import/remove; `add-class` body `templateId`.
4. `data-actions.ts`: union action mới, xoá `assign-syllabus`.
5. `data-store-reducer.ts`: xoá case `assign-syllabus` (:164-170) — không thêm case mới (red-team B).
6. `use-syllabus.ts`: thêm `templates` memo.
7. `data-provider.tsx`: `classesForSyllabus` derive qua `sourceTemplateId`.
8. Cập nhật 4 file test theo matrix; chạy `pnpm --filter web test` (nếu filter khác, dùng `pnpm test` scoped).

## File Inventory

| File | Action | Size | Test impact |
|------|--------|------|-------------|
| `apps/web/src/lib/data-actions.ts` | modify | S | reducer test compile |
| `apps/web/src/lib/repos/kernel.ts` | modify | M | `repos/kernel.test.ts` :231-240/:368-410 |
| `apps/web/src/lib/repos/syllabus.ts` | modify | S | `repos/syllabus.test.ts` :65-:115 |
| `apps/web/src/lib/repos/use-syllabus.ts` | modify | S | `syllabus-peel.contract.test.ts` |
| `apps/web/src/lib/data-provider.tsx` | modify | S | provider selectors |
| `apps/web/src/lib/data-store-reducer.ts` | modify | M | `data-store-reducer.test.ts` :117-:223 |
| `apps/web/src/lib/mock-data.ts` | modify | S | typecheck toàn consumer |
| `apps/web/src/lib/data-store-reducer.test.ts` | modify | M | rewrite assign case :223 |
| `apps/web/src/lib/repos/kernel.test.ts` | modify | S | rewrite assign path :401-410 |
| `apps/web/src/lib/repos/syllabus.test.ts` | modify | S | thêm assert pass-through |
| `apps/web/test/fixtures/mock-data.ts` | modify | S | fixture rows có 2 field |

## Test Scenario Matrix

| # | Scenario (invariant khóa) | Priority |
|---|---------------------------|----------|
| 1 | Repo import POST đúng path `/api/classes/:id/import-syllabus` + body `{templateId}` (rewrite :401-410) | Critical |
| 2 | Repo remove POST `/api/classes/:id/remove-curriculum` body rỗng | Critical |
| 3 | `mapSyllabi` pass-through `classId`/`sourceTemplateId` + totalLessons recompute vẫn đúng (:65 không regression) | High |
| 4 | `templates` chỉ chứa `classId === null`; copy bị loại | High |
| 5 | `classesForSyllabus(templateId)` đếm class có copy `sourceTemplateId === id` (kể cả class có pointer nhưng khác template → không đếm) | High |
| 6 | `add-class` gửi `templateId` (default `""` = không import) | Medium |
| 7 | Reducer: case `assign-syllabus` đã xoá, action union mới compile (không case import/remove — dead fixture, red-team B) | Medium |
| 8 | Contract import → refreshed snapshot chứa cây copy + pointer trỏ copy (bus refetch path — thay cho Critical scenario reducer cũ) | Critical |
| 9 | Typecheck: không còn reference `assign-syllabus` ở apps/web lib | Critical |

## Success Criteria

- [x] `pnpm test` pass cho các suite web nêu trên (matrix 1-9).
- [x] `pnpm check-types` pass — action union + display types khớp contract phase 3.
- [x] Grep `apps/web/src/lib` không còn `assign-syllabus`.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `classesForSyllabus` đổi semantics — selector hiện 0 caller, site đọc thật là 2 inline filter `syllabus/index.tsx:50`, `$syllabusId.tsx:86` | Nêu đích danh 2 inline site là migration target (phase 5 sửa cùng UI); KHÔNG dựa vào grep `classesForSyllabus` (trả rỗng — red-team M) |
| `templates` filter mỗi render alloc mới | Memo trong hook (useMemo) — pattern sẵn của use-syllabus |
| Fixture cũ thiếu field → typecheck đỏ | Bước 1 làm mock-data trước (kể cả `repos/classes.test.ts:75-86`), các bước sau compile được dần |

## Dependency Map

- **Input:** Phase 3 (contract, endpoint, response shape).
- **Output → Phase 5:** `templates`, action `import-syllabus`/`remove-curriculum`, `classesForSyllabus` (đang dùng) là API cho UI.
- **Output → Phase 6:** suite web xanh là điều kiện acceptance.
