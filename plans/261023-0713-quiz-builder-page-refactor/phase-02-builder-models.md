---
phase: 2
title: "Model nhóm và model cây đề"
status: pending
priority: P1
effort: "0.5d"
dependencies: ["#420 phase 2", "#420 phase 3", 1]
---

# Phase 2: Model nhóm và model cây đề (`apps/admin`)

## Overview

Toàn bộ logic thuần mà UI cần: thao tác nhóm, `PartFormValue` mang `groups`, mapping lỗi nhóm, dựng cây Part → Nhóm → Câu cho mọi slot, và dữ liệu cho panel kiểm tra đáp án. Không có JSX trong phase này.

## Context

- Plan #420 phase 4 Task 4.2, 4.3, 4.4, 4.5b (helper nhóm, test, `PartFormValue.groups`, message tiếng Việt + path lỗi dạng `groups.N.field`).
- Trang hiện giữ nháp mọi part trong `drafts: Map<slot, {dirty, value}>` và DTO đã lưu trong `partsBySlot` (`$testId.tsx`).
- `qStartOf(skill, part)` ở `packages/ui/src/components/assignments/editor/assignment-presets.ts:333`.

## Related code files

- Create: `apps/admin/src/components/library/group-model.ts` (+ `.test.ts`) — theo #420 Task 4.2/4.3
- Modify: `apps/admin/src/components/library/part-form.tsx`, `part-form.test.tsx`, `part-issues.ts` — theo #420 Task 4.4/4.5b
- Create: `apps/admin/src/components/library/test-outline-model.ts` (+ `.test.ts`)
- Create: `apps/admin/src/components/library/answers-overview.ts` (+ `.test.ts`)

## Implementation steps

### Task 2.1 — Helper nhóm
Thực hiện nguyên văn Task 4.2 và 4.3 của plan #420. Thêm hàm `moveQuestion(value, gi, offset, dir)` hoán đổi câu trong dải của nhóm `gi` (không cho vượt biên nhóm) và test cho nó.

### Task 2.2 — `PartFormValue` mang `groups` + lỗi nhóm
Thực hiện nguyên văn Task 4.4 và 4.5b của plan #420.

### Task 2.3 — Model cây đề
1. Tạo `test-outline-model.ts` export:
   ```ts
   interface OutlineQuestion { number: number; offset: number; hasAnswer: boolean }
   interface OutlineGroup { index: number; label: string; typeLabel: string; questions: OutlineQuestion[] }
   interface OutlineSection { part: string; label: string; qStart: number; state: "empty" | "saved" | "dirty"; groupCount: number; questionCount: number; groups: OutlineGroup[] }
   function buildTestOutline(skill, slots, partsBySlot, drafts): OutlineSection[]
   ```
2. Nguồn value mỗi slot: `drafts.get(part)?.value` nếu có, ngược lại `partValueFromDto(saved)`; slot không có cả hai → `state: "empty"`, `groups: []`.
3. Nhóm lấy qua `effectiveGroups(value)` (nhóm ngầm vẫn hiện thành "Nhóm câu 1"); `number = qStartOf(skill, part) + group.startIndex + offset`; `typeLabel = quizTypeDisplay(group.type).label`.
4. `groupCount` = số nhóm thật (`value.groups.length`, part không nhóm = 1).
5. Test: Reading 2 nhóm (3 + 2 câu) ở `p1` cho số 1…5; `p2` bắt đầu bằng `qStartOf("reading","p2")`; nháp thắng bản đã lưu; slot trống.

### Task 2.4 — Dữ liệu panel kiểm tra đáp án
1. Tạo `answers-overview.ts` export `buildAnswersOverview(outlineSource)` → mảng `{ number; part; partLabel; groupIndex; answer; alts: string[]; missing: boolean }` theo thứ tự số câu, dùng cùng nguồn value như Task 2.3 (tách hàm `resolvePartValues` dùng chung để không lặp).
2. Test: câu thiếu đáp án có `missing: true`; `alts` tách từ dữ liệu câu như grader đọc.

## Todo

- [ ] Task 2.1 helper nhóm + `moveQuestion`
- [ ] Task 2.2 `PartFormValue.groups` + lỗi nhóm
- [ ] Task 2.3 `buildTestOutline`
- [ ] Task 2.4 `buildAnswersOverview`

## Success criteria

- `pnpm --filter admin test` và `pnpm --filter admin check-types` exit 0; test cũ của `part-form.test.tsx` không phải sửa ngoài fixture `groups: []` đã thêm ở #420 phase 2.

## Risk

- `group-model.ts` import type từ `part-form.tsx` và ngược lại: dùng `import type` để không tạo vòng import lúc chạy (như #420 đã ghi).
