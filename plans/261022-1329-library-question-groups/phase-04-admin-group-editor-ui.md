---
phase: 4
title: "Editor nhóm kiểu Selfomy trong apps/admin (PR2)"
status: pending
priority: P1
effort: "1.5d"
dependencies: [3]
---

# Phase 4: Editor nhóm kiểu Selfomy trong `apps/admin` (PR2)

## Goal

Trong mỗi tab slot (`p1..p3` / `s1..s4`) của trang sửa đề, admin chia câu hỏi thành nhiều nhóm: cột trái là mục lục (Nhóm n → Câu số tuyệt đối), cột phải là các thẻ nhóm mở ra được (dạng bài, cờ, hướng dẫn rich text, câu hỏi + đáp án + giải thích). Part không có nhóm vẫn dùng editor một khối như cũ.

## Files to Create / Modify

- Modify: `packages/ui/src/components/assignments/editor/question-key-editor.tsx` (props mới, optional)
- Modify: `packages/ui/src/components/assignments/editor/answer-key-grid.tsx` (red-team F2: hàng câu per-item sống ở đây, không ở QuestionKeyEditor)
- Modify: `packages/ui/src/lib/cloze.ts` (red-team F1: merge giữ field khi apply ClozeEditor) + file test tương ứng (`packages/ui/src/lib/cloze.test.ts` nếu có, nếu không tạo mới)
- Create: `apps/admin/src/components/library/group-model.ts` (helper thuần)
- Create: `apps/admin/src/components/library/group-model.test.ts`
- Create: `apps/admin/src/components/library/group-card.tsx`
- Create: `apps/admin/src/components/library/group-outline.tsx`
- Modify: `apps/admin/src/components/library/part-form.tsx`
- Modify: `apps/admin/src/components/library/part-form.test.tsx`

## Quy ước UI bắt buộc

- Đọc `DESIGN.md` trước khi viết UI. Dùng component trong `@teacher-os/ui/components/web-kit/*` (`Button`, `Field`, `Input`, `Select`, `RichTextEditor`); không hard-code màu, dùng token Tailwind sẵn có.
- Text giao diện tiếng Việt, thống nhất từ: "Nhóm câu", "Dạng bài", "Hướng dẫn nhóm", "Giải thích".
- Mọi nút icon có `aria-label`.

## Tasks & Steps

### Task 4.1 — Prop mới cho `QuestionKeyEditor` (không đổi hành vi web)

- Goal: editor dùng chung nhận số câu bắt đầu tùy chỉnh và hiển thị ô giải thích khi được bật.
- Target: function `QuestionKeyEditor` trong `question-key-editor.tsx`.
- Steps:
  1. Thêm 2 prop optional vào type props:
     - `qStartOverride?: number` — số câu đầu tiên; mặc định giữ `qStartOf(skill, partId)`.
     - `showExplanation?: boolean` — mặc định `false`.
  2. Đổi `const qStart = qStartOf(skill, partId);` thành `const qStart = qStartOverride ?? qStartOf(skill, partId);`.
  3. (red-team F2) `QuestionKeyEditor` KHÔNG render từng câu — hàng câu do `AnswerKeyGrid` vẽ (`items.map` trong `answer-key-grid.tsx`). Plumb xuống: thêm prop optional `showExplanation?: boolean` cho `AnswerKeyGrid`; khi true, mỗi hàng câu hiển thị thêm `Field` label `Giải thích câu {qStart + index}` chứa `RichTextEditor` `value={item.explanation ?? ""}`, `onChange` cập nhật `explanation` của item đó qua `onItemsChange` của editor cha. Nếu giá trị rỗng sau `htmlToPlainText(...).trim()`, xóa key `explanation` khỏi item (không lưu chuỗi rỗng). KHÔNG nhét editor vào footer tóm tắt đáp án (read-only).
  4. Không đổi gì khi hai prop vắng mặt (web composer không truyền → hàng câu không có ô giải thích).
- Verify: `pnpm --filter @teacher-os/ui test` exits 0 và `pnpm --filter @teacher-os/ui check-types` exits 0.

### Task 4.1b — ClozeEditor apply không mất field câu (red-team F1, Critical)

