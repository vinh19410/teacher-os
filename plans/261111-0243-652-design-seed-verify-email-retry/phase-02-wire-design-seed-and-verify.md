---
phase: 2
title: "Phase 2: Đấu nối design-seed.ts + cập nhật chú thích capture.mjs + kiểm chứng"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Đấu nối design-seed.ts + cập nhật chú thích capture.mjs + kiểm chứng

<!-- Updated: Red Team Session 1 - RT-1, RT-2, RT-5, RT-6, RT-7 -->

## Goal

Đấu nối `withNavRetry`, `clampTimeoutMs`, `TransientNavError`, `redactCapabilityUrl`, và `assertVerifiedEmailRedirect` vào `apps/e2e/scripts/design-seed.ts` với `SEED_DEADLINE` chung (390s < trần 420s của `capture.mjs`), chuyển bước xác thực email học viên sang gọi API trực tiếp + xác nhận `get-session` sau khi đóng `studentPage` nguyên tử, bọc retry cho phần điều hướng chỉ-đọc của Bước 8, siết quyền `0o700`/`0o600` cho `.state`, cập nhật chú thích `scripts/design-compare/capture.mjs`, và chứng minh qua toàn bộ gate + một lượt chạy thật `capture.mjs --screens s-dashboard --side app --force`.

## Files to Create / Modify

- Modify: `apps/e2e/scripts/design-seed.ts`
- Modify: `scripts/design-compare/capture.mjs`

## Tasks & Steps

### Task 2.1 — Đấu nối `SEED_DEADLINE`, `gotoStable`, Step 7 (API verify + `studentPage.close()`), Step 8 (retry điều hướng chỉ-đọc), và quyền `.state` trong `design-seed.ts` + cập nhật chú thích `capture.mjs`
- **Goal**: Loại bỏ hoàn toàn `studentPage.goto(verifyUrl)` (điểm nghẽn Vite cold-transform ở dòng 552), triệt tiêu đua điều hướng nền từ `SignUpForm`, bảo vệ cả `gotoStable` lẫn cold-transform Bước 8 bằng `withNavRetry` theo `SEED_DEADLINE`, và đồng bộ bảo mật file `.state` + redact debug log.
- **Target files and symbols**:
  - `apps/e2e/scripts/design-seed.ts` (`SEED_DEADLINE`, `gotoStable` tại dòng 42–52, `readVerificationUrl` tại dòng 54–80, Step 7 tại dòng 525–556, Step 8 tại dòng 558–592, ghi `OUT_FILE` tại dòng 597–625).
  - `scripts/design-compare/capture.mjs` (chú thích ngân sách timeout seed tại dòng 576–579).
