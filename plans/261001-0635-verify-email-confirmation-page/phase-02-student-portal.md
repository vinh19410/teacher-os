---
phase: 2
title: "Trang xác nhận trên student portal"
status: completed
priority: P2
effort: 2h
dependencies: [1]
---

# Phase 2: Trang xác nhận trên student portal

## Goal

Student bấm link xác thực landing trên trang `/verify-email` tiếng Việt của cổng học viên với CTA vào portal, thay vì redirect thẳng `/login` → gate như hiện tại. Quyết định scope từ phỏng vấn validation: làm cả hai cổng, thống nhất thiết kế trạng thái với phase 1.

## Context

- Hiện tượng: sign-up student truyền `callbackURL: ${origin}/login` (`apps/student/src/components/auth/sign-up-form.tsx:36-41`); resend ở pending screen cũng trỏ `/login` (`apps/student/src/components/overview/student-error-view.tsx:44-47`).
- Khung trang: `apps/student/src/routes/login.tsx` + `apps/student/src/components/auth/brand-panel.tsx`.
- Student worker có SPA fallback mở (`apps/student/src/worker.ts:83-94`) — route mới không cần đăng ký allowlist.
- Resend precedent (xử lý `EMAIL_ALREADY_VERIFIED`): `apps/student/src/components/overview/student-error-view.tsx:39-71`.

## Files to Create / Modify

- Create: `apps/student/src/routes/verify-email.tsx`
- Create: `apps/student/src/components/auth/verify-email-view.tsx`
- Modify: `apps/student/src/components/auth/sign-up-form.tsx` (callbackURL → `/verify-email?verified=1`)
- Modify: `apps/student/src/components/overview/student-error-view.tsx` (resend callbackURL → `/verify-email?verified=1`)
- Generated, không sửa tay: `apps/student/src/routeTree.gen.ts` (sinh qua `check-types`)
- Không tạo: component test student (app student chưa có test component nào — vitest wired nhưng 0 file; view là bản dịch của web view đã có test ở phase 1, luồng thật được e2e phủ ở phase 3)

## Tasks & Steps

### Task 2.1 — View component tiếng Việt

- Goal: mirror logic 3 nhánh của `VerifyEmailView` web (phase 1, task 1.1) với copy tiếng Việt; không thêm nhánh logic mới.
- Target files: `apps/student/src/components/auth/verify-email-view.tsx`.
- Copy chuẩn (không tự bịa biến thể):
  - Success: icon `MailCheck`, heading `Email đã được xác thực`, body `Địa chỉ email của bạn đã được xác nhận. Bạn sẵn sàng bắt đầu.`, nút `Vào cổng học viên` → `window.location.assign("/")` (gate hiện có sẽ đưa học viên mới sang `/onboarding`, học viên cũ vào portal).
  - Error: icon `CircleAlert`, heading `Liên kết không hoạt động`, body `Liên kết xác thực không hợp lệ, đã được sử dụng hoặc đã hết hạn. Hãy yêu cầu liên kết mới hoặc đăng nhập để tiếp tục.`
  - Resend block (error card, khi có session và `emailVerified === false`): nút `Gửi lại email` — giữ đúng chữ này vì là tên đã dùng ở pending screen; gọi `authClient.sendVerificationEmail({ email: user.email, callbackURL: \`${window.location.origin}/verify-email?verified=1\` })`; nhánh `EMAIL_ALREADY_VERIFIED` → reload; sau gửi thành công hiện `Đã gửi lại — kiểm tra hộp thư` và ẩn nút.
  - Không session / đã verified trong error card: link `Về đăng nhập` → `/login`.
- Success criteria: không có chuỗi tiếng Anh của phase 1 trong component; logic nhánh identical (error → verified===? → error).
- Verify: task 2.3 (check-types) + phase 3 (e2e).

### Task 2.2 — Route `/verify-email` của student

- Goal: route public decode search param, khung giống login student.
- Target files: `apps/student/src/routes/verify-email.tsx`.
- Steps:
  1. `createFileRoute("/verify-email")`, `validateSearch` chỉ giữ `verified` và `error` khi là string (pattern `apps/web/src/routes/login.tsx:20-30`).
  2. Khung copy từ `apps/student/src/routes/login.tsx`, bỏ tabs/Google button; heading `Xác thực email`; render `<VerifyEmailView … />`.
  3. Không đụng `worker.ts` — SPA fallback đã serve mọi route app.
- Success criteria: điều hướng thẳng và với `?verified=1` không crash.
- Verify: task 2.3.

### Task 2.3 — Đổi callbackURL hai chỗ gọi + sinh route tree

- Goal: mail verify của student trỏ về trang mới, cả từ sign-up lẫn resend.
- Target files: `apps/student/src/components/auth/sign-up-form.tsx`, `apps/student/src/components/overview/student-error-view.tsx`.
- Steps:
  1. Sign-up: `callbackURL: \`${window.location.origin}/verify-email?verified=1\`` (thay `/login`).
  2. Resend trong error-view: cùng giá trị mới (thay `/login`).
  3. `pnpm --filter student check-types` để sinh `routeTree.gen.ts` chứa `/verify-email`.
- Success criteria: grep trong `apps/student/src` không còn chuỗi `` `${window.location.origin}/login` `` dùng làm verification callbackURL; `routeTree.gen.ts` có `'/verify-email'`.
- Verify: tất cả exit 0:
  - `pnpm --filter student check-types`
  - `pnpm check` (root)
  - `pnpm check-types` (root)

## Security Considerations

- Giống phase 1: callbackURL chỉ từ `window.location.origin`; trang public không PII; không log token; copy lỗi tĩnh.
- Đổi callbackURL resend không đổi quyền — vẫn endpoint chuẩn better-auth, vẫn yêu cầu session.

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
