---
title: "feat(web): Redesign giao diện Giao bài tập trong lớp học sang Modal 2 cột (#717)"
description: "Chuyển luồng giao bài tập trong chi tiết lớp (/classes/$classId) sang Modal 2 cột chuẩn Design v2 có đầy đủ 4 cơ chế Huỷ/Đóng, tìm kiếm & lọc kỹ năng kèm số đếm, xem trước đề thu gọn theo ngữ cảnh, đóng Modal + toast + tự mở bài mới sau khi giao."
status: completed
priority: P1
issue: 717
branch: "vinh19410/Redesign-giao-bài-tập"
base_branch: "develop"
tags: ["classes", "assignments", "ui-ux", "design-v2", "modal"]
---

# Plan: Redesign giao diện Giao bài tập trong lớp học sang Modal 2 cột (#717)

## Bối cảnh & Mục tiêu

- Issue: [#717](https://github.com/vinh19410/teacher-os/issues/717)
- Hiện trạng trên `/classes/$classId`: khi bấm `Giao bài tập` hoặc `Giao thêm đề`, `ClassAssignmentsTab` chuyển `view = "assign"` ngay trong cột nội dung, làm biến mất toàn bộ danh sách Buổi học & Bài đã giao bên dưới thanh `Buổi học & bài giao`, đặt thanh hành động `fixed inset-x-0 bottom-0` tràn đè lên sidebar trái, thiếu hoàn toàn nút `Huỷ`/`Quay lại`, lặp lại 2–3 nút mở mang nhãn khác nhau, thiếu ô tìm kiếm đề, thiếu `<Check />` và còn sót class v1 (`ring-fg`, `border-border-soft`).
- Thiết kế mới:
  1. Gỡ nút `Giao bài tập` khỏi `PageHead` của `/classes/$classId`; thống nhất điểm mở ngay tại section `Bài đã giao lớp này` (`Giao bài tập` khi trống, `+ Giao bài tập` khi đã có bài).
  2. Tách form giao bài sang `AssignClassPromptModal` dùng `Modal` (`size="xl"`, `scrollableBody`), giữ nguyên ngữ cảnh trang Lớp phía sau, cung cấp đủ 4 cơ chế Huỷ/Đóng (`Huỷ`, `✕`, `Escape` không xung đột popover lịch `DatePickerInput`, click backdrop).
  3. Bố cục 2 cột bên trong Modal: cột trái chọn đề (tìm kiếm client-side + `ChipFilter` có `counts` `aria-hidden` + thẻ chọn chuẩn `ring-1 ring-primary` + `<Check />` + xem trước thu gọn chỉ hiện khi đã chọn đề); cột phải cấu hình hạn nộp (`DatePickerInput` + `TimeInput24h` giữ nguyên hành vi `#572`), lời nhắn, danh sách học viên có đếm `(X/Y)` và bỏ SĐT, kèm empty state chuyển nhanh sang thêm học viên.
  4. Giao thành công đóng Modal ngay, bắn `toast.success` và tự mở sẵn (`aria-expanded="true"`) bài mới ở đầu danh sách `Bài đã giao lớp này`.

## Ranh giới File Sở Hữu

- **UI Modal & Tab lớp:**
  - `apps/web/src/components/ui/modal.tsx` & `apps/web/src/components/ui/modal.test.tsx`
  - `apps/web/src/components/classes/assign-class-prompt-modal.tsx` & `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx`
  - `apps/web/src/components/classes/class-assignments-tab.tsx` & `apps/web/src/components/classes/class-assignments-tab.test.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.tsx`
- **Kiểm thử E2E liên quan:**
  - `apps/e2e/specs/class-assign.spec.ts`
  - `apps/e2e/specs/assignment-prompt-create.spec.ts`
  - `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts`
  - `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`
  - `apps/e2e/specs/notifications-ac-001.spec.ts`
- **POT Artifacts:**
  - `plans/reports/717-assign-modal-*.png` & `plans/reports/717-class-assigned-list-1440x900-light.png`

## Tiêu chí hoàn thành & Gates

- [x] `pnpm exec biome check .` & `CI=1 pnpm check-types` exit `0` (12/12 turbo task).
- [x] `CI=1 pnpm test` exit `0` (`apps/web` 198 file / 2147 test cùng toàn bộ workspace & root script test).
- [x] 5 spec E2E liên quan chạy trên port `8100–8105` pass 100% (`18 passed (4.0m)` — bao gồm test Huỷ / `Escape` và `#572` + `#assigned-list` 3 viewport & `320px` reflow ở Light & Dark).
- [x] `pnpm design:compare` cho `t-class-detail` exit `0`, đã kiểm tra trực quan ảnh desktop/mobile.
- [x] Isolated `code-reviewer` xác nhận `0 Critical, 0 Important`; sẵn sàng POT + PR + merge vào `develop` (`--merge --beta`).
