---
phase: 3
title: "E2E AC-002: gửi lỗi 3 lần → Lỗi gửi (failed)"
status: completed
priority: P0
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: E2E AC-002 (`@bounce.test` → 3 lần thử → `failed`)

<!-- Updated: Validation & Red Team Session 1 - Handover decomposition + bounce only notification emails + helpers.ts failed field + onboarded: true -->

## Goal

Chứng minh end-to-end AC-002 trên stack thật: khi phát sinh sự kiện thông báo cho học viên có địa chỉ kết thúc bằng `@bounce.test`, `recordingMailer` ném lỗi ở cả 3 lượt thử tự động, ghi đúng 3 dòng `failed: true` vào `.mail-log.jsonl`, bản ghi trên màn `/notifications` chuyển sang `"Lỗi gửi"` kèm thông điệp `E-010: mailbox unavailable sau 3 lần thử`, chi tiết hiện `"3/3 lần thử"`, và học viên đăng nhập cổng học viên vẫn thấy thông báo In-app trong chuông (mở xem không làm đổi trạng thái `failed`).

## Files to Create or Modify

- Modify: `apps/e2e/src/boot.ts`
- Modify: `apps/e2e/specs/helpers.ts`
- Create: `apps/e2e/specs/notifications-ac-002.spec.ts`

## Tasks & Steps

### Task 3.1 — Cập nhật `recordingMailer` trong `apps/e2e/src/boot.ts` và kiểu `VerificationEmailEntry` trong `apps/e2e/specs/helpers.ts`
- **Goal:** Làm cho `recordingMailer` giả lập lỗi gửi email (`Error("mailbox unavailable")`) đối với thư thông báo nghiệp vụ gửi tới `@bounce.test` (ghi `{ ...base, failed: true, at }` vào `.mail-log.jsonl` trước khi throw), nhưng vẫn cho phép thư xác thực tài khoản Better-Auth (`verifyMatch` / `resetMatch`) đi qua bình thường để học viên `@bounce.test` xác thực được tài khoản trên cổng học viên.
- **Target files and symbols:**
  - `apps/e2e/src/boot.ts` (`recordingMailer`)
  - `apps/e2e/specs/helpers.ts` (`VerificationEmailEntry`)
- **Steps:**
  1. Trong `apps/e2e/specs/helpers.ts`: thêm `failed?: boolean;` vào interface `VerificationEmailEntry`.
  2. Trong `apps/e2e/src/boot.ts` (`recordingMailer.send`):
     - Sau khi kiểm tra `verifyMatch` và `resetMatch`, nếu `!verifyMatch && !resetMatch && input.to.trim().toLowerCase().endsWith("@bounce.test")`:
       - Ghi dòng `JSON.stringify({ ...base, failed: true, at })` vào `MAIL_LOG_PATH`.
       - `throw new Error("mailbox unavailable");`.
- **Success criteria:** `pnpm check-types` và `pnpm check` pass; thư xác thực vẫn có `url`, thư thông báo tới `@bounce.test` ghi `failed: true` và ném lỗi.
- **Verify:** `pnpm check-types` exits `0`.

### Task 3.2 — Viết spec E2E `apps/e2e/specs/notifications-ac-002.spec.ts` và verify 3 viewport
- **Goal:** Kiểm thử tự động toàn bộ luồng AC-002 trên trình duyệt thật (bao gồm kiểm tra giao diện màn `[5]` ở 3 viewport `1440×900`, `768×1024`, `375×812` và focus bàn phím vào nút xem chi tiết).
- **Target files and symbols:**
  - `apps/e2e/specs/notifications-ac-002.spec.ts`
- **Steps:**
  1. Tạo `apps/e2e/specs/notifications-ac-002.spec.ts` theo mẫu `apps/e2e/specs/notifications-ac-001.spec.ts`:
     - Đăng ký giáo viên qua UI (`signUpViaUi`), seed 1 học viên với email `tos22.bounce.${Date.now()}@bounce.test` và `onboarded: true`.
     - Tạo lớp, ghi danh và kích hoạt học viên vào lớp (phát sự kiện `class_enrolled`).
     - Poll `.mail-log.jsonl` tới khi có đủ 3 mục `failed === true` gửi tới email học viên đó; khẳng định số lượng mục `failed === true` của email đó đúng bằng `3`.
     - Mở `/notifications?status=failed` phía giáo viên:
       - Chip `"Lỗi gửi"` có badge đếm `"1"`.
       - Dòng của học viên hiển thị nhãn `"Lỗi gửi"` và dòng phụ `"E-010: mailbox unavailable sau 3 lần thử"`.
       - Kiểm tra responsive ở 3 viewport (`1440×900`, `768×1024`, `375×812`) và focus bàn phím vào nút `Xem chi tiết thông báo cho ...`, bấm mở hộp thoại chi tiết thấy `"3/3 lần thử"` và `"E-selfomy-alignment-010: mailbox unavailable"`.
     - Mở cổng học viên (`STUDENT_ORIGIN`), đăng ký & xác thực email cho học viên `@bounce.test`, mở chuông thông báo In-app thấy mục `"Bạn được mời vào lớp"`, bấm vào thông báo để đánh dấu đã đọc.
     - Quay lại `/notifications?status=failed` phía giáo viên, reload và khẳng định bản ghi vẫn ở trạng thái `"Lỗi gửi"` (không bị đổi sang `"Đã xem"`), đồng thời hộp thoại chi tiết có thời점 `"Đọc lúc"` khác `"—"`.
- **Success criteria:** Cả `notifications-ac-002.spec.ts` và `notifications-ac-001.spec.ts` đều pass xanh.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- notifications-ac-00` exits `0`.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- notifications-ac-00` exits `0`.
- `pnpm check && pnpm check-types` exits `0`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
