---
phase: 1
title: "Primitive editor dùng chung"
status: completed
priority: P1
effort: "0.75d"
dependencies: ["#420 phase 1"]
---

# Phase 1: Primitive editor dùng chung (`packages/ui`)

## Overview

Bổ sung các prop optional cho editor câu hỏi dùng chung để trang admin dựng được bố cục Selfomy: đánh số tùy chỉnh, ô giải thích, tách khối hướng dẫn khỏi khối câu hỏi, hàng câu thu gọn có chip tóm tắt và nút lên/xuống. Web composer không truyền prop mới nên không đổi hành vi.

## Context

- Report: `plans/reports/rea-261023-1420-selfomy-quiz-builder-ui-structure.md` mục 4, 5, 7.
- Plan #420 phase 4 Task 4.1 và 4.1b (`plans/261022-1329-library-question-groups/phase-04-admin-group-editor-ui.md`) — tái dùng nguyên văn ở đây.
- `QuestionKeyEditor`: `packages/ui/src/components/assignments/editor/question-key-editor.tsx` (props :32-69, `qStart` :71, nút "Chèn câu lệnh chuẩn" :171, `ClozeEditor` :183, `OptionBankEditor` :194, `AnswerKeyGrid` :261).
- `AnswerKeyGrid`: `answer-key-grid.tsx` (vòng hàng câu :297, nút "Xóa câu n" :477).

## Related code files

- Modify: `packages/ui/src/components/assignments/editor/question-key-editor.tsx` (+ `.test.tsx`)
- Modify: `packages/ui/src/components/assignments/editor/answer-key-grid.tsx` (+ `.test.tsx`)
- Modify: `packages/ui/src/lib/cloze.ts`, `packages/ui/src/components/assignments/editor/cloze-editor.tsx` (+ test)
- Modify: `packages/ui/src/components/assignments/editor/table-grid-editor.tsx` (caller thứ hai của `segmentsToItems` — VC1)
- Create: `packages/ui/src/components/assignments/editor/card-controls.tsx` (+ `.test.tsx`)
- Create: `packages/ui/src/components/assignments/editor/question-summary.ts` (+ `.test.ts`)

## Implementation steps

### Task 1.1 — Đánh số tùy chỉnh và ô giải thích
Thực hiện Task 4.1 của plan #420 (`qStartOverride`, `showExplanation` cho `QuestionKeyEditor` và `AnswerKeyGrid`), bổ sung bắt buộc (red-team F1/A2 — Critical): mọi nhãn "Câu {number}" sống ở `AnswerKeyGrid`, và grid **tự tính** `const qStart = qStartOf(skill, partId)` (`answer-key-grid.tsx:179`) — phải:
1. Thêm prop optional `qStartOverride?: number` cho `AnswerKeyGrid`; đổi `:179` thành `qStartOverride ?? qStartOf(skill, partId)`.
2. `QuestionKeyEditor` truyền qStart đã resolve (`qStartOverride ?? qStartOf(skill, partId)`) xuống `AnswerKeyGrid` qua prop này.
3. Unit test: grid với `qStartOverride=4`, 2 hàng → nhãn "Câu 4", "Câu 5" (fieldset aria-label, nút "Xóa câu 4/5", "Giải thích câu 4/5" khi `showExplanation`).

### Task 1.2 — ClozeEditor apply không mất field câu
Thực hiện nguyên văn Task 4.1b của plan #420 (`segmentsToItems(segments, existing)` giữ `explanation`/`answerSet`/`type`/`pin`). Caller thứ hai: `table-grid-editor.tsx:70` cũng gọi `segmentsToItems(segments)` — truyền thêm `items` hiện tại vào `existing` tại đó để dạng `tablecomp` được cùng fix (VC1).

