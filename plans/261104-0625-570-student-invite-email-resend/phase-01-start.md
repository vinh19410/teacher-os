---
title: "Phase 1: Contracts, migration và mailer/template lời mời dùng chung"
status: todo
---

# Phase 1: Contracts, migration và mailer/template lời mời dùng chung

<!-- Updated: Red Team & Validation Session 1 - fix composeFrom nested angle brackets, bounded timeoutMs/Retry-After, exact mail.test.ts and renderHtml/renderText symbols, full href escaping -->

## Overview

Chuẩn bị đầy đủ nền tảng dữ liệu và hợp đồng dùng chung trước khi sửa route nghiệp vụ:
1. Sửa lỗi `composeFrom` trong `packages/auth/src/mail/mailer.ts` khi `MAIL_FROM` đã có dạng `"TeacherOS <no-reply@teacheros.io.vn>"`, lọc ký tự điều khiển `\r\n\0`, mở rộng `MailInput` hỗ trợ `idempotencyKey` (header `Idempotency-Key`) + `timeoutMs`, và áp trần `Retry-After <= 2s` để an toàn khi gọi đồng bộ.
2. Thêm cột nullable `last_invite_email_at` trên bảng `student` (migration forward-only `0062_*.sql` cho D1).
3. Bổ sung mã lỗi/trường DTO trong `@teacher-os/api/contracts`.
4. Tách helper `resolveOrgMailSender` (`senderName`, `replyToEmail`) và trình dựng nội dung email lời mời dùng chung (`invite-email.ts`), đồng thời nâng cấp `escapeHtml` / `renderHtml` trong `deliver.ts` hỗ trợ `ctaLabel` tùy biến và escape an toàn thuộc tính `href`.

## Files to Create / Modify

- Modify: `packages/auth/src/mail/mailer.ts`
- Modify: `packages/auth/src/mail/mail.test.ts`
- Modify: `packages/db/src/schema/student.ts`
- Create: `packages/db/src/migrations/0062_*.sql` (sinh qua `drizzle-kit generate` kèm cập nhật `packages/db/src/migrations/meta/*`)
- Modify: `packages/api/src/contracts.ts`
- Create: `apps/server/src/lib/notifications/org-mail-sender.ts`
- Create: `apps/server/src/lib/notifications/invite-email.ts`
- Modify: `apps/server/src/lib/notifications/enqueue.ts`
- Modify: `apps/server/src/lib/notifications/deliver.ts`
- Modify: `apps/server/src/lib/notifications/notifications.test.ts`

## Requirements

- [ ] **`packages/auth/src/mail/mailer.ts`:**
  - Hàm `sanitizeHeaderValue(value: string, maxLen = 200)`: xóa mọi ký tự `[\r\n\0]` và cắt tối đa `maxLen` ký tự.
  - Sửa `composeFrom(from: string, fromName?: string)`:
    - Nếu không có `fromName` (hoặc sau khi trim/sanitize rỗng) → trả `sanitizeHeaderValue(from, 320)`.
    - Nếu có `fromName`: trích xuất địa chỉ email trần từ `from` nếu `from` có dạng `Display <addr@domain>` (`const match = from.match(/<([^<>]+)>/); const bareAddress = (match ? match[1] : from).trim();`), escape `\` trước `"` trong `fromName` (`replaceAll("\\", "\\\\").replaceAll('"', '\\"')`), trả `"${escaped}" <${sanitizeHeaderValue(bareAddress, 254)}>`.
  - Mở rộng `MailInput` thêm `idempotencyKey?: string` và `timeoutMs?: number`.
  - Trong `createResendMailer`:
    - Dùng `AbortSignal.timeout(input.timeoutMs ?? 10_000)` cho mỗi lượt `postMail`.
    - Sanitize `subject` và `replyTo` qua `sanitizeHeaderValue`; gắn header `"Idempotency-Key": sanitizeHeaderValue(input.idempotencyKey, 255)` khi có `input.idempotencyKey`.
    - Ở nhánh retry `429`/`5xx`: nếu header `Retry-After` chỉ định `retrySeconds > 2` thì **không** sleep/retry (ném lỗi ngay để không giữ kết nối đồng bộ quá lâu); ngược lại giới hạn `sleepMs = Math.min(rawSleepMs, 2_000)`.
