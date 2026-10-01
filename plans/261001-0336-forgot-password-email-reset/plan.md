---
title: "Quên mật khẩu qua email"
description: "Người dùng xin liên kết đặt lại mật khẩu qua email, bấm link, rồi đặt mật khẩu mới trên đúng cổng đã xin."
status: completed
priority: P1
effort: 13h
issue: 292
branch: vinh19410/feat/forgot-password-email-reset
tags: [feature, auth, frontend, backend]
blockedBy: []
blocks: []
created: 2026-10-01
---

# Quên mật khẩu qua email

## Overview

Giáo viên và học viên đang đăng nhập bằng email/mật khẩu không có đường lấy lại mật khẩu. Trên `apps/web`, nút "Forgot password?" chỉ mở một câu thông báo pilot. Cổng học viên không có nút nào. Mailer Resend và template xác thực email đã chạy trong `packages/auth`.

Plan này bật `sendResetPassword` của better-auth 1.6.27, gửi email HTML tiếng Việt chứa đúng `url` better-auth trả về, rồi thêm trang xin link và trang đặt mật khẩu mới trên cả hai app. Link trong email do better-auth phát hành; khi hợp lệ nó chuyển tới `/reset-password?token=...` của đúng origin đã xin.

## Scope Challenge

- Existing code: `emailAndPassword.enabled` không có `sendResetPassword` (`packages/auth/src/index.ts`). Web chặn người dùng bằng notice tại `apps/web/src/components/sign-in-form.tsx`. Student sign-in không có nhánh quên mật khẩu. E2E mail log chỉ giữ URL `/verify-email` (`apps/e2e/src/boot.ts`).
- Requested scope: quên mật khẩu, gửi link qua email, click link thì vào trang đổi mật khẩu mới. Làm đủ cho cả hai cổng vì cả hai dùng cùng kho credential.
- Complexity: khoảng 15 file, không service mới, 3 phase. Tái dùng `Mailer`, `AuthField`, `BrandPanel`.
- Selected mode: HOLD SCOPE. Không `--yagni`.

## Decisions

| # | Quyết định | Lý do |
|---|------------|--------|
| D1 | Dùng better-auth `sendResetPassword` + client `requestPasswordReset({ email, redirectTo })` + `resetPassword({ newPassword, token })` | Đúng API docs email-password của bản catalog `1.6.27`. Không tự phát hành token. |
| D2 | `redirectTo` = `window.location.origin + "/reset-password"`. Cấm nhận redirect từ query người dùng gõ | Better-auth chỉ chấp nhận origin trong `trustedOrigins`. Chặn open redirect. |
| D3 | `resetPasswordTokenExpiresIn: 60 * 60`. `revokeSessionsOnPasswordReset: true` | Cùng hạn 1 giờ với email xác thực. Đặt lại mật khẩu phải cắt session cũ. |
| D4 | Email dùng chung, tiếng Việt, subject `Đặt lại mật khẩu TeacherOS của bạn`. UI teacher giữ tiếng Anh. UI student giữ tiếng Việt | Khớp ngôn ngữ từng bề mặt hiện có. Một template vì auth là một. |
| D5 | Mail gửi nền qua `advanced.backgroundTasks.handler` (`waitUntil` trên worker). Lỗi mailer được log (không kèm url/token/email), không ném. Response `request-password-reset` luôn 200 và giống hệt cho email có và không có tài khoản. UI luôn hiện câu trung tính "nếu có tài khoản thì đã gửi"; chỉ lỗi mạng, 4xx, 429 mới báo thất bại | Better-auth v1.6.27 bọc `sendResetPassword` trong `runInBackgroundOrAwait` (try/catch + log) nên ném lỗi không bao giờ tới client; ép ném lỗi mở oracle liệt kê tài khoản. Gửi nền cũng loại timing oracle. Thay quyết định D5 cũ ("lỗi mailer không được nuốt") |
| D6 | Không bật `requireEmailVerification`. Không làm đổi mật khẩu khi đang đăng nhập | Ngoài yêu cầu. |
| D7 | Tài khoản chỉ đăng nhập Google vẫn nhận mail reset và `resetPassword` tạo credential mật khẩu cho tài khoản đó. Chấp nhận, ghi rõ, khóa bằng test | Hành vi mặc định better-auth; người kiểm soát hộp thư vốn đã ngang quyền Google reset. Đã hỏi và user chọn chấp nhận |
| D8 | Callback `sendResetPassword` chỉ gửi khi role của user khớp app suy ra từ `callbackURL` (`resolveRequestApp`). Lệch thì không gửi, response vẫn trung tính | Gọi API trực tiếp với email học viên và `redirectTo` origin teacher từng gửi mail tới cổng sai. Đã hỏi và user chọn thêm chốt chặn |
| D9 | Không đổi cấu hình rate limit server. UI map 429 sang copy riêng và vô hiệu nút gửi 60 giây sau thành công. Ghi rủi ro email-bombing và bucket chung sau NAT | Đã hỏi và user chọn giữ scope ở UI |

