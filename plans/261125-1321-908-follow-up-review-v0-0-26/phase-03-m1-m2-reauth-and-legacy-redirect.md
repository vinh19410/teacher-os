---
phase: 3
title: "Phase 3: M1 & M2 — Bounded Reauth Sign-Out and Legacy Login ReturnUrl Rewrite"
status: completed
priority: P2
effort: 1.5h
dependencies: []
---

# Phase 3: M1 & M2 — Bounded Reauth Sign-Out and Legacy Login ReturnUrl Rewrite

## Goal

(M1) Đảm bảo `reauth()` ở cả 3 ứng dụng (`web`, `student`, `admin`) gọi `authClient.signOut()` đồng bộ rồi chờ hoàn tất với giới hạn timeout 2000ms (kèm `reauthEpoch` chống bfcache ghost-redirect và `clearTimeout` trong `finally`) trước khi điều hướng sang `/login?returnUrl=...`; và (M2) giữ nguyên deep-link `returnUrl` (bảo toàn `%26`/`%23`/`%25`) khi redirect 301 từ `/login` của các host legacy sang `lms.<domain>/login`, đồng thời loại bỏ `returnUrl` độc hại/open-redirect khỏi phản hồi 301.

## Files to Create / Modify

- Modify: `apps/web/src/lib/reauth.ts`
- Modify: `apps/web/src/lib/reauth.test.ts`
- Modify: `apps/web/src/lib/query-client.test.ts`
- Modify: `apps/student/src/lib/query-client.ts`
- Modify: `apps/student/test/wrong-role-redirect.test.ts`
- Modify: `apps/student/test/student-org-recovery.test.ts`
- Modify: `apps/admin/src/lib/query-client.ts`
- Modify: `apps/admin/src/lib/query-client.test.ts`
- Modify: `apps/lms/src/legacy-redirect.ts`
- Modify: `apps/lms/src/legacy-redirect.test.ts`

## Tests Before (TDD Red Phase)

### Task 3.1 — Viết failing tests cho M1 (`reauth()` ordering + timeout + bfcache cancel) và M2 (legacy `returnUrl` prefix rewrite + encoding preservation)
<!-- Updated: Red Team Session 1 - include percent-encoded query/hash cases (%26, %23, %25) and double-encoded invalid URI (%2Fclasses%25E0%25A4%25A), strip malicious returnUrl on 301, and add bfcache cancellation test -->
- **Goal:** Tạo test chứng minh mã cũ gọi `window.location.assign` trước khi `signOut()` settle và rơi deep-link `returnUrl` khi redirect 301 từ legacy `/login`.
- **Target files and symbols:**
  - `apps/web/src/lib/reauth.test.ts`
  - `apps/admin/src/lib/query-client.test.ts`
  - `apps/student/test/wrong-role-redirect.test.ts`
  - `apps/lms/src/legacy-redirect.test.ts`
