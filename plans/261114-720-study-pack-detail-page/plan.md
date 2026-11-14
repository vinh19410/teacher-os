---
title: "feat(web,server): add study pack detail page (/assignments/packs/$packId) (#720)"
description: "Bổ sung trang xem chi tiết bộ đề tự học (/assignments/packs/$packId) theo bố cục Master–Detail 2 cột (desktop) / 2 màn (mobile) với 2 tab Đề & Đáp án và Làm thử, hỗ trợ Gán cho lớp, Nhân bản, Chỉnh sửa, Xoá và gỡ modal cũ."
status: in_progress
priority: P1
issue: 720
branch: "vinh19410/Xem-chi-tiết-page-xem-bộ-đề-tự-học"
base_branch: "develop"
tags: ["study-pack", "assignments", "ui-ux", "design-v2"]
---

# Plan: Trang xem chi tiết Bộ đề tự học (`/assignments/packs/$packId`) (#720)

## Bối cảnh & Mục tiêu

- Issue: [#720](https://github.com/vinh19410/teacher-os/issues/720)
- Hiện trạng tại `/assignments/packs`: tab `Thư viện hệ thống` chỉ mở chi tiết bằng `Modal` nhỏ `max-h-72` liệt kê tiêu đề ngày và nút Nghe thử, chưa xem được bài đọc, câu hỏi, đáp án đúng, giải thích hay transcript; tab `Bộ đề của tôi` chưa có màn xem chi tiết nào; tên bộ đề đã gán tại `/classes/$classId` không điều hướng sang chi tiết bộ đề.
- Thiết kế mới:
  1. Bổ sung `StudyPackItemDetailView` tại `packages/api/src/contracts.ts` và 2 endpoint trong `apps/server/src/routes/study-pack.ts` (`GET /api/study-packs/:packId/items/:itemId` và `GET /api/study-packs/:packId/items/:itemId/audio`) hỗ trợ cả `library_exercise`, `org_prompt`, `library_test_part` với kiểm tra quyền `canReviewGrade` và cô lập theo `orgId`.
  2. Chuyển `/_auth/assignments/packs` sang `packs/index.tsx` (gỡ modal `viewingPack` cũ, thêm nút/link `Xem chi tiết` cho cả `org` lẫn `system` pack) và tạo `packs/$packId.tsx` theo bố cục Master–Detail 2 cột (responsive mobile chuyển danh sách ↔ chi tiết), lọc `skill` + tìm kiếm `q` (debounce ~300ms) + `item` + `tab` trên URL.
  3. Hỗ trợ 2 tab `"Đề & Đáp án"` (bài đọc, hướng dẫn, audio Blob proxy CSP-safe, transcript, ghi chú, câu hỏi, đáp án đúng và giải thích) và `"Làm thử"` (`PreviewQuizSimulation` cho cả 4 kỹ năng tự chấm `reading`/`listening`/`grammar`/`vocabulary`).
  4. Bổ sung các thao tác ngữ cảnh theo `scope`/`status`/`role` (`canPublishGrade`): **Gán cho lớp** (`AssignPackToClassModal` dùng `DatePickerInput`/`TimeInput24h` + xem trước ngày nghỉ cho lớp `active`), **Nhân bản về trung tâm**, **Chỉnh sửa** (`StudyPackEditorModal` dùng chung), **Xoá** (có hộp thoại xác nhận + xử lý `409`).
  5. Gắn link tên bộ đề đã gán trong `ClassStudyPackSection` (`/classes/$classId`) sang `/assignments/packs/$packId`.

## Ranh giới File Sở Hữu

- **Contracts (`packages/api`):**
  - `packages/api/src/contracts.ts`
- **Backend (`apps/server`, Worker A):**
  - `apps/server/src/app.ts`
  - `apps/server/src/lib/study-pack-clone.ts`
  - `apps/server/src/routes/study-pack.ts`
  - `apps/server/src/routes/study-pack.test.ts`
- **Frontend (`apps/web`, Worker B):**
  - `apps/web/src/lib/repos/study-pack.ts`
  - `apps/web/src/routes-matcher.ts` & `apps/web/src/routes-matcher.test.ts`
  - `apps/web/src/components/assignments/preview-quiz-simulation.tsx`
  - `apps/web/src/components/study-packs/study-pack-editor-modal.tsx`
  - `apps/web/src/components/study-packs/assign-pack-to-class-modal.tsx`
  - `apps/web/src/components/study-packs/study-pack-item-viewer.tsx`
  - `apps/web/src/routes/_auth/assignments/packs.tsx` (gỡ bỏ) → `packs/index.tsx` & `packs/$packId.tsx` (+ tests)
  - `apps/web/src/components/classes/class-study-pack-section.tsx` (+ test)
- **E2E & POT (`apps/e2e`, `plans/reports/`, `CHANGELOG.md`):**
  - `apps/e2e/specs/study-pack.spec.ts`
  - `plans/reports/720-pack-detail-*.png`

## Tiêu chí hoàn thành & Gates

- [ ] `pnpm exec biome check .` & `pnpm check-types` exit `0`.
- [ ] `pnpm test` exit `0`.
- [ ] `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/study-pack.spec.ts` exit `0`.
- [ ] `node scripts/design-compare/capture.mjs --screens t-class-detail` exit `0` và ảnh 3 viewport (`1440×900`, `768×1024`, `375×812`) sáng/tối không tràn ngang (`320px` reflow pass).
- [ ] Review độc lập (`code-reviewer`) sạch lỗi, PR mở vào `develop` được merge (`--beta --merge`), CI xanh, issue `#720` mang nhãn `shipped` kèm comment POT đầy đủ.
