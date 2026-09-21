---
phase: 2
title: "Web data layer & catalog preset 3 cấp"
status: completed
priority: P1
effort: "3h"
dependencies: ["1"]
---

# Phase 2: Web data layer & catalog preset 3 cấp

## Goal

Đưa dữ liệu v5 xuống web: (a) UI type `AssignmentPrompt` + mapper + action payload + command bus mapping theo contract v2; (b) rewrite `assignment-presets.ts` thành catalog 3 cấp `SKILLS` (skill → part → type, port verbatim copy design kèm `KIND` map + template passage/transcript/cue/items) với export compat tạm cho consumer chưa migrate; (c) unit tests cho catalog. Kết phase: `pnpm --filter web test` + `check-types` xanh, mọi consumer cũ vẫn chạy đúng trên dữ liệu backfill.

## Context Links

- Spec: [../research/design-spec.md](../research/design-spec.md) (§2.1–2.6: bảng part/type đầy đủ, KIND map, qStart)
- Mock chuẩn (nguồn copy): `assignment-create-5.html` dòng 442–641 (`SKILLS` + `KIND`), dòng 733–737 (`qStart/qNum`), dòng 743–749 (`emptyItem`), dòng 750–759 (`answerChoices`)
- Hằng whitelist id (nguồn duy nhất, phase 1): `packages/api/src/contracts.ts` — `ASSIGNMENT_SKILLS` / `ASSIGNMENT_PART_TYPES` / `ASSIGNMENT_ANSWER_CHOICES`
- Scout: [../reports/scout-report.md](../reports/scout-report.md) (mục 4 data layer, mục 10 surfaces tiêu thụ)
- Code hiện tại: `apps/web/src/components/assignments/assignment-presets.ts` (TASK_PRESETS 2 cấp), `apps/web/src/lib/data-actions.ts:43-56`, `apps/web/src/lib/repos/assignment-prompts.ts`, `apps/web/src/lib/repos/kernel.ts:163-169`, `apps/web/src/lib/mock-data.ts:49-61`

## Key Insights

- **Không có snapshot collection mới** → không compile-guard ép web glue; nhưng UI type + mapper phải land trước phase 3 (UI đọc field mới).
- **Export compat là cầu không đổ vỡ giữa các phase**: `bank.tsx`, `class-assignments-tab.tsx`, `bank-preview-aside.tsx`, `new.tsx` (cũ) đều import `TASK_PRESETS/taskOf/genreOf` — giữ 3 export này như derive từ `SKILLS.writing` tới khi phase 4 dọn xong (Key Decision 6 plan). Row backfill có `part=task`, `type=genre` khớp id trong catalog mới nên compat hoạt động liền mạch.
- **Catalog phải port verbatim** copy tiếng Việt/Anh của design (title/prompt/passage/intro/items/transcript/cueTopic/cuePoints/spec/help/source) — đây là hợp đồng hiển thị; không bịa nội dung mẫu. **Type-id lấy đúng id của mock** (`mcq` cho R/p3 Multiple choice, `mcq1` cho L/s1, `mcq3` cho L/s3) — giá trị kind (`mcq4`/`mcq3`) chỉ là dạng answer UI; tổng **4 skill · 12 part · 29 type** (W 4+4, R 2×3, L 2×4, S 2+3+2). Id catalog phải khớp bộ hằng `ASSIGNMENT_PART_TYPES` từ `@teacher-os/api/contracts` (import làm nguồn sự thật — test assert khớp).
- **Mọi helper catalog phải có fallback an toàn** (finding R6): `skillOf/partOf/typeOf/kindOf/qStartOf` nhận id lạ → trả phần tử đầu/fallback (`?? parts[0]`, kind fallback `"text"`), không bao giờ trả undefined để `undefined.label` crash trang bank với row dữ liệu lạ; kèm test unknown-id.
- **Compat `TASK_PRESETS` phải đủ shape cũ** (finding R12): `TaskPreset` hiện yêu cầu `words: number; minutes: number` (`assignment-presets.ts:8-15`) và `bank-preview-aside.tsx:27-28` + `student-preview-paper.tsx:41` đang render `t.words`/`t.minutes` — block compat derive kèm bảng tĩnh `{task1: {words:150, minutes:20}, task2: {words:250, minutes:40}}`.
- `KIND` map type-id→kind quyết định UI q-editor (chip radiogroup vs 2 input text) và số lựa chọn: `tfng/ynng` 3 chips, kind `mcq4` (type `mcq`) A–D, kind `mcq3` (type `mcq1`/`mcq3`) A–C, `roman` i–viii, `letter` A–H; `text` → input answer + alts.
- `emptyItem()` (mock dòng 743–749): câu mới mặc định `{stem:"", answer:"", alts:"", opts: null}`; kind `mcq4` → `["","","",""]`, kind `mcq3` → `["","",""]`.

