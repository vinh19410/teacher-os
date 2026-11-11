---
title: "fix(design-compare): loại bỏ goto Vite ở verify-email và thêm retry theo deadline cho design-seed (#652)"
description: "Xác thực email học viên trực tiếp qua studentCtx.request.get(verifyUrl, { maxRedirects: 0 }) + kiểm chứng get-session không chạm Vite dev, kèm withNavRetry có SEED_DEADLINE và redact capability token cho gotoStable + Step 8."
status: completed
priority: P1
effort: "2h"
issue: 652
branch: fix/652-design-seed-verify-email-retry
tags: [bugfix, e2e, design-compare, tooling]
blockedBy: []
blocks: []
created: 2026-11-11
---

# fix(design-compare): loại bỏ goto Vite ở verify-email và thêm retry theo deadline cho design-seed (#652)

## Overview

`pnpm design:compare` (`scripts/design-compare/capture.mjs:566-582`) khởi chạy `apps/e2e/scripts/design-seed.ts` (timeout tổng `420_000ms`) trên Vite **dev** server cho `web` và `student`. Ở bước 7 (`apps/e2e/scripts/design-seed.ts:552`), lệnh trần `await studentPage.goto(verifyUrl)` dùng mặc định của Playwright (`timeout: 30_000`, `waitUntil: "load"`, không retry): sau khi `boot:api` trả `302` về `${STUDENT_ORIGIN}/verify-email?verified=ok`, trình duyệt phải chờ Vite dev cold-transform module graph của `student` (trang `/verify-email` không được `warm()` tại `capture.mjs:558-563`) hoặc dính full-reload khi `optimizeDeps` chạy trên máy đang tải 4 core → nổ `TimeoutError: page.goto(...verify-email...%3Fverified%3Dok), waiting until "load"`.

