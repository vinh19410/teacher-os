---
phase: 2
title: "Web data layer & catalog preset 3 cấp"
status: todo
priority: P1
effort: "3h"
dependencies: ["1"]
---

# Phase 2: Web data layer & catalog preset 3 cấp

## Goal

Đưa dữ liệu v5 xuống web: (a) UI type `AssignmentPrompt` + mapper + action payload + command bus mapping theo contract v2; (b) rewrite `assignment-presets.ts` thành catalog 3 cấp `SKILLS` (skill → part → type, port verbatim copy design kèm `KIND` map + template passage/transcript/cue/items) với export compat tạm cho consumer chưa migrate; (c) unit tests cho catalog. Kết phase: `pnpm --filter web test` + `check-types` xanh, mọi consumer cũ vẫn chạy đúng trên dữ liệu backfill.

## Context Links

- Spec: [../research/design-spec.md](../research/design-spec.md) (§2.1–2.6: bảng part/type đầy đủ, KIND map, qStart)
- Mock chuẩn (nguồn copy): `assignment-create-5.html` dòng 442–641 (`SKILLS` + `KIND`), dòng 675–680 (`emptyItem`), dòng 727–737 (`answerChoices`), dòng 686–690 (`qStart/qNum`)
- Scout: [../reports/scout-report.md](../reports/scout-report.md) (mục 4 data layer, mục 10 surfaces tiêu thụ)
- Code hiện tại: `apps/web/src/components/assignments/assignment-presets.ts` (TASK_PRESETS 2 cấp), `apps/web/src/lib/data-actions.ts:43-56`, `apps/web/src/lib/repos/assignment-prompts.ts`, `apps/web/src/lib/repos/kernel.ts:163-169`, `apps/web/src/lib/mock-data.ts:49-61`

## Key Insights

- **Không có snapshot collection mới** → không compile-guard ép web glue; nhưng UI type + mapper phải land trước phase 3 (UI đọc field mới).
- **Export compat là cầu không đổ vỡ giữa các phase**: `bank.tsx`, `class-assignments-tab.tsx`, `bank-preview-aside.tsx`, `new.tsx` (cũ) đều import `TASK_PRESETS/taskOf/genreOf` — giữ 3 export này như derive từ `SKILLS.writing` tới khi phase 4 dọn xong (Key Decision 6 plan). Row backfill có `part=task`, `type=genre` khớp id trong catalog mới nên compat hoạt động liền mạch.
- **Catalog phải port verbatim** copy tiếng Việt/Anh của design (title/prompt/passage/intro/items/transcript/cueTopic/cuePoints/spec/help/source) — đây là hợp đồng hiển thị; không bịa nội dung mẫu.
- `KIND` map type→dạng đáp án quyết định UI q-editor (chip radiogroup vs 2 input text) và số lựa chọn: `tfng/ynng` 3 chips, `mcq4` A–D, `mcq3` A–C, `roman` i–viii, `letter` A–H; `text` → input answer + alts.
- `emptyItem()` (mock dòng 675–680): câu mới mặc định `{stem:"", answer:"", alts:"", opts: null}`; mcq4 → `["","","",""]`, mcq3 → `["","",""]`.

## Requirements

### Functional

- `QuestionItem` type mới trong `apps/web/src/lib/mock-data.ts`: `{ stem: string; opts: string[] | null; answer: string; alts: string }`; `AssignmentPrompt` thêm `skill`, `part`, `type`, `intro`, `passage`, `transcript`, `cueTopic`, `cuePoints`, `audioName`, `questions: QuestionItem[]` (giữ `task/genre` trên UI type làm legacy-read cho compat tới phase 4 xóa).
- Mapper `mapAssignmentPrompts` (`apps/web/src/lib/repos/assignment-prompts.ts`) map field-for-field các trường mới.
- Action payload `"create-assignment-prompt"` (`apps/web/src/lib/data-actions.ts:43-56`) thay bằng đúng shape v2 (skill/part/type + trường nội dung + questions + note/status — import `AssignmentPromptCreate` từ `@teacher-os/api/contracts` thay tay khai enum); case `kernelCommand` (`apps/web/src/lib/repos/kernel.ts:163-169`) giữ `body: { ...action.payload }` (payload = toàn body `.strict()`), cập nhật comment.
- Catalog mới trong `assignment-presets.ts`:
  - `SKILLS`: 4 entry `writing|reading|listening|speaking`, mỗi entry `{ id, name, heading, bankLabel, partLabel, typeLabel, source, parts }`; part `{ id, label, spec, help, qStart?, passage?, types }`; type `{ id, label, title, prompt?, intro?, items?, transcript?, cueTopic?, cuePoints? }` — port đúng bảng §2.3 design (W: task1/task2 × 4+4; R: p1/p2/p3 × 2; L: s1..s4 × 2; S: part1 × 2, part2 × 3, part3 × 2 — tổng 26 type).
  - `KIND` map + helpers thuần: `skillOf(id)`, `partOf(skillId, partId)`, `typeOf(skillId, partId, typeId)`, `kindOf(typeId)`, `qStartOf(skillId, partId)`, `answerChoices(kind)`, `emptyItem(typeId)`, `wordCount(text)` (giữ nguyên), `compositionDefaults(...)` v2 (apply template title/prompt/passage/intro/items/transcript/cue trừ field dirty).
  - Compat tạm (đánh dấu `@deprecated — remove ở phase 4`): `TASK_PRESETS` (derive từ `SKILLS.writing.parts`), `taskOf`, `genreOf`.