- [ ] **Schema & Migration (`packages/db`):** Thêm cột `lastInviteEmailAt: integer("last_invite_email_at", { mode: "timestamp_ms" })` vào `packages/db/src/schema/student.ts` và sinh migration SQLite/D1 forward-only `0062_*.sql`.
- [ ] **Contracts (`packages/api/src/contracts.ts`):**
  - Mở rộng `STUDENT_INVITATION_ERROR_CODES` thêm:
    - `EMAIL_SEND_FAILED: "INVITATION_EMAIL_FAILED"`
    - `EMAIL_UNAVAILABLE: "INVITATION_EMAIL_UNAVAILABLE"`
    - `RESEND_COOLDOWN: "INVITATION_RESEND_COOLDOWN"`
    - `ALREADY_JOINED: "STUDENT_ALREADY_JOINED"`
  - Mở rộng `KernelStudentRow` thêm `portalLinked?: boolean`.
  - Mở rộng `StudentCreateResponse` (`packages/api/src/contracts.ts:56-62`) thêm `inviteEmailSent?: boolean`.
  - Thêm `resendStudentInviteSchema = z.object({ enrollmentId: z.string().trim().min(1).optional() })` và `StudentInviteResendResponse = { ok: true; id: string; updatedAt: string | number | Date }`.
- [ ] **Notifications & Invite Email Builder (`apps/server/src/lib/notifications/`):**
  - Trong `deliver.ts`: cập nhật `escapeHtml` escape cả `'` (`&#39;`), cập nhật `renderHtml(body: string, linkUrl: string, ctaLabel = "Mở xem")` chỉ render thẻ `<a href="...">` khi `linkUrl` bắt đầu bằng `http://`, `https://` hoặc `/` (escape đầy đủ `escapeHtml(linkUrl)` và `escapeHtml(ctaLabel)`), truyền `idempotencyKey: row.id` khi `deliverNotifications` gọi `mailer.send`, và export `renderHtml` + `renderText`.
  - Tạo `org-mail-sender.ts` chứa `resolveOrgMailSender(db, orgId)` và tái sử dụng trong `enqueue.ts`.
  - Tạo `invite-email.ts` chứa `buildOrgInvitationEmail({ orgName, inviterName, studentOrigin })` và `buildStudentPortalInviteEmail({ orgName, studentName, className, studentOrigin })` (dùng `ctaLabel = "Mở cổng học viên"`, chỉ truyền `linkUrl` khi `studentOrigin` bắt đầu bằng `http://` hoặc `https://`).

## Implementation Steps (Handover Tasks)

### Task 1.1 — Viết test Đỏ cho `composeFrom`, `Idempotency-Key` và trần `Retry-After` trong `mail.test.ts`
- **Goal:** Có unit test chứng minh `composeFrom` xử lý đúng `MAIL_FROM="TeacherOS <no-reply@teacheros.io.vn>"` + lọc `\r\n\` và `createResendMailer` chuyển tiếp `Idempotency-Key`, tôn trọng `timeoutMs` và không sleep khi `Retry-After > 2`.
- **Target files and symbols:** `packages/auth/src/mail/mail.test.ts`, `packages/auth/src/mail/mailer.ts` (`composeFrom`, `MailInput`, `createResendMailer`).
- **Steps:**
  1. Đọc toàn bộ `packages/auth/src/mail/mail.test.ts` để nắm cấu trúc mock `fetch` hiện tại.
  2. Thêm các test case mới:
     - `composeFrom("TeacherOS <no-reply@teacheros.io.vn>", "Alpha Academy qua Teacher OS")` trả đúng `"Alpha Academy qua Teacher OS" <no-reply@teacheros.io.vn>` (không lồng hai dấu `<...>`).
     - `composeFrom("no-reply@teacheros.io.vn", "Evil\\\r\nBcc: x@y.z")` lọc bỏ `\r\n` và escape `\` thành `"Evil\\Bcc: x@y.z" <no-reply@teacheros.io.vn>`.
     - `createResendMailer` gắn header `"Idempotency-Key"` khi truyền `idempotencyKey`, và khi gặp `429` kèm `Retry-After: 60` thì ném lỗi ngay ở lượt 1 (chỉ gọi `fetch` 1 lần, không treo 60s).
- **Success criteria:** Chạy test thất bại bằng `AssertionError` ở các case mới vì `mailer.ts` chưa sửa (pha Đỏ TDD).
- **Verify:** `pnpm --filter @teacher-os/auth test` thoát mã khác `0` với lỗi `AssertionError` trên `composeFrom` / `Idempotency-Key`.

### Task 1.2 — Cập nhật `packages/auth/src/mail/mailer.ts` để vượt qua test xanh
- **Goal:** Toàn bộ cải tiến `composeFrom`, sanitization, `idempotencyKey`, `timeoutMs` và trần `Retry-After` hoạt động đúng.
- **Target files and symbols:** `packages/auth/src/mail/mailer.ts` (`composeFrom`, `MailInput`, `createResendMailer`).
- **Steps:**
  1. Cập nhật `MailInput`, `composeFrom` và `createResendMailer` trong `packages/auth/src/mail/mailer.ts` theo đúng mục Requirements ở trên.
- **Success criteria:** Toàn bộ test trong `@teacher-os/auth` pass 100%.
- **Verify:** `pnpm --filter @teacher-os/auth test` thoát mã `0`.

### Task 1.3 — Thêm cột `lastInviteEmailAt` vào schema `student` và sinh migration D1
- **Goal:** Bảng `student` có cột nullable `last_invite_email_at` kiểu `timestamp_ms` kèm file migration SQL forward-only hợp lệ.
- **Target files and symbols:** `packages/db/src/schema/student.ts` (`student`), `packages/db/src/migrations/0062_*.sql`.
- **Steps:**
  1. Trong `packages/db/src/schema/student.ts`, ngay sau `onboardingCompletedAt`, thêm `lastInviteEmailAt: integer("last_invite_email_at", { mode: "timestamp_ms" })`.
  2. Chạy `pnpm --filter @teacher-os/db db:generate` để sinh file migration `0062_*.sql` và cập nhật `meta/_journal.json`.
  3. Đọc file SQL `0062_*.sql` vừa sinh để xác nhận chỉ chứa câu lệnh `ALTER TABLE \`student\` ADD \`last_invite_email_at\` integer;`.
