---
phase: 2
title: "Thông báo lỗi khóa ở web"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Thông báo lỗi khóa ở web

## Goal

Khi server trả `PROMPT_CONTENT_LOCKED` hoặc `WRITING_SECTION_LOCKED`, giáo viên biết vì sao không lưu được và phải làm gì, thay vì được nhắc thử lại.

## Files to Create / Modify

- Modify: `apps/web/src/lib/use-kernel-form-submit.ts` — chọn thông báo theo `result.error.code` ở nhánh `definite-failure`.
- Modify: `apps/web/src/routes/_auth/assignments/new-submit.test.tsx` (hook chưa có file test riêng).

## Tasks & Steps

1. Viết test: 409 với từng mã hiện đúng thông báo; lỗi khác vẫn hiện thông báo chung hiện tại.
2. Ở nhánh `definite-failure` (dòng 40-46), dùng `isHttpError(result.error)` rồi tra `code`:
   - `PROMPT_CONTENT_LOCKED`: "Đề đã có học viên làm bài nên không sửa được nội dung. Bạn vẫn có thể đổi tiêu đề, band, nguồn và trạng thái. Muốn đổi nội dung, hãy tạo đề mới."
   - `WRITING_SECTION_LOCKED`: "Đề đã được giao hoặc đang dùng trong bộ đề nên không sửa được phần Writing. Hãy trả phần này về như cũ để lưu các thay đổi khác."
3. Đặt ánh xạ trong hook để composer `new.tsx` và `test-builder-shell.tsx` cùng dùng, không lặp lại ở từng màn hình.
4. Kiểm tra `HttpError.code` được điền từ body 409 của kernel. Nếu đường `update-assignment-prompt` trong `apps/web/src/lib/repos/kernel.ts` chưa truyền `code`, sửa để truyền.
5. Kiểm tra form giữ nguyên nội dung sau lỗi và `submit.error` hiển thị ở cả hai màn hình.

## Verification

- `pnpm --filter web test -- new-submit`.
- Theo `REVIEW.md`: kiểm tra thông báo ở 3 viewport 1440×900, 768×1024, 375×812.