- **Steps**:
  1. Trong `apps/e2e/scripts/design-seed.ts`:
     - Import thêm `chmodSync` từ `"node:fs"` và import `{ assertVerifiedEmailRedirect, clampTimeoutMs, redactCapabilityUrl, TransientNavError, withNavRetry }` từ `"../src/design-seed-nav"`.
     - Khai báo `const SEED_DEADLINE = Date.now() + 390_000;` ngay đầu module (trước `gotoStable`).
     - Cập nhật `gotoStable(page: Page, url: string, opts?: { attempts?: number; perAttemptMs?: number })`:
       a) Bọc `page.goto` bằng `await withNavRetry((timeoutMs) => page.goto(url, { waitUntil: "load", timeout: timeoutMs }), { label: \`gotoStable \${url}\`, attempts: opts?.attempts ?? 2, perAttemptMs: opts?.perAttemptMs ?? 45_000, deadline: SEED_DEADLINE });`.
       b) Kẹp `networkidle` theo ngân sách còn lại: nếu `SEED_DEADLINE - Date.now() > 7_000`, chờ `page.waitForLoadState("networkidle", { timeout: Math.min(8_000, Math.max(1_000, SEED_DEADLINE - Date.now() - 6_000)) })` (bắt lỗi bỏ qua như cũ), rồi chờ `800ms`.
     - Cập nhật `readVerificationUrl(email: string)`: trong vòng lặp poll `.mail-log.jsonl`, kiểm tra `clampTimeoutMs(SEED_DEADLINE, 20_000, "readVerificationUrl")` để dừng sớm với thông báo rõ nếu đã sát `SEED_DEADLINE`.
     - Ở Step 7 (`// 7) Student auth thật: signup portal + verify qua mail log.`):
       a) Trong khối `catch (err)` của `studentPage.click("#tab-signup")`: tạo thư mục `dbg` với `{ recursive: true, mode: 0o700 }` + `chmodSync(dbg, 0o700)`, chụp `student-login.png` kèm `chmodSync(..., 0o600)`, và bọc cả `studentPage.url()` lẫn `(await studentPage.content()).slice(0, 600)` qua `redactCapabilityUrl(...)` trước khi in `console.error`.
       b) Sau khi điền `#signup-name`, `#signup-email`, `#signup-password`: tính `const signUpTimeout = clampTimeoutMs(SEED_DEADLINE, 30_000, "student sign-up");`, khởi tạo `const signUpResPromise = studentPage.waitForResponse((r) => { const u = new URL(r.url()); return r.request().method() === "POST" && u.origin === API_ORIGIN && u.pathname === "/api/auth/sign-up/email"; }, { timeout: signUpTimeout });`, đính `signUpResPromise.catch(() => {});` chống unhandled rejection nếu `click()` ném lỗi trước, rồi chạy `const [signUpRes] = await Promise.all([signUpResPromise, studentPage.getByRole("button", { name: "Tạo tài khoản" }).click({ timeout: signUpTimeout })]);`. Nếu `!signUpRes.ok()` ném `new Error(\`[design-seed] student sign-up thất bại: HTTP \${signUpRes.status()}\`)`.
       c) Đóng ngay `await studentPage.close();` để huỷ nguyên tử renderer của `/login` (chặn tuyệt đối `SignUpForm` chạy `authClient.getSession() -> window.location.assign("/")` ở nền mà không có bất kỳ race `goto("about:blank")` nào — RT-1).
       d) Đọc `const verifyUrl = await readVerificationUrl(studentEmail);`.
       e) Thay hoàn toàn cụm `studentPage.goto(verifyUrl)` + click `"Vào cổng học viên"` + `waitForURL` bằng:
          - `await withNavRetry(async (timeoutMs) => { const res = await studentCtx.request.get(verifyUrl, { maxRedirects: 0, timeout: timeoutMs }); if (res.status() >= 500) { throw new TransientNavError(\`verify-email HTTP \${res.status()}\`); } const cookies = await studentCtx.cookies(API_ORIGIN); assertVerifiedEmailRedirect({ status: res.status(), location: res.headers().location, studentOrigin: STUDENT_ORIGIN, cookies }); const sessRes = await studentCtx.request.get(\`\${API_ORIGIN}/api/auth/get-session\`, { timeout: clampTimeoutMs(SEED_DEADLINE, 15_000, "student get-session") }); if (sessRes.status() >= 500) { throw new TransientNavError(\`get-session HTTP \${sessRes.status()}\`); } if (!sessRes.ok()) { throw new Error(\`get-session HTTP \${sessRes.status()}\`); } const sessBody = (await sessRes.json()) as { user?: { emailVerified?: boolean } } | null; if (sessBody?.user?.emailVerified !== true) { throw new Error("student session chưa có emailVerified=true sau verify-email"); } }, { label: \`verify-email \${verifyUrl}\`, attempts: 2, perAttemptMs: 30_000, deadline: SEED_DEADLINE });`.
     - Ở Step 8 (`// 8) Student bắt đầu 4 đề...` — cập nhật theo tư vấn `kongming` sau load test):
       a) Duyệt `quizTargets = [["reading", 0], ["listening", 1], ["writing", 2], ["speaking", 3]] as const` lấy `assignmentId = fixture.assignmentIds[idx]`.
       b) Gọi trực tiếp `studentCtx.request.post(\`\${API_ORIGIN}/api/student/assignments/\${encodeURIComponent(assignmentId)}/quiz/start\`, { data: {}, headers: { Origin: STUDENT_ORIGIN }, timeout: timeoutMs, maxRedirects: 0 })` bên trong `withNavRetry` (`attempts: 2`, `perAttemptMs: 30_000`, `deadline: SEED_DEADLINE`, ném `TransientNavError` nếu HTTP `>= 500`), loại bỏ hoàn toàn phụ thuộc Vite optimizer reload ở giai đoạn seed.
     - Khi ghi `OUT_FILE` (`design-seed.json`): tạo thư mục cha với `{ recursive: true, mode: 0o700 }` + `chmodSync(path.dirname(OUT_FILE), 0o700)`, ghi `writeFileSync(OUT_FILE, ..., { mode: 0o600 })` + `chmodSync(OUT_FILE, 0o600)`.
  2. Trong `scripts/design-compare/capture.mjs` (dòng 576–579): cập nhật comment giải thích `timeoutMs: 420_000` giữ khoảng đệm 30s trên `SEED_DEADLINE` (`390_000ms`) của `design-seed.ts` để các bước điều hướng/xác thực của seed kịp fail-loud với timeline đã redact trước khi harness gửi SIGTERM.
  3. Chạy `pnpm check:fix` nếu cần để đồng bộ định dạng Biome.