## Non-goals

- OTP, magic link đăng nhập, đổi mật khẩu trong trang profile.
- Sửa fail-open của email xác thực lúc sign-up.
- Đổi ngôn ngữ trang login teacher.
- Cấu hình Resend hoặc zone TLS mới.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Auth gửi email đặt lại mật khẩu](./phase-01-start.md) | Pending |
| 2 | [Trang quên mật khẩu và trang đặt mật khẩu mới](./phase-02-reset-pages.md) | Pending |
| 3 | [E2E hai cổng và changelog](./phase-03-e2e-reset-mail.md) | Pending |

## Dependencies

- better-auth `1.6.27` (`pnpm-workspace.yaml` catalog).
- `Mailer` inject sẵn (`CreateAuthInput.mailer`). Không env mới.
- Phase 2 phụ thuộc contract HTTP của phase 1. Phase 3 phụ thuộc cả hai.

## Success Criteria

- [ ] User teacher bấm "Forgot password?", nhận email, mở link, đặt mật khẩu mới, đăng nhập được bằng mật khẩu mới và không đăng nhập được bằng mật khẩu cũ.
- [ ] User student làm cùng việc trên cổng học viên, link không nhảy sang origin teacher.
- [ ] Email không tồn tại vẫn thấy cùng câu thành công, cùng body response và không có thư trong mail log. Request không chờ mailer.
- [ ] Mail reset không bao giờ tới cổng khác role của tài khoản; token không xuất hiện trong log server.
- [ ] Link hết hạn hoặc sai token hiện lỗi và không đổi mật khẩu.
- [ ] `pnpm --filter @teacher-os/auth test`, `pnpm --filter web test`, `pnpm --filter student test`, `pnpm --filter server check-types` và spec e2e mới đều xanh.

## Red Team Review

### Session 1 — 2026-10-01 (planner tự đối chiếu)

| ID | Severity | Evidence | Disposition |
|----|----------|----------|-------------|
| RT1 | High | `apps/e2e/src/boot.ts:40` chỉ regex `/verify-email`. Thư reset sẽ thành `error: "no-verify-url"` | Accept — phase 3 bắt URL reset, không đổi nhánh verify |
| RT2 | High | `apps/web/src/routes-matcher.ts:4` không có route lạ. `/forgot-password` sẽ 404 ở worker | Accept — phase 2 thêm exact route và test drift |
| RT3 | High | `packages/auth/src/index.ts:143` nuốt lỗi mailer lúc sign-up. Copy nguyên sẽ báo đã gửi dù không gửi | Superseded — xem F1 phiên 2 (better-auth tự nuốt; D5 mới) |
| RT4 | Medium | Docs better-auth: `redirectTo` không hợp lệ bị từ chối | Accept — D2 |
| RT5 | Medium | Tài khoản chỉ Google có thể không có credential password | Superseded — xem F7 phiên 2 (D7) |

### Session 2 — 2026-10-01 (3 reviewer đối kháng: Security Adversary, Failure Mode Analyst, Assumption Destroyer)

