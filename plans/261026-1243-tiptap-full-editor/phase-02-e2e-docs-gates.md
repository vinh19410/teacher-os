---
title: "Phase 2: E2E, docs và gates"
status: completed
---

# Phase 2: E2E, docs và gates

## Overview

Chuyển e2e sang phủ tính năng toolbar mới, cập nhật docs nơi nhắc rich text, chạy đủ gate local + full Playwright + verify hình ảnh (web + admin) trước khi mở PR vào `develop`.

## Requirements

- [x] E2E mới: 1 spec proof-of-feature cho toolbar full-option — soạn nội dung dùng H2 + blockquote + hr + danh sách, lưu, mở lại, xác nhận markup persist và render phía học viên giữ cấu trúc.
- [x] 3 spec e2e hiện có (`rich-text-content.spec.ts`: bold persist, XSS neutralize, newlines) vẫn xanh, không sửa assertion làm yếu đi. Spec cũ neo XPath `../preceding-sibling::div[@role='toolbar']` — phase 1 đã khóa bất biến DOM này, không được bọc toolbar thêm container.
- [x] Grep `tiptap|ProseMirror` trong `docs/` — cập nhật chỗ nói "rich text" nếu liệt kê tính năng; ghi phương án CKEditor bị loại vì license (không có thư mục `docs/adr/` — ghi trong PR description + issue).
- [x] `pnpm check`, `pnpm check-types`, test, full `pnpm --filter e2e e2e` xanh. Port mặc định 8000/8001/8003/8104 (`apps/e2e/playwright.config.ts:5-8`); khi dev stack local đang chiếm 8000/8001/8003/8004 thì chạy với override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104` (quy ước AGENTS.md).
- [x] Verify UI 3 viewport (1440×900, 768×1024, 375×812) + focus bàn phím theo `REVIEW.md` cho **cả web lẫn admin** (admin có 4 callsite: part-content-fields, test-header-form); screenshot vào PR + `pnpm design:compare`. Style `RichTextBody` mới ảnh hưởng ~20 callsite render — chụp thêm mặt học viên `quiz-paper` và `quiz-reading-layout` ở 375px (nội dung cũ có h2/blockquote/pre sẽ hiện khác).

## Related Files

- Sửa: `apps/e2e/specs/rich-text-content.spec.ts` (thêm spec, không bớt), `docs/**` (grep trước khi sửa).
- Chỉ đọc: `apps/e2e/specs/helpers.ts` (`fillRichEditor` giữ nguyên — selector `getByLabel` không phụ thuộc engine).

## Implementation Steps

1. Viết spec mới `toolbar full option persists and renders` theo mẫu spec bold persist (signUpViaUi → /assignments/new → soạn → lưu → mở preview).
2. Chạy e2e filter spec rich-text trước, full suite sau (watchdog hạ tầng #402: crash vite giữa run ≠ lỗi test).
3. Grep docs + cập nhật (`docs/codebase-summary.md:50` nhắc Tiptap v3).
4. Chạy đủ gate; chụp 3 viewport web + admin surfaces + keyboard focus; `pnpm design:compare`.
5. Viết journal kỹ thuật và mở PR vào `develop`.

## Todo

- [x] Spec e2e mới cho toolbar full-option
- [x] Full e2e xanh
- [x] Docs cập nhật
- [x] Screenshot 3 viewport (web + admin) + design:compare
- [x] Journal + PR

## Success Criteria

- Toàn bộ e2e xanh trên Tiptap full-option; spec cũ không bị sửa assertion.
- PR mô tả rõ pivot license + bug stale-state đã sửa, kèm screenshot web + admin.

## Risk Assessment

- E2E soạn heading qua toolbar: cần click nút khi con trỏ đang trong editor — dùng pattern select-all + click như spec bold.
- `design:compare` có thể bắt khác pixel do toolbar thêm nút — so sánh baseline mới có chủ ý, ghi trong PR.

## Rollback

Revert spec mới + docs; spec cũ không đụng nên không rollback.
