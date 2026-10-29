---
title: "Phase 3: Đồng bộ render, sanitize và contract HTML"
status: todo
---

# Phase 3: Đồng bộ render, sanitize và contract HTML

## Overview

Việc "hiển thị HTML content" đã đi qua một sink duy nhất là `RichTextBody` (DOMPurify). Phase này bảo đảm HTML do CKEditor sinh ra được render đúng và an toàn, không đổi mô hình bảo mật (sanitize khi render, không sanitize khi ghi).

## Requirements

- [ ] Mọi tag/thuộc tính mà cấu hình CKEditor ở Phase 2 có thể sinh ra đều nằm trong allowlist của `sanitizeRichText` hoặc bị loại bỏ có chủ ý (so với `ALLOWED_TAGS = p, br, strong, em, u, s, ul, ol, li, a, code, pre, hr, blockquote, h2, h3, h4`).
- [ ] Style render danh sách, liên kết, heading trong `RichTextBody` không đổi so với trước.
- [ ] `richTextField` / `isEmptyRichText` / `htmlToPlainText` đúng với HTML của CKEditor (`<p>&nbsp;</p>`, `<br data-cke-filler>`).
- [ ] Nội dung Tiptap đã lưu trong DB vẫn render đúng (không migration vì cùng là HTML thuần).

## Related Files

- Sửa nếu cần: `packages/ui/src/lib/rich-text-sanitize.ts`, `packages/ui/src/components/assignments/rich-text-body.tsx`, `packages/api/src/rich-text.ts`.
- Test: `apps/web/src/components/ui/rich-text-body.test.tsx`, test của `packages/api` cho `rich-text`.

## Implementation Steps

1. Sinh bộ HTML mẫu từ CKEditor cho mọi nút trong toolbar, lưu làm fixture.
2. Chạy fixture qua `sanitizeRichText`, so sánh vào/ra; chỉ bổ sung allowlist khi tag thật sự cần, giữ `ALLOW_DATA_ATTR: false`.
3. Thêm test: `&nbsp;` đơn lẻ, `<p></p>`, `<p><br data-cke-filler="true"></p>` đều là rỗng; cap độ dài đo trên plain text.
4. Thêm test XSS (script, `onerror`, href `javascript:`) với đầu ra CKEditor; xác nhận hook `rel="noopener noreferrer"` vẫn chạy.
5. Cập nhật chú thích nhắc "Tiptap" trong `rich-text-legacy.ts` và `rich-text-body.tsx` thành mô tả hành vi trung tính.

## Todo

- [ ] Fixture HTML từ mọi nút toolbar
- [ ] Đối chiếu allowlist
- [ ] Test rỗng/độ dài/XSS
- [ ] Xác nhận dữ liệu cũ (Tiptap) vẫn render

## Success Criteria

- Test sanitize + rich-text xanh; không tag nào của CKEditor bị DOMPurify xoá ngoài ý muốn.
- Không mở rộng bề mặt tấn công: allowlist chỉ thêm tag được xác định là cần.

## Risk Assessment

- Mô hình đe doạ: HTML do giáo viên/admin nhập, hiển thị cho học viên; XSS lưu trữ là rủi ro thật nên sink sanitize bắt buộc và giữ nguyên.
- Server (Workers) vẫn không có sanitizer; chấp nhận như hiện tại.

## Rollback

Revert thay đổi allowlist/test; dữ liệu không đổi nên không cần rollback dữ liệu.
