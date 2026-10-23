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
  3. Khi `showExplanation` true: dưới mỗi câu (trong vòng lặp render từng item), thêm `Field` label `Giải thích câu {qStart + index}` chứa `RichTextEditor` `value={item.explanation ?? ""}`, `onChange` cập nhật `explanation` của item đó qua `onItemsChange`. Nếu giá trị rỗng sau `htmlToPlainText(...).trim()`, xóa key `explanation` khỏi item (không lưu chuỗi rỗng).
  4. Không đổi gì khi hai prop vắng mặt.
- Verify: `pnpm --filter @teacher-os/ui test` exits 0 và `pnpm --filter @teacher-os/ui check-types` exits 0.

### Task 4.2 — Helper thuần quản lý nhóm

- Goal: mọi thao tác nhóm là hàm thuần trả value mới với `startIndex` luôn đúng.
- Target: tạo `apps/admin/src/components/library/group-model.ts`.
- Steps: export các hàm (nhận và trả `PartFormValue`; dùng `import type { PartFormValue } from "./part-form"` — bắt buộc `import type` để `part-form.tsx` import ngược `group-model.ts` không tạo vòng import lúc chạy):
  1. `effectiveGroups(value)` → nếu `value.groups.length === 0` trả một nhóm ngầm `{id:"implicit", type:value.type, instruction:"", startIndex:0, count:value.questions.length, optionBank:value.optionBank, answersInline:false, splitContent:false, dragDrop:false}`; ngược lại trả `value.groups`.
  2. `reindexGroups(groups)` → gán lại `startIndex` cộng dồn theo `count`, giữ thứ tự.
  3. `splitIntoGroups(value)` → biến nhóm ngầm thành nhóm thật (`id` = `crypto.randomUUID()`), chuyển `value.optionBank` sang nhóm và `value.intro` sang `groups[0].instruction`, rồi đặt `value.optionBank = []`, `value.intro = ""` (intro cấp part không còn ô hiển thị khi có nhóm, nếu giữ lại sẽ thành dữ liệu ẩn).
  4. `addGroup(value, type)` → nếu đang ngầm thì `splitIntoGroups` trước; thêm nhóm mới cuối với 1 câu `emptyItem(type)` (import từ `@teacher-os/ui/components/assignments/editor/assignment-presets`), nối câu vào cuối `questions`, `reindexGroups`, đặt `value.type = groups[0].type`.
  5. `removeGroup(value, gi)` → xóa nhóm và **đúng dải câu của nó** khỏi `questions`, `reindexGroups`; nếu còn 0 nhóm → trả `groups: []` (về nhóm ngầm).
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
  3. `partValueFromDto` → `groups: Array.isArray(dto.groups) ? (dto.groups as LibraryQuestionGroup[]) : []`.
  4. `canonicalPartValue`, `partInputFromValue` VÀ `partReadyIssues` (hàm này tự dựng object input riêng) → đưa `groups` vào. Thiếu ở `partReadyIssues` thì rule ready chạy trên nhóm ngầm với `optionBank=[]` và chặn lưu sai.
  5. **Bắt buộc:** `normalizeQuestions` dựng lại câu theo từng field nên đang làm rơi field lạ. Thêm: nếu `typeof raw.explanation === "string"` thì giữ `explanation`; nếu `typeof raw.answerSet === "string"` thì giữ `answerSet`. Không thêm key khi vắng mặt.
  6. Thêm `groups: []` vào fixture DTO trong `part-form.test.tsx` (tsconfig admin quét cả file test).
  7. Thêm test round-trip: DTO có câu kèm `explanation` → `partValueFromDto` → `partInputFromValue` vẫn giữ `explanation`.
  8. `slotTypes`: khi part có nhóm, danh sách dạng bài cho Select nhóm dùng `librarySkillTypes(skill)`; Select dạng bài cấp part chỉ hiển thị khi `groups.length === 0`.
- Verify: `pnpm --filter admin test part-form --reporter=verbose` exits 0 (test cũ không sửa vẫn pass).

### Task 4.5 — Component `GroupCard`

