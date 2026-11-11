---
phase: 1
title: "Phase 1: Helper retry + xác thực redirect + redact token (TDD)"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Helper retry + xác thực redirect + redact token (TDD)

<!-- Updated: Red Team Session 1 - RT-3, RT-4, RT-5, RT-6 -->

## Goal

Xây dựng theo quy trình TDD (RED trước, GREEN sau) module thuần `apps/e2e/src/design-seed-nav.ts` và bộ kiểm thử `apps/e2e/src/design-seed-nav.test.ts` (không import `@playwright/test`) để cung cấp: che giấu capability token đầy đủ (`redactCapabilityUrl`), phân loại lỗi điều hướng/HTTP 5xx tạm thời (`isTransientNavError`, `TransientNavError`), kẹp ngân sách thời gian (`clampTimeoutMs`), retry có trễ & trần `deadline` (`withNavRetry`), và xác thực kết quả redirect email chặt chẽ (`assertVerifiedEmailRedirect`).

## Files to Create / Modify

- Create: `apps/e2e/src/design-seed-nav.test.ts`
- Create: `apps/e2e/src/design-seed-nav.ts`

## Tasks & Steps

### Task 1.1 — Viết bộ unit test RED cho `design-seed-nav`
- **Goal**: Tạo đầy đủ các ca kiểm thử hành vi cho `redactCapabilityUrl`, `isTransientNavError`, `TransientNavError`, `clampTimeoutMs`, `withNavRetry`, và `assertVerifiedEmailRedirect` trước khi có file cài đặt, xác nhận test suite fail đúng pha RED.
- **Target files and symbols**:
  - `apps/e2e/src/design-seed-nav.test.ts` (import `assertVerifiedEmailRedirect`, `clampTimeoutMs`, `isTransientNavError`, `redactCapabilityUrl`, `TransientNavError`, `withNavRetry` từ `./design-seed-nav`).
