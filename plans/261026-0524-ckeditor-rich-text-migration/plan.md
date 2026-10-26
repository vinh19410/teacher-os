---
title: "Chuyển rich text sang CKEditor 5"
description: "Thay Tiptap bằng CKEditor 5 trong RichTextEditor dùng chung để nhập và hiển thị nội dung HTML ở các trường rich text."
status: pending
priority: P2
effort: 2d
issue: 436
branch: vinh19410/feat/ckeditor-rich-text
tags: [frontend, rich-text, ui, dependencies]
blockedBy: []
blocks: []
created: 2026-10-26
---

# Chuyển rich text sang CKEditor 5

## Overview

Yêu cầu: các trường rich text dùng CKEditor để nhập và hiển thị nội dung HTML.

Hiện trạng (đã scout): repo **đã có** rich text bằng Tiptap v3 (issue #280) với một component dùng chung `RichTextEditor` ([rich-text-editor.tsx](../../packages/ui/src/components/web-kit/rich-text-editor.tsx)), 10 chỗ gọi (prompt-composer, part-content-fields của admin, answer-key-grid, question-key-editor). Hiển thị đi qua một sink `RichTextBody` + DOMPurify. Giá trị lưu là chuỗi HTML thô. Vì vậy việc này là **thay engine soạn thảo sau một seam**, không phải xây mới, và không cần migration dữ liệu.

## Scope

- Trong phạm vi: thay engine của `RichTextEditor` sang CKEditor 5 giữ nguyên props; kiểm tra render/sanitize/contract với HTML của CKEditor; chuyển test/e2e; gỡ Tiptap; cập nhật docs.
- Ngoài phạm vi (ghi nhận, chưa làm): các `<Textarea>` còn lại (mô tả syllabus/module/lesson, ghi chú chấm bài, báo cáo, invoice, onboarding...). Đổi chúng kéo theo contract, render và dữ liệu cũ cho từng chỗ. Xem câu hỏi mở số 2.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [License gate và spike CKEditor 5](./phase-01-license-gate-spike.md) | Pending |
| 2 | [Thay Tiptap bằng CKEditor trong RichTextEditor](./phase-02-editor-swap.md) | Pending |
| 3 | [Đồng bộ render, sanitize và contract HTML](./phase-03-render-sanitize-parity.md) | Pending |
| 4 | [Test, dọn Tiptap và tài liệu](./phase-04-tests-cleanup-docs.md) | Pending |

## Quyết định cần user (chặn Phase 2)

Plan #280 (2026-09-28) đã chọn Tiptap vì MIT, HTML là giá trị native, headless khớp Tailwind. Yêu cầu hiện tại đảo quyết định đó, nên cần xác nhận các đánh đổi:

1. **Giấy phép CKEditor 5** (từ v44 bắt buộc `licenseKey`): `GPL` (miễn phí, có logo "Powered by CKEditor", ràng buộc GPL-2.0+ có thể áp lên ứng dụng), free plan thương mại qua CDN (giới hạn 1.000 lượt tải/tháng, ít tính năng), hoặc gói thương mại tự host. Tiptap hiện là MIT, không ràng buộc.
2. **Phạm vi**: chỉ thay engine ở các editor hiện có (khuyến nghị, đã lập plan), hay mở rộng sang các textarea khác.
3. **Kích thước bundle**: CKEditor nặng hơn Tiptap; Phase 1 đo, Phase 2 có thể lazy-load.

Nguồn: [License key and activation](https://ckeditor.com/docs/ckeditor5/latest/support/licensing/license-key-and-activation.html), [React integration](https://ckeditor.com/docs/ckeditor5/latest/installation/integrations/react.html). Các nguồn mâu thuẫn nhau về điều khoản free plan, nên phải đọc lại bản hiện hành ở Phase 1.

## Dependencies

Không phụ thuộc plan khác. Plan #280 (Tiptap) là nền đã hoàn tất; plan này thay phần engine của nó.

## Success Criteria

- [ ] Mọi `RichTextEditor` chạy bằng CKEditor, API công khai không đổi.
- [ ] Nội dung HTML cũ (Tiptap) và plain text cũ hiển thị/sửa đúng, không migration.
- [ ] Đầu ra CKEditor qua `RichTextBody` an toàn (test XSS), `isEmptyRichText` đúng.
- [ ] Không còn `@tiptap` / `ProseMirror` trong code; `pnpm check`, `check-types`, test, full e2e xanh.
- [ ] Verify UI ở 3 viewport + focus bàn phím; screenshot + `design:compare` trong PR.

## Câu hỏi mở

1. Chọn giấy phép nào (GPL / free plan / thương mại)?
2. Có mở rộng sang các `<Textarea>` khác không?
3. Dùng toolbar mặc định của CKEditor (khuyến nghị) hay giữ toolbar Tailwind hiện tại (phải bind lệnh thủ công)?

<!-- slug: ckeditor-rich-text-migration -->
