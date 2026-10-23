---
phase: 3
title: "Cây điều hướng và thẻ Part/Nhóm"
status: pending
priority: P1
effort: "0.75d"
dependencies: [2]
---

# Phase 3: Cây điều hướng và thẻ Part/Nhóm (`apps/admin`)

## Overview

Dựng các component trình bày: tab nhỏ có badge đếm, cây điều hướng ba tầng, thẻ Nhóm có ba tab, và tách `PartForm` thành thẻ Part có hai tab. `PartForm` vẫn là nơi giữ state, dirty và lưu của một part.

## Context

- Report mục 4 (thẻ Section/Group/Question), mục 7 (bộ nút chung, badge đếm, phụ đề tóm tắt).
- `DESIGN.md`: selection = `bg-muted`; badge đếm `aria-hidden`; nút chính = mực; không thêm màu phân cấp (quyết định Q4).
- `PartTabs` (`apps/admin/src/components/library/part-tabs.tsx`) có sẵn logic `role=tablist` + phím mũi tên/Home/End — tổng quát hóa thay vì viết lại.
- Plan #420 Task 4.5 (nội dung thẻ nhóm: dạng bài, 3 cờ, `answersInline` chỉ cho `CLOZE_EDITOR_TYPES`, dòng `Câu có ô trống: x/y`, `errorFor("groups.N.…")`).

## Related code files

- Create: `apps/admin/src/components/library/card-tabs.tsx` (+ `.test.tsx`)
- Create: `apps/admin/src/components/library/test-outline.tsx` (+ `.test.tsx`)
- Create: `apps/admin/src/components/library/group-card.tsx`
- Modify: `apps/admin/src/components/library/part-form.tsx`, `part-form.test.tsx`
- Delete (phase 4, khi trang không còn dùng): `apps/admin/src/components/library/part-tabs.tsx`

## Implementation steps

### Task 3.1 — `CardTabs`
1. Tổng quát hóa `PartTabs` thành `CardTabs({ tabs: {id, label, count?}[], active, onSelect, idPrefix, size?: "md" | "sm" })`: giữ `role=tablist/tab`, `aria-selected`, `aria-controls`, roving `tabIndex`, phím trái/phải/Home/End.
2. `count` hiện thành badge `font-mono text-[10px]` có `aria-hidden` — accessible name chỉ là `label`.
3. Kiểu: tab chọn có gạch chân `border-b-2 border-primary` và chữ `text-foreground`, tab khác `text-muted-foreground`.
4. Test: badge không nằm trong accessible name; phím mũi tên chuyển tab (test logic qua hàm thuần `nextTabIndex` nếu harness là `renderToStaticMarkup`).

### Task 3.2 — `TestOutline`
1. Props: `sections: OutlineSection[]`, `active: { part: string; group?: number; question?: number }`, `onSelect(target)`, `collapsed`, `onCollapsedChange`.
2. Render `<nav aria-label="Mục lục đề">` có nút đầu `Thu gọn mục lục` / `Mở mục lục` (`aria-expanded`). Khi thu gọn chỉ còn nút này.
3. Danh sách lồng:
   - Part: `button` accessible name đúng bằng nhãn slot (`Passage 1`, `Section 1`) để e2e chọn theo tên; bên cạnh (ngoài button) phụ đề `aria-hidden` "{g} nhóm · {q} câu" hoặc "Trống"; part `dirty` có chấm `--warn` kèm text sr-only "chưa lưu" đặt ngoài button.
   - Nhóm: `button` "Nhóm câu {n}" thụt một cấp, kèm `typeLabel` dạng chữ muted.
   - Câu: `button` "Câu {number}" thụt hai cấp; câu thiếu đáp án có chấm `--warn` `aria-hidden`.
4. Mục đang chọn: `aria-current="true"`, nền `bg-muted`, chữ `text-foreground font-medium`.
5. Cây chỉ hiển thị nhóm/câu của part đang mở và part có dữ liệu; part trống chỉ hiện dòng part.
6. Test (static render): đủ slot; nhãn đúng; badge/phụ đề không lọt vào accessible name.

