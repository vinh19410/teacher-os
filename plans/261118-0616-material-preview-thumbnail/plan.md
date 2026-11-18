---
title: "Compact inline thumbnail preview for PDF and image materials"
description: "Đổi preview inline tài liệu (PDF/PNG/JPG/WEBP) từ khung lớn sang thumbnail nhỏ gọn 96×72 ở đầu hàng; click mở modal xem đầy đủ"
status: completed
priority: P1
effort: "2h"
tags: [ui, materials, preview, pdf, student, web]
created: 2026-11-18
issue: 801
branch: feat/material-preview-thumbnail
---

# Compact inline thumbnail preview for PDF and image materials

## Overview

Sau PR #799, preview inline đang chiếm trọn chiều rộng dưới mỗi hàng tài liệu với toolbar trang/zoom đầy đủ. Kế hoạch này thu gọn preview inline thành thumbnail `96×72px` (`w-24 h-[72px]`) đặt ở đầu hàng thay icon tĩnh cho file PDF/ảnh; bấm thumbnail vẫn mở modal xem đầy đủ dùng lại `blob:` URL đã tải.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Thêm `BlobDocumentThumbnail` (PDF trang 1 / `<img>` `object-cover`, không toolbar) và thu gọn `InlineDocumentPreview` thành nút thumbnail `w-24 h-[72px]` | P1 |
| 2 | Đặt thumbnail vào đầu hàng ở `apps/web` (`MaterialItem` slot `leading` tại `/materials` & `SessionMaterialsModal`) và `apps/student` (`LessonMaterials`) | P1 |
| 3 | Xác minh bằng unit test, E2E `material-preview.spec.ts`, screenshot 3 viewport, `biome check .`, `check-types` | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Compact thumbnail component & web/student integration](./phase-01-start.md) | In Progress |

## Success Criteria

- [x] PDF/PNG/JPG/WEBP trong `/materials`, `SessionMaterialsModal` và `LessonMaterials` hiện thumbnail `96×72px` ở đầu hàng thay icon tĩnh; file Office/link/audio/video vẫn giữ icon tĩnh.
- [x] Click thumbnail (`aria-label="Xem trước <tên>"`) mở modal phóng to tái sử dụng `blob:` URL không fetch lại.
- [x] Giữ nguyên cơ chế lazy-load (`IntersectionObserver`), tối đa 3 request song song, chặn auto-load `> 10 MiB`, recover 401/403, responsive 3 viewport (không tràn ngang ở `375×812`).
- [x] Unit tests, E2E `material-preview.spec.ts`, `biome check .` và `pnpm check-types` xanh.

<!-- slug: material-preview-thumbnail -->