- **Steps:**
  1. Trong `apps/web/src/lib/reauth.test.ts`, thêm các test case (reset state bằng `resetReauthForTests()` trong `beforeEach`):
     - Deferred Promise: gọi `reauth()`, assert `expect(signOutMock).toHaveBeenCalledTimes(1)` đồng bộ và `expect(assign).not.toHaveBeenCalled()`, resolve `signOut`, rồi `await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1))`.
     - Timeout fallback: với `vi.useFakeTimers()` và `signOutMock` treo vĩnh viễn, assert chưa gọi `assign` ở 1999ms, `await vi.advanceTimersByTimeAsync(2_000)` -> `assign` được gọi đúng 1 lần.
     - Reject fallback: `signOutMock` reject -> `assign` vẫn được gọi đúng 1 lần.
  2. Trong `apps/admin/src/lib/query-client.test.ts` và `apps/student/test/wrong-role-redirect.test.ts`, thêm test chứng minh `signOut` được gọi đồng bộ nhưng `assign` chưa chạy trước khi `signOut()` settle, và chạy sau khi settle / timeout 2000ms / reject (và test `pageshow` `persisted: true` hủy continuation cũ của `reauth()` đang treo để không gây ghost-redirect).
  3. Trong `apps/lms/src/legacy-redirect.test.ts`, thêm test cases:
     - `https://app.msmy.io.vn/login?returnUrl=/classes` -> `https://lms.msmy.io.vn/login?returnUrl=%2Fteacher%2Fclasses`
     - `https://app.msmy.io.vn/login?returnUrl=%2Fclasses%2Fc-1%3Ftab%3Dstudents%23roster&tab=signin` -> `returnUrl` thành `/teacher/classes/c-1?tab=students#roster`, giữ `tab=signin`
     - Bảo toàn percent-encoding trong query/hash: `https://app.msmy.io.vn/login?returnUrl=%2Fstudents%3Fq%3Da%2526b%2523c%26p%3D100%2525` -> `returnUrl` giải mã 1 lần ra đúng `"/teacher/students?q=a%26b%23c&p=100%25"` (không bị bung `&`/`#` hay fail `URIError`)
     - `https://app.msmy.io.vn/login?returnUrl=/` -> `returnUrl=%2Fteacher`
     - `https://app.msmy.io.vn/login?returnUrl=/students` -> `returnUrl=%2Fteacher%2Fstudents` (ranh giới segment: không nhầm với `/student`!)
     - `https://app.msmy.io.vn/login/?returnUrl=/classes` -> `https://lms.msmy.io.vn/login/?returnUrl=%2Fteacher%2Fclasses`
     - `https://teacheros.io.vn/login?returnUrl=/grading` -> `https://lms.msmy.io.vn/login?returnUrl=%2Fteacher%2Fgrading`
     - `https://student.msmy.io.vn/login?returnUrl=/schedule?week=2` -> `returnUrl=%2Fstudent%2Fschedule%3Fweek%3D2`
     - `https://admin.msmy.io.vn/login?returnUrl=/library/tests?page=2` -> `returnUrl=%2Fadmin%2Flibrary%2Ftests%3Fpage%3D2`
     - Không double-prefix & không phá prefix cổng khác/pay/auth: `returnUrl=%2Fteacher%2Fclasses`, `returnUrl=%2Fstudent%2Fclasses`, `returnUrl=%2Fadmin%2Flibrary`, `returnUrl=%2Fpay%2Ftok-1`, `returnUrl=%2Flogin` đều giữ nguyên `search` gốc.
     - Loại bỏ `returnUrl` độc hại / malformed khỏi 301 (giữ lại các query param hợp lệ khác nếu có): `https://evil.com`, `//evil.com`, `/\evil.com`, `%2F%2Fevil.com`, `%0d%0a/classes`, `javascript:alert(1)`, `%2Fclasses%25E0%25A4%25A` (double-encoded invalid UTF-8) -> không bao giờ ghép `/teacher` và không phản xạ `returnUrl` độc hại trong `Location`.
     - `www.lms.msmy.io.vn/login?returnUrl=/classes` -> giữ nguyên không rewrite.
- **Success criteria:** Các test mới thất bại đúng với lỗi cũ (assign bị gọi đồng bộ trước `signOut` resolve; `legacy-redirect` trả `returnUrl=/classes` thiếu prefix).
- **Verify:** `pnpm --filter lms exec vitest run src/legacy-redirect.test.ts` exits non-zero with assertion failure (expecting `%2Fteacher%2Fclasses`); passing test is a failure.

## Tasks & Steps

### Task 3.2 — Sửa `reauth()` gọi `signOut()` đồng bộ và chờ settle có timeout 2000ms + `reauthEpoch` tại `web`, `student`, `admin`
<!-- Updated: Red Team Session 1 - call authClient.signOut() synchronously inside try/catch; add reauthEpoch + activeTimer cancellation on pageshow(persisted)/pagehide; export resetReauthForTests() and guard window.addEventListener in apps/web/src/lib/reauth.ts -->
- **Goal:** Gọi `authClient.signOut()` đồng bộ rồi chờ settle (hoặc timeout 2000ms / lỗi) trước khi `window.location.assign(targetUrl)`, bảo toàn chữ ký `reauth(): void`, single-flight và chống bfcache ghost-redirect.
- **Target files and symbols:**
  - `apps/web/src/lib/reauth.ts` (`reauth`, `resetReauthForTests`, `REAUTH_SIGNOUT_TIMEOUT_MS = 2_000`)
  - `apps/student/src/lib/query-client.ts` (`reauth`, `resetRedirectGuardsForTests`, `REAUTH_SIGNOUT_TIMEOUT_MS = 2_000`)
  - `apps/admin/src/lib/query-client.ts` (`reauth`, `REAUTH_SIGNOUT_TIMEOUT_MS = 2_000`)
  - `apps/web/src/lib/reauth.test.ts`, `apps/web/src/lib/query-client.test.ts`, `apps/admin/src/lib/query-client.test.ts`, `apps/student/test/wrong-role-redirect.test.ts`, `apps/student/test/student-org-recovery.test.ts`