Điều tra root cause (`ak-debug` + tư vấn `kongming` + Red Team 2 chiều) xác lập 5 nguyên tắc thiết kế:
1. **`design:compare` không chụp `/verify-email`**: `scripts/design-compare/screens.json:10-582` không có màn `/verify-email` nào; luồng UI `/verify-email` + nút `"Vào cổng học viên"` đã được kiểm thử E2E đầy đủ ở `apps/e2e/specs/helpers.ts:115-143`, `apps/e2e/specs/student-portal-email-verification.spec.ts:57-61`, và `apps/e2e/specs/web-email-verification.spec.ts:32-41`. Nút `"Vào cổng học viên"` (`apps/student/src/components/auth/verify-email-view.tsx:77-83`) chỉ gọi `window.location.assign("/")`, còn dòng `studentPage.waitForURL(new RegExp(\`^\${STUDENT_ORIGIN}\`))` (`apps/e2e/scripts/design-seed.ts:554`) khớp sẵn `/verify-email?verified=ok` ngay lập tức (0ms) trước khi điều hướng kịp chạy.
2. **Xác thực qua `studentCtx.request.get(verifyUrl, { maxRedirects: 0 })` + đối chiếu `GET /api/auth/get-session`**: `APIRequestContext` của `studentCtx` chia sẻ cookie jar trực tiếp với trình duyệt (đã kiểm chứng thực nghiệm với cookie `__Secure-better-auth.session_token; SameSite=None; Secure` trên `http://localhost`). Gọi GET trực tiếp tới `boot:api` với `maxRedirects: 0` hoàn tất xác thực trong vài ms mà không chạm Vite dev. Lưu ý từ `better-auth` (`email-verification.mjs:274-275`): nếu lần 1 kịp ghi `email_verified = 1` rồi đứt kết nối, lần retry thứ 2 vẫn trả `302` về `${STUDENT_ORIGIN}/verify-email?verified=ok` nhưng bỏ qua `setSessionCookie`; vì auth chạy soft-mode không bật `cookieCache`, phiên từ bước sign-up vẫn đọc `emailVerified` trực tiếp từ DB, và ta gọi tiếp `studentCtx.request.get(\`\${API_ORIGIN}/api/auth/get-session\`)` để khẳng định `user.emailVerified === true` (RT-6).
3. **Đóng `studentPage` nguyên tử để triệt tiêu điều hướng nền của `SignUpForm` (RT-1)**: Sau khi `POST /api/auth/sign-up/email` trả `200`, `SignUpForm` (`apps/student/src/components/auth/sign-up-form.tsx:50-64`) gọi tiếp `authClient.getSession()` rồi `window.location.assign("/")`. Thay vì `studentPage.goto("about:blank")` (có thể đụng lỗi `interrupted by another navigation` ngay tích tắc `window.location.assign("/")` nổ), ta đóng luôn `await studentPage.close()` ngay sau khi `POST /api/auth/sign-up/email` `200 OK` (huỷ renderer nguyên tử, giữ nguyên cookie trong `studentCtx`).
4. **Chuyển cả Bước 8 (`quiz/start`) sang `studentCtx.request.post` idempotent & ngân sách `SEED_DEADLINE` (RT-2, RT-5, Kongming Failure-Protocol counsel)**: Dưới tải cao, việc mở 4 đề qua Vite dev ở Bước 8 kích hoạt `[vite] [optimizer] bundling dependencies...` (bundle media/recorder của listening/speaking) gây full-reload giữa chừng. Vì `fixture.assignmentIds` đã có sẵn thứ tự `[0..3]` và route `POST /api/student/assignments/:id/quiz/start` idempotent, Bước 8 gọi thẳng `studentCtx.request.post` kèm `headers: { Origin: STUDENT_ORIGIN }` bên trong `withNavRetry` (`attempts: 2`, `perAttemptMs: 30_000`, `deadline: SEED_DEADLINE = seedStart + 390_000`), loại bỏ hoàn toàn phụ thuộc Vite dev ở giai đoạn seed (~100–150ms cho cả 4 đề).
5. **Chống rò rỉ capability token đồng bộ với `harness-lib.mjs` & quyền file `.state` (RT-3, RT-4, RT-7)**: `redactCapabilityUrl` che đủ `[?&]token=`, `(%3f|%26)token%3d`, `/api/auth/reset-password/<token>`, `/pay/<token>`, và `Bearer`/`ghp_`/`github_pat_`; `withNavRetry` tính `safeLabel = redactCapabilityUrl(opts.label)` ngay đầu hàm cho **mọi** nhánh ném lỗi và tuyệt đối không đính `{ cause: err }`. Khi ghi `design-seed.json` và `.state/debug`, ép quyền `0o700` cho thư mục và `0o600` cho file giống `capture.mjs:494,621,641`.

## Advisor Scope Lock (`--advice`)

- **Locked Scope**:
  - Tạo module thuần không phụ thuộc Playwright `apps/e2e/src/design-seed-nav.ts` và bộ unit test `apps/e2e/src/design-seed-nav.test.ts` (chạy qua `pnpm --filter e2e test` theo `apps/e2e/package.json:7` và kiểm kiểu qua `apps/e2e/tsconfig.json:9-15`).
  - Cập nhật `apps/e2e/scripts/design-seed.ts`: đặt `SEED_DEADLINE`, kẹp timeout qua `clampTimeoutMs`, bọc `gotoStable` bằng `withNavRetry`, đổi Step 7 sang đồng bộ `POST /api/auth/sign-up/email` → `studentPage.close()` → `withNavRetry` bọc `studentCtx.request.get(verifyUrl, { maxRedirects: 0 })` + `assertVerifiedEmailRedirect` + kiểm chứng `GET /api/auth/get-session`, đổi Step 8 sang `withNavRetry` bọc `studentCtx.request.post(.../quiz/start)` trực tiếp, ghi telemetry thời gian/retry và siết quyền `0o700`/`0o600` cho `.state` + redact debug log.
  - Cập nhật comment ngân sách timeout và log tóm tắt telemetry seed tại `scripts/design-compare/capture.mjs:576-595`.