- **Success criteria**: `design-seed.ts` không còn `studentPage.goto(verifyUrl)`, không còn click `"Vào cổng học viên"`, đóng `studentPage` nguyên tử sau sign-up, kiểm chứng `emailVerified === true` qua `get-session`, kẹp `SEED_DEADLINE` xuyên suốt Step 7–8, và pass toàn bộ kiểm tra tĩnh + unit test.
- **Verify**: Chạy `pnpm exec biome check apps/e2e/src/design-seed-nav.ts apps/e2e/src/design-seed-nav.test.ts apps/e2e/scripts/design-seed.ts scripts/design-compare/capture.mjs && pnpm --filter e2e test && pnpm --filter e2e check-types && pnpm test:design-compare`; lệnh phải kết thúc với mã thoát `0`.

### Task 2.2 — Kiểm chứng thực tế bằng harness `capture.mjs` (end-to-end seed + student sign-in + chụp màn) và gate toàn repo
- **Goal**: Chạy thật `scripts/design-compare/capture.mjs` với `--screens s-dashboard --side app --force` (boot thật API + Vite dev `web` + Vite dev `student`, chạy `design-seed.ts` từ đầu tới cuối, đăng nhập student và chụp 6 tổ hợp viewport×theme vào `.state/raw` git-ignored mà không ghi bẩn thư mục tracked), sau đó chạy full gate `pnpm exec biome check .` và `pnpm check-types`.
- **Target files and symbols**:
  - Thực thi kiểm chứng trên `scripts/design-compare/capture.mjs`, `apps/e2e/scripts/design-seed.ts`, và kiểm tra quyền `0o600` của `scripts/design-compare/.state/design-seed.json` (không tạo/sửa thêm file mã nguồn).
- **Steps**:
  1. Chạy `node scripts/design-compare/capture.mjs --screens s-dashboard --side app --force`.
  2. Kiểm tra output in `[harness] seed xong` và `[harness] xong: 6 ảnh, 0 lỗi`, mã thoát `0`, và quyền file `scripts/design-compare/.state/design-seed.json` là `600`.
  3. Chạy gate toàn repo: `pnpm exec biome check .` và `pnpm check-types`.
  4. Kiểm tra `git status --short` để xác nhận chỉ có các file thuộc phạm vi task và thư mục plan `plans/261111-0243-652-design-seed-verify-email-retry/`.
- **Success criteria**: Lượt chạy thật `capture.mjs --screens s-dashboard --side app --force` thoát `0` với `6 ảnh, 0 lỗi`, `design-seed.json` có mode `600`, `pnpm exec biome check .` và `pnpm check-types` đều thoát `0`.
- **Verify**: `node scripts/design-compare/capture.mjs --screens s-dashboard --side app --force && stat -c "%a" scripts/design-compare/.state/design-seed.json` thoát `0` và dòng cuối in `600`; `pnpm exec biome check . && pnpm check-types` thoát `0`.

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

- `pnpm --filter e2e test` thoát `0`.
- `pnpm test:design-compare` thoát `0`.
- `node scripts/design-compare/capture.mjs --screens s-dashboard --side app --force` thoát `0` và in `6 ảnh, 0 lỗi`.
- `stat -c "%a" scripts/design-compare/.state/design-seed.json` in `600`.
- `pnpm exec biome check .` và `pnpm check-types` thoát `0`.

## Todo

- [x] Task 2.1: Đấu nối `SEED_DEADLINE`, `gotoStable`, Step 7 API verify + `studentPage.close()`, Step 8 retry, và quyền `.state` trong `design-seed.ts` + cập nhật chú thích `capture.mjs`
- [x] Task 2.2: Chạy thực tế `capture.mjs --screens s-dashboard --side app --force` + kiểm tra mode `600` + full gate `biome check` & `check-types`

## Success Criteria

`design-seed.ts` vượt qua bước xác thực email mà không phụ thuộc Vite dev cold-transform, mọi bước điều hướng chỉ-đọc ở Step 7–8 có retry theo `SEED_DEADLINE`, `.state/design-seed.json` đạt mode `600`, và toàn bộ gate (`e2e` unit test, `test:design-compare`, live `capture.mjs --screens s-dashboard --side app --force`, `biome check`, `check-types`) đều xanh.