- Goal: thẻ một nhóm, đóng/mở được.
- Target: tạo `group-card.tsx`, export `GroupCard`.
- Steps:
  1. Props: `skill`, `slot`, `index`, `group`, `items`, `qStart`, `open`, `onToggle`, `onPatch`, `onItemsChange`, `onMove(dir)`, `onRemove`, `canMoveUp`, `canMoveDown`, `imageUrl`, `onImageUrlChange`, `showErrors`, `status`, `errorFor(path)`.
  2. Header (luôn hiện): nhãn `Nhóm câu {index+1}`, dạng bài (dùng `quizTypeDisplay(group.type).label` từ `@teacher-os/api/contracts`), dải câu `Câu {qStart+group.startIndex}–{qStart+group.startIndex+group.count-1}`, nút lên/xuống/xóa (icon, `aria-label` tương ứng "Đưa nhóm lên", "Đưa nhóm xuống", "Xóa nhóm"), nút mở/đóng `aria-expanded`.
  3. Body (khi `open`):
     - `Select` "Dạng bài" (`librarySkillTypes(skill)`).
     - 3 checkbox: "Ô trả lời nằm trong hướng dẫn" (`answersInline`), "Tách nội dung và câu hỏi" (`splitContent`), "Cho phép kéo thả đáp án" (`dragDrop`).
     - `QuestionKeyEditor` với `typeId=group.type`, `items`, `optionBank=group.optionBank`, `intro={group.instruction}`, `onIntroChange={(v) => onPatch({ instruction: v })}` (dùng chính ô "Hướng dẫn đề" và nút "Chèn câu lệnh chuẩn" của editor làm hướng dẫn nhóm — KHÔNG thêm `RichTextEditor` riêng), `qStartOverride={qStart + group.startIndex}`, `showExplanation`, `onBankChange` → `onPatch({optionBank})`.
     - Checkbox "Ô trả lời nằm trong hướng dẫn" chỉ bật được khi `CLOZE_EDITOR_TYPES.has(group.type)` (import từ `@teacher-os/api/lib/infer-question-types`); dạng khác thì checkbox `disabled` kèm chú thích "Chỉ dùng cho dạng điền từ". Ô trống được nhập bằng `ClozeEditor` mà `QuestionKeyEditor` tự hiện cho các dạng này — không viết editor ô trống mới.
     - Khi `answersInline`: dưới editor hiện dòng `Câu có ô trống: {số câu có countClozeMarkers(stem) === 1}/{group.count}`; lệch thì dòng này dùng màu lỗi (token destructive).
     - Hiện `errorFor("groups.{index}.instruction")`, `errorFor("groups.{index}.optionBank")`, `errorFor("groups.{index}.type")` gần field tương ứng.
- Verify: `pnpm --filter admin check-types` exits 0.

### Task 4.5b — Thông báo lỗi tiếng Việt cho rule nhóm

- Goal: mọi message mới từ `library-contracts.ts` hiện bằng tiếng Việt.
- Target: `apps/admin/src/components/library/part-issues.ts` (map message → text) và hằng `FIELD_ERROR_TEXT` trong cùng file.
- Steps:
  1. Thêm mapping cho từng message mới: `"invalid type for skill"` → "Dạng bài không thuộc kỹ năng này", `"question type must match its group"` → "Dạng câu phải trùng dạng của nhóm", các message bất biến dải câu ở phase 2 (Task 2.5) → "Nhóm câu bị chồng hoặc hở số câu", `"inline answers need a completion type"` → "Chỉ dạng điền từ mới đặt ô trả lời trong nội dung", `"inline question needs exactly one blank"` → "Câu điền từ cần đúng một ô trống ____".
  2. Thêm key `groups` vào `FIELD_ERROR_TEXT` với nhãn "Nhóm câu".
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
- Verify: `pnpm --filter admin check-types` exits 0.

### Task 4.8 — Test component

- Target: `part-form.test.tsx` (theo đúng cách render/test của file hiện có).
- Steps: thêm test:
  1. Part không nhóm render một editor và nút "Chia thành nhiều nhóm câu".
  2. Bấm nút đó → xuất hiện `nav` "Mục lục nhóm câu" với 2 mục "Nhóm câu 1", "Nhóm câu 2".
  3. Part có 2 nhóm (`tfng` 3 câu, `note` 2 câu) từ DTO: outline hiện `Câu 1`…`Câu 5` (reading `p1` bắt đầu từ 1).
  4. Nhóm `note` `answersInline` 2 câu, chỉ câu đầu có `____` → hiển thị `Câu có ô trống: 1/2`.
  5. Sửa ô giải thích câu 1 → `isPartDirty` true.
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