Báo cáo gốc: `plans/reports/red-team-{security,failure,assumptions}-261001-forgot-password.md`. Hook môi trường chặn đọc `node_modules`, nên hành vi better-auth đối chiếu với source GitHub tag `v1.6.27` (cùng catalog `1.6.27`). Controller tự xác minh F1 trên `api/routes/password.ts` và `context/create-context.ts` của tag đó.

**Findings:** 23 gộp còn 14 sau dedupe (3 reviewer, nhiều finding trùng). 14 Accept, 0 Reject. Severity: 1 Critical, 6 High, 7 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | `sendResetPassword` ném lỗi không làm endpoint fail; D5/RT3 và test mailer-reject sai tiền đề (3/3 reviewer) | Critical | Accept — D5 mới, test 1.3 bước 6 đổi | plan D5, phase 1 task 1.2, 1.3 |
| F2 | Timing oracle: mailer await trong request, user thật chậm hơn email lạ | High | Accept — gửi nền `waitUntil` + test độ trễ | phase 1 task 1.2, 1.3 bước 7 |
| F3 | Token reset lộ qua log Hono (`logger()` in path) | High | Accept — hàm che token + test | phase 1 task 1.2b |
| F4 | `createLogMailer` in nguyên URL reset ở chế độ log-only | Medium | Accept — ghi nhận, không sửa (đã cảnh báo lúc khởi động, prod phải `resend`) | phase 1 task 1.2b |
| F5 | E2E student tự khoá mình (session còn, `/login` đẩy đi); route mới không được copy redirect session | High | Accept — `clearCookies`, cấm `useSession` ở route reset, test có session | phase 2 task 2.3, 2.4; phase 3 task 3.2 |
| F6 | Đổi `button` thành `Link` làm vỡ `sign-in-form.test.tsx` và `login.test.tsx` (mock thiếu `Link`) | High | Accept — thêm hai file vào Modify, mock `Link`, verify chạy cả hai suite | phase 2 Files, task 2.5 |
| F7 | `routeTree.gen.ts` của web bị gitignore, drift guard `return` sớm, Verify task 2.1 xanh giả | High | Accept — test trực tiếp `isValidAppRoute` + `worker.test.ts` | phase 2 task 2.1, 2.5 |
| F8 | E2E "mật khẩu cũ chết" là phantom (`not.toHaveURL` pass ở t=0); không test thu hồi session | High | Accept — `waitForResponse` + assert `get-session` null | phase 1 task 1.3 bước 4; phase 3 task 3.2 |
| F9 | Regex reset ở task 3.1 sai/lỏng, và unknown-email check race nếu mail gửi nền | Medium | Accept — neo `/api/auth/reset-password/<token>?...`, gửi cho user thật rồi chờ mới assert | phase 3 task 3.1, 3.2 bước 4 |
| F10 | Rate limit mặc định 3 req/60s/IP, in-memory, chỉ production; UI không có copy 429 | Medium | Accept — D9 (copy 429 + khóa nút), ghi rủi ro | plan D9; phase 2 task 2.2, 2.4; phase 1 Security |
| F11 | `resetPassword` double-submit và gộp mọi lỗi thành "link hỏng" | Medium | Accept — vô hiệu submit, phân loại theo `error.code` | phase 2 task 2.3, 2.4 |
| F12 | Reset tạo credential cho tài khoản Google-only | Medium | Accept — D7 + test | plan D7; phase 1 task 1.3 bước 9 |
| F13 | `redirectTo` không ràng buộc role: mail tới cổng sai | Medium | Accept — D8 + test | plan D8; phase 1 task 1.2, 1.3 bước 8 |
| F14 | Token nằm lại trong URL/history; plan không có thứ tự deploy/rollback (link mail trỏ route 404 nếu server lên trước web) | Medium | Accept — `replace` URL; mục Deploy Order | phase 2 task 2.3, 2.4; plan Deploy Order |

### Whole-Plan Consistency Sweep (sau phiên 2)