- Goal: bấm "Áp vào câu hỏi" của `ClozeEditor` KHÔNG xóa `explanation`/`answerSet`/`type`/`pin` đã nhập của các câu trong nhóm.
- Target: `segmentsToItems` trong `packages/ui/src/lib/cloze.ts` (hiện rebuild item mới chỉ `{stem, opts: null, answer, alts}` — `packages/ui/src/lib/cloze.ts:223-232`).
- Steps:
  1. Đổi chữ ký: `segmentsToItems(segments: ClozeSegment[], existing?: readonly QuestionItem[])`. Với mỗi segment index `i`: nếu `existing?.[i]` tồn tại → trả `{ ...existing[i], stem, opts: null, answer, alts }` (giữ `explanation`, `answerSet`, `type`, `pin`); ngược lại giữ hành vi cũ (item mới). Nếu `existing` dài hơn segments, các item dư bị cắt (giữ nguyên hành vi độ dài = segments).
  2. Caller (ClozeEditor `onApply` trong `cloze-editor.tsx`) truyền `items` hiện tại vào `existing`.
  3. Thêm unit test: 2 câu có sẵn `explanation` + `answerSet` → apply lại segments mới (đổi stem) → hai field vẫn nguyên; segments dài hơn mảng cũ → item mới không có field optional.
- Verify: `pnpm --filter @teacher-os/ui test cloze --reporter=verbose` exits 0, output không có `FAIL`.

### Task 4.2 — Helper thuần quản lý nhóm

- Goal: mọi thao tác nhóm là hàm thuần trả value mới với `startIndex` luôn đúng.
- Target: tạo `apps/admin/src/components/library/group-model.ts`.
- Steps: export các hàm (nhận và trả `PartFormValue`; dùng `import type { PartFormValue } from "./part-form"` — bắt buộc `import type` để `part-form.tsx` import ngược `group-model.ts` không tạo vòng import lúc chạy):
  1. `effectiveGroups(value)` → nếu `value.groups.length === 0` trả một nhóm ngầm `{id:"implicit", type:value.type, instruction:"", startIndex:0, count:value.questions.length, optionBank:value.optionBank, answersInline:false, splitContent:false, dragDrop:false}`; ngược lại trả `value.groups`.
  2. `reindexGroups(groups)` → gán lại `startIndex` cộng dồn theo `count`, giữ thứ tự.
  3. `splitIntoGroups(value)` → biến nhóm ngầm thành nhóm thật (`id` = `crypto.randomUUID()`), chuyển `value.optionBank` sang nhóm và `value.intro` sang `groups[0].instruction`, rồi đặt `value.optionBank = []`, `value.intro = ""` (intro cấp part không còn ô hiển thị khi có nhóm, nếu giữ lại sẽ thành dữ liệu ẩn).
  4. `addGroup(value, type)` → nếu đang ngầm thì `splitIntoGroups` trước; thêm nhóm mới cuối với 1 câu `emptyItem(type)` (import từ `@teacher-os/ui/components/assignments/editor/assignment-presets`), nối câu vào cuối `questions`, `reindexGroups`, đặt `value.type = groups[0].type`.
  5. `removeGroup(value, gi)` → xóa nhóm và **đúng dải câu của nó** khỏi `questions`, `reindexGroups`; nếu còn 0 nhóm → trả `groups: []` (về nhóm ngầm) VÀ (red-team F7) hoàn `instruction` của nhóm cuối còn lại về `value.intro` trước khi xóa (mirror `splitIntoGroups`) — nếu không, hướng dẫn cấp part cũ bị mất vĩnh viễn vì `splitIntoGroups` đã dời nó vào nhóm.
  6. `moveGroup(value, gi, dir: -1 | 1)` → hoán đổi nhóm VÀ dải câu tương ứng, `reindexGroups`, đặt lại `value.type = groups[0].type`.
  7. `setGroupItems(value, gi, items)` → thay dải câu của nhóm `gi` bằng `items`, cập nhật `count = items.length`, `reindexGroups`.
  8. `patchGroup(value, gi, patch)` → gộp field (type/instruction/optionBank/cờ); nếu đổi `type` thì xóa `type` riêng ở các câu trong dải và cập nhật `value.type` khi `gi === 0`.
  9. `groupQuestionNumber(qStart, group, offset)` → `qStart + group.startIndex + offset`.
- Verify: no verification needed (Task 4.3 kiểm).

### Task 4.3 — Test helper nhóm

