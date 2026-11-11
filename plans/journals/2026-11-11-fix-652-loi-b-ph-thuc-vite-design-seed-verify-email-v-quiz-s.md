---
title: "Fix #652: loại bỏ phụ thuộc Vite ở design-seed verify-email và quiz/start"
date: 2026-11-11
summary: "API verify-email + API quiz/start + withNavRetry có SEED_DEADLINE và redact capability token"
---

# Fix #652: loại bỏ phụ thuộc Vite ở design-seed verify-email và quiz/start

- **Root cause**: `apps/e2e/scripts/design-seed.ts:552` gọi trần `studentPage.goto(verifyUrl)` (timeout mặc định 30s, `waitUntil: "load"`, không retry). Sau khi `boot:api` trả `302` về `${STUDENT_ORIGIN}/verify-email?verified=ok`, trình duyệt chờ Vite dev cold-transform module graph của `student` (hoặc full-reload khi `optimizeDeps` chạy) trên máy 4 core đang tải nặng → nổ `TimeoutError`. Tương tự, vòng lặp Bước 8 mở 4 đề qua SPA cũng kích hoạt `[vite] [optimizer] bundling dependencies...` cho media/recorder dưới tải cao.
- **Giải pháp đã ship**:
  1. Thêm helper thuần `apps/e2e/src/design-seed-nav.ts` + 9 bài kiểm thử `apps/e2e/src/design-seed-nav.test.ts` (`redactCapabilityUrl`, `TransientNavError`, `isTransientNavError`, `clampTimeoutMs`, `withNavRetry`, `assertVerifiedEmailRedirect`) với trần `SEED_DEADLINE = 390s` (< `420s` SIGTERM của `capture.mjs`), không gắn `Error.cause`, parse `Location` không base URL để chặn relative redirect.
  2. Trong `apps/e2e/scripts/design-seed.ts`: sau `POST /api/auth/sign-up/email` `200 OK`, đóng nguyên tử `studentPage.close()` (triệt tiêu điều hướng nền của `SignUpForm`), gọi `studentCtx.request.get(verifyUrl, { maxRedirects: 0 })` + `assertVerifiedEmailRedirect` + `GET /api/auth/get-session` (`user.emailVerified === true`); chuyển Bước 8 sang `studentCtx.request.post(.../quiz/start)` kèm `Origin: STUDENT_ORIGIN`; ép quyền `0o700`/`0o600` cho `.state` và ghi telemetry `seedDurationMs`/`verifyDurationMs`/`quizzesDurationMs`/`navRetryCount`.
- **Kiểm chứng**: 3 lượt liên tiếp chạy song song với `pnpm turbo run check-types --force --concurrency=1` (`Cached: 0 cached, 12 total`, `loadavg 8.84–16.89`) đều hoàn tất `design-seed.ts` trong `13.1–19.0s` (`verify=413–748ms`, `quizzes=112–151ms`, `retries=0`); chạy toàn trình `capture.mjs --screens s-dashboard --side app --force` đạt `6 ảnh, 0 lỗi` (`seed=11573ms`, `.state/design-seed.json` mode `600`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