- Rewrite `apps/web/src/components/assignments/assignment-presets.test.ts`: catalog shape (4 skill, 12 part, 26 type đúng §2.3); `kindOf` map đúng từng type id; `qStartOf` (R 1/14/27, L 1/11/21/31, W/S → 1); `answerChoices` sets; `emptyItem` opts theo kind; `compositionDefaults` dirty-flag (đổi type giữ title/prompt đã sửa); spot-check verbatim (title + answer đầu của `tfng` = "FALSE").

### Non-functional

- Catalog là pure module (không import React) — test vitest thường.
- Không đổi `kernel-state.ts` (`assignmentPrompts: []` đã có) và `data-store-reducer.ts` (case `create-assignment-prompt` đã inert ở dòng 83 — chỉ type payload đổi).

## Architecture (data flow)

```
snapshot.assignmentPrompts (row v2, phase 1)
  → mapAssignmentPrompts → AssignmentPrompt (questions đã là QuestionItem[])
create page (phase 3) → action "create-assignment-prompt" (payload v2)
  → kernelCommand → POST /api/assignments/prompts (body = payload, .strict() khớp từng field)
catalog SKILLS (pure) → picker options + template apply (dirty-flag) + KIND/qStart/choices cho q-editor
```

## Related Code Files

- Modify: `apps/web/src/lib/mock-data.ts` (`QuestionItem` + `AssignmentPrompt` mở rộng), `apps/web/src/lib/repos/assignment-prompts.ts`, `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/repos/kernel.ts` (comment), `apps/web/src/components/assignments/assignment-presets.ts` (rewrite + compat), `apps/web/src/components/assignments/assignment-presets.test.ts` (rewrite), fixture trong `apps/web/src/routes/_auth/assignments/new.test.tsx` + `bank.test.tsx` (bổ sung field mới, không đổi assertion)
- Create: không (catalog giữ đường dẫn cũ — import path không đổi)
- Delete: không (compat exports xóa ở phase 4)

## Implementation Steps

1. Thêm `QuestionItem` + mở rộng `AssignmentPrompt` trong `mock-data.ts` (docblock: v5 4 kỹ năng; `task/genre` legacy-read tạm cho consumer chưa migrate).
2. Mở rộng mapper `mapAssignmentPrompts` field-for-field.
3. Đổi payload action `create-assignment-prompt` trong `data-actions.ts` sang shape contract v2 (dùng type `AssignmentPromptCreate`).
4. Rewrite `assignment-presets.ts`: port `SKILLS` + `KIND` từ mock (dòng 442–641) verbatim; viết helpers (`skillOf/partOf/typeOf/kindOf/qStartOf/answerChoices/emptyItem/compositionDefaults` v2); giữ `wordCount`; append compat block `@deprecated` derive từ `SKILLS.writing`.
5. Cập nhật comment case `kernelCommand` trong `repos/kernel.ts:163-169`.
6. Rewrite `assignment-presets.test.ts` theo Functional; bổ sung field mới cho fixture `AssignmentPrompt` trong `new.test.tsx`/`bank.test.tsx` (giá trị writing rỗng + `questions: []`) — assertion cũ giữ nguyên; chạy `pnpm --filter web test`.
7. `pnpm check-types` toàn repo.

## Todo

- [ ] `QuestionItem` + `AssignmentPrompt` v2 trong mock-data.ts
- [ ] Mapper assignment-prompts.ts mở rộng
- [ ] Action payload v2 + comment kernelCommand
- [ ] Catalog SKILLS 3 cấp verbatim + KIND + helpers + compat @deprecated
- [ ] Rewrite assignment-presets.test.ts + fix fixture 2 test file cũ
- [ ] `pnpm --filter web test` + `pnpm check-types` xanh

## Success Criteria

- Catalog unit tests xanh: đủ 4 skill/12 part/26 type đúng bảng design; kindOf/qStartOf/answerChoices/emptyItem/compositionDefaults đúng spec; spot-check verbatim khớp mock.
- `pnpm --filter web test` xanh (kể cả new/bank test cũ với fixture bổ sung field); `pnpm check-types` xanh.
- Không consumer nào đổi hành vi trong phase này (compat: `genreOf("task2","discuss")` vẫn trả label "Discuss both views").

## Verification

```bash
cd apps/web && npx vitest run assignment-presets
cd apps/web && npx vitest run
pnpm check-types
```

## Risk Assessment

- **R1: Lệch copy khi port catalog tay** — spot-check verbatim trong test + đối chiếu mock dòng 442–641 khi review.
- **R2: Compat derive sai làm đỏ test bank/class cũ** — derive trực tiếp từ cùng object `SKILLS.writing.parts` (không copy cấu trúc riêng); toàn test web ở bước 6 bắt được.
- **R3: Fixture cũ thiếu field mới vỡ type-check** — bước 6 bổ sung giá trị mặc định, không đổi assertion.

## Security Considerations

- Catalog là hằng số client thuần — không dữ liệu nhạy cảm.
- Mapper không parse thêm gì (`questions` đã parse server-side phase 1) — không `JSON.parse` trong web layer.

## Next Steps

- Phase 3 dựng UI tạo đề trên catalog + `QuestionItem` mới.
