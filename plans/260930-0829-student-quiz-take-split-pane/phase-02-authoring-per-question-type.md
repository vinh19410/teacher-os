---
title: "Phase 2: Authoring — chọn type từng câu trong composer"
status: done
priority: P1
effort: 5h
dependencies: [1]
---

# Phase 2: Authoring — chọn type từng câu trong composer

## Overview

Giáo viên soạn được đề reading/listening trộn nhiều dạng câu hỏi trong một
prompt (đúng cấu trúc đề thật): mỗi hàng câu hỏi trong composer có select đổi
dạng bài; câu mới mặc định theo type của prompt; UI key editor + preview thích
ứng theo type từng câu.

## Context Links

- Plan index: [plan.md](./plan.md)
- Phase trước: [phase-01-contracts-server-per-question-type.md](./phase-01-contracts-server-per-question-type.md)
- Composer: `apps/web/src/components/assignments/prompt-composer.tsx`
  (330 dòng — chọn 1 type prompt-level tại `:63`, `:134`; truyền
  `typeId={value.type}` + `items` xuống editor tại `:247`–`259`)
- Row editors: `question-key-editor.tsx` (352 dòng), `cloze-editor.tsx`
  (418 dòng), `table-grid-editor.tsx`, `pin-editor.tsx`, `answer-key-grid.tsx`
- Presets/catalog: `assignment-presets.ts` — `SKILLS` (`:130`), `emptyItem`
  (`:342`), `kindOf` (`:330`), `TYPE_HINTS` (`:77`)
- Preview giáo viên: `student-preview-paper.tsx`

## Requirements

- [x] Mỗi hàng câu hỏi (auto skills) có select dạng bài, danh sách = catalog
      type của part hiện tại (`SKILLS[skill].parts[part].types`); giá trị
      mặc định = type prompt; đổi type của câu KHÔNG đổi type prompt.
- [x] Đổi type câu → `opts` khởi tạo đúng kind (`emptyItem(typeId)`: mcq4/mcq3
      có opts, các kind khác null) và hàng answer key thích ứng kind (pill
      choice vs free text — theo `answerChoices(kind)` sẵn có).
- [x] Câu type khác type prompt vẫn nằm cùng `items[]`, tuần tự giữ vị trí —
      thứ tự cụm = thứ tự câu (không có khái niệm reorder cụm riêng).
- [x] Submit gửi `questions[].type` (field Phase 1); câu không đổi type gửi
      `null`/omit để payload cũ gọn.
- [x] Teacher preview (`student-preview-paper.tsx`) hiển thị đúng widget theo
      type TỪNG CÂU (pill vs cloze) — sửa chỗ đang key theo `value.type`
      prompt-level.
- [x] `TYPE_HINTS` placeholder intro giữ nguyên (authoring hint, không phải
      instruction take screen —.take screen dùng `QUIZ_TYPE_DISPLAY` Phase 1).

## Related Code Files

- Modify: `apps/web/src/components/assignments/prompt-composer.tsx`
- Modify: `apps/web/src/components/assignments/question-key-editor.tsx`
- Modify: `apps/web/src/components/assignments/cloze-editor.tsx`
- Modify: `apps/web/src/components/assignments/student-preview-paper.tsx`
- Modify test: `prompt-composer.test.tsx`, `question-key-editor.test.tsx`,
  `cloze-editor.test.tsx`, `student-preview-paper.test.tsx`

## Implementation Steps

1. `assignment-presets.ts`: thêm helper lấy catalog type của part
   (`typeCatalogOf(skillId, partId)`) nếu chưa đủ — dùng cho select.
2. Truyền catalog xuống question editor từ `prompt-composer.tsx`; thêm select
   per-row trong editor đang chịu trách nhiệm render hàng (cloze-editor cho kind
   text, question-key-editor/table-grid-editor cho kind choice — theo cách
   composer đang dispatch).
3. Xử lý `onItemChange(index, { type, opts, answer })` khi đổi type: reset opts
   theo `emptyItem(typeId)` nhưng GIỮ `stem`; answer để trống (đáp án cũ có thể
   sai kind).
4. Preview: `student-preview-paper.tsx` chuyển sang render theo
   `item.type ?? promptType` cho widget mỗi câu.
5. Cập nhật test: đổi type 1 câu giữa prompt → payload + preview phản ánh; giữ
   nguyên stem; validation catalog (type ngoài part → lỗi hiển thị).

## Todo

- [x] Select per-row + catalog helper
- [x] Adapt opts/answer-key theo type câu
- [x] Preview theo type từng câu
- [x] Tests composer + editors + preview

## Success Criteria

- `pnpm --filter web test` xanh; `pnpm check` + `pnpm check-types` xanh.
- Tái hiện được đề như ảnh chụp: 1 prompt reading 13 câu gồm cụm tfng (1–4) +
  flowchart (5–8) + note (9–13), save thành công, preview từng câu đúng widget.
- Đề 1 type soạn như cũ — không thêm bước nào cho tác giả (select mặc định =
  type prompt, không đụng là không gửi field).

## Risk Assessment

- **Composer dispatch theo prompt type**: các editor hiện key theo `typeId`
  prompt-level — cần rà chỗ nào dùng `typeId` để render hàng (ClozeStemText,
  answer grid) chuyển sang per-item type, tránh sót nhánh.
- **Đổi type làm mất answer đang nhập**: chấp nhận (answer cũ sai kind), nhưng
  GIỮ stem + cảnh báo bằng empty answer — không tự xoá stem.
- **Option bank**: bank vẫn prompt-level; đề trộn bankable + non-bankable giữ
  bank hiển thị toàn bài (đã ghi nhận trong plan.md Key Decisions — không mở
  per-cluster bank scope này).

## Security Considerations

- Không thay đổi route/permission; payload vẫn qua cùng contract validation
  (superRefine Phase 1 chặn type ngoài catalog).