- **Explicit Non-Goals (YAGNI)**:
  - Không sửa code production (`apps/student`, `apps/web`, `apps/server`, `packages/auth`). (Ghi chú RT-8: `apps/server/src/log-redaction.ts` chưa redact `?token=` ở stdout thô của server, nhưng `capture.mjs:132-135` và `devserver-services.mjs:119-125` đã redact toàn bộ luồng log thu thập; giữ nguyên non-goal không chạm `apps/server` trong PR này).
  - Không sửa `apps/e2e/specs/helpers.ts` (`verifyStudentEmailFromMailLog` vẫn test trang UI `/verify-email` thật trong E2E suite).
  - Không nâng trần `timeoutMs: 420_000` hay sửa `warm()` trong `scripts/design-compare/capture.mjs`.
  - Plan này tuân thủ hợp đồng bàn giao `--advice`: mỗi phase đặc tả từng task tường minh và nhúng nguyên văn khối `## Failure Protocol`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Xây dựng và kiểm thử TDD helper `design-seed-nav` (`redactCapabilityUrl`, `isTransientNavError`, `clampTimeoutMs`, `withNavRetry`, `assertVerifiedEmailRedirect`) | P1 |
| 2 | Đấu nối `design-seed.ts` (Step 7 API verify + đóng page nguyên tử, Step 8 retry phần chỉ-đọc, `SEED_DEADLINE`, quyền `.state` `0o600`/`0o700`) + kiểm chứng toàn trình | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Helper retry + xác thực redirect + redact token (TDD)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Đấu nối design-seed.ts + cập nhật chú thích capture.mjs + kiểm chứng](./phase-02-wire-design-seed-and-verify.md) | Pending |

## Success Criteria

- [x] `pnpm --filter e2e test` exit 0, bao phủ đầy đủ: `redactCapabilityUrl` (query `?token=`, percent-encoded `%3Ftoken%3D`, `/reset-password/`, `/pay/`, token chứa ký tự `)` giữa chuỗi); `isTransientNavError` (kể cả HTTP `5xx` tạm thời, loại trừ `ERR_CONNECTION_REFUSED`); `withNavRetry` (retry có trễ `retryDelayMs`, dừng ngay ở lỗi không tạm thời mà vẫn redact `opts.label`, cắt ngắn/từ chối mở lần thử theo `SEED_DEADLINE`, không gắn `Error.cause`); `clampTimeoutMs`; và `assertVerifiedEmailRedirect` (parse `Location` không base URL để chặn relative redirect, kiểm origin/pathname/query chặt, kiểm cookie có giá trị khác rỗng).
- [x] `apps/e2e/scripts/design-seed.ts` không còn `studentPage.goto(verifyUrl)` hay click `"Vào cổng học viên"`; Step 7 đóng `studentPage` sau `sign-up/email`, xác thực qua `studentCtx.request.get(verifyUrl, { maxRedirects: 0 })` + xác nhận `get-session` trả `user.emailVerified === true`; Step 8 khởi tạo 4 attempt qua `studentCtx.request.post(.../quiz/start)` trong `withNavRetry`; `.state` ghi với quyền `0o700`/`0o600`.
- [x] `pnpm check`, `pnpm check-types`, `pnpm test:design-compare`, và chạy thật `node scripts/design-compare/capture.mjs --screens s-dashboard --side app --force` đều exit 0 (`6 ảnh, 0 lỗi`, không làm bẩn file tracked).

## Validation Log

### Verification Results — 2026-11-11
- **Tier:** Light (2 phases — Fact Checker)
- **Claims checked:** 16
- **Verified:** 14 | **Failed:** 2 (đã sửa triệt để trong bản cập nhật Red Team bên dưới) | **Unverified:** 0
- **Resolved claims:**
  1. `new URL(input.location, input.studentOrigin)` cho phép relative `Location` lọt qua kiểm tra origin → đã đổi sang `new URL(input.location)` không truyền base URL (`phase-01-start.md` Task 1.2).
  2. `verifyUrl` lần 2 không phát lại `Set-Cookie` (`better-auth` `email-verification.mjs:274-275`) và `SEED_DEADLINE` chưa kẹp các bước chờ cuối → đã sửa mô tả `plan.md`, bổ sung kiểm chứng `GET /api/auth/get-session` và `clampTimeoutMs` cho toàn bộ bước 7–8 (`phase-02-wire-design-seed-and-verify.md` Task 2.1).
  3. `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md` đã xác nhận tồn tại trên đĩa bằng `glob` (`VERIFIED`).