- **Success criteria:** File `0062_*.sql` tồn tại, chỉ chứa `ALTER TABLE` cộng cột nullable, và test `@teacher-os/db` xanh.
- **Verify:** `pnpm --filter @teacher-os/db test` thoát mã `0`.

### Task 1.4 — Cập nhật contracts, `deliver.ts`, `org-mail-sender.ts` và `invite-email.ts`
- **Goal:** Định nghĩa đầy đủ error codes/DTOs trong `@teacher-os/api/contracts` và có unit test xanh cho `resolveOrgMailSender`, `renderHtml` và `buildOrgInvitationEmail` / `buildStudentPortalInviteEmail`.
- **Target files and symbols:**
  - `packages/api/src/contracts.ts` (`STUDENT_INVITATION_ERROR_CODES`, `KernelStudentRow`, `StudentCreateResponse`, `resendStudentInviteSchema`, `StudentInviteResendResponse`)
  - `apps/server/src/lib/notifications/deliver.ts` (`escapeHtml`, `renderHtml`, `renderText`, `deliverNotifications`)
  - `apps/server/src/lib/notifications/enqueue.ts` (`enqueueNotifications`)
  - `apps/server/src/lib/notifications/org-mail-sender.ts` (`resolveOrgMailSender`)
  - `apps/server/src/lib/notifications/invite-email.ts` (`buildOrgInvitationEmail`, `buildStudentPortalInviteEmail`)
  - `apps/server/src/lib/notifications/notifications.test.ts`
- **Steps:**
  1. Đọc `packages/api/src/contracts.ts` vùng `StudentCreateResponse` (`:50-70`), `KernelStudentRow` (`:1438-1450`) và `STUDENT_INVITATION_ERROR_CODES` (`:2688-2715`), bổ sung các trường/hằng/schema theo mục Requirements.
  2. Cập nhật `deliver.ts` (`escapeHtml` escape thêm `'`, `renderHtml` nhận `ctaLabel = "Mở xem"`, kiểm tra scheme URL hợp lệ trước khi render `<a href>`, truyền `idempotencyKey: row.id` vào `mailer.send`, và export `renderHtml`, `renderText`).
  3. Tạo `org-mail-sender.ts` (`resolveOrgMailSender`) và cập nhật `enqueue.ts` gọi hàm này.
  4. Tạo `invite-email.ts` (`buildOrgInvitationEmail`, `buildStudentPortalInviteEmail`, lọc `\r\n\0` khỏi `subject`).
  5. Thêm unit test trong `apps/server/src/lib/notifications/notifications.test.ts` kiểm tra: nhãn CTA `"Mở cổng học viên"`, escape ký tự `<>&"'` trong tên tổ chức/tên lớp/link, bỏ link không phải `http(s)://`, và `deliverNotifications` truyền `idempotencyKey: row.id`.
- **Success criteria:** Bộ test `notifications.test.ts` và typecheck `@teacher-os/api` pass hoàn toàn.
- **Verify:** `pnpm --filter server exec vitest run src/lib/notifications/notifications.test.ts && pnpm --filter @teacher-os/api check-types` thoát mã `0`.

## Todo

- [ ] Task 1.1: Viết test Đỏ cho `composeFrom`, `Idempotency-Key` và trần `Retry-After` trong `mail.test.ts`
- [ ] Task 1.2: Cập nhật `packages/auth/src/mail/mailer.ts` để vượt qua test xanh
- [ ] Task 1.3: Thêm cột `lastInviteEmailAt` vào schema `student` và sinh migration D1
- [ ] Task 1.4: Cập nhật contracts, `deliver.ts`, `org-mail-sender.ts` và `invite-email.ts`

## Success Criteria

Toàn bộ sửa lỗi `composeFrom`, `MailInput.idempotencyKey`/`timeoutMs`, migration `0062_*.sql`, contracts và bộ dựng email lời mời đã sẵn sàng, pass unit test và typecheck.

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
