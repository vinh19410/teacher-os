---
title: "Add class type and structured schedule to create class modal"
description: "Modal Tạo lớp mới thêm field loại lớp (IELTS / Giao tiếp): IELTS chọn nhiều kỹ năng, Giao tiếp không có kỹ năng. Lịch học thay input free-text bằng multi-select thứ (T2–CN) + time picker start/end, end default = start + 90 phút. Thay đổi dọc toàn stack: zod contract, DB migration, server, snapshot, display, modal."
status: completed
priority: P2
effort: "1.5-2d"
branch: develop
tags: [frontend, backend, database, feature]
blockedBy: []
blocks: []
created: 2026-08-20
---

# Add class type and structured schedule to create class modal

## Overview

Hiện tại class có `skill: string` đơn chọn (Writing…/Giao tiếp trộn lẫn) và `schedule: string` free-text. Plan này đưa **loại lớp** (`ielts` | `communication`) thành field chính thức: lớp IELTS chọn **nhiều** kỹ năng (Writing/Speaking/Reading/Listening), lớp Giao tiếp không có kỹ năng. **Lịch học** trở thành dữ liệu có cấu trúc: tập các thứ trong tuần (T2–CN) + giờ bắt đầu/kết thúc, giờ kết thúc mặc định = giờ bắt đầu + 90 phút. Thay đổi chạy dọc: `data-actions.ts` → zod `packages/api` → drizzle `packages/db` (migration 0007) → `apps/server` (POST /api/classes + snapshot) → `mapClasses`/display → modal.

## Scope Challenge

- Existing: luồng ghi kernel đã có sẵn (modal → `useKernelFormSubmit` → POST `/api/classes` → snapshot refresh → `mapClasses`); `Input` nhận `type="time"` qua `inputHTMLAttributes`; `ChipFilter` là tiền lệ chip single-select; `dayNames` (T2…CN) có sẵn trong `mock-data.ts:152`; `KernelLessonRow.day: number` là tiền lệ dữ liệu lịch có cấu trúc.
- Requested: (1) field loại lớp + kỹ năng đa chọn điều kiện theo loại, (2) lịch học multi-select thứ + time picker với end = start + 1.5h mặc định. Không thêm gì ngoài 2 yêu cầu này.
- Complexity: ~13 file / 4 package + 1 migration; không tạo service/abstraction mới ngoài 2 helper nhỏ (`formatSchedule`, `ChipMulti`). 3 phase.
- Selected mode: **HOLD SCOPE**. Auto-detected: hard (blast radius chạm DB migration + contract chéo package; research ngoài không cần — đã có scout report nội bộ).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `classCreateSchema` có `type` (`ielts`\|`communication`) và `skills: string[]`; `schedule` là object `{days, start, end}` được zod validate (days 1–7 unique, time `HH:MM` hợp lệ); invariant chéo enforce ở SERVER (`superRefine`): IELTS ≥1 kỹ năng, Giao tiếp = 0 kỹ năng | P1 |
| 2 | DB: cột `type` mới + cột `skills` (JSON array, rename từ `skill`) qua migration forward-only, back-compat dữ liệu cũ (skill `Giao tiếp` → type communication) | P1 |
| 3 | Modal: chọn loại lớp; IELTS hiện multi-select kỹ năng (≥1 bắt buộc), Giao tiếp ẩn field kỹ năng | P1 |
| 4 | Modal: lịch học = chips T2–CN (≥1 bắt buộc) + 2 time picker; đổi start → end tự = start + 90 phút (trừ khi user đã sửa end) | P1 |
| 5 | Display (classes list + detail) hiển thị đúng theo loại lớp; schedule cũ free-text vẫn hiển thị được (fallback) | P1 |
| 6 | `pnpm check` / `pnpm test` / `pnpm check-types` / `pnpm build` xanh, kể cả các test fixture đang hardcode payload add-class | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Contract + DB migration + server](./phase-01-start.md) | Completed |
| 2 | [Web read and display layer](./phase-02-web-read-and-display-layer.md) | Completed |
| 3 | [AddClassModal form rework](./phase-03-addclassmodal-form-rework.md) | Completed |

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|-------------|------|--------|
| none | `260820-2029-add-tanstack-query-for-api-data-state-management` | completed |

