---
phase: 2
title: "Model nhóm và model cây đề"
status: completed
priority: P1
effort: "0.5d"
dependencies: ["#420 phase 2", "#420 phase 3", 1]
---

# Phase 2: Model nhóm và model cây đề (`apps/admin`)

## Overview

Toàn bộ logic thuần mà UI cần: thao tác nhóm, `PartFormValue` mang `groups`, mapping lỗi nhóm, dựng cây Part → Nhóm → Câu cho mọi slot, và dữ liệu cho panel kiểm tra đáp án. Không có JSX trong phase này.

## Context

- Plan #420 phase 4 Task 4.2, 4.3, 4.4, 4.5b (helper nhóm, test, `PartFormValue.groups`, message tiếng Việt + path lỗi dạng `groups.N.field`).
- Trang hiện giữ nháp mọi part trong `drafts: Map<slot, {dirty, value}>` và DTO đã lưu trong `partsBySlot` (`$testId.tsx`). Lưu ý: `PartForm` bắn `onDraftChange` **kể cả khi mount sạch** (`part-form.tsx:326-330`) nên draft sạch luôn tồn tại cho slot từng mở — mọi đọc dữ liệu phải qua `resolvePartValues` (Task 2.3 bước 2).
- Precedent đánh số của repo: `apps/web/src/lib/test-ranges.ts` — `qStart` tĩnh **bị cấm** làm nguồn số ("FORBIDDEN as numbering input", contract test source-parse, CHANGELOG #231); panel Answers Checking bên web dùng `computeTestRanges`. Editor admin phải cùng cơ chế fold này (red-team A1/S1).

## Related code files

- Create: `apps/admin/src/components/library/group-model.ts` (+ `.test.ts`) — theo #420 Task 4.2/4.3
- Modify: `apps/admin/src/components/library/part-form.tsx`, `part-form.test.tsx`, `part-issues.ts` — theo #420 Task 4.4/4.5b
- Create: `apps/admin/src/components/library/test-outline-model.ts` (+ `.test.ts`)
- Create: `apps/admin/src/components/library/answers-overview.ts` (+ `.test.ts`)

## Implementation steps

### Task 2.1 — Helper nhóm
Thực hiện nguyên văn Task 4.2 và 4.3 của plan #420. Thêm hàm `moveQuestion(value, gi, offset, dir)` hoán đổi câu trong dải của nhóm `gi` (không cho vượt biên nhóm) và test cho nó.

### Task 2.2 — `PartFormValue` mang `groups` + lỗi nhóm
Thực hiện nguyên văn Task 4.4 và 4.5b của plan #420. **Bắt buộc nổi bật (red-team S2 — chống mất dữ liệu):** bước 5 của #420 Task 4.4 (`normalizeQuestions` giữ `explanation`/`answerSet` khi rebuild item — hiện tại `part-form.tsx:89-96` đang strip hai field này khỏi mọi lần lưu) và bước 7 (test round-trip `explanation` → `partValueFromDto` → `partInputFromValue`) là mục chặn data-destruction, không được bỏ; task này không chỉ thêm `groups`.

### Task 2.3 — Model cây đề
1. Tạo `test-outline-model.ts` export:
   ```ts
   interface OutlineQuestion { number: number; offset: number; hasAnswer: boolean }
   interface OutlineGroup { index: number; label: string; typeLabel: string; questions: OutlineQuestion[] }
   interface OutlineSection { part: string; label: string; qStart: number; state: "empty" | "saved" | "dirty"; groupCount: number; questionCount: number; groups: OutlineGroup[] }
   function resolvePartValues(skill, slots, partsBySlot, drafts): { part, label, value, state }[]
   function buildTestOutline(skill, slots, partsBySlot, drafts): OutlineSection[]
   ```
2. `resolvePartValues` — nguồn value mỗi slot (red-team F7/A5, mirror gate `if (draft?.dirty)` của `effectiveParts` ở `$testId.tsx:284`):
   - `saved` tồn tại: draft `dirty` thắng; ngược lại dùng `saved`; nếu không có draft thì `saved`.
   - `saved` không tồn tại: `drafts.get(part)?.value ?? emptyPartValue`.
   - `state`: `"dirty"` khi draft dirty; `"empty"` khi không có saved VÀ value đẵ resolve bằng baseline rỗng (draft sạch vừa bấm "Thêm nội dung" — `emptyPartValue` khởi tạo 1 câu rỗng và vẫn bắn onDraftChange khi mount, phải coi là empty); còn lại `"saved"`.
3. Đánh số **fold theo số câu thật, KHÔNG dùng `qStartOf` tĩnh** (red-team A1/S1 — Critical): qStart của part = tổng số câu thật của các part trước theo `resolvePartValues` (part trống count 0). Viết hàm thuần `computeLibraryTestRanges(entries)` mirror `apps/web/src/lib/test-ranges.ts` (admin không import được từ apps/web — replicate ~20 dòng kèm 4 case test như `test-ranges.test.ts`, gồm case 12/14/14 → 1/13/27 "NOT preset 1/14/27"). `OutlineSection.qStart` = qStart fold; `number = qStart + group.startIndex + offset`; `typeLabel = quizTypeDisplay(group.type).label`.
4. Nhóm lấy qua `effectiveGroups(value)` (nhóm ngầm vẫn hiện thành "Nhóm câu 1" — nhưng chỉ khi part có dữ liệu thật, bước 2).
5. `groupCount` = số nhóm thật (`value.groups.length`, part không nhóm = 1).
6. Test: Reading 2 nhóm (3 + 2 câu) ở `p1` cho số 1…5 VÀ `p2` bắt đầu bằng 6 (fold — không phải `qStartOf("reading","p2")=14`); case `p1` 12 câu + `p2` 14 câu → `p2` qStart 13; **p1 draft dirty thêm 1 câu → qStart của `p2` tăng 1 ngay** (kongming GO-checkpoint: số phụ thuộc draft, phải khóa bằng test); draft dirty thắng saved; draft sạch không đè saved; slot chưa từng mở → `state "empty"`, `groups: []`; draft sạch của slot trống (vừa "Thêm nội dung") vẫn `state "empty"`.

### Task 2.4 — Dữ liệu panel kiểm tra đáp án
1. Tạo `answers-overview.ts` export `buildAnswersOverview(outlineSource)` → mảng `{ number; part; partLabel; groupIndex; answer; alts: string[]; missing: boolean }` theo thứ tự số câu, dùng cùng `resolvePartValues` của Task 2.3.
2. `alts` tách bằng đúng separator của grader `" / "` (có space — `ALT_SEPARATOR` ở `packages/api/src/lib/grade-quiz.ts:19`; export hằng này từ `@teacher-os/api` để dùng chung, red-team S7), filter mục rỗng sau trim như `acceptedCandidates`. KHÔNG tách theo `"/"`.
3. Test: câu thiếu đáp án có `missing: true`; `alts` "a / b" → 2 mục, "a/b" (không space) → 1 mục "a/b" nguyên vẹn; số câu liên tục qua part theo fold.

> Kiểm tra nhất quán số khi clone đề thư viện (kongming GO-checkpoint): đọc `apps/server/src/routes/snapshot.ts` / đường clone `library_test_part` → assignment; nếu nơi đó gán `q_start_override` tĩnh thì ghi nhận thành rủi ro nhất quán (học viên thấy số khác admin) và báo controller trước khi đổi — không tự sửa ngoài scope PR này.

## Todo

- [ ] Task 2.1 helper nhóm + `moveQuestion`
- [ ] Task 2.2 `PartFormValue.groups` + lỗi nhóm
- [ ] Task 2.3 `buildTestOutline`
- [ ] Task 2.4 `buildAnswersOverview`

## Success criteria

- `pnpm --filter admin test` và `pnpm --filter admin check-types` exit 0; test cũ của `part-form.test.tsx` không phải sửa ngoài fixture `groups: []` đã thêm ở #420 phase 2.

## Risk

- `group-model.ts` import type từ `part-form.tsx` và ngược lại: dùng `import type` để không tạo vòng import lúc chạy (như #420 đã ghi).
