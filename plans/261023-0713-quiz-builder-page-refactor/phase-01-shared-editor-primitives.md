---
phase: 1
title: "Primitive editor dùng chung"
status: pending
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
- Create: `packages/ui/src/components/assignments/editor/card-controls.tsx` (+ `.test.tsx`)
- Create: `packages/ui/src/components/assignments/editor/question-summary.ts` (+ `.test.ts`)

## Implementation steps

### Task 1.1 — Đánh số tùy chỉnh và ô giải thích
Thực hiện nguyên văn Task 4.1 của plan #420 (`qStartOverride`, `showExplanation` cho `QuestionKeyEditor` và `AnswerKeyGrid`).

### Task 1.2 — ClozeEditor apply không mất field câu
Thực hiện nguyên văn Task 4.1b của plan #420 (`segmentsToItems(segments, existing)` giữ `explanation`/`answerSet`/`type`/`pin`).

### Task 1.3 — `view` để tách hướng dẫn khỏi câu hỏi
1. Thêm prop optional `view?: "all" | "intro" | "questions"` (mặc định `"all"`) cho `QuestionKeyEditor`.
2. `"intro"`: chỉ render khối "Hướng dẫn đề" + nút "Chèn câu lệnh chuẩn".
3. `"questions"`: render mọi phần còn lại (URL ảnh/pin, `ClozeEditor`, `OptionBankEditor`, dán đáp án hàng loạt, `AnswerKeyGrid`), bỏ khối hướng dẫn.
4. `"all"`: như hiện tại.

### Task 1.4 — Bộ nút điều khiển dùng chung `CardControls`
1. Tạo `card-controls.tsx` export `CardControls` với props `{ label: string; open?: boolean; onToggle?; onMoveUp?; onMoveDown?; onRemove?; canMoveUp?; canMoveDown? }`. Chỉ render nút có callback.
2. Nút icon (`lucide-react`: `ChevronDown`/`ChevronUp`, `ArrowUp`, `ArrowDown`, `Trash2`), `aria-label` theo mẫu: `Mở {label}` / `Thu gọn {label}` (kèm `aria-expanded`), `Đưa {label} lên`, `Đưa {label} xuống`, `Xóa {label}`. Nút xóa dùng màu `text-destructive`.
3. Không tự hỏi xác nhận; nơi gọi quyết định (nhóm/part cần confirm, câu thì không — giữ hành vi xóa câu hiện tại).

### Task 1.5 — Tóm tắt câu cho hàng thu gọn
1. Tạo `question-summary.ts` export `questionSummary(item: QuestionItem, typeId: string)` → `{ excerpt: string; choiceCount: number | null; hasAnswer: boolean; hasExplanation: boolean }`.
   - `excerpt`: `htmlToPlainText(item.stem)` (từ `packages/api/src/rich-text.ts:101`) rút gọn 90 ký tự kèm `…`; stem rỗng → `""`.
   - `choiceCount`: số lựa chọn của dạng MCQ/matching (dùng `answerChoices(kindOf(...))` hoặc `item.opts?.length`), dạng gõ chữ → `null`.
   - `hasAnswer`: `item.answer.trim() !== ""`.
2. Test: MCQ có 4 lựa chọn, dạng `note` gõ chữ, stem HTML dài bị rút gọn, câu thiếu đáp án.

### Task 1.6 — Hàng câu thu gọn trong `AnswerKeyGrid`
1. Thêm props optional: `collapsible?: boolean`, `openRow?: number | null`, `onOpenRowChange?: (index: number | null) => void`, `onMoveRow?: (index: number, dir: -1 | 1) => void`, `rowIdPrefix?: string`.
2. Khi `collapsible` bật, mỗi hàng có id `${rowIdPrefix}-q${index}` và:
   - Thu gọn: một dòng gồm badge `Câu {number}`, `excerpt`, chip `{n} lựa chọn` (khi `choiceCount`), chip trạng thái đáp án (chấm `--success` + "Có đáp án" / chấm `--warn` + "Thiếu đáp án"), chip "Có giải thích" (khi có), rồi `CardControls` với `label = "câu {number}"` (mở/đóng, lên/xuống qua `onMoveRow`, xóa dùng handler xóa hiện có).
   - Mở: viền `ring-2 ring-ring/50` và hiện đầy đủ ô nhập như chế độ phẳng hiện tại (kể cả ô giải thích của Task 1.1).
   - Hàng có lỗi (`rowErrors` đang hiện) luôn được coi là mở để lỗi không bị giấu.
3. `collapsible` vắng mặt → render y như hiện tại (ô "Xóa câu n" giữ nguyên `aria-label`).
4. Đổi thứ tự hàng: `onMoveRow` do nơi gọi xử lý; trong `QuestionKeyEditor` thêm prop passthrough `collapsibleRows?: boolean` + `openRow`/`onOpenRowChange`, và tự hiện thực `onMoveRow` bằng hoán đổi phần tử rồi gọi `onItemsChange`.

### Task 1.7 — Test
1. `card-controls.test.tsx`: chỉ render nút có callback; `aria-label` và `aria-expanded` đúng.
2. `answer-key-grid.test.tsx`: chế độ phẳng không đổi (test cũ pass không sửa); chế độ `collapsible` với `openRow=null` hiện "Câu 1", chip "Thiếu đáp án", không hiện ô "Đáp án chấm tự động"; `openRow=0` hiện ô đó.
3. `question-key-editor.test.tsx`: `view="intro"` không có "Lưới đáp án"; `view="questions"` không có ô "Hướng dẫn đề".

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

Không có thay đổi dữ liệu hay quyền. `excerpt` là plain text từ `htmlToPlainText`, không render HTML.