- Target: tạo `apps/admin/src/components/library/group-model.test.ts`.
- Steps: test mỗi hàm ở Task 4.2, tối thiểu:
  1. `addGroup` trên part 3 câu không nhóm → 2 nhóm, `[0..2]` và `[3..3]`, `optionBank` part rỗng.
  2. `removeGroup(…, 0)` trên 2 nhóm (3 câu + 2 câu) → còn 1 nhóm `startIndex 0 count 2`, `questions.length === 2`, câu còn lại là đúng 2 câu của nhóm sau.
  3. `moveGroup(…, 1, -1)` → thứ tự câu đổi theo nhóm, `startIndex` đúng.
  4. `setGroupItems` tăng nhóm 0 từ 3 lên 4 câu → nhóm 1 có `startIndex 4`.
  5. Sau MỌI thao tác, kết quả parse thành công bằng `libraryPartUpsertSchema` (dùng `partInputFromValue`).
- Verify: `pnpm --filter admin test group-model --reporter=verbose` exits 0, output không có `FAIL`.

### Task 4.4 — `PartFormValue` mang `groups`

- Goal: form đọc/ghi/so sánh dirty có `groups`.
- Target: `part-form.tsx`: interface `PartFormValue`, `emptyPartValue`, `partValueFromDto`, `canonicalPartValue`, `partInputFromValue`.
- Steps:
  1. Thêm `groups: LibraryQuestionGroup[]` vào `PartFormValue` (import type từ `@teacher-os/api/library-contracts`).
  2. `emptyPartValue` → `groups: []`.
  3. `partValueFromDto` → `groups: normalizeGroups(dto.groups)` với `normalizeGroups` rebuild từng group theo thứ tự key cố định `{id, type, instruction, startIndex, count, optionBank, answersInline, splitContent, dragDrop}` (mirror `normalizeQuestions`; red-team A5 — không cast thô `as LibraryQuestionGroup[]` vì `canonicalPartValue` so bằng `JSON.stringify` nhạy thứ tự key: group client-dựng vs server-xuất có thể khác key order → dirty "vĩnh viễn"). Input là `unknown[]` từ DTO: phần tử không phải object hợp lệ → bỏ qua; mảng rỗng/undefined → `[]`.
  4. `canonicalPartValue`, `partInputFromValue` VÀ `partReadyIssues` (hàm này tự dựng object input riêng) → đưa `groups` vào. Thiếu ở `partReadyIssues` thì rule ready chạy trên nhóm ngầm với `optionBank=[]` và chặn lưu sai.
  5. **Bắt buộc:** `normalizeQuestions` dựng lại câu theo từng field nên đang làm rơi field lạ. Thêm: nếu `typeof raw.explanation === "string"` thì giữ `explanation`; nếu `typeof raw.answerSet === "string"` thì giữ `answerSet`. Không thêm key khi vắng mặt.
  6. (Đã xử lý ở Task 2.7 bước 1b từ phase 2 — fixture DTO `partDto` trong `part-form.test.tsx` đã có `groups: []`; không lặp lại.)
  7. Thêm test round-trip: DTO có câu kèm `explanation` → `partValueFromDto` → `partInputFromValue` vẫn giữ `explanation`.
  8. `slotTypes`: khi part có nhóm, danh sách dạng bài cho Select nhóm dùng `librarySkillTypes(skill)`; Select dạng bài cấp part chỉ hiển thị khi `groups.length === 0`.
- Verify: `pnpm --filter admin test part-form --reporter=verbose` exits 0 (test cũ không sửa vẫn pass).

### Task 4.5 — Component `GroupCard`

