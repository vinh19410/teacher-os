---
phase: 3
title: "E2E AC-002: gửi lỗi 3 lần → Lỗi gửi (failed)"
status: pending
priority: P0
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: E2E AC-002

## Files

- Modify: `apps/e2e/src/boot.ts` — `recordingMailer` ném `Error("mailbox unavailable")` khi `input.to` kết thúc bằng `@bounce.test`, ghi dòng `{ to, subject, failed: true, at }` vào mail log trước khi ném.
- Create: `apps/e2e/specs/notifications-ac-002.spec.ts` (theo mẫu `notifications-ac-001.spec.ts`).

## Steps

1. Seed học viên có email `<random>@bounce.test`, ghi danh vào lớp (phát `class_enrolled`).
2. Chờ (poll API `GET /api/notification-logs?status=failed`) tới khi bản ghi `failed`; khẳng định mail log có đúng 3 dòng `failed: true` cho địa chỉ đó.
3. Mở `/notifications?status=failed`: thấy dòng với nhãn "Lỗi gửi" và chữ `E-010`; chip "Lỗi gửi" ≥ 1; mở chi tiết thấy "3/3".
4. Cổng học viên của học viên đó (nếu spec AC-001 có sẵn helper đăng nhập portal) vẫn thấy thông báo trong chuông.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- notifications-ac-00`
