---
title: "Phase 4: Test, dọn Tiptap và tài liệu"
status: todo
---

# Phase 4: Test, dọn Tiptap và tài liệu

## Overview

Chuyển test jsdom và e2e từ ProseMirror sang CKEditor, gỡ Tiptap, cập nhật tài liệu, chạy toàn bộ gate trước khi merge.

## Requirements

- [ ] `apps/web/src/components/ui/rich-text-editor.test.tsx`: bỏ test headless Tiptap `Editor`; giữ test a11y qua `Field` (selector `.ck-editor__editable` thay cho `ProseMirror`) và test nhãn toolbar tiếng Việt. Test round-trip legacy chuyển sang kiểm tra `normalizeLegacyRichText` + `htmlToPlainText` trên đầu ra CKEditor.
- [ ] `apps/e2e/specs/helpers.ts` `fillRichEditor`: cập nhật comment; nếu `fill()` không dùng được với CKEditor thì dùng `click` + `keyboard.insertText`.
- [ ] `apps/e2e/specs/rich-text-content.spec.ts`: sửa chỗ tìm toolbar bằng xpath `preceding-sibling` (DOM của CKEditor khác) sang selector theo `role="toolbar"` / nhãn nút.
- [ ] Gỡ `@tiptap/*` khỏi `packages/ui/package.json` và catalog `pnpm-workspace.yaml`; gỡ CSS `.ProseMirror`. Giữ `dompurify`.
- [ ] Cập nhật tài liệu trong `docs/` nơi nhắc Tiptap (grep trước khi sửa); ghi giấy phép CKEditor đã chọn.

## Implementation Steps

1. `grep -rn "tiptap\|ProseMirror" apps packages docs` để lập danh sách còn sót.
2. Cập nhật test và helper theo yêu cầu trên.
3. `pnpm install` để cập nhật lockfile sau khi gỡ Tiptap; kiểm tra diff lockfile chỉ gồm Tiptap/CKEditor.
4. Chạy: `pnpm check`, `pnpm check-types`, test từng package đụng tới, và full Playwright `pnpm --filter e2e e2e` với port 8100/8101/8103/8104 (theo AGENTS.md). Nếu develop đã tiến thêm, chạy lại full e2e trên develop + PR trước khi squash-merge.
5. Verify UI 3 viewport + focus bàn phím; đính kèm screenshot vào PR và chạy `pnpm design:compare`.
6. Viết journal kỹ thuật, mở PR vào `develop`.

## Todo

- [ ] Cập nhật unit test
- [ ] Cập nhật e2e + helper
- [ ] Gỡ Tiptap và CSS
- [ ] Cập nhật docs
- [ ] Chạy đủ gate local + full e2e
- [ ] Screenshot 3 viewport + design:compare

## Success Criteria

- Không còn tham chiếu `@tiptap` / `ProseMirror` trong code; toàn bộ gate xanh.
- Các spec e2e rich text hiện có (đậm persist, XSS, giữ xuống dòng) vẫn đạt với CKEditor.

## Risk Assessment

- E2E phụ thuộc DOM editor nên dễ vỡ; dùng selector theo vai trò/nhãn.
- Lockfile đổi lớn: kiểm tra diff.

## Rollback

Giữ commit gỡ Tiptap tách riêng để revert nhanh.