- Goal: thẻ một nhóm, đóng/mở được.
- Target: tạo `group-card.tsx`, export `GroupCard`.
- Steps:
  1. Props: `skill`, `slot`, `index`, `group`, `items`, `qStart`, `open`, `onToggle`, `onPatch`, `onItemsChange`, `onMove(dir)`, `onRemove`, `canMoveUp`, `canMoveDown`, `imageUrl`, `onImageUrlChange`, `showErrors`, `status`, `errorFor(path)`.
  2. Header (luôn hiện): nhãn `Nhóm câu {index+1}`, dạng bài (dùng `quizTypeDisplay(group.type).label` từ `@teacher-os/api/contracts`), dải câu `Câu {qStart+group.startIndex}–{qStart+group.startIndex+group.count-1}`, nút lên/xuống/xóa (icon, `aria-label` tương ứng "Đưa nhóm lên", "Đưa nhóm xuống", "Xóa nhóm"), nút mở/đóng `aria-expanded`. (red-team F7) Nút "Xóa nhóm" phải hỏi xác nhận (dialog confirm theo pattern sẵn có của admin, vd `delete-test-dialog.tsx`) — xóa nhóm là phá hoại (mất cả dải câu + đáp án + giải thích).
  3. Body (khi `open`):
     - `Select` "Dạng bài" (`librarySkillTypes(skill)`).
     - 3 checkbox: "Ô trả lời nằm trong hướng dẫn" (`answersInline`), "Tách nội dung và câu hỏi" (`splitContent`), "Cho phép kéo thả đáp án" (`dragDrop`).
     - `QuestionKeyEditor` với `typeId=group.type`, `items`, `optionBank=group.optionBank`, `intro={group.instruction}`, `onIntroChange={(v) => onPatch({ instruction: v })}` (dùng chính ô "Hướng dẫn đề" và nút "Chèn câu lệnh chuẩn" của editor làm hướng dẫn nhóm — KHÔNG thêm `RichTextEditor` riêng), `qStartOverride={qStart + group.startIndex}`, `showExplanation`, `onBankChange` → `onPatch({optionBank})`.
     - Checkbox "Ô trả lời nằm trong hướng dẫn" chỉ bật được khi `CLOZE_EDITOR_TYPES.has(group.type)` (import từ `@teacher-os/api/lib/infer-question-types`); dạng khác thì checkbox `disabled` kèm chú thích "Chỉ dùng cho dạng điền từ". Ô trống được nhập bằng `ClozeEditor` mà `QuestionKeyEditor` tự hiện cho các dạng này — không viết editor ô trống mới.
     - Khi `answersInline`: dưới editor hiện dòng `Câu có ô trống: {số câu có countClozeMarkers(stem) === 1}/{group.count}`; lệch thì dòng này dùng màu lỗi (token destructive).
     - Hiện `errorFor("groups.{index}.optionBank")`, `errorFor("groups.{index}.type")`, `errorFor("groups.{index}.answersInline")` gần field tương ứng (path dotted sống sau Task 4.5b bước 3; KHÔNG wire `groups.{index}.instruction` — không rule nào sinh path đó).
- Verify: `pnpm --filter admin check-types` exits 0.

### Task 4.5b — Thông báo lỗi tiếng Việt + wiring path cho rule nhóm

- Goal: mọi message mới từ `library-contracts.ts` hiện bằng tiếng Việt, và lỗi superRefine của nhóm hiển thị được.
- Target (red-team A4/F4/F5 — KHÔNG dùng `FIELD_ERROR_TEXT` ở `part-issues.ts`, hằng đó không tồn tại ở đó): message-map thật là `MESSAGE_LABELS` (regex → label) và `FIELD_LABELS` (path key → label) trong `apps/admin/src/components/library/part-issues.ts` (:13-60); hằng `FIELD_ERROR_TEXT` (field → câu lỗi) nằm ở `part-form.tsx` (~:193).
- Steps:
  1. Thêm regex mapping vào `MESSAGE_LABELS` cho từng message mới: `"invalid type for skill"` → "Dạng bài không thuộc kỹ năng này", `"question type must match its group"` → "Dạng câu phải trùng dạng của nhóm", `"first group must start at 0"` / `"groups must be contiguous"` / `"group counts must cover every question"` / `"duplicate group id"` → "Nhóm câu bị chồng hoặc hở số câu" (mỗi regex riêng để khớp chính xác), `"optionBank lives on groups when groups exist"` → "Ngân hàng đáp án nằm ở từng nhóm khi có nhóm", `"part type must equal first group type"` → "Dạng bài của part phải trùng nhóm đầu", `"inline answers need a completion type"` → "Chỉ dạng điền từ mới đặt ô trả lời trong nội dung", `"inline question needs exactly one blank"` → "Câu điền từ cần đúng một ô trống ____", `"answer set needs at least two questions"` → "Khóa tập đáp án cần ít nhất hai câu", `"answer set must stay inside one group"` → "Các câu cùng khóa tập đáp án phải nằm trong một nhóm".
  2. Thêm key `groups` vào `FIELD_LABELS` (`part-issues.ts`) với nhãn "Nhóm câu", và key `groups` vào `FIELD_ERROR_TEXT` (`part-form.tsx`) với câu lỗi "Dữ liệu nhóm câu không hợp lệ.".
  3. (red-team F4) `partInputFromValue` và `partReadyIssues` đang flatten `issue.path[0]` — mọi issue superRefine `["groups", i, ...]` bị hạ thành `"groups"`. Đổi: khi `issue.path[0] === "groups"` thì key = `issue.path.join(".")` (vd `"groups.1.optionBank"`) để `errorFor("groups.{index}.optionBank")` của GroupCard thực sự sống; key khác giữ `path[0]` như cũ.
- Verify: `pnpm --filter admin check-types` exits 0.

### Task 4.6 — Component `GroupOutline`