### Task 1.3 — `view` để tách hướng dẫn khỏi câu hỏi
1. Thêm prop optional `view?: "all" | "intro" | "questions"` (mặc định `"all"`) cho `QuestionKeyEditor`.
2. Hiện thực bằng **ẩn/hiện khối, KHÔNG unmount** (red-team F5): hai khối "Hướng dẫn đề" và khối câu hỏi (URL ảnh/pin, `ClozeEditor`, `OptionBankEditor`, dán đáp án hàng loạt, `AnswerKeyGrid`) luôn mount; `view` điều khiển thuộc tính `hidden` trên wrapper của khối không hiển thị. Lý do: đổi tab trong `GroupCard` là đổi `view` — nếu unmount thì text đang gõ dở và trạng thái lỗi blur (`blurred` trong grid) mất ngay khi đổi tab.
3. `"intro"`: hiện khối "Hướng dẫn đề" + nút "Chèn câu lệnh chuẩn", ẩn khối câu hỏi. `"questions"`: ngược lại. `"all"`: hiện cả hai (như hiện tại).

### Task 1.4 — Bộ nút điều khiển dùng chung `CardControls`
1. Tạo `card-controls.tsx` export `CardControls` với props `{ label: string; open?: boolean; onToggle?; onMoveUp?; onMoveDown?; onRemove?; canMoveUp?; canMoveDown? }`. Chỉ render nút có callback.
2. Nút icon (`lucide-react`: `ChevronDown`/`ChevronUp`, `ArrowUp`, `ArrowDown`, `Trash2`), `aria-label` theo mẫu: `Mở {label}` / `Thu gọn {label}` (kèm `aria-expanded`), `Đưa {label} lên`, `Đưa {label} xuống`, `Xóa {label}`. Nút xóa dùng màu `text-destructive`.
3. Không tự hỏi xác nhận; nơi gọi quyết định (nhóm/part cần confirm, câu thì không — giữ hành vi xóa câu hiện tại).

### Task 1.5 — Tóm tắt câu cho hàng thu gọn
1. Tạo `question-summary.ts` export `questionSummary(item: QuestionItem, typeId: string, optionBank?: readonly string[])` → `{ excerpt: string; choiceCount: number | null; hasAnswer: boolean; hasExplanation: boolean }`.
   - `excerpt`: `htmlToPlainText(item.stem)` (từ `packages/api/src/rich-text.ts:101`) rút gọn 90 ký tự kèm `…`; stem rỗng → `""`.
   - `choiceCount` (red-team S5/A6): resolve dạng theo hàng như grid — `kindOf(item.type ?? typeId)` (mirror `rowTypeOf`); nếu có `optionBank` (nhóm matching có bank riêng) → `optionBank.length`; ngược lại MCQ → `item.opts?.length ?? answerChoices(kind).length`; dạng letter/roman **không có bank** và dạng gõ chữ → `null` (không hiện chip — tránh chip "8 lựa chọn" sai với bank 3 mục).
   - `hasAnswer`: `item.answer.trim() !== ""`.
2. Test: MCQ có 4 lựa chọn; dạng `note` gõ chữ → `choiceCount` null; matching có `optionBank` 3 mục → 3; câu override `item.type` khác `typeId` đếm theo `item.type`; stem HTML dài bị rút gọn; câu thiếu đáp án.

### Task 1.6 — Hàng câu thu gọn trong `AnswerKeyGrid`
1. Thêm props optional: `collapsible?: boolean`, `openRow?: number | null`, `onOpenRowChange?: (index: number | null) => void`, `rowIdPrefix?: string`.
2. Khi `collapsible` bật, mỗi hàng có id `${rowIdPrefix}-q${index}` và:
   - Thu gọn: một dòng gồm badge `Câu {number}`, `excerpt`, chip `{n} lựa chọn` (khi `choiceCount`), chip trạng thái đáp án (chấm `--success` + "Có đáp án" / chấm `--warn` + "Thiếu đáp án"), chip "Có giải thích" (khi có), rồi `CardControls` với `label = "câu {number}"` (mở/đóng, lên/xuống, xóa dùng handler xóa hiện có). **Phần thân hàng thu gọn KHÔNG render** (unmount — khác với tab dùng `hidden`): chỉ một hàng mở tại mỗi nhóm có editor (kể cả RichTextEditor giải thích), đề 40 câu không mount hàng chục editor ProseMirror (kongming GO-checkpoint).
   - Mở: viền `ring-2 ring-ring/50` và hiện đầy đủ ô nhập như chế độ phẳng hiện tại (kể cả ô giải thích của Task 1.1).
   - Hàng có lỗi **đang hiện** (`errorEntries.length > 0` của hàng đó — KHÔNG phải `rowErrors` tồn tại, red-team F5) luôn được coi là mở; khi force-open, nút thu gọn của hàng đó ẩn theo và `aria-expanded` phản ánh thật.
   - Collapse chủ động một hàng (`onToggle` → đóng) đồng thời clear chỉ số hàng khỏi `blurred` để nút thu gọn không bị blur-mới đánh dấu rồi ép mở lại (red-team F5).