## Requirements

### Functional

- `QuestionItem` type mới trong `apps/web/src/lib/mock-data.ts`: `{ stem: string; opts: string[] | null; answer: string; alts: string }`; `AssignmentPrompt` thêm `skill`, `part`, `type`, `intro`, `passage`, `transcript`, `cueTopic`, `cuePoints`, `audioName`, `questions: QuestionItem[]` (giữ `task/genre` trên UI type làm legacy-read cho compat tới phase 4 xóa).
- Mapper `mapAssignmentPrompts` (`apps/web/src/lib/repos/assignment-prompts.ts`) map field-for-field các trường mới.
- Action payload `"create-assignment-prompt"` (`apps/web/src/lib/data-actions.ts:43-56`) thay bằng đúng shape v2 (skill/part/type + trường nội dung + questions + note/status — import `AssignmentPromptCreate` từ `@teacher-os/api/contracts` thay tay khai enum); case `kernelCommand` (`apps/web/src/lib/repos/kernel.ts:163-169`) giữ `body: { ...action.payload }` (payload = toàn body `.strict()`), cập nhật comment.
- Catalog mới trong `assignment-presets.ts`:
  - `SKILLS`: 4 entry `writing|reading|listening|speaking`, mỗi entry `{ id, name, heading, bankLabel, partLabel, typeLabel, source, parts }`; part `{ id, label, spec, help, qStart?, passage?, types }`; type `{ id, label, title, prompt?, intro?, items?, transcript?, cueTopic?, cuePoints? }` — port đúng bảng §2.3 design (W: task1/task2 × 4+4; R: p1/p2/p3 × 2; L: s1..s4 × 2; S: part1 × 2, part2 × 3, part3 × 2 — **tổng 29 type, 12 part**); id khớp `ASSIGNMENT_PART_TYPES` từ `@teacher-os/api/contracts`.
  - `KIND` map + helpers thuần: `skillOf(id)`, `partOf(skillId, partId)`, `typeOf(skillId, partId, typeId)`, `kindOf(typeId)`, `qStartOf(skillId, partId)`, `answerChoices(kind)`, `emptyItem(typeId)`, `wordCount(text)` (giữ nguyên), `compositionDefaults(...)` v2 — **ngữ nghĩa dirty đã chốt (Validation Q1)**: đổi **skill** → reset toàn bộ (dirty flags, audioName, items — template skill mới apply, theo mock); đổi **part/type** → áp template mới CHỈ cho field chưa dirty, **giữ nguyên nội dung user đã sửa** (deviation có chủ đích khỏi mock v5 — mock reset dirty khi đổi part/type; hành vi app hiện tại + tránh mất nội dung đã gõ). Tất cả helper có fallback an toàn (id lạ → phần tử đầu / `"text"` / 1).
  - Compat tạm (đánh dấu `@deprecated — remove ở phase 4`): `TASK_PRESETS` (derive từ `SKILLS.writing.parts` **+ bảng words/minutes tĩnh**), `taskOf`, `genreOf`.
