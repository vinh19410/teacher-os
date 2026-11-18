---
title: "Gỡ bỏ đăng nhập bằng mã email (Email OTP) trên cổng học viên"
description: "Loại bỏ tùy chọn đăng nhập bằng mã OTP qua email ở cả frontend (apps/student) lẫn backend (packages/auth), khôi phục giao diện đăng nhập cổng học viên còn 2 tab Đăng nhập (mật khẩu) và Đăng ký."
status: completed
priority: P1
effort: "2h"
tags: [auth, student, email-otp, cleanup, better-auth]
created: 2026-11-17
---

# Plan: Gỡ bỏ đăng nhập bằng mã email (Email OTP) trên cổng học viên

## Overview

Hiện tại trang đăng nhập cổng học viên (`apps/student/src/routes/login.tsx`) có 3 tab (`Mã email`, `Mật khẩu`, `Đăng ký`) với tab mặc định là `Mã email` (`OtpSignInForm`), cùng plugin `emailOTP` ở `packages/auth/src/index.ts`.

Theo yêu cầu mới (và xác nhận phạm vi gỡ cả UI lẫn backend):
- Bỏ hoàn toàn tùy chọn đăng nhập bằng mã email (gỡ cả UI ở `apps/student` lẫn backend `emailOTP` plugin/endpoints/template ở `packages/auth`).
- Khôi phục giao diện cổng học viên chỉ còn **2 tab**: **Đăng nhập** (`id="tab-signin"`, form email + mật khẩu cũ) và **Đăng ký** (`id="tab-signup"`, form đăng ký), giữ nguyên nút tiếp tục với Google OAuth và liên kết quên mật khẩu.
- Bổ sung thông báo tiếng Việt thân thiện khi đăng ký email đã tồn tại (`USER_ALREADY_EXISTS`), hướng dẫn người dùng (bao gồm tài khoản từng dùng OTP trước đây chưa đặt mật khẩu) chuyển sang `Đăng nhập` hoặc `Quên mật khẩu?`.

## Advisor Scope Lock & Non-goals

- **Locked Scope:**
  - Gỡ plugin `emailOTP`, cooldown hook OTP, `BLOCKED_EMAIL_OTP_PATHS`, helper `getUserByEmail`/`checkAndUpdateCooldown`, và `otpEmailTemplate` khỏi `packages/auth`.
  - Gỡ `OtpSignInForm`, tab `Mã email`, `emailOTPClient` khỏi `apps/student`, đưa `AuthTabs` và `/login` về 2 tab `Đăng nhập` / `Đăng ký` với tab mặc định là `signin`.
  - Chuyển đổi test tích hợp `student-auth-otp.test.ts` sang luồng `sign-up/email` + `verify-email` (`student-auth-provisioning.test.ts`) và mở rộng test xác nhận toàn bộ 9 route OTP trả về `404`.
  - Đồng bộ tài liệu đặc tả trong `docs/auth-signin/` (và `docs/auth-student-signup/` nếu có tham chiếu OTP) ở bước Docs Sync của pipeline beta.
