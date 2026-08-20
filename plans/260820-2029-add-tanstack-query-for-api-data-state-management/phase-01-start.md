---
phase: 1
title: "Cài đặt, QueryClient + reauth single-flight, provider bọc app"
status: todo
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Cài đặt, QueryClient + reauth single-flight, provider bọc app

## Overview

Đưa TanStack Query v5 vào app: cài deps, tạo `lib/query-client.ts` (QueryClient với defaults D4 + `QueryCache.onError` → 401 reauth), tách `reauth()` khỏi `data-provider.tsx` thành `lib/reauth.ts` có single-flight guard (D5), bọc `main.tsx` với `QueryClientProvider` + devtools. **App boot không đổi hành vi** — DataProvider vẫn tự fetch như cũ đến phase 2; chỉ có reauth đổi từ inline-callback sang module fn có guard (và guard chỉ khác khi 401 arrive đồng thời — hôm nay là race, sau nay là fire-một-lần).

## Requirements

Functional:
- `pnpm --filter web add @tanstack/react-query@^5` (dependencies) + `pnpm --filter web add -D @tanstack/react-query-devtools@^5` (devDependencies — theo convention `@tanstack/react-router-devtools` đã nằm devDependencies trong `apps/web/package.json:34`).
- `apps/web/src/lib/reauth.ts`: export `reauth()` — logic nguyên vẹn từ `data-provider.tsx:89-94` (`authClient.signOut()` best-effort → `validateReturnUrl(location)` → `window.location.assign('/login?returnUrl=...')`), thêm module flag single-flight: lần gọi thứ hai trở đi là no-op.
- `apps/web/src/lib/query-client.ts`: export `createKernelQueryClient()` factory + `kernelQueryRetry()` (pure, testable độc lập). Defaults D4: `staleTime: Infinity`, `gcTime: 5*60_000`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `retry: kernelQueryRetry`, structural sharing giữ default. `QueryCache.onError`: `HttpError` 401 → `reauth()`.
- `apps/web/src/main.tsx`: tạo QueryClient ở module scope, bọc `RouterProvider` trong `QueryClientProvider`, render `TanStackQueryDevtools` (production-excluded mặc định — researcher-01 §4, không cần gate `import.meta.env.DEV`).
- `data-provider.tsx`: thay inline `reauth` callback bằng import từ `lib/reauth.ts` — xóa `useCallback reauth` (dòng 89-94), bus `onAuthLost: reauth` giữ.

Non-functional:
- Không circular import: `reauth.ts` chỉ import `@/lib/auth-client` + `kernel-load-state`; `query-client.ts` import `kernel-load-state` + `reauth.ts`; hai bên không import ngược.
- Không thêm StrictMode (main.tsx hiện không có — ngoài scope).
- QueryClient tạo NGOÀI component tree (module scope main.tsx) — không bị recreate giữa re-render.

## Architecture

Data flow sau phase 1 (chưa có query nào chạy):

```
main.tsx (module scope)
  queryClient = createKernelQueryClient()
  <QueryClientProvider client={queryClient}>
    <RouterProvider/>          ← app-shell → DataProvider (fetch thủ công như cũ)
    <TanStackQueryDevtools/>   ← dev-only
  </QueryClientProvider>

401 read path (từ phase 2): queryFn throw HttpError 401
  → QueryCache.onError → reauth()  [single-flight]
401 write path (bus, giữ nguyên): deps.onAuthLost → reauth()  [cùng guard]
```

Single-flight guard (D5 — rủi ro lớn nhất theo kongming): hôm nay read 401 (provider) và write 401 (bus) có thể gọi `reauth()` 2 lần → double `signOut`/`location.assign` race. Guard bằng module flag; flag không cần reset vì `location.assign` là full page load — module state chết theo document cũ.

```ts
// lib/reauth.ts ( skeleton )
import { authClient } from "@/lib/auth-client";
import { validateReturnUrl } from "@/lib/kernel-load-state";

let started = false;
export function reauth(): void {
  if (started) return;
  started = true;
  void authClient.signOut().catch(() => undefined);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`/login?returnUrl=${encodeURIComponent(validateReturnUrl(current))}`);
}
```

```ts
// lib/query-client.ts ( skeleton )
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { HttpError, isHttpError, MalformedSnapshotError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";

export function kernelQueryRetry(failureCount: number, error: unknown): boolean {
  if (isHttpError(error) && error.status >= 400 && error.status < 500) return false;
  if (error instanceof MalformedSnapshotError) return false;
  return failureCount < 2;
}

export function createKernelQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: {
      staleTime: Infinity, gcTime: 5 * 60_000,
      refetchOnWindowFocus: false, refetchOnReconnect: false,
      retry: kernelQueryRetry,
    } },
    queryCache: new QueryCache({ onError: (error) => {
      if (isHttpError(error) && error.status === 401) reauth();
    } }),
  });
}
```

