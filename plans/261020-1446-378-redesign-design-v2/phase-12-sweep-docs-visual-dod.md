---
phase: 12
title: "Sweep, DESIGN.md, e2e, DoD ảnh đối chiếu toàn bộ"
status: pending
priority: P1
effort: "6h"
dependencies: [5, 6, 7, 8, 11]
---

# Phase 12: Sweep + tài liệu + DoD toàn bộ

## Goal

Xóa tàn dư v1, chốt tài liệu hệ thống thiết kế v2, chạy toàn bộ gate + chụp lại mọi màn và
đạt 100% PASS.

## Files to Create / Modify

- Modify: `packages/ui/src/styles/globals.css` — xóa alias token v1 + utility `neu*` sau khi grep
  = 0 chỗ dùng (`text-hot|bg-hot|bg-surface|text-fg|text-meta|border-line|neu-|font-display|kicker`).
- Modify: mọi file còn dùng token v1 (danh sách từ grep phase 2).
- Modify: `DESIGN.md` — viết lại theo v2: nguồn `teacheros-design-v2@7a53fc0`, light mặc định,
  bảng token neutral oklch + số contrast đo, Geist, radius, quy tắc component v2 (Button/Card/
  Badge/TuitionBadge/Tabs/Table/Modal/Shell/Command search), trạng thái màu (destructive cho
  quá hạn/lỗi, emerald/amber chấm trạng thái học phí), ngoại lệ verdict, lệch có chủ đích
  (font self-host, copy tiếng Việt, ẩn Dictation, Classmates tối giản).
- Modify: `REVIEW.md` — bỏ mục "focus ring cam", "đỏ chỉ phá hủy"; thêm bước chạy
  `pnpm design:compare` cho PR đụng UI.
- Modify: `AGENTS.md` mục "Quy ước UI" nếu nhắc quy tắc v1.
- Modify: `CHANGELOG.md` — mục redesign v2 + tính năng mới.
- Output: `screenshots/**` (`--label new`) + `screenshots/verdict.md` 100% PASS.

## Tasks & Steps

1. Grep tàn dư v1 + hex cứng ngoài whitelist (nền trắng QR, SVG logo) → 0.
2. Đo lại contrast toàn bộ cặp token, cập nhật `DESIGN.md`.
3. `pnpm design:compare --screens all --side both --label new`; duyệt từng ảnh theo checklist
   phase 1; FAIL → sửa ở file màn tương ứng rồi chụp lại màn đó.
4. Kiểm 320px reflow + keyboard focus (Tab qua shell, palette ⌘K, heatmap) theo `REVIEW.md`.
5. Full gate + full e2e trên nhánh; nếu `develop` đã tiến → merge `develop` vào nhánh rồi chạy
   lại full e2e trước khi squash-merge (quy tắc repo).

## Verification

- `pnpm check && pnpm check-types`
- `pnpm --filter web test && pnpm --filter student test && pnpm --filter server test && pnpm --filter @teacher-os/ui check-types`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` (full)
- `grep -c "FAIL\|TODO" plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md` = 0
- Dừng server design (`scripts/design-compare/fetch-design.sh stop`) và server e2e đã khởi động.