### Task 3.3 — `GroupCard`
1. Props như #420 Task 4.5 bước 1, thêm `activeTab`, `onTabChange`, `openRow`, `onOpenRowChange`, `rowIdPrefix`.
2. Header: badge viền `Nhóm câu {index+1}`, đoạn trích hướng dẫn (plain text 80 ký tự), dải `Câu x–y`, rồi `CardControls` `label = "nhóm câu {index+1}"` (mở/đóng, lên/xuống, xóa — xóa phải confirm qua dialog theo mẫu `delete-test-dialog.tsx`).
3. Body khi mở: `CardTabs` với 3 tab:
   - **Hướng dẫn**: `QuestionKeyEditor view="intro"` (`intro = group.instruction`, `onIntroChange → onPatch({instruction})`).
   - **Thiết lập**: `Select` "Dạng bài" + 3 checkbox như #420 Task 4.5 bước 3 (kể cả ràng buộc `answersInline` và dòng `Câu có ô trống`).
   - **Câu hỏi ({count})**: `QuestionKeyEditor view="questions"` với `qStartOverride`, `showExplanation`, `collapsibleRows`, `openRow`, `onOpenRowChange`.
4. Lỗi `errorFor("groups.{index}.type|optionBank|answersInline")` hiện cạnh field tương ứng; nếu tab chứa field lỗi không đang mở thì tab đó có chấm `--destructive` `aria-hidden` + text sr-only "có lỗi".

### Task 3.4 — Tách `PartForm` thành thẻ Part
1. `PartForm` giữ nguyên state/dirty/`handleSave`/xóa part; đổi phần render thành thẻ:
   - Header: badge tròn nền mực số thứ tự slot, tiêu đề part (hoặc nhãn slot khi rỗng), phụ đề "{g} nhóm, {q} câu", nút "Xóa part" (giữ confirm và điều kiện `testReady` hiện có).
   - `CardTabs`: **Nội dung** (tiêu đề, band, nguồn, passage, transcript, audio, ghi chú nội bộ — các field hiện có, giữ nguyên label/id) và **Câu hỏi ({g})**.
   - Tab Câu hỏi khi `groups.length === 0`: `QuestionKeyEditor view="all"` + `collapsibleRows` + `showExplanation` + nút "Chia thành nhiều nhóm câu" (#420 Task 4.7 bước 1).
   - Tab Câu hỏi khi có nhóm: danh sách `GroupCard` (mỗi thẻ bọc trong phần tử id `group-${slot}-${gi}`), nút "Thêm nhóm câu", bộ đếm "Tổng số câu của part: n/40" và khóa thêm câu khi đủ 40 (#420 Task 4.7 bước 2, 6).
2. Prop mới `focusTarget?: { group: number; question?: number } | null`: khi đổi, chuyển sang tab Câu hỏi, mở nhóm, mở tab Câu hỏi của nhóm, đặt `openRow`, rồi `scrollIntoView({ block: "start" })` vào hàng `group-${slot}-${gi}-q${offset}`.
3. Bỏ nút "Lưu part" khỏi form; expose `save()` qua `forwardRef` + `useImperativeHandle` (`PartFormHandle`) để thanh hành động của trang gọi. Khối lỗi `role="alert"` và trạng thái `aria-live` giữ trong thẻ.
4. Cập nhật `part-form.test.tsx`: test static cho hai tab, nhãn badge, và các test #420 Task 4.8 (thay "outline nhóm" bằng `TestOutline` ở Task 3.2).

## Todo

- [ ] Task 3.1 `CardTabs`
- [ ] Task 3.2 `TestOutline`
- [ ] Task 3.3 `GroupCard`
- [ ] Task 3.4 thẻ Part

## Success criteria

- `pnpm --filter admin test`, `pnpm --filter admin check-types`, `pnpm check` exit 0.
- Mọi nút icon có `aria-label`; không badge đếm nào nằm trong accessible name.

## Risk

- `part-form.tsx` đã 595 dòng; sau khi tách thẻ, nếu vượt ~650 dòng thì tách phần tab Nội dung ra `part-content-fields.tsx`.
- Chuyển nút lưu ra ngoài form làm thay đổi luồng focus sau khi lưu: giữ `aria-live` trong thẻ để thông báo vẫn được đọc.