## Related Code Files

- Create: `apps/web/src/lib/reauth.ts` — reauth single-flight (logic tách từ data-provider).
- Create: `apps/web/src/lib/query-client.ts` — QueryClient factory + retry fn.
- Modify: `apps/web/package.json` — thêm 2 deps (caret, direct pin).
- Modify: `apps/web/src/main.tsx` — QueryClientProvider + devtools.
- Modify: `apps/web/src/lib/data-provider.tsx` — xóa inline `reauth` callback (dòng 83-94), import từ `lib/reauth.ts`; phần khác không đụng.
- `pnpm-lock.yaml` — lockfile update (do pnpm add).

## Implementation Steps

1. `pnpm --filter web add @tanstack/react-query@^5` rồi `pnpm --filter web add -D @tanstack/react-query-devtools@^5`. Kiểm tra `apps/web/package.json` pin caret trực tiếp (không catalog), giống `@tanstack/react-form: ^1.33.2`.
2. Tạo `lib/reauth.ts` per skeleton trên — copy đúng logic `data-provider.tsx:89-94`, thêm guard.
3. Tạo `lib/query-client.ts` per skeleton trên (retry fn export riêng để phase 4 unit-test thuần).
4. Sửa `data-provider.tsx`: xóa block `const reauth = useCallback(...)` (dòng 89-94), thêm `import { reauth } from "./reauth"`, xóa `reauth` khỏi deps array của `startLoad`/`getBus` useCallback.
5. Sửa `main.tsx`:
   ```tsx
   import { QueryClientProvider } from "@tanstack/react-query";
   import { TanStackQueryDevtools } from "@tanstack/react-query-devtools";
   import { createKernelQueryClient } from "./lib/query-client";
   const queryClient = createKernelQueryClient();
   // root.render:
   root.render(
     <QueryClientProvider client={queryClient}>
       <RouterProvider router={router} />
       <TanStackQueryDevtools initialIsOpen={false} />
     </QueryClientProvider>,
   );
   ```
6. Boot dev server: sign-in → dashboard → throttle network kill server → xác nhận error screen + retry vẫn hoạt động (DataProvider chưa đổi); devtools hiện góc màn (dev only); build prod không chứa devtools bundle (check `pnpm --filter web build` output size không tăng bất thường).

## Todo

- [ ] Deps cài xong, lockfile update
- [ ] `lib/reauth.ts` tạo + `data-provider.tsx` chuyển dùng module fn
- [ ] `lib/query-client.ts` tạo (factory + retry fn)
- [ ] `main.tsx` bọc QueryClientProvider + devtools
- [ ] Dev server boot + sign-in + dashboard OK, không hành vi mới

## Success Criteria

- [ ] App boot và chạy như trước trên dev server (sign-in, dashboard, mở modal, ghi 1 mutation OK) — DataProvider chưa đổi fetch path.
- [ ] 401 write path vẫn reauth đúng: expire session thủ công rồi dispatch write → redirect `/login?returnUrl=...` MỘT lần (guard hoạt động).
- [ ] React Query Devtools hiện ở dev; `pnpm --filter web build` thành công.
- [ ] `pnpm check` + `pnpm check-types` + `pnpm test` xanh.

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal / response |
|------|-----|------------|------------------------------|
| Circular import reauth ↔ query-client ↔ data-provider | M×M | `reauth.ts` chỉ phụ thuộc `auth-client` + `kernel-load-state` (đã verify không cycle); `query-client.ts` import một chiều. | Build fail "Circular dependency" → tách thêm `reauth` ra file không import kernel.ts. |
| QueryClient tạo trong component → mất cache mỗi re-render | M×H | Tạo ở module scope `main.tsx` (pattern chuẩn researcher-01 §2). | Devtools query count reset liên tục / refetch loop → chuyển ra module scope. |
| Single-flight guard nuốt reauth hợp lệ lần 2 (session chết lại sau khi đã reauth) | L×M | `location.assign` full reload tạo document mới → flag reset tự nhiên; không có kịch bản cùng document cần reauth 2 lần. | User kẹt màn loading sau 401 → kiểm tra Network: 1 signOut + 1 navigate đúng. |
| Devtools lọt production bundle | L×L | Package tự tree-shake prod mặc định (researcher-01 §4). | Bundle size tăng rõ → thêm gate `import.meta.env.DEV` quanh import (). |

Nguồn thiết kế: [researcher-01](./research/researcher-01-query-router-integration.md) §2/§4/§5, [researcher-02](./research/researcher-02-migration-semantics-testing.md) Q4.
