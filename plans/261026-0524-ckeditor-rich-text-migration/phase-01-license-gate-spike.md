---
title: "Phase 1: License gate và spike CKEditor 5"
status: todo
---

# Phase 1: License gate và spike CKEditor 5

## Overview

CKEditor 5 từ v44 bắt buộc `licenseKey`. Giấy phép là điều kiện chặn của cả plan: chọn sai thì phải làm lại. Phase này chốt giấy phép và chứng minh bằng một spike nhỏ rằng CKEditor chạy được trong monorepo (Vite 8, React 19, jsdom/vitest) trước khi đụng vào code thật.

## Requirements

- [ ] Người dùng chọn một trong ba hướng giấy phép (xem plan.md, mục Quyết định cần user):
  - `licenseKey: "GPL"`: miễn phí, hiện logo "Powered by CKEditor", mã nguồn phải tương thích GPL-2.0+.
  - Free plan thương mại qua CDN: tối đa 1.000 lượt tải editor/tháng, bộ tính năng giới hạn.
  - Gói thương mại tự host: liên hệ sales.
- [ ] Spike chạy được `ckeditor5` + `@ckeditor/ckeditor5-react` (cài bản npm, tự host) trong `apps/web` và `apps/admin`.

## Implementation Steps

1. Đọc docs licensing hiện hành (https://ckeditor.com/docs/ckeditor5/latest/support/licensing/license-key-and-activation.html) và xác nhận lại điều khoản trước khi cài.
2. Thêm vào catalog `pnpm-workspace.yaml`: `ckeditor5`, `@ckeditor/ckeditor5-react` (ghim phiên bản cụ thể).
3. Viết spike tạm (không commit) mount `<CKEditor>` với plugin Essentials, Paragraph, Bold, Italic, Underline, List, Link, Heading; kiểm tra: `editor.getData()` trả HTML, `setData` đồng bộ giá trị ngoài, `vite` production bundle không lỗi, đo mức tăng kích thước bundle.
4. Kiểm tra chạy trong vitest jsdom (render, `getByRole("toolbar")`, nhập liệu qua `editor.setData`).
5. Kiểm tra gõ tiếng Việt (Telex/VNI IME) thủ công trên Chrome và Safari.
6. Ghi kết quả (kích thước bundle, giấy phép đã chọn, vấn đề jsdom) vào `plans/261026-0524-ckeditor-rich-text-migration/reports/`.

## Todo

- [ ] User chốt giấy phép
- [ ] Spike mount thành công trên web + admin
- [ ] Spike chạy trong vitest jsdom
- [ ] IME tiếng Việt ổn
- [ ] Báo cáo spike

## Success Criteria

- Giấy phép được chọn bằng văn bản; `licenseKey` có nguồn cấu hình rõ ràng (hằng số hoặc env, không hard-code key thương mại vào repo).
- Spike chứng minh 3 điều: bundle qua, test qua, IME tiếng Việt không mất ký tự. Nếu một điều thất bại, dừng plan và báo user trước Phase 2.

## Risk Assessment

- GPL: thư viện phía trình duyệt được phân phối tới người dùng, nên yêu cầu GPL có thể áp lên toàn bộ ứng dụng. Cần user chấp nhận rõ.
- Bundle tăng đáng kể so với Tiptap; đo trước, cân nhắc lazy-load (`React.lazy`) editor.

## Rollback

Spike không commit nên không cần rollback; chỉ revert thay đổi catalog nếu đã lỡ commit.
