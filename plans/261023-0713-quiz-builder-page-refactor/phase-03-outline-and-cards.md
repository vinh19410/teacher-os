---
phase: 3
title: "Cây điều hướng và thẻ Part/Nhóm"
status: completed
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
1. Tạo **file mới** `card-tabs.tsx` tổng quát hóa logic của `PartTabs` (sao chép pattern `role=tablist/tab` + phím mũi tên/Home/End từ `part-tabs.tsx:29-41`): `CardTabs({ tabs: {id, label, count?}[], active, onSelect, idPrefix, size?: "md" | "sm" })` — giữ `role=tablist/tab`, `aria-selected`, `aria-controls` (unique qua `idPrefix`), roving `tabIndex`, phím trái/phải/Home/End. KHÔNG sửa tại chỗ `part-tabs.tsx` — file đó bị xóa ở phase 4 (VC3).
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
1. Props như #420 Task 4.5 bước 1, thêm `activeTab`, `onTabChange`, `openRow`, `onOpenRowChange` (**per-group** — PartForm giữ `openRowByGroup: Record<number, number | null>`, mỗi thẻ đọc/ghi đúng key của mình, red-team F8), `rowIdPrefix`, `qStart` (số fold của part + `group.startIndex`, truyền xuống `qStartOverride`).
2. Header: badge viền `Nhóm câu {index+1}`, đoạn trích hướng dẫn = `htmlToPlainText(group.instruction)` rút gọn 80 ký tự render dạng **text node** (red-team S4 — `instruction` là rich HTML, không render HTML, không `.slice()` thô), dải `Câu x–y`, rồi `CardControls` `label = "nhóm câu {index+1}"` (mở/đóng, lên/xuống, xóa — xóa phải confirm qua dialog theo mẫu `delete-test-dialog.tsx`).
3. Body khi mở: `CardTabs` với 3 tab, và **một instance `QuestionKeyEditor` duy nhất cho cả 3 tab** (red-team F5 — đổi tab không unmount editor, giữ text đang gõ và lỗi blur):
   - **Hướng dẫn**: QKE `view="intro"` (`intro = group.instruction`, `onIntroChange → onPatch({instruction})`).
   - **Thiết lập**: QKE bị ẩn cả hai khối (wrapper `hidden`); mặt tab này render `Select` "Dạng bài" + 3 checkbox như #420 Task 4.5 bước 3 (kể cả ràng buộc `answersInline` và dòng `Câu có ô trống`).
   - **Câu hỏi ({count})**: QKE `view="questions"` với `qStartOverride`, `showExplanation`, `collapsibleRows`, `openRow`, `onOpenRowChange`. Khi `collapsibleRows` bật, hàng mới thêm qua "Thêm câu" **tự mở** (set `openRow` = chỉ số hàng mới — chốt hành vi, red-team F6/A3).
4. Lỗi `errorFor("groups.{index}.type|optionBank|answersInline")` hiện cạnh field tương ứng; nếu tab chứa field lỗi không đang mở thì tab đó có chấm `--destructive` `aria-hidden` + text sr-only "có lỗi".

### Task 3.4 — Tách `PartForm` thành thẻ Part