Đã rà `plan.md` và 3 phase. Không còn "ném lỗi từ `sendResetPassword`", không còn `forgetPassword` làm đường dự phòng (better-auth 1.6.27 có `requestPasswordReset`/`resetPassword`), không còn "ba test" ở phase 1 (nay sáu) hay phase 3 (nay bốn). Cùng subject, cùng hạn 3600 giây, cùng `revokeSessionsOnPasswordReset: true`, cùng hai route. Vẫn nhất quán: lỗi mailer chỉ xuất hiện trong log, UI chỉ báo thất bại cho lỗi mạng/4xx/429.

## Deploy Order

Link trong mail redirect về `<origin>/reset-password` của app đã xin. Thứ tự: deploy `apps/web` và `apps/student` trước, `apps/server` sau (server lên trước thì mail phát ra trỏ vào route 404 ở worker web). Rollback theo chiều ngược: server trước, web/student sau. Mail còn hạn 1 giờ trỏ vào route đã gỡ sẽ 404, chấp nhận cho cửa sổ rollback. Sau deploy: `curl -sI <web>/reset-password` trả 200 và `GET <api>/api/auth/reset-password/x?callbackURL=<origin>/reset-password` trả 302 về `?error=INVALID_TOKEN`. `MAILER_IMPL=resend` phải được đặt ở môi trường nhận mail thật (mặc định hạ tầng là `log`).

## Validation Log

### Verification Results

- Claims checked: 12
- Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Standard
- Failures: none

Claims: `emailAndPassword` chỉ `enabled: true` tại `packages/auth/src/index.ts:123`. Notice pilot tại `apps/web/src/components/sign-in-form.tsx:97`. Student sign-in không có forgot (`apps/student/src/components/auth/sign-in-form.tsx`). `signUpViaUi` tại `apps/e2e/specs/helpers.ts:11`. `readVerificationEmails` tại `apps/e2e/specs/helpers.ts:51`. Catalog `better-auth: 1.6.27`. Route public nằm ở `routes/login.tsx`, không nằm dưới `_auth`. Drift guard đọc `FileRoutesByFullPath` trong `apps/web/src/routes-matcher.test.ts:83`. `.mail-preview/` đã gitignore.

### Decisions locked without a second interview

Yêu cầu gốc đã đủ để HOLD SCOPE. Không hỏi lại giữa chừng vì phiên trước đang kẹt ở bước research.

### Whole-Plan Consistency Sweep

Không có mâu thuẫn còn mở. Plan sẵn sàng để `/ak:cook` khi được yêu cầu. Chưa implement trong phiên này.

### Verification Results (phiên 2, sau red-team)

- Claims checked: 12 (phiên 1) + 14 finding đối chiếu code (phiên 2)
- Verified: 26 | Failed: 0 | Unverified: 0
- Tier: Standard
- Failures: không còn. Hai chỗ lệch nhỏ đã sửa: `routes-matcher.ts:3` thực tế là dòng 4; `routeTree.gen.ts` web bị gitignore (`.gitignore:12`) nên không thể là bằng chứng drift guard.

Controller đã tự đối chiếu trên worktree: `apps/server/src/index.ts` chưa có `runInBackground`; `packages/infra/alchemy.run.ts:100` có `nodejs_compat` và `apps/server/tsdown.config.ts` đã `neverBundle: ["cloudflare:workers"]`; `apps/server/src/app.ts:108` `app.use(logger())`; `apps/student/src/routes/login.tsx:42-47` redirect khi có session; `apps/web/vitest.config.ts` `environment: "node"`; student không có jsdom/Testing Library; `apps/server/src/*.test.ts` không import `index.ts`.

### Decisions locked (phiên 2)

User trả lời qua hỏi đáp: D5 mới (gửi nền + log), D7 (chấp nhận credential cho tài khoản Google), D8 (chốt chặn role/origin), D9 (copy 429 + khóa nút, không đổi rate limit server). Các mục còn lại (F2–F14 không có câu hỏi riêng) là sửa cho khớp source.

<!-- slug: forgot-password-email-reset -->