- **Steps**:
  1. Tạo file `apps/e2e/src/design-seed-nav.test.ts` dùng `node:assert/strict` và `node:test` (theo chuẩn `apps/e2e/src/fs-media-store.test.ts:1-6`, dùng tab indent + double quotes theo `biome.json`).
  2. Viết các bài `test(...)` kiểm tra đủ 8 nhóm hành vi:
     - `redactCapabilityUrl`:
       a) Che `?token=eyJ...&callbackURL=...` và `&token=abc_123` thành `?token=[redacted]` / `&token=[redacted]`, giữ nguyên `callbackURL`.
       b) Không cắt cụt giữa chừng nếu token chứa ký tự `)` ở giữa (ví dụ `?token=hdr)secret_tail&callbackURL=x` → `?token=[redacted]&callbackURL=x`), nhưng nếu chuỗi kết thúc bằng dấu đóng ngoặc của log `page.goto(http://localhost:8100/api/auth/verify-email?token=SECRET_END)` thì kết quả không làm lộ `SECRET_END`.
       c) Che cả percent-encoded `%3Ftoken%3DENC_SECRET%26a%3D1` / `%26token%3DENC_SECRET2`, đường dẫn `/api/auth/reset-password/RESET_SECRET?callbackURL=...`, `/pay/cmpPaySecret123`, và `Bearer SECRET_BEARER`.
     - `isTransientNavError` & `TransientNavError`: trả `true` cho `TransientNavError` (ví dụ HTTP 503 tạm thời), `Error` có `name = "TimeoutError"`, message chứa `"Timeout 30000ms exceeded"`, `"net::ERR_ABORTED"`, `"Navigation to http://... is interrupted by another navigation"`, `"read ECONNRESET"`, `"net::ERR_CONNECTION_RESET"`, `"socket hang up"`; trả `false` cho `"net::ERR_CONNECTION_REFUSED"`, `"connect ECONNREFUSED"`, và lỗi nghiệp vụ thường.
     - `clampTimeoutMs`: trả `min(maxMs, deadline - now() - safetyMarginMs)` khi ngân sách còn đủ; ném lỗi (đã redact `label`) khi `deadline - now() < minRemainingMs` hoặc ngân sách sau trừ `safetyMarginMs` nhỏ hơn `minRemainingMs`.
     - `withNavRetry` hồi phục sau lỗi tạm thời có `retryDelayMs`: lần 1 ném `TimeoutError` (chứa raw `?token=secret-jwt-value`), lần 2 trả `"ok"` → hàm trả `"ok"`, gọi `attemptFn` đúng 2 lần, gọi `sleep` đúng 1 lần giữa lần 1 và lần 2 với `retryDelayMs`, truyền `budgetMs = 45_000` khi `deadline` còn dư rộng.
     - `withNavRetry` dừng ngay ở lỗi không tạm thời VÀ vẫn redact `opts.label` (RT-4): truyền `label: "verify-email http://localhost:8100/api/auth/verify-email?token=LABEL_SECRET_TOKEN"`, lần 1 ném `Error("net::ERR_CONNECTION_REFUSED at http://localhost:8100")` → ném lỗi ngay sau đúng 1 lần gọi (không gọi `sleep`, không gọi lần 2), message chứa `[redacted]`, KHÔNG chứa `"LABEL_SECRET_TOKEN"`, và `err.cause === undefined`.
     - `withNavRetry` tôn trọng `deadline`: dùng đồng hồ giả `now` và `sleep` giả; khi `deadline - now()` còn `18_000ms` (`safetyMarginMs = 2_000`, `perAttemptMs = 45_000`), lần 1 nhận `timeoutMs = 16_000`; sang vòng kế khi `deadline - now()` chỉ còn `3_000ms` (`< minRemainingMs = 5_000`), helper KHÔNG gọi `attemptFn` lần 2 mà ném lỗi có ghi `skipped` trong timeline.
     - `withNavRetry` chống rò rỉ token khi hết lượt thử: cả 2 lần đều ném `TimeoutError("page.goto(http://localhost:8100/api/auth/verify-email?token=LIVE_SECRET_TOKEN&callbackURL=...)")` → lỗi ném ra có message chứa `[redacted]`, KHÔNG chứa `"LIVE_SECRET_TOKEN"`, và `err.cause === undefined`.
     - `assertVerifiedEmailRedirect` (RT-3, RT-6):
       a) Pass khi `status === 302`, `location === "http://localhost:8103/verify-email?verified=ok"`, `studentOrigin === "http://localhost:8103"`, `cookies` chứa `{ name: "__Secure-better-auth.session_token", value: "non-empty" }` (hoặc `better-auth.session_token`).
       b) Ném lỗi không tạm thời (`isTransientNavError(err) === false`) cho từng ca lệch: `status = 200`; `location = undefined` hoặc `location = null`; **relative `location = "/verify-email?verified=ok"`** (phải bị từ chối vì không có origin tuyệt đối); `location` có userinfo `http://user:pass@localhost:8103/verify-email?verified=ok`; `location` dính `&error=INVALID_TOKEN` hoặc `&error=ROLE_MISMATCH` hoặc query key lạ `&extra=1`; `location` trỏ sai origin `http://localhost:8101/verify-email?verified=ok`; thiếu `verified=ok`; `cookies` rỗng hoặc cookie `session_token` có `value: ""` (đã bị xoá); và nếu `location` lỡ chứa `?token=RAW_TOK` thì message lỗi đã redact `RAW_TOK`.
- **Success criteria**: File `apps/e2e/src/design-seed-nav.test.ts` tồn tại và lệnh test của package `e2e` fail ở pha RED do chưa có `./design-seed-nav`.
- **Verify**: Chạy `pnpm --filter e2e test`; điều kiện đạt pha RED là lệnh kết thúc với mã thoát khác `0` và output in lỗi không tìm thấy module `./design-seed-nav` (`ERR_MODULE_NOT_FOUND` hoặc `Cannot find module`); nếu lệnh thoát `0` ở bước này thì coi là thất bại.