> **Bước 0 (kongming wave-1/2 checkpoint — bắt buộc làm ĐẦU task):** `part-form.tsx` hiện **653 dòng** (đã vượt ngưỡng 650 của Risk). Tách khối các field tab Nội dung (tiêu đề, band, nguồn, passage, transcript, audio, ghi chú nội bộ) ra `part-content-fields.tsx` như một bước **thuần di chuyển code, không đổi hành vi** — chạy `pnpm --filter admin test` xanh ngay sau khi tách, rồi mới thẻ hóa.
1. `PartForm` giữ nguyên state/dirty/`handleSave`/xóa part; đổi phần render thành thẻ:
   - Header: badge tròn nền mực số thứ tự slot, tiêu đề part (hoặc nhãn slot khi rỗng), phụ đề "{g} nhóm, {q} câu", nút "Xóa part" (giữ confirm và điều kiện `testReady` hiện có).
   - `CardTabs`: **Nội dung** (tiêu đề, band, nguồn, passage, transcript, audio, ghi chú nội bộ — các field hiện có, giữ nguyên label/id) và **Câu hỏi ({g})**.
   - Tab Câu hỏi khi `groups.length === 0`: `QuestionKeyEditor view="all"` + `showExplanation` + nút "Chia thành nhiều nhóm câu" (#420 Task 4.7 bước 1) — **KHÔNG bật `collapsibleRows`** ở chế độ phẳng (red-team F6/A3: mọi e2e/hành vi soạn hiện tại đi qua editor phẳng, giữ nguyên). Select "Dạng bài" cấp part (chỉ hiện khi không nhóm, #420 Task 4.4 bước 8) nằm trong tab **Câu hỏi**.
   - Tab Câu hỏi khi có nhóm: danh sách `GroupCard` (mỗi thẻ bọc trong phần tử id `group-${slot}-${gi}`), nút "Thêm nhóm câu", bộ đếm "Tổng số câu của part: n/40" và khóa thêm câu khi đủ 40 (#420 Task 4.7 bước 2, 6).
2. Prop mới `qStart?: number` — số câu đầu của part theo fold từ trang (Task 2.3); vắng mặt thì fallback `qStartOf(skill, slot)` (giữ part-form.test.tsx render độc lập hoạt động). Truyền `qStart + group.startIndex` xuống từng `GroupCard`.
3. Prop mới `focusTarget?: { group: number; question?: number; nonce: number } | null` (red-team F3): **consume-once** — effect so theo key serialized `${group}:${question}:${nonce}`; khi key đổi: chuyển sang tab Câu hỏi của part, mở nhóm + tab Câu hỏi của nhóm, đặt `openRowByGroup[group]`, rồi `scrollIntoView({ block: "start" })` **trong cùng effect sau khi element tồn tại** (id `group-${slot}-${gi}-q${offset}` — luôn có trong DOM vì GroupCard giữ một instance QKE luôn mount, khối ẩn bằng `hidden`); nonce tăng mỗi lần bấm cây nên re-render giữa chừng (identity mới) không kích hoạt lại. **Chống re-fire sau remount (kongming wave-1/2):** PartForm gọi `onFocusConsumed?.(nonce)` sau khi xử lý xong; trang đặt `focusTarget = null` — instance PartForm mới (remount theo key sau lưu) có ref key rỗng sẽ không coi focusTarget cũ là mới. Test: render với focusTarget → remount cùng prop đã reset → không kích hoạt lần hai. Input trong khối `hidden` không nằm trong tab order (thuộc tính `hidden` loại khỏi tab order mặc định — không cần `inert` thêm).
4. Prop callback `onActivePositionChange?: (pos: { group: number | null; question: number | null; view?: PartViewState }) => void` (red-team A4): PartForm là owner của `openGroup`/`openRowByGroup`; mọi thay đổi (user bấm thẻ, focusTarget, thao tác cấu trúc) báo lên trang để cây tô `aria-current` đúng. Sau `removeGroup`/`moveGroup`/`moveQuestion`/`setGroupItems`: **di chuyển key `openRowByGroup` theo phần tử** (mirror pattern remap của grid wave 1 — moveGroup dời nguyên cặp key theo nhóm được swap; không chỉ clamp), clamp `openGroup` (`min(openGroup, groups.length - 1)`), rồi báo vị trí mới. **View-state sống sót remount (kongming wave-1/2 — remount theo key `${slot}:${updatedAt}` sau khi lưu):** PartForm nhận `initialView?: { partTab; openGroup; groupTabs; openRowByGroup }` và trang giữ `viewStateBySlot: Map<slot, PartViewState>` cập nhật qua callback — sau khi lưu xong remount, người dùng vẫn ở đúng nhóm/tab/hàng đang soạn.
5. Bỏ nút "Lưu part" khỏi form; expose `save()` qua `forwardRef` + `useImperativeHandle` (`PartFormHandle`) — **KHÔNG dep array** (hoặc latest-ref cho `handleSave`), và chữ ký `save(): Promise<boolean>` (kongming wave-1/2: toolbar wave 4 cần biết thành công hay bị validation chặn; `handleSave` trả boolean; double-submit do prop `saving` chặn ở toolbar). Tạo lại handle mỗi render để không đóng băng closure `value` (red-team F2). Khối lỗi `role="alert"` và trạng thái `aria-live` giữ trong thẻ. **Nhảy tới lỗi đầu khi lưu thất bại (kongming wave-1/2):** khi `handleSave` bị validation chặn, chuyển tự động sang tab part / mở nhóm / mở hàng chứa issue đầu tiên (theo `errorFor` path) rồi focus field đó — người dùng không phải mò lỗi ở thẻ đang đóng; kết hợp force-open theo `errorEntries` của grid (wave 1b).
6. Cập nhật `part-form.test.tsx` (VC2 + advisory 2026-10-23): prop `onSave` **GIỮ NGUYÊN** — nó là đường mutation PUT duy nhất của trang (`handleSave` gọi `await onSave(built.input, value)`); ref `save()` chỉ thay cái nút bấm, giá trị `Promise<boolean>` lấy từ kết quả `onSave`. Vì vậy 8 chỗ `onSave={vi.fn()}` (:278,306,332,352,373,390,415,434) giữ nguyên; chỉ bỏ/đổi assertion `"Lưu part"` (:287) theo nút dời ra toolbar; 2 chỗ e2e `getByRole("button", { name: "Lưu part" })` (`admin-library-reading.spec.ts:55`, `admin-library-listening.spec.ts:51`) đổi sang nút toolbar của trang (phase 4). Thêm test static cho hai tab, nhãn badge, và các test #420 Task 4.8 (thay "outline nhóm" bằng `TestOutline` ở Task 3.2).

## Todo

- [ ] Task 3.1 `CardTabs`
- [ ] Task 3.2 `TestOutline`
- [ ] Task 3.3 `GroupCard`
- [ ] Task 3.4 thẻ Part

## Success criteria

- `pnpm --filter admin test`, `pnpm --filter admin check-types`, `pnpm check` exit 0.
- Mọi nút icon có `aria-label`; không badge đếm nào nằm trong accessible name.

## Risk

- `part-form.tsx` đã 653 dòng — đã tách `part-content-fields.tsx` ở Bước 0; sau thẻ hóa nếu còn vượt ~650 thì tách tiếp khối GroupCard-list ra `part-groups-panel.tsx`.
- Chuyển nút lưu ra ngoài form làm thay đổi luồng focus sau khi lưu: giữ `aria-live` trong thẻ để thông báo vẫn được đọc.