Không có quan hệ blockedBy/blocks: plan TanStack chỉ refactor `data-provider.tsx` + command bus internals và cam kết không đổi call-site `useData()`; plan này không đụng 2 file đó. **Lưu ý phối hợp**: cả hai có thể cùng sửa `apps/web/src/lib/repos/kernel.test.ts` (fixture add-class vs test bus 4-state) — rebase trước khi merge cái sau.

## Success Criteria

- [x] Tạo lớp Giao tiếp thành công không cần kỹ năng; card/detail không hiển thị kỹ năng.
- [x] Tạo lớp IELTS bắt buộc chọn ≥1 kỹ năng (chặn cả ở server — POST ielts+skills rỗng → 400), chọn được nhiều; display join bằng ", ".
- [x] Chọn start 19:00 → end tự thành 20:30; sửa tay end được giữ khi đổi start lại.
- [x] Không chọn thứ nào → không submit được (thông báo lỗi tiếng Việt).
- [x] Class tạo trước migration (schedule free-text) vẫn hiển thị nguyên chuỗi cũ; class cũ `skill=''` migrate thành `skills='[]'` (không corrupt `'["[]"]'`).
- [x] POST `/api/classes` thiếu/sai schedule hợp lệ → 400; snapshot trả `type` + `skills: string[]`.
- [x] `pnpm check` / `pnpm test` / `pnpm check-types` / `pnpm build` pass.

## Open Questions

- Field "Trình độ" (Band 5.5–7.5+) chỉ hợp lý với IELTS — có nên ẩn khi loại lớp là Giao tiếp không? Hiện giữ nguyên theo đúng scope yêu cầu; nếu muốn ẩn thì bổ sung 1 thay đổi nhỏ ở Phase 3.

## Rollout / Deploy

Migration chạy thủ công, không chạy khi server boot; `RENAME COLUMN` làm server cũ đang chạy hỏng mọi query đọc class. Sequence bắt buộc: **stop server → migrate 0007 → deploy server + web cùng lúc** (monorepo, 1 release). Wire change breaking có chủ đích: bundle web cũ còn cache nhận 400 trên tạo lớp trong cửa sổ stale — chấp nhận ở giai đoạn pre-pilot. Rollback app code một chiều (forward-only). Chi tiết: Phase 1 "Rollout / Deploy".

## Design Decisions

1. **Wire format**: `schedule` trên wire là object (`{days: number[], start, end}`) được zod validate; DB lưu `JSON.stringify` vào cột `schedule` TEXT cũ. `KernelClassRow.schedule` giữ nguyên `string` (raw) — web parse khi hiển thị, fallback chuỗi legacy.
2. **Skills storage**: rename cột `skill` → `skills`, lưu JSON array string; snapshot parse server-side (`parseSkills` với try/catch fallback `[]`) nên `KernelClassRow.skills: string[]` — downstream không cần parse. `KernelClassRow.type: ClassType` (union, không `string`) để `mapClasses` không cần ép cast.
3. **days convention**: `0 = T2 (thứ 2) … 6 = CN`, khớp index `dayNames` (`mock-data.ts:152`); days dedupe + sort ở server trước khi lưu.
4. **UI primitives**: tạo `ChipMulti<T extends string | number>` (multi-select chips, clone style `ChipFilter`) dùng cho cả 3 picker: loại lớp (value/label), kỹ năng, ngày; `<Input type="time">` cho giờ — không kéo thư viện mới. Không dùng `ChipFilter` cho loại lớp (value = label chuỗi hiển thị, gửi nhầm `"IELTS"` thay vì `"ielts"`).
5. **Migration policy**: forward-only, migration mới `0007_*.sql` viết tay sau khi generate (drizzle dễ sinh table-rebuild khi đổi name+default), không sửa migration đã apply (khớp ràng buộc production-readiness plan). Thứ tự UPDATE: wrap `json_array` trước (guard `<> ''`), blanket `'[]'` sau.
6. **Trust boundary**: invariant loại lớp ↔ kỹ năng enforce ở server (`superRefine`); validation modal chỉ là UX. Overnight: `end <= start` = qua ngày hôm sau, hợp lệ.

