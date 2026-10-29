---
title: "Phase 2: Thay Tiptap bằng CKEditor trong RichTextEditor"
status: todo
---

# Phase 2: Thay Tiptap bằng CKEditor trong RichTextEditor

## Overview

Thay phần ruột của `RichTextEditor` bằng CKEditor 5, giữ nguyên props công khai (`value`, `onChange`, `placeholder`, `id`, `aria-invalid`, `aria-describedby`, `ariaLabel`, `className`, `contentClassName`) để toàn bộ 10 chỗ gọi không phải sửa. Có một seam duy nhất nên thay đổi gói gọn trong `packages/ui`.

## Requirements

- [ ] Giữ nguyên chữ ký props của `RichTextEditor` (re-export tại `apps/web/src/components/ui/rich-text-editor.tsx` không đổi).
- [ ] Tính năng tương đương hiện tại: đậm, nghiêng, gạch chân, danh sách gạch đầu dòng, danh sách đánh số, liên kết, heading cấp 2-3. Nhãn toolbar tiếng Việt (gói dịch `vi`).
- [ ] Hợp đồng a11y của `Field`: editable nhận `id` được inject và `aria-labelledby="${id}-label"`, `aria-invalid`, `aria-describedby`, để `getByLabel` / e2e tìm đúng editor.
- [ ] Placeholder hiển thị khi rỗng.
- [ ] Đồng bộ giá trị ngoài (reset form, khôi phục draft) không vòng lặp update, không mất undo/caret khi chỉ đổi trạng thái lỗi.
- [ ] Nội dung cũ dạng plain text vẫn đi qua `normalizeLegacyRichText` (CKEditor cũng gộp `\n`).
- [ ] Không render phía server (SSR/node test): giữ vỏ `aria-busy` như hiện tại.

## Related Files

- Sửa: `packages/ui/src/components/web-kit/rich-text-editor.tsx`, `apps/web/src/index.css` (thay CSS `.ProseMirror` bằng style cho `.ck-editor__editable`, dùng token trong `packages/ui/src/styles/globals.css`, đọc `DESIGN.md`), `packages/ui/package.json`, `pnpm-workspace.yaml`.
- Có thể thêm: `packages/ui/src/components/web-kit/ckeditor-config.ts` (cấu hình plugin + toolbar dùng chung).
- Chỉ đọc: các chỗ gọi `<RichTextEditor>` trong `prompt-composer.tsx`, `part-content-fields.tsx`, `answer-key-grid.tsx`, `question-key-editor.tsx`.

## Implementation Steps

1. Tạo cấu hình CKEditor chung: Essentials, Paragraph, Heading (h2, h3), Bold, Italic, Underline, List, Link, Autoformat, placeholder qua `config.placeholder`.
2. Viết lại `RichTextEditor` với `<CKEditor>` từ `@ckeditor/ckeditor5-react`; `onChange` đọc `editor.getData()` qua ref (như `onChangeRef` hiện tại).
3. Gắn `id`/aria lên root của editing view trong `onReady`, cập nhật khi aria đổi mà không tạo lại editor.
4. Đồng bộ `value` ngoài bằng `editor.setData` chỉ khi khác `getData()`.
5. Toolbar: dùng toolbar mặc định của CKEditor, tuỳ biến bằng biến CSS `--ck-*` theo design token (giữ toolbar Tailwind hiện tại buộc phải bind lệnh thủ công, tốn công hơn nhiều).
6. Lazy-load component bằng `React.lazy` nếu spike cho thấy bundle quá lớn.
7. Cập nhật CSS (`index.css`): min-height 5rem, padding, focus ring khớp `focus-within` hiện tại, dark mode nếu DESIGN.md yêu cầu.

## Todo

- [ ] Cấu hình plugin/toolbar dùng chung
- [ ] Viết lại `RichTextEditor`
- [ ] a11y + Field contract
- [ ] Đồng bộ value + legacy adapter
- [ ] CSS theo design token
- [ ] Verify 3 viewport (1440x900, 768x1024, 375x812) + focus bàn phím theo `REVIEW.md`

## Success Criteria

- `pnpm check`, `pnpm check-types` xanh; 10 chỗ gọi hoạt động không đổi code.
- Soạn, định dạng, lưu, mở lại một bài tập giữ nguyên định dạng và ngắt dòng cũ.

## Risk Assessment

- `<p>&nbsp;</p>` và `<p>` rỗng do CKEditor sinh: `isEmptyRichText` phải coi là rỗng (cần test).
- Plugin thừa sinh thêm markup (`figure`, `span style`): chỉ bật plugin trong danh sách trên.
- Re-mount khi `id` đổi làm mất undo; giữ như hành vi Tiptap hiện tại (`[id]` deps).

## Rollback

Revert commit của `rich-text-editor.tsx` + CSS + dependencies. Tiptap chỉ bị gỡ ở Phase 4 nên rollback lúc này không cần cài lại gì.
