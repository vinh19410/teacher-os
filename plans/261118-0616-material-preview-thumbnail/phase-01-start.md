---
title: "Phase 1: Compact thumbnail component & web/student integration"
status: completed
---

# Phase 1: Compact thumbnail component & web/student integration

## Overview

Refactor UI preview inline sang thumbnail nhỏ `96×72px` ở đầu hàng trong `@teacher-os/ui`, `apps/web` và `apps/student`, đồng thời cập nhật unit tests + E2E.

## Requirements

- [x] `BlobDocumentThumbnail` render trang 1 PDF lên `<canvas>` vừa khung `96×72` (top-aligned cover) hoặc `<img className="size-full object-cover">` không có toolbar.
- [x] `InlineDocumentPreview` render nút thumbnail `w-24 h-[72px] shrink-0` (`aria-label={`Xem trước ${title}`}`) với icon zoom nhỏ góc dưới phải khi hover; trạng thái loading / placeholder / `> 10 MiB` click-to-load / lỗi gọn vừa khung `w-24 h-[72px]`.
- [x] `MaterialItem` (`apps/web`) thay slot `preview` dưới đáy bằng slot `leading` ở đầu hàng thay thế `<Icon />` tĩnh; cập nhật `/materials` và `SessionMaterialsModal` (cả 2 list).
- [x] `LessonMaterials` (`apps/student`) đặt `<StudentInlineMaterialPreview />` thay cho `<KindIcon />` ở đầu hàng khi là PDF/ảnh; giữ `<audio>`/`<video>` inline phía dưới cho `media`.

## Implementation Steps

1. Thêm `BlobDocumentThumbnail` vào `packages/ui/src/components/document-preview/blob-document-view.tsx`.
2. Cập nhật `InlineDocumentPreview` trong `packages/ui/src/components/document-preview/inline-document-preview.tsx` và unit test tương ứng.
3. Chuyển `MaterialItem` sang `leading?: ReactNode`, cập nhật `apps/web/src/routes/_auth/materials/index.tsx`, `apps/web/src/components/class-detail/session-materials-modal.tsx` và tests.
4. Cập nhật `apps/student/src/components/class/lesson-materials.tsx` và `lesson-materials.test.tsx`.
5. Cập nhật `apps/e2e/specs/material-preview.spec.ts`, chạy gate lint/type/unit/E2E và chụp screenshot 3 viewport.

## Todo

- [x] `@teacher-os/ui`: `BlobDocumentThumbnail` + `InlineDocumentPreview` + test
- [x] `apps/web`: `MaterialItem` + `/materials` + `SessionMaterialsModal` + tests
- [x] `apps/student`: `LessonMaterials` + test
- [x] `apps/e2e`: `material-preview.spec.ts` + POT screenshots

## Success Criteria

Mọi gate kiểm tra (`biome check .`, `check-types`, `@teacher-os/ui` / `web` / `student` tests, E2E `material-preview.spec.ts`) xanh và xác nhận ảnh 3 viewport sạch.