3. `collapsible` vắng mặt → render y như hiện tại (ô "Xóa câu n" giữ nguyên `aria-label`).
4. Đổi thứ tự hàng — **hiện thực bên trong grid** như `remove()` sẵn có (red-team F4): hoán đổi phần tử rồi gọi `onItemsChange`, remap `blurred` theo hoán đổi (mirror logic shift của `remove()` ở `answer-key-grid.tsx:224-236`), và nếu hàng đang mở bị dời thì gọi `onOpenRowChange(chỉ số mới)`. Trong `QuestionKeyEditor` thêm prop passthrough `collapsibleRows?: boolean` + `openRow`/`onOpenRowChange`; khi bật, grid tự xử lý move nội bộ (không cần `onMoveRow` prop bên ngoài).

### Task 1.7 — Test
1. `card-controls.test.tsx`: chỉ render nút có callback; `aria-label` và `aria-expanded` đúng.
2. `answer-key-grid.test.tsx`: chế độ phẳng không đổi (test cũ pass không sửa); chế độ `collapsible` với `openRow=null` hiện "Câu 1", chip "Thiếu đáp án", không hiện ô "Đáp án chấm tự động"; `openRow=0` hiện ô đó; hàng thu gọn không có fieldset/ô nhập trong DOM (thân unmount); `qStartOverride=4` hiện "Câu 4"/"Câu 5" (Task 1.1); move/remove hàng đang mở + có `blurred` → assert **đồng thời** dữ liệu mới, `blurred` remap đúng, `openRow` dời theo đúng hàng, và lỗi đang hiện dán đúng hàng (Task 1.6 bước 4 + kongming GO-checkpoint).
3. `question-key-editor.test.tsx`: `view="intro"` không có "Lưới đáp án"; `view="questions"` không có ô "Hướng dẫn đề"; cả hai `view` vẫn mount khối bị ẩn (kiểm qua DOM render tĩnh có element `hidden` tương ứng).

## Todo

- [ ] Task 1.1 qStartOverride + showExplanation
- [ ] Task 1.2 cloze giữ field
- [ ] Task 1.3 prop `view`
- [ ] Task 1.4 `CardControls`
- [ ] Task 1.5 `questionSummary`
- [ ] Task 1.6 hàng câu thu gọn
- [ ] Task 1.7 test

## Success criteria

- `pnpm --filter @teacher-os/ui test` và `pnpm --filter @teacher-os/ui check-types` exit 0.
- `pnpm --filter web test` exit 0 (web composer không đổi hành vi).

## Risk

- `AnswerKeyGrid` dài 500 dòng và có logic lỗi theo blur; chế độ thu gọn chỉ bọc phần hiển thị hàng, không đổi logic lỗi. Nếu file vượt ~600 dòng, tách phần hàng thu gọn ra `answer-key-row-summary.tsx`.

## Security

Phase này **bật ghi `explanation` (rich text) từ admin** lên payload lưu part (field có sẵn trên wire schema nhưng admin trước đó không ghi) — có thay đổi dữ liệu ghi. Mọi excerpt/chip là plain text từ `htmlToPlainText` render dạng text node, không render HTML. Gate cuối phase (precedent `plans/260928-0820-rich-text-test-builder/phase-04-render-surfaces.md`): `rg -n "dangerouslySetInnerHTML|innerHTML" packages/ui/src apps/admin/src` chỉ trả về các site hiện có (`rich-text-body.tsx` sink duy nhất + inert check `main.tsx`) và KHÔNG có kết quả mới.