### Task 1.2 — Cài đặt `apps/e2e/src/design-seed-nav.ts` để chuyển sang GREEN
- **Goal**: Hiện thực hóa đầy đủ `apps/e2e/src/design-seed-nav.ts` để toàn bộ unit test của `e2e` và kiểm tra kiểu TypeScript (`strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`) đều xanh.
- **Target files and symbols**:
  - `apps/e2e/src/design-seed-nav.ts`: export `redactCapabilityUrl`, `TransientNavError`, `isTransientNavError`, `DeadlineBudgetOptions`, `clampTimeoutMs`, `RetryOptions`, `withNavRetry`, `SessionCookieLike`, `VerifyEmailApiCheckInput`, `assertVerifiedEmailRedirect`.
- **Steps**:
  1. Tạo `apps/e2e/src/design-seed-nav.ts` (không import `@playwright/test`).
  2. Cài đặt `redactCapabilityUrl(input: string): string` đồng bộ với `scripts/design-compare/harness-lib.mjs:75-90`:
     - Thay `/([?&]token=)[^\s&"']+?(?=\)(?:[\s:]|$)|[\s&"']|$)/gi` bằng `"$1[redacted]"` (che trọn token kể cả khi chứa `)` ở giữa, đồng thời không nuốt dấu `)` đóng của `page.goto(...)` ở cuối URL).
     - Thay `/((?:%3f|%26)token%3d)[^\s&"'%]+(?:%(?!26|22|27)[^\s&"'%]+)*/gi` (hoặc `/((?:%3f|%26)token%3d)(?:(?!%26)[^\s&"'])+/gi`) bằng `"$1[redacted]"`.
     - Thay `/(\/api\/auth\/reset-password\/)[^?\s"'&)]+/gi` bằng `"$1[redacted]"`.
     - Thay `/(\/pay\/)[A-Za-z0-9_-]{6,}/gi` bằng `"$1[redacted]"`.
     - Thay `/((?:x-access-token:|Bearer\s+))[^\s@"')]+/gi` và `/\b(gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g` bằng `"$1[redacted]"` / `"[redacted]"`.
  3. Cài đặt `export class TransientNavError extends Error` (`this.name = "TransientNavError"`) và `isTransientNavError(err: unknown): boolean`:
     - Nếu `err instanceof TransientNavError` → trả `true`.
     - Ghép `name` và `message` nếu `err instanceof Error`, ngược lại `String(err)`.
     - Nếu khớp `/ERR_CONNECTION_REFUSED|ECONNREFUSED/i` → trả `false` ngay.
     - Trả `true` khi `err instanceof Error && err.name === "TimeoutError"` hoặc chuỗi khớp `/TimeoutError|Timeout\s+\d+ms\s+exceeded|net::ERR_ABORTED|interrupted by another navigation|ECONNRESET|net::ERR_CONNECTION_RESET|socket hang up/i`; ngược lại trả `false`.
  4. Cài đặt `clampTimeoutMs(deadline: number, maxMs: number, label: string, opts?: DeadlineBudgetOptions): number`:
     - Mặc định `minRemainingMs = 5_000`, `safetyMarginMs = 2_000`, `now = Date.now`.
     - Tính `remaining = deadline - now()`, `budgetMs = Math.min(maxMs, remaining - safetyMarginMs)`.
     - Nếu `remaining < minRemainingMs || budgetMs < minRemainingMs`, ném `new Error(\`[design-seed] \${redactCapabilityUrl(label)} vượt SEED_DEADLINE (remaining=\${remaining}ms)\`)`.
     - Trả `budgetMs`.
  5. Cài đặt `withNavRetry<T>(attemptFn: (timeoutMs: number, attempt: number) => Promise<T>, opts: RetryOptions): Promise<T>`:
     - Tính ngay ở đầu hàm: `const safeLabel = redactCapabilityUrl(opts.label);` — dùng `safeLabel` ở **mọi** nhánh `throw new Error(...)` (tuyệt đối không dùng `opts.label` thô và không truyền `{ cause }`).
     - Mặc định `attempts = 2`, `perAttemptMs = 45_000`, `minRemainingMs = 5_000`, `safetyMarginMs = 2_000`, `retryDelayMs = 500`, `now = Date.now`, `isTransient = isTransientNavError`, `sleep = (ms) => new Promise((r) => setTimeout(r, ms))`. Nếu `attempts < 1` ném `RangeError`.
     - Trong vòng `attempt = 1..attempts`:
       a) Nếu `attempt > 1 && retryDelayMs > 0`: kiểm tra `opts.deadline - now() >= retryDelayMs + minRemainingMs + safetyMarginMs`; nếu không đủ thì ghi `attempt ${attempt}: skipped (remaining=${opts.deadline - now()}ms)` rồi `break`; nếu đủ thì `await sleep(retryDelayMs)`.
       b) Kiểm tra `remaining = opts.deadline - now()`, `budgetMs = Math.min(perAttemptMs, remaining - safetyMarginMs)`. Nếu `remaining < minRemainingMs || budgetMs < minRemainingMs`, ghi `attempt ${attempt}: skipped (remaining=${remaining}ms)` vào `timeline` rồi `break`.
       c) Gọi `await attemptFn(budgetMs, attempt)` và trả kết quả nếu thành công.
       d) Trong `catch (err)`: ghi vào `timeline` chuỗi đã qua `redactCapabilityUrl` (cắt tối đa 240 ký tự). Nếu `!isTransient(err)` ném ngay `new Error(\`[design-seed] \${safeLabel} thất bại không thể retry — \${timeline.join(" -> ")}\`)`.
     - Sau vòng lặp: ném `new Error(\`[design-seed] \${safeLabel} thất bại sau \${timeline.length}/\${attempts} bước — \${timeline.join(" -> ")}\`)`.
  6. Cài đặt `assertVerifiedEmailRedirect(input: VerifyEmailApiCheckInput): void` với `VerifyEmailApiCheckInput = { status: number; location: string | null | undefined; studentOrigin: string; cookies: ReadonlyArray<SessionCookieLike> }` (`SessionCookieLike = { name: string; value: string }`):
     - Kiểm tra `input.status === 302`; nếu không khớp ném `Error` (đã redact `location`).
     - Kiểm tra `typeof input.location === "string" && input.location.length > 0`; parse `new URL(input.location)` **KHÔNG truyền base URL** trong `try/catch` (để relative URL như `"/verify-email?verified=ok"` bị từ chối fail-closed).
     - Kiểm tra `locUrl.username === "" && locUrl.password === ""`, `locUrl.origin === new URL(input.studentOrigin).origin`, `locUrl.pathname === "/verify-email"`, `locUrl.searchParams.get("verified") === "ok"`, `!locUrl.searchParams.has("error")`, và `[...locUrl.searchParams.keys()].every((k) => k === "verified")`.
     - Kiểm tra `input.cookies.some((c) => (c.name === "better-auth.session_token" || c.name === "__Secure-better-auth.session_token" || c.name.endsWith(".session_token")) && c.value.length > 0)`.
     - Mọi nhánh vi phạm ném `new Error(...)` đã qua `redactCapabilityUrl` (không phải `TransientNavError` hay `TimeoutError`).
- **Success criteria**: Toàn bộ bài kiểm thử trong `apps/e2e/src/design-seed-nav.test.ts` và `apps/e2e/src/fs-media-store.test.ts` đều pass, kiểm tra kiểu `e2e` không có lỗi.
- **Verify**: Chạy `pnpm --filter e2e test && pnpm --filter e2e check-types`; lệnh phải kết thúc với mã thoát `0` và output của `node --test` in `fail 0`.

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

## Verification

- `pnpm --filter e2e test` thoát `0` (`fail 0`).
- `pnpm --filter e2e check-types` thoát `0`.

## Todo

- [x] Task 1.1: Viết bộ unit test RED `apps/e2e/src/design-seed-nav.test.ts`
- [x] Task 1.2: Cài đặt `apps/e2e/src/design-seed-nav.ts` và pass GREEN + `check-types`

## Success Criteria

Module `apps/e2e/src/design-seed-nav.ts` hoàn chỉnh, không phụ thuộc `@playwright/test`, pass 100% unit test và typecheck nghiêm ngặt của `apps/e2e`.
