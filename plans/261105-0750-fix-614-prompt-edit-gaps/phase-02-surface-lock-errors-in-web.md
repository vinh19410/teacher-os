---
phase: 2
title: "Thông báo lỗi khóa ở web"
status: done
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Thông báo lỗi khóa ở web

## Goal

Khi server trả `PROMPT_CONTENT_LOCKED` hoặc `WRITING_SECTION_LOCKED`, giáo viên biết vì sao không lưu được và phải làm gì, thay vì được nhắc thử lại.

## Files to Create / Modify

- Modify: `apps/web/src/lib/use-kernel-form-submit.ts` — chọn thông báo theo `result.error.code` ở nhánh `definite-failure`.
- Modify: `apps/web/src/lib/use-kernel-form-submit.test.tsx` (hook test riêng — `new-submit.test.tsx` mock toàn bộ hook nên test hook phải ở file mới; tránh đụng file với phase 3).
- Modify (amendment kongming): `apps/web/src/routes/_auth/assignments/new.tsx` + `apps/web/src/components/assignment-tests/test-builder-shell.tsx` — field-diff payload edit mode (bỏ trường nội dung không đổi; xem phase-03 file chung).

## Tasks & Steps

1. Viết test: 409 với từng mã hiện đúng thông báo; lỗi khác vẫn hiện thông báo chung hiện tại.
2. Ở nhánh `definite-failure` (dòng 40-46), dùng `isHttpError(result.error)` rồi tra `code`:
   - `PROMPT_CONTENT_LOCKED`: "Đề đã có học viên làm bài nên không sửa được nội dung. Bạn vẫn có thể đổi tiêu đề, band, nguồn và trạng thái. Muốn đổi nội dung, hãy tạo đề mới."
   - `WRITING_SECTION_LOCKED`: "Đề đã được giao hoặc đang dùng trong bộ đề nên không sửa được phần Writing. Hãy trả phần này về như cũ để lưu các thay đổi khác."
3. Đặt ánh xạ trong hook để composer `new.tsx` và `test-builder-shell.tsx` cùng dùng, không lặp lại ở từng màn hình.
4. ~~Kiểm tra `HttpError.code` được điền từ body 409 của kernel~~ ĐÃ KIỂM TRA (2026-11-05): `parseErrorOptions` copy `code` (`repos/kernel.ts:476`) cho mọi kernel write, kể cả PATCH prompt — không cần sửa.
5. Kiểm tra form giữ nguyên nội dung sau lỗi và `submit.error` hiển thị ở cả hai màn hình; kiểm tra riêng panel Apply (đáp án) của test builder có hiển thị `submit.error` khi PATCH questions bị 409.

## Verification

- `pnpm --filter web test -- new-submit`.
- Theo `REVIEW.md`: kiểm tra thông báo ở 3 viewport 1440×900, 768×1024, 375×812.