- **Steps:**
  1. Ở cả 3 file, quản lý trạng thái bằng:
     - `let started = false;` (hoặc `reauthing`)
     - `let reauthEpoch = 0;`
     - `let activeTimer: ReturnType<typeof setTimeout> | undefined;`
     - Helper nội bộ `cancelPendingReauth()` đặt `started = false; reauthEpoch += 1; if (activeTimer !== undefined) { clearTimeout(activeTimer); activeTimer = undefined; }`
     - Listener `if (typeof window !== "undefined" && typeof window.addEventListener === "function")`:
       - `pageshow`: `if (event.persisted) cancelPendingReauth();`
       - `pagehide`: `cancelPendingReauth();`
     - Ở `apps/web/src/lib/reauth.ts`, export thêm `resetReauthForTests(): void { cancelPendingReauth(); }` (và ở `apps/student/src/lib/query-client.ts`, gọi `cancelPendingReauth()` trong `resetRedirectGuardsForTests()`).
  2. Trong `reauth(): void` ở cả 3 file:
     - Kiểm tra và bật cờ single-flight đồng bộ (`if (started) return; started = true; const epoch = reauthEpoch;`).
     - Xóa cache client đồng bộ:
       - `apps/web/src/lib/reauth.ts`: `authClient.clearSessionCache?.();`
       - `apps/student/src/lib/query-client.ts`: `syncStudentSessionUser(null); authClient.clearSessionCache?.();`
       - `apps/admin/src/lib/query-client.ts`: không gọi `clearSessionCache`.
     - Capture `targetUrl` đồng bộ từ `window.location`.
     - Gọi `authClient.signOut()` **đồng bộ** ngay trong `try/catch`:
       ```ts
       let signOutPromise: Promise<unknown>;
       try {
       	signOutPromise = Promise.resolve(authClient.signOut()).catch(
       		() => undefined,
       	);
       } catch {
       	signOutPromise = Promise.resolve();
       }
       void (async () => {
       	let timer: ReturnType<typeof setTimeout> | undefined;
       	try {
       		await Promise.race([
       			signOutPromise,
       			new Promise<void>((resolve) => {
       				timer = setTimeout(resolve, REAUTH_SIGNOUT_TIMEOUT_MS);
       				activeTimer = timer;
       			}),
       		]);
       	} finally {
       		if (timer !== undefined) {
       			clearTimeout(timer);
       			if (activeTimer === timer) activeTimer = undefined;
       		}
       	}
       	if (epoch !== reauthEpoch || typeof window === "undefined") return;
       	window.location.assign(targetUrl);
       })();
       ```
  3. Cập nhật các test đang assert `assign` đồng bộ (`apps/web/src/lib/reauth.test.ts`, `apps/web/src/lib/query-client.test.ts`, `apps/admin/src/lib/query-client.test.ts`, `apps/student/test/wrong-role-redirect.test.ts`, `apps/student/test/student-org-recovery.test.ts`) dùng `await vi.waitFor(...)` cho assertion `assign` (giữ nguyên assert đồng bộ cho `signOut` và xóa `localStorage`).
- **Success criteria:** Toàn bộ test của `web`, `student`, `admin` liên quan tới `reauth()` pass, chứng minh `signOut()` gọi đồng bộ, `assign` chờ `signOut()` / timeout 2000ms / reject, và `pageshow` (`persisted: true`) hủy continuation cũ.
- **Verify:** `pnpm --filter web exec vitest run src/lib/reauth.test.ts src/lib/query-client.test.ts && pnpm --filter admin exec vitest run src/lib/query-client.test.ts && pnpm --filter student exec vitest run test/wrong-role-redirect.test.ts test/student-org-recovery.test.ts` exits 0 with 0 failures.

