---
phase: 4
title: "Bố cục trang hai cột"
status: completed
priority: P1
effort: "0.5d"
dependencies: [3]
---

# Phase 4: Bố cục trang hai cột (`$testId.tsx`)

## Overview

Ghép thẻ thông tin, thanh hành động, cây điều hướng và thẻ Part thành trang Quiz Builder; thay `PartTabs`; thêm panel "Kiểm tra đáp án".

## Context

- Trang hiện tại: `apps/admin/src/routes/_auth/library/tests/$testId.tsx` (536 dòng). Giữ nguyên: query/mutation, `headerFromDetail`, PATCH header khi blur, `drafts`/`onDraftChange`, `useBlocker`, `effectiveParts` + `validateTestReady`, danh sách lý do chưa đủ điều kiện xuất bản, trạng thái tải/lỗi.
- Quyết định Q2 (lưu từng part), Q3 (slot cố định), Q5 (panel đáp án chỉ đọc).

## Related code files

- Modify: `apps/admin/src/routes/_auth/library/tests/$testId.tsx`
- Create: `apps/admin/src/components/library/answers-checking-panel.tsx` (+ `.test.tsx`)
- Delete: `apps/admin/src/components/library/part-tabs.tsx` (không còn nơi dùng — kiểm bằng grep)

## Implementation steps

### Task 4.1 — Khung trang
1. Đổi container `max-w-4xl` thành `max-w-screen-2xl`.
2. Đầu trang: link "← Thư viện đề", tiêu đề, dòng phụ skill · thời gian, và `PublishBar` (giữ props).
3. Thẻ "Thông tin bộ đề" giữ `TestHeaderForm` + nút "Lưu thông tin" như cũ.
4. Thanh hành động (`role="toolbar"` `aria-label="Thao tác soạn đề"`): nút chính "Lưu part" (gọi `partFormRef.current?.save()`, disable khi **PartForm không được mount** (slot trống chưa "Thêm nội dung" — `partsBySlot.has(slot) || initializedSlots.has(slot)` là false, red-team F2) hoặc đang lưu, chữ "Đang lưu…" khi pending); nút outline "Kiểm tra đáp án" có icon check, `aria-expanded` điều khiển panel; nhãn "Có thay đổi chưa lưu" khi `dirtySlots.size > 0`.

### Task 4.2 — Hai cột
1. `div` `grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]`.
2. Cột trái `aside`: `TestOutline` với `sections = buildTestOutline(skill, slots, partsBySlot, drafts)`; trên `lg` là `sticky top-4 self-start max-h-[calc(100dvh-2rem)] overflow-y-auto`; dưới `lg` nằm trên cột phải và `collapsed` mặc định `true` (đọc `matchMedia("(min-width: 1024px)")` lúc mount, guard `typeof window.matchMedia === "function"` theo precedent `annotatable-essay.tsx:113-118` — admin CSR nhưng test environment có thể thiếu matchMedia).
3. Cột phải: thẻ Part của slot đang chọn (`PartForm` với `ref`, `focusTarget`, `qStart` = qStart fold của slot từ `computeLibraryTestRanges`, `onActivePositionChange`) hoặc trạng thái slot trống hiện có ("Chưa có nội dung cho …" + nút "Thêm nội dung").
4. State (red-team A4 — mỗi tầng một owner): trang giữ `selection: { part }` (thay `activeSlot`, giữ guard fallback `slots[0]` hiện có) + `activePosition: { group: number | null; question: number | null }` (chỉ nhận từ `onActivePositionChange` của `PartForm`, dùng tô `aria-current` nhóm/câu trên cây). `onSelect` của cây: nếu khác part → đổi `selection.part` (nháp part cũ đã nằm trong `drafts` và được khôi phục qua `initialValue`); nếu có `group` → bump `focusNonce` và truyền `focusTarget = { group, question, nonce }` (object được build trong handler, không render-dependent). KHÔNG lưu selection vào URL (mọi e2e URL assertion dùng `$`-anchor — scope audit xác nhận an toàn).
5. Xóa import và file `PartTabs`; `rg -n "part-tabs|PartTabs" apps/admin/src` không còn kết quả.

### Task 4.3 — Panel "Kiểm tra đáp án"
1. `AnswersCheckingPanel({ rows, onJump })` với `rows = buildAnswersOverview(...)`: bảng nhóm theo part (`<h3>` nhãn slot), mỗi dòng: số câu (nút bấm), đáp án (+ đáp án chấp nhận thêm, phân cách " / "), trạng thái "Thiếu đáp án" (chấm `--warn`). Số câu theo fold — không trùng lặp giữa các part.
2. Dòng đầu tóm tắt: "{tổng} câu · {thiếu} câu thiếu đáp án".
3. Bấm số câu → `onJump({ part, group, question })` dùng cùng đường đi với cây (đổi part nếu cần + `focusTarget`).
4. Panel chỉ đọc; nhắc "Dán đáp án hàng loạt nằm trong tab Câu hỏi của từng nhóm."
5. Test static: tóm tắt đếm đúng; câu thiếu có nhãn.

## Todo

- [ ] Task 4.1 khung trang + thanh hành động
- [ ] Task 4.2 hai cột + điều hướng
- [ ] Task 4.3 panel kiểm tra đáp án

## Success criteria

- `pnpm --filter admin check-types`, `pnpm --filter admin test`, `pnpm check` exit 0.
- Đổi part qua cây khi part cũ còn nháp: quay lại vẫn thấy nháp và chấm "chưa lưu" (kiểm ở e2e phase 5).

## Risk

- `useImperativeHandle` + remount `PartForm` theo `key` (`${slot}:${updatedAt}`): ref được gán lại sau remount; nút "Lưu part" đọc `ref.current` lúc bấm nên không giữ handle cũ. Handle được tạo lại mỗi render (không dep array — Task 3.4 bước 5) nên không có stale closure `value`; e2e phase 5 khóa bằng bước gõ thêm → Lưu → reload → nội dung mới tồn tại.
