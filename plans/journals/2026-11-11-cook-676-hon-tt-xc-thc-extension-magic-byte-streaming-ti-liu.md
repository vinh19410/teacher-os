---
title: "Cook #676: hoàn tất xác thực extension & magic-byte streaming tài liệu"
date: 2026-11-11
summary: "Hoàn tất TDD Phase 1–2, E2E preview 810x, full test suite và tạo follow-up #681 cho issue #676."
---

# Cook #676: hoàn tất xác thực extension & magic-byte streaming tài liệu

## What happened
- Triển khai TDD trọn vẹn 2 phase của kế hoạch `plans/261111-0818-676-upload-extension-magic-bytes/` cho issue #676:
  - `packages/api/src/material-contracts.ts`: thêm `MATERIAL_MAGIC_PEEK_BYTES = 64`, `materialExtensionMatches`, `matchesMaterialMagic` (chặn polyglot HTML/UTF-16LE BOM `FF FE`, `ID3<html>`, `<!--ftyp-->`, `RIFF<!--WEBP-->`, `%PDF-<html>`, `PK\x03\x04<html>`, `ftyp` phi-MP4) và siết `resolveMaterialMimeType` dùng chung `sanitizeMediaFileName` + bảng alias OS/trình duyệt.
  - `apps/server/src/lib/peek-stream.ts` & `apps/server/src/routes/materials.ts`: triển khai `peekStream` pull-based với `{ highWaterMark: 0 }`, tách cờ `cancelled`/`releaseReader()` và kiểm `Math.min(64, size + 1)` + `matchesMaterialMagic` trước `store.put`.
  - `apps/e2e/specs/material-upload-student.spec.ts` & `CHANGELOG.md`: bổ sung E1b/E3b và mở issue follow-up #681 (`ai-handle`).
- Trong Task 1.4, kích hoạt Failure Protocol gọi Kongming 2 lần khi gặp lệch sắp xếp import Biome và mặc định `highWaterMark = 1` của `ReadableStream`; áp dụng `{ highWaterMark: 0 }` và stream mở pull-driven, toàn bộ unit/type-check/lint/E2E đều xanh.

## Decision
- Đặt `{ highWaterMark: 0 }` trên `ReadableStream` phát lại của `peekStream` để không kéo thêm chunk thừa trước khi `store.put` đọc.

## Next steps
- Chạy `/ak-code-review --pending --advice`, cập nhật `docs/system-architecture.md` (`ak-docs update`), rồi ship beta PR.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