### Task 3.3 — Viết lại `returnUrl` trên `/login` của host legacy trong `apps/lms/src/legacy-redirect.ts`
<!-- Updated: Red Team Session 1 - decode only for read-only security validation; parse raw directly to preserve %26/%23/%25; strip invalid/malicious returnUrl from 301 redirect -->
- **Goal:** Tự động thêm prefix cổng (`/teacher`, `/student`, `/admin`) cho `returnUrl` tương đối hợp lệ trên `/login` của host legacy, bảo toàn percent-encoding query/hash, và loại bỏ `returnUrl` độc hại khỏi 301.
- **Target files and symbols:** `apps/lms/src/legacy-redirect.ts` (`resolveLegacyHostRedirect`, helper nội bộ `rewriteLegacyLoginSearch`).
- **Steps:**
  1. Thêm hằng `PORTAL_PREFIXES = ["/teacher", "/student", "/admin"] as const`, `REDIRECT_SCHEME_PREFIX_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/`, `REDIRECT_BASE_ORIGIN = "https://lms.invalid"` và helper `hasControlCharacter(value)`, `matchesSegmentPrefix(pathname, prefix)` (`pathname === prefix || pathname.startsWith(\`${prefix}/\`)`), `stripReturnUrlParam(url: URL): string` (xóa `returnUrl` khỏi bản sao `URLSearchParams`, trả `""` nếu rỗng hoặc `\`?${next.toString()}\``).
  2. Thêm helper `isSafeRelativeReturnUrl(raw: string): boolean`:
     - Kiểm tra `raw.length > 0 && !hasControlCharacter(raw)` và `raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !REDIRECT_SCHEME_PREFIX_RE.test(raw)`.
     - Chạy vòng giải mã read-only (tối đa 2 vòng `decodeURIComponent` trên bản sao `probe` — riêng phần `pathname` của `raw` để không vướng `%25` hợp lệ trong query, hoặc kiểm `hasControlCharacter` và `//`/`/\`/`scheme:` trên `pathname` đã giải mã và kiểm `hasControlCharacter` trên toàn bộ `raw` + `decodeURIComponent` của `raw` khi có thể; nếu `pathname` giải mã lỗi `URIError` hoặc bất kỳ tầng nào vi phạm -> trả `false`). *(Cụ thể: tách `raw` trước `?`/`#` thành `rawPath`, chạy vòng `decodeURIComponent` tối đa 2 vòng trên `rawPath` để chặn `%2F%2Fevil.com`, `%5C`, `%25E0%25A4%25A`, control char; đồng thời quét `hasControlCharacter` trên `raw` và kiểm tra `%00`–`%1F` / `%7F` trên toàn bộ `raw`!)*
     - Kiểm tra `new URL(raw, REDIRECT_BASE_ORIGIN)` không throw và `parsed.origin === REDIRECT_BASE_ORIGIN`.
  3. Thêm helper `rewriteLegacyLoginSearch(pathname: string, url: URL, portalPrefix: string): string`:
     - Chuẩn hóa `const normalizedPath = pathname.replace(/\/+$/, "") || "/";`. Nếu `normalizedPath !== "/login"` hoặc `!url.searchParams.has("returnUrl")` -> trả `url.search` nguyên bản.
     - Lấy `const raw = url.searchParams.get("returnUrl") ?? "";`.
     - Nếu `!isSafeRelativeReturnUrl(raw)` -> trả `stripReturnUrlParam(url)` (loại bỏ `returnUrl` độc hại khỏi 301, giữ nguyên các param khác nếu có).
     - Parse `const parsed = new URL(raw, REDIRECT_BASE_ORIGIN)` trực tiếp từ **`raw`** (giữ nguyên `%26`, `%23`, `%25` trong `parsed.search` và `parsed.hash`!).
     - Nếu `PORTAL_PREFIXES.some((p) => matchesSegmentPrefix(parsed.pathname, p))` hoặc `isPayPath(parsed.pathname)` hoặc `isUnifiedAuthPath(parsed.pathname)` -> trả `url.search` nguyên bản.
     - Tính `const rewritten = \`${prefixPath(parsed.pathname, portalPrefix)}${parsed.search}${parsed.hash}\`;`.
     - Tạo `const nextParams = new URLSearchParams(url.searchParams); nextParams.set("returnUrl", rewritten);` và trả `\`?${nextParams.toString()}\``.
  4. Gọi `rewriteLegacyLoginSearch(pathname, url, "/teacher")` (nhánh `teacherTargetHost`), `"/student"` (nhánh `studentDomain`), và `"/admin"` (nhánh `adminDomain`); không gọi cho `www.lms.<domain>`.
- **Success criteria:** Toàn bộ matrix test trong `apps/lms/src/legacy-redirect.test.ts` và `apps/lms/src/worker.test.ts` pass.
- **Verify:** `pnpm --filter lms test` exits 0 with 0 failures.

## Tests After & Regression Gate

- `pnpm --filter lms test` exits 0.
- `pnpm --filter web exec vitest run src/lib/reauth.test.ts src/lib/query-client.test.ts` exits 0.
- `pnpm --filter admin exec vitest run src/lib/query-client.test.ts` exits 0.
- `pnpm --filter student exec vitest run test/wrong-role-redirect.test.ts test/student-org-recovery.test.ts` exits 0.

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