- **Explicit Non-Goals:**
  - Không thay đổi luồng đăng nhập của `apps/web` (giáo viên) và `apps/admin` (quản trị).
  - Không xóa cơ chế `maybeProvisionVerifiedStudent` / `provisionStudentForUser` (#716) vốn dùng chung cho đăng ký email+mật khẩu (`afterEmailVerification`) và Google OAuth.
  - Không xóa `userName` trim/fallback và `validateUpdateUserImage` sanitization trong `databaseHooks.user.create.before` của `packages/auth/src/index.ts`.
  - Không chạy full E2E suite ở local (tuân thủ `AGENTS.md`).

## Docs Impact

- Cập nhật `docs/auth-signin/` (và `docs/auth-student-signup/` nếu liên quan) trong bước `/ak-docs update` (vì mode `--beta` không chạy docs trong `/ak-ship beta`) để gỡ bỏ mô tả phương thức Email OTP / endpoint `/api/auth/email-otp/*` & `/api/auth/sign-in/email-otp`.

## Operational Note (Legacy OTP-only Accounts)

- Tài khoản học viên từng tạo thuần qua Email OTP (nếu có trên staging/prod) có `user` (`emailVerified = true`) nhưng chưa có `account` (`providerId = "credential"`). Sau khi bỏ OTP, nhóm này đặt mật khẩu lần đầu qua `/forgot-password` (`reset-password` tạo `credential` mới). Map lỗi `USER_ALREADY_EXISTS` sang tiếng Việt trên form đăng ký giúp hướng dẫn người dùng rõ ràng thay vì hiện lỗi tiếng Anh.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Đóng hoàn toàn các endpoint Email OTP (toàn bộ 9 path trả `404`) và xóa template OTP ở `packages/auth`, đồng thời giữ nguyên lớp test tích hợp provisioning (#716) qua `sign-up/email` + `verify-email` | P1 |
| 2 | Khôi phục `/login` ở `apps/student` chỉ còn 2 tab `Đăng nhập` / `Đăng ký`, fallback an toàn từ `localStorage` giá trị `"otp"` cũ về `"signin"`, map lỗi `USER_ALREADY_EXISTS` sang tiếng Việt | P1 |
| 3 | Vượt qua toàn bộ unit tests (`@teacher-os/auth`, `server`, `student`), `pnpm check-types`, `pnpm exec biome check .` | P1 |

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | Backend: Gỡ Email OTP plugin & bảo toàn test tích hợp `createAuth` → `/api/student/me` | [phase-01-start.md](./phase-01-start.md) | Done |
| 2 | Frontend & Gates: Khôi phục 2 tab Đăng nhập / Đăng ký ở `apps/student` và chạy full quality gates | [phase-02-student-login-ui.md](./phase-02-student-login-ui.md) | Done |

## Acceptance Criteria

- [x] `packages/auth/src/index.ts` không còn import hoặc cấu hình `emailOTP`, `otpEmailTemplate`, `checkAndUpdateCooldown`, `BLOCKED_EMAIL_OTP_PATHS`.
- [x] Toàn bộ 9 endpoint OTP (`/api/auth/email-otp/send-verification-otp`, `/api/auth/sign-in/email-otp`, `/api/auth/email-otp/request-password-reset`, `/api/auth/email-otp/reset-password`, `/api/auth/forget-password/email-otp`, `/api/auth/email-otp/change-email`, `/api/auth/email-otp/request-email-change`, `/api/auth/email-otp/verify-email`, `/api/auth/email-otp/check-verification-otp`) trả về HTTP `404` với cả `studentOrigin`, `teacherOrigin`, và request không có `Origin`.
- [x] `packages/auth/src/mail/otp-email-template.ts` và `packages/auth/src/auth-email-otp.test.ts` được xóa sạch; `apps/server/src/routes/student-auth-otp.test.ts` được chuyển đổi thành `apps/server/src/routes/student-auth-provisioning.test.ts` dùng `sign-up/email` + `verify-email` để kiểm chứng end-to-end Trường hợp A/B/C qua `/api/student/me`.
- [x] `apps/student/src/components/auth/auth-tabs.tsx` chỉ render 2 tab: `Đăng nhập` (`#tab-signin`) và `Đăng ký` (`#tab-signup`) với `grid-cols-2`.
- [x] `apps/student/src/routes/login.tsx` mặc định mở tab `signin`, tự động fallback về `signin` nếu `localStorage` còn lưu `"otp"`, không render `OtpSignInForm` hay `#panel-otp`.
- [x] `apps/student/src/components/auth/otp-sign-in-form.tsx` và `otp-sign-in-form.test.tsx` được xóa; `apps/student/src/lib/auth-client.ts` không còn `emailOTPClient`.
- [x] `apps/student/src/lib/auth-error.ts` map lỗi `USER_ALREADY_EXISTS` sang thông báo tiếng Việt hướng dẫn chuyển tab `Đăng nhập` hoặc `Quên mật khẩu?`.
- [x] `pnpm --filter @teacher-os/auth test`, `pnpm --filter server test`, `pnpm --filter student test`, `pnpm check-types`, và `pnpm exec biome check .` đều pass 100%.

## Validation Log

### Verification Results (Light Tier — Fact Checker)
- **Tier:** Light
- **Claims checked:** 10
- **Verified:** 10 | **Failed:** 0 | **Unverified:** 0
- Đã đối chiếu trực tiếp: `apps/student/vitest.config.ts:20`, `apps/student/test/login.test.tsx:1-20`, `apps/student/test/reset-password-routes.test.tsx:18-46`, `apps/student/src/routes/login.tsx`, `apps/student/src/components/auth/auth-tabs.tsx`, `apps/student/src/lib/auth-client.ts`, `apps/student/src/lib/auth-error.ts`, `packages/auth/src/index.ts`, `packages/auth/src/auth-verification-email.test.ts`, `apps/server/src/routes/student-auth-otp.test.ts`.

## Red Team Review

### Session — 2026-11-17
**Reviewers:** Security Adversary + Assumption Destroyer (2 parallel `code-reviewer` agents)
**Findings:** 7 unique findings after deduplication (7 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 4 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `login.test.tsx` dùng `node` env & sai mock router (`Route.options.component`) | Critical | Accept | Phase 2 (tách `apps/student/test/login-route.test.tsx` với `// @vitest-environment jsdom` + mock `createFileRoute`/`sonner`) |
| 2 | Chỉ test 404 cho 2/9 endpoint OTP trong `BLOCKED_EMAIL_OTP_PATHS` | High | Accept | Phase 1 (assert `404` cho toàn bộ 9 path OTP qua các origin & không có `Origin`) |
| 3 | Lệnh `grep` ở Task 2.3 tự mâu thuẫn với assertion `not.toContain("tab-otp")` trong test | High | Accept | Phase 2 (giới hạn `grep` vào `apps/*/src packages/*/src` và loại trừ `*.test.*`) |
| 4 | Tài khoản từng dùng OTP (0 `account` rows) gặp lỗi tiếng Anh `USER_ALREADY_EXISTS` nếu bấm Đăng ký | High | Accept | Plan + Phase 2 (map `USER_ALREADY_EXISTS` sang tiếng Việt gợi ý `Đăng nhập` / `Quên mật khẩu?` + ghi chú vận hành) |
| 5 | Xóa `student-auth-otp.test.ts` làm mất test tích hợp `createAuth` → `getSessionUser` → `/api/student/me` | High | Accept | Phase 1 (chuyển đổi sang `student-auth-provisioning.test.ts` dùng `sign-up/email` + `verify-email`) |
| 6 | Xóa trim/fallback `userName` trong `user.create.before` mở khe hở `user.name` trắng | Medium | Accept | Phase 1 (giữ nguyên `userName` trim/fallback và `validateUpdateUserImage`, chỉ bỏ comment `#578`) |
| 7 | Thiếu phạm vi cập nhật tài liệu `docs/auth-signin/` | Medium | Accept | Plan `## Docs Impact` (xử lý ở bước `/ak-docs update` trong pipeline beta) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-student-login-ui.md`
- Decision deltas checked: 7
- Reconciled stale references: 7 (đồng bộ danh sách files xóa/chuyển đổi, 9 endpoint 404, tách `login-route.test.tsx`, `auth-error.ts`, giữ `userName` trim/fallback, scope lệnh `grep`)
- Unresolved contradictions: 0

<!-- slug: remove-student-email-otp -->