### Whole-Plan Consistency Sweep (Validation)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-wire-design-seed-and-verify.md`
- Decision deltas checked: 7
- Reconciled stale references: 7
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-11
**Findings:** 14 thô → 8 sau gộp trùng (7 accepted, 1 rejected do thuộc non-goal đã được bọc ở tầng harness)
**Severity breakdown:** 2 Critical, 4 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `studentPage.goto("about:blank")` trần đua với `SignUpForm` `window.location.assign("/")` + `signUpResPromise` thiếu pin `API_ORIGIN`/catch (A1+S7) | Critical | Accept | `plan.md`, Phase 2 Task 2.1 (`Promise.all` + `studentPage.close()` + `studentCtx.newPage()`) |
| 2 | Dời Step 7 khỏi Vite đẩy toàn bộ cold-transform `_auth` sang Step 8 chưa có retry (A2) | Critical | Accept | `plan.md`, Phase 2 Task 2.1 (bọc đoạn điều hướng chỉ-đọc tới `startDialog` của Step 8 bằng `withNavRetry`) |
| 3 | `new URL(input.location, input.studentOrigin)` cho phép relative `Location` vượt qua kiểm tra cross-origin + kiểu `location: string \| null \| undefined` (S1+A6) | High | Accept | `plan.md`, Phase 1 Task 1.1 & 1.2 (`new URL(input.location)` không base URL, cấm userinfo & query lạ) |
| 4 | `redactCapabilityUrl` thiếu `%3Ftoken%3D`/`/reset-password/`/`/pay/`, cắt sớm ở `)` giữa token, và `withNavRetry` quên redact `opts.label` ở nhánh `!isTransient` (S2+S3+A3) | High | Accept | `plan.md`, Phase 1 Task 1.1 & 1.2 (`safeLabel` ngay đầu hàm + bộ regex đồng bộ `harness-lib.mjs`) |
| 5 | `SEED_DEADLINE` chưa kẹp `networkidle`, `readVerificationUrl`, `signUpResPromise`, và `waitForResponse` ở Step 8 (A4+S8) | High | Accept | `plan.md`, Phase 1 (`clampTimeoutMs`), Phase 2 Task 2.1 & chú thích `capture.mjs` |
| 6 | Retry `0ms` backoff, HTTP `5xx` bị coi là lỗi cứng, và kiểm tra tên cookie đơn thuần bị dương tính giả từ cookie sign-up (A5+S4) | High | Accept | `plan.md`, Phase 1 (`retryDelayMs` + `TransientHttpError` / HTTP 5xx + kiểm tra `cookie.value`), Phase 2 (`GET /api/auth/get-session` xác nhận `emailVerified === true`) |
| 7 | `design-seed.ts` ghi `.state/design-seed.json` & `.state/debug` thiếu mode `0o600`/`0o700` và log debug chưa redact (S6) | Medium | Accept | `plan.md`, Phase 2 Task 2.1 |
| 8 | `apps/server/src/log-redaction.ts` chưa redact `?token=` trên stdout thô của server (S5) | High | Reject | Ngoài phạm vi non-goal (không sửa `apps/server`); `capture.mjs:132-135` và `devserver-services.mjs:119-125` đã redact ở bộ thu log harness |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-wire-design-seed-and-verify.md`
- Decision deltas checked: 7 (`about:blank` → `studentPage.close()`, Step 8 read-only retry, base-less `new URL(input.location)`, `safeLabel` + full capability redaction, `clampTimeoutMs`, `retryDelayMs` + HTTP 5xx + `get-session` check, `.state` `0o600`/`0o700`)
- Reconciled stale references: 7 (đã xoá sạch mọi tham chiếu `about:blank`, `new URL(input.location, input.studentOrigin)`, và `cookieNames` thuần tên trên cả 3 file)
- Unresolved contradictions: 0

<!-- slug: 652-design-seed-verify-email-retry -->