- Goal: mục lục trái kiểu Selfomy.
- Target: tạo `group-outline.tsx`, export `GroupOutline`.
- Steps:
  1. Props: `groups`, `qStart`, `activeIndex`, `onSelect(gi)`.
  2. Render `<nav aria-label="Mục lục nhóm câu">` chứa danh sách: mỗi nhóm là `button` "Nhóm câu n · {label dạng}" (bấm → `onSelect(gi)`), bên dưới liệt kê `Câu x` (text, không tương tác) theo `groupQuestionNumber`.
  3. Nhóm đang mở có `aria-current="true"` và kiểu nhấn mạnh bằng token màu primary.
- Verify: no verification needed (Task 4.8 kiểm).

### Task 4.7 — Tích hợp vào `PartForm`

- Goal: tab slot hiển thị editor nhóm.
- Target: function `PartForm` trong `part-form.tsx`, khối đang render `<QuestionKeyEditor ... />`.
- Steps:
  1. Nếu `value.groups.length === 0`: giữ nguyên `QuestionKeyEditor` hiện tại, thêm prop `showExplanation`, và dưới nó thêm `Button` variant outline "Chia thành nhiều nhóm câu" → `setValue(addGroup(value, value.type))`.
  2. Nếu có nhóm: render bố cục `grid gap-6 lg:grid-cols-[220px_1fr]`: cột trái `GroupOutline` (`lg:sticky lg:top-4 self-start`), cột phải danh sách `GroupCard` + nút "Thêm nhóm câu" (thêm nhóm dạng = dạng nhóm cuối). Dưới `lg` hai cột xếp chồng, outline trên cùng.
  3. State `openGroup` (index, mặc định 0). `onSelect` của outline → set `openGroup` và `document.getElementById(\`group-${slot}-${gi}\`)?.scrollIntoView({block:"start"})`; mỗi `GroupCard` bọc trong phần tử có id đó.
  4. Mọi callback của `GroupCard` gọi helper ở Task 4.2 rồi `patch(...)`/`setValue(...)` theo cách `PartForm` đang cập nhật state.
  5. Truyền `errorFor` hiện có của form vào `GroupCard`.
  6. (red-team F9) Hiện bộ đếm tổng "Tổng số câu của part: {value.questions.length}/40" cạnh danh sách nhóm khi có nhóm; khi tổng đạt 40, các nút "Thêm câu" trong `GroupCard` bị disable (truyền xuống `QuestionKeyEditor` qua `atMaxOverride` hoặc tương đương — `QUESTION_MAX_COUNT` hiện đếm per-editor, schema chặn 40 câu/PART).
- Verify: `pnpm --filter admin check-types` exits 0.

### Task 4.8 — Test component

- Target: `part-form.test.tsx`. (red-team A3: file này render bằng `renderToStaticMarkup` — KHÔNG có DOM tương tác; các assertion bấm/gõ phải đi qua helper thuần hoặc e2e phase 5, không viết test tương tác ở đây.)
- Steps: thêm test:
  1. (Static render) Part không nhóm render một editor và nút "Chia thành nhiều nhóm câu".
  2. (Helper thuần thay cho click) `addGroup(emptyPartValue(skill, "p1"), type)` → value có 2 nhóm; render tĩnh value đó → có `nav` "Mục lục nhóm câu" với "Nhóm câu 1", "Nhóm câu 2".
  3. (Static render) Part có 2 nhóm (`tfng` 3 câu, `note` 2 câu) từ DTO: outline hiện `Câu 1`…`Câu 5` (reading `p1` bắt đầu từ 1).
  4. (Static render) Nhóm `note` `answersInline` 2 câu, chỉ câu đầu có `____` → hiển thị `Câu có ô trống: 1/2`.
  5. (Helper thuần) `isPartDirty`: DTO gốc vs `partValueFromDto(dto)` với câu 1 có `explanation` thêm vào → `true`; không sửa → `false`.
  6. Luồng bấm nút thật (click "Chia thành nhiều nhóm câu", sửa ô giải thích trong UI) do e2e Task 5.1 phủ — không nhân bản ở đây.
- Verify: `pnpm --filter admin test` exits 0, output không có `FAIL`.

### Task 4.9 — Gate

- Verify: `pnpm check && pnpm --filter admin check-types && pnpm --filter @teacher-os/ui check-types && pnpm --filter admin test && pnpm --filter @teacher-os/ui test` đều exit 0. (Nếu `pnpm check` fail vì format: `pnpm check:fix`, chạy lại.)

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