## Red Team Review

### Session — 2026-08-20
**Mode:** hard (auto-detected) — 3 reviewers (Security Adversary, Failure Mode Analyst, Assumption Destroyer), tier Standard (Fact Checker + Contract Verifier). **Findings:** 24 raw → 13 dedup (13 accepted, 0 rejected — tất cả có evidence file:line).
**Severity breakdown:** 2 Critical, 4 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Migration SQL: thứ tự UPDATE corrupt rows `skill=''` thành `'["[]"]'` (cả 3 reviewer) | Critical | Accept | Phase 1 (SQL reorder + guard + sanity check + case `''`) |
| 2 | Bỏ sót consumer `data-store-reducer.ts:124-134` — case add-class spread payload, vỡ typecheck + optimistic row sai shape | Critical | Accept | Phase 3 (Related Files + step 3, map `JSON.stringify`) |
| 3 | Claim sai vị trí seed: `src/lib/mock-data.ts` không có seed; seed thật `apps/web/test/fixtures/mock-data.ts` (`seedData`) bị bỏ sót | High | Accept | Phase 2 (Related Files + step 1) |
| 4 | Bỏ sót fixture `repos/kernel.test.ts:15,35-50` (typed `KernelSnapshot` với `skill`) — vỡ typecheck ngay Phase 1 | High | Accept | Phase 2 (Related Files + step 1) |
| 5 | Invariant IELTS ≥1 kỹ năng / Giao tiếp = 0 chỉ enforce ở UI — API chấp nhận dữ liệu mâu thuẫn | High | Accept | Phase 1 (`superRefine` + test 400 f/g), plan.md Goal 1 + DD6 |
| 6 | Deploy-order/rollback hole: RENAME làm server cũ đang chạy 500; migration thủ công không có sequence; stale bundle 400 | High | Accept | Phase 1 "Rollout / Deploy" + plan.md "Rollout / Deploy" |
| 7 | `KernelClassRow.type: string` vs `ClassGroup.type: ClassType` → type error chắc chắn ở `mapClasses` | Medium | Accept | Phase 1 step 2 (`type: ClassType`), plan.md DD2 |
| 8 | Drizzle đổi name+default cùng lúc dễ sinh table-rebuild (style 0006) thay vì RENAME sạch | Medium | Accept | Phase 1 (viết tay migration 0007, risk cập nhật) |
| 9 | `ChipMulti value: string[]` vs days `number[]` không khớp; payload days có thể gửi string | Medium | Accept | Phase 3 (ChipMulti generic `<T>` + test typeof number) |
| 10 | `ChipFilter` value = label hiển thị → gửi nhầm `"IELTS"` thay vì `"ielts"` | Medium | Accept | Phase 3 (dùng ChipMulti cho loại lớp, bỏ ChipFilter), plan.md DD4 |
| 11 | `days` chấp nhận trùng + không giới hạn độ dài (`[1,1,1…]` pass) | Medium | Accept | Phase 1 (`.max(7)` + unique refine + server dedupe/sort) |
| 12 | Regex `HH:MM` chấp nhận `99:99`; nhánh validation "thiếu giờ" là code chết; overnight chưa định nghĩa | Medium | Accept | Phase 1 (regex chặt), Phase 3 (bỏ nhánh chết, định nghĩa overnight), plan.md DD6 |
| 13 | Consumer enumeration: `classCreateSchema` (2) cover đủ; `KernelClassRow`/`ClassGroup`/payload có 3 site bỏ sót (gộp vào #2/#3/#4) | Medium | Accept | Đã gộp |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-web-read-and-display-layer.md, phase-03-addclassmodal-form-rework.md
- Decision deltas checked: 9 (SQL order, KernelClassRow.type union, superRefine, ChipMulti generic thay ChipFilter, seed fixture path, reducer consumer, regex giờ, overnight semantics, rollout sequence)
- Reconciled stale references: 3 (bỏ claim "seed trong src/lib/mock-data.ts"; bỏ claim "không có code nào giả định payload.schedule là string" ở Phase 3 risk; bỏ ChipFilter khỏi DD4/Phase 3)
- Unresolved contradictions: 0
