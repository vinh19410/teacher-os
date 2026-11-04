# Phase 1: In-memory session cache, deduplication và timeout an toàn

## Goal
Xây dựng lớp đệm in-memory session cache (`getCachedSession`) với TTL 10 giây, cơ chế chống gọi trùng (in-flight deduplication), và timeout an toàn 5 giây (`AbortSignal.timeout(5000)`) cho `authClient.getSession()` trong `apps/web/src/lib/auth-client.ts`, kèm dọn cache triệt để khi đăng xuất, khi `reauth()`, khi cập nhật hồ sơ (`updateUser`), và khi session hết hạn (`{ data: null }`).

## Files to Create or Modify
- `apps/web/src/lib/auth-client.ts` — Thêm `getCachedSession`, `clearSessionCache`, tự xóa cache khi session null.
- `apps/web/src/lib/reauth.ts` — Gọi `clearSessionCache()` khi kích hoạt `reauth()`.
- `apps/web/src/routes/_auth/profile.tsx` — Gọi `clearSessionCache()` trước khi `router.invalidate()` khi đổi tên.
- `apps/web/src/components/profile/avatar-section.tsx` — Gọi `clearSessionCache()` trước khi `router.invalidate()` khi đổi avatar.
- `apps/web/src/lib/auth-client.test.ts` — Test đơn vị cho cache TTL (10s), deduplication, timeout, null purge, và clear cache.

## Tasks & Steps

### Task 1.1 — Viết test trước cho getCachedSession (TDD)
- **Goal**: Bộ test mô tả đầy đủ các tính chất:
  1. Cache trả lại cùng dữ liệu trong 10s không gọi fetch mới.
  2. Gọi đồng thời nhiều lần chỉ sinh 1 promise fetch (deduplication).
  3. Khi fetch trả về `{ data: null }` (session hết hạn/revoked), cache tự động xóa về null.
  4. Gọi `clearSessionCache()` buộc lần gọi tiếp theo phải fetch lại.
  5. Timeout 5s hoạt động thông qua AbortSignal.
- **Target files and symbols**: `apps/web/src/lib/auth-client.test.ts`.
- **Steps**:
  1. Tạo file test `apps/web/src/lib/auth-client.test.ts`.
  2. Viết các test case tương ứng 5 mục trên.
- **Success criteria**: File test tồn tại và chạy với vitest.
- **Verify**: `pnpm --filter web exec vitest run src/lib/auth-client.test.ts` chạy và báo lỗi do `getCachedSession` chưa được export (red phase).

### Task 1.2 — Cài đặt getCachedSession và clearSessionCache trong auth-client.ts
- **Goal**: Cài đặt logic cache (TTL 10s), in-flight promise deduplication, 5s timeout, và export các hàm trong `apps/web/src/lib/auth-client.ts`.
- **Target files and symbols**: `apps/web/src/lib/auth-client.ts` (`getCachedSession`, `clearSessionCache`).
- **Steps**:
  1. Định nghĩa `SESSION_CACHE_TTL_MS = 10_000` (10 giây).
  2. Khai báo biến module `cachedSession: { data: any; expiresAt: number } | null = null`.
  3. Khai báo biến module `inFlightSessionPromise: Promise<any> | null = null`.
  4. Viết hàm `clearSessionCache()`:
     ```ts
     export function clearSessionCache(): void {
       cachedSession = null;
       inFlightSessionPromise = null;
     }
     ```
  5. Viết hàm `getCachedSession({ force = false }: { force?: boolean } = {})`:
     - Nếu không `force`, và `cachedSession` còn hạn (`Date.now() < cachedSession.expiresAt`), trả về ngay `cachedSession.data`.
     - Nếu có `inFlightSessionPromise`, trả về promise đó.
     - Khởi tạo promise fetch qua `authClient.getSession({ fetchOptions: { signal: AbortSignal.timeout(5_000) } })`.
     - Sau khi hoàn thành:
       - Nếu có `res.data`, lưu `cachedSession = { data: res, expiresAt: Date.now() + SESSION_CACHE_TTL_MS }`.
       - Nếu không có `res.data` (`data` null/undefined), gọi `clearSessionCache()`.
       - Dọn `inFlightSessionPromise = null`.
       - Trả về `res`.
     - Nếu lỗi, dọn `inFlightSessionPromise = null` và ném tiếp lỗi.
  6. Hook vào `authClient.signOut`: bọc `authClient.signOut` để gọi `clearSessionCache()`.
- **Success criteria**: Tất cả các test trong `auth-client.test.ts` chuyển sang màu xanh (green phase).
- **Verify**: `pnpm --filter web exec vitest run src/lib/auth-client.test.ts` exits 0 và toàn bộ test pass.

### Task 1.3 — Đồng bộ dọn cache trong reauth.ts, profile.tsx và avatar-section.tsx
- **Goal**: Đảm bảo cache được dọn ngay lập tức khi 401 hoặc khi người dùng đổi tên/avatar.
- **Target files and symbols**:
  - `apps/web/src/lib/reauth.ts` (`reauth`)
  - `apps/web/src/routes/_auth/profile.tsx`
  - `apps/web/src/components/profile/avatar-section.tsx`
- **Steps**:
  1. Trong `apps/web/src/lib/reauth.ts`, import `clearSessionCache` và gọi ở đầu hàm `reauth()`.
  2. Trong `apps/web/src/routes/_auth/profile.tsx`, gọi `clearSessionCache()` ngay trước `await router.invalidate()` khi cập nhật tên.
  3. Trong `apps/web/src/components/profile/avatar-section.tsx`, gọi `clearSessionCache()` ngay trước `await router.invalidate()` khi cập nhật avatar.
- **Success criteria**: Code biên dịch sạch, không lỗi type.
- **Verify**: `pnpm --filter web check-types` exits 0.

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