- Rewrite `apps/web/src/components/assignments/assignment-presets.test.ts`: catalog shape (4 skill, 12 part, **29 type** đúng §2.3 — assert kèm breakdown per skill để không đếm nhầm); id catalog ⊆ `ASSIGNMENT_PART_TYPES`; `kindOf` map đúng từng type id (phân biệt type-id `mcq/mcq1/mcq3` với kind `mcq4/mcq3`); `qStartOf` (R 1/14/27, L 1/11/21/31, W/S → 1); `answerChoices` sets; `emptyItem` opts theo kind; helper fallback với id lạ không crash; helper fallback với id lạ không crash; `compositionDefaults` pin ngữ nghĩa dirty đã chốt (đổi part/type giữ field dirty; đổi skill reset toàn bộ); spot-check verbatim (title + answer đầu của `tfng` = "FALSE").
- **Shim compile cho `new.tsx` cũ (finding R8b)**: đổi payload action sang v2 khiến `new.tsx:108-120` (payload v1 inline `task/genre`) vỡ type — cập nhật tối thiểu chỗ xây payload sang v2: `skill: "writing", part: value.task, type: value.genre` + các trường mới rỗng + `questions: []` (chỉ đổi chỗ này; redesign trang là phase 3).
- **Fixture sweep (finding R14)**: mọi file tạo literal `AssignmentPrompt` phải bổ sung field mới — gồm `new.test.tsx`, `bank.test.tsx`, **`apps/web/src/components/classes/class-assignments-tab.test.tsx`** (dòng 80-93 có fixture `task/genre`) và bất kỳ file nào grep `AssignmentPrompt` bắt thêm; assertion cũ giữ nguyên.

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
4. Rewrite `assignment-presets.ts`: port `SKILLS` + `KIND` từ mock (dòng 442–641) verbatim (id theo mock); viết helpers có fallback (`skillOf/partOf/typeOf/kindOf/qStartOf/answerChoices/emptyItem/compositionDefaults` v2); giữ `wordCount`; append compat block `@deprecated` derive từ `SKILLS.writing` + bảng words/minutes.
5. Cập nhật comment case `kernelCommand` trong `repos/kernel.ts:163-169`.
6. **Shim `new.tsx` payload v1 → v2** (chỉ chỗ xây payload `submit.run`, giữ nguyên phần còn lại của trang — finding R8b).
7. Rewrite `assignment-presets.test.ts` theo Functional; fixture sweep mọi literal `AssignmentPrompt` (`new.test.tsx`, `bank.test.tsx`, `class-assignments-tab.test.tsx`, + grep) — giá trị writing rỗng + `questions: []`, assertion cũ giữ nguyên; chạy `pnpm --filter web test`.
8. `pnpm check-types` toàn repo.

## Todo

- [ ] `QuestionItem` + `AssignmentPrompt` v2 trong mock-data.ts
- [ ] Mapper assignment-prompts.ts mở rộng
- [ ] Action payload v2 + shim payload `new.tsx` + comment kernelCommand
- [ ] Catalog SKILLS 3 cấp verbatim (id theo mock, khớp whitelist api) + KIND + helpers có fallback + compat @deprecated (kèm words/minutes)
- [ ] Rewrite assignment-presets.test.ts (29 type + breakdown, fallback unknown-id) + fixture sweep 3+ test file cũ
- [ ] `pnpm --filter web test` + `pnpm check-types` xanh

## Success Criteria

- Catalog unit tests xanh: đủ 4 skill/12 part/**29 type** đúng bảng design (breakdown per skill); id khớp `ASSIGNMENT_PART_TYPES`; kindOf/qStartOf/answerChoices/emptyItem đúng spec; helper không crash với id lạ; spot-check verbatim khớp mock.
- `pnpm --filter web test` xanh (kể cả new/bank/class-assignments-tab test cũ với fixture bổ sung field); `pnpm check-types` xanh.
- Không consumer nào đổi hành vi trong phase này (compat: `genreOf("task2","discuss")` vẫn trả label "Discuss both views"; meta "Academic · 150/20..." không đổi).

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
