---
title: "Phase 1: API Contracts, Opening Callout & Session Link Email Renderer"
status: completed
---

# Phase 1: API Contracts, Opening Callout & Session Link Email Renderer

## Overview

Cập nhật contract loại sự kiện thông báo, thêm callout thông báo link buổi học gửi trước 2 tiếng cho lớp `Online` trong `renderClassOpeningEmail`, và tạo module thuần `session-link-email.ts` (đánh giá cửa sổ `T-2h` + render email HTML/plain-text chứa link Zoom và link cổng học viên).

## Requirements

- [ ] `packages/api/src/contracts.ts`: thêm `"session_link_reminder"` vào `NOTIFICATION_EVENT_TYPES` và `session_link_reminder: "schedule"` vào `NOTIFICATION_EVENT_GROUP_BY_TYPE`.
- [ ] `packages/api/src/class-opening-email.ts`:
  - Export `ONLINE_SESSION_LINK_NOTICE = "Link buổi học sẽ được gửi đến bạn trước buổi học 2 tiếng."`.
  - Khi `trimmedMode.toLowerCase() === "online"`, render khối callout emerald (`bg-session-notice`) ngay sau bảng chi tiết và trước `Lời nhắn từ giáo viên` / nút `Mở cổng học viên`, kèm CSS dark mode (`@media (prefers-color-scheme: dark)` và `[data-ogsc]`), và bổ sung dòng tương ứng vào `text`.
  - Ẩn hoàn toàn với lớp `Offline`, rỗng, hoặc hình thức khác `Online`.
- [ ] `packages/api/src/session-link-email.ts`:
  - Export `SESSION_LINK_REMINDER_LEAD_MINUTES = 120`, `SESSION_LINK_REMINDER_LEAD_MS`, `evaluateSessionLinkReminderWindow`, `renderSessionLinkEmail`.
  - Kiểm tra nghiêm ngặt `date` (`parseStartDateStrict(date) === date`), `time` (`HH:MM` 24h), `nowMs` hữu hạn; phân loại `"too_early" | "due" | "started" | "invalid"` theo `[startMs - 2h, startMs)` giờ VN.
  - Render HTML + plain-text + `summaryBody`, thoát HTML toàn bộ biến đầu vào, chỉ render CTA chính `Tham gia buổi học` khi `isValidZoomJoinUrl(joinUrl)` hợp lệ (`https://`) và link phụ cổng học viên khi `isSafeEmailUrl(sessionPortalUrl)` hợp lệ.

## Files to Modify / Create

- `packages/api/src/contracts.ts`
- `packages/api/src/class-opening-email.ts`
- `packages/api/src/class-opening-email.test.ts`
- `packages/api/src/session-link-email.ts` (new)
- `packages/api/src/session-link-email.test.ts` (new)

## Implementation Steps (TDD)

1. Viết/cập nhật test trước trong `packages/api/src/class-opening-email.test.ts` và `packages/api/src/session-link-email.test.ts`.
2. Chạy `pnpm --filter @teacher-os/api test` xác nhận test mới fail trước khi implement.
3. Implement thay đổi ở `contracts.ts`, `class-opening-email.ts`, và tạo `session-link-email.ts`.
4. Chạy lại `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types` cho đến khi xanh 100%.

## Verification

- `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types`
