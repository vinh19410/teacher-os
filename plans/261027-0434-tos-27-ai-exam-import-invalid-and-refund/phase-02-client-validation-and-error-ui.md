---
phase: 2
title: "Client: chặn tệp E-003, panel lỗi E-004, hộp thoại E-001"
status: completed
effort: 4h
---

# Phase 2 — Client: chặn tệp + UI lỗi

## Files

- Tạo `apps/web/src/lib/exam-file-check.ts` (+ test): `checkExamFile(file)` dùng `pdfjs-dist` đếm trang / bắt `PasswordException`.
- `apps/web/src/components/exam-import/exam-file-dropzone.tsx`: gọi `checkExamFile` trước upload, hiện lỗi inline E-003 (`role="alert"`).
- Tạo `apps/web/src/components/exam-import/import-failed-panel.tsx` (thông điệp E-004 + nút ghost "Thử bóc tách lại AI"), `insufficient-credits-dialog.tsx` (E-001).
- `apps/web/src/routes/_auth/assignments/tests/import.tsx`: xử lý 400/402/502, mở job `failed_refunded` từ `?job=` hiện panel lỗi.

## Steps

1. Dropzone: sai → hiện E-003 kèm lý do cụ thể ("tệp 18,0 MB vượt 15 MB", "25 trang vượt 20 trang", "tệp có mật khẩu"), không gọi API.
2. 502 E-004 → `ImportFailedPanel`; nút thử lại gọi `POST /:id/retry`, cập nhật `?job=` sang job mới, làm mới số dư ví.
3. 402 E-001 → `InsufficientCreditsDialog`.

## Verify

- `pnpm --filter web test -- exam-file-check exam-file-dropzone import-failed-panel insufficient-credits-dialog` pass; 3 viewport + focus.
