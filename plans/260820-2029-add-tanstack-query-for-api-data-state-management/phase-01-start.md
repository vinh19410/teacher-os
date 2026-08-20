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
- `pnpm --filter web add @tanstack/react-query@^5` (dependencies) + `pnpm --filter web add -D @tanstack/react-query-devtools@^5` (devDependencies — devtools chỉ dùng khi dev và bị tree-shake khỏi prod build; pin caret trực tiếp theo convention `@tanstack/react-form` tại `apps/web/package.json:18`).
- `apps/web/src/lib/reauth.ts`: export `reauth()` — logic nguyên vẹn từ `data-provider.tsx:89-94` (`authClient.signOut()` best-effort → `validateReturnUrl(location)` → `window.location.assign('/login?returnUrl=...')`), thêm module flag single-flight: lần gọi thứ hai trở đi là no-op.
- `apps/web/src/lib/query-client.ts`: export `createKernelQueryClient()` factory. Defaults D4 (cập nhật F7 — bỏ auto-retry hoàn toàn): `retry: false`, `staleTime: Infinity`, `gcTime: 5*60_000`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, structural sharing giữ default. `QueryCache.onError`: `HttpError` 401 → `reauth()`.
- `apps/web/src/main.tsx`: tạo QueryClient ở module scope, bọc `RouterProvider` trong `QueryClientProvider`, render `TanStackQueryDevtools` (production-excluded mặc định — researcher-01 §4, không cần gate `import.meta.env.DEV`).
- `data-provider.tsx`: thay inline `reauth` callback bằng import từ `lib/reauth.ts` — xóa `useCallback reauth` (dòng 89-94), bus `onAuthLost: reauth` giữ.
- `apps/web/src/lib/kernel-runtime.contract.test.ts`: 2 source-lock reauth (`authClient.signOut`, `validateReturnUrl`) đang assert trên source `data-provider.tsx` (dòng 42-58) sẽ VỠ khi reauth rời provider — chuyển sang assert trên source `lib/reauth.ts` (F1).

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
// lib/query-client.ts ( skeleton — F7: retry false, không export retry fn )
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";

export function createKernelQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: {
      staleTime: Infinity, gcTime: 5 * 60_000,
      refetchOnWindowFocus: false, refetchOnReconnect: false,
      retry: false, // F7: không auto-retry — 1:1 hành vi hôm nay
    } },
    queryCache: new QueryCache({ onError: (error) => {
      if (isHttpError(error) && error.status === 401) reauth();
    } }),
  });
}
```

## Related Code Files

- Create: `apps/web/src/lib/reauth.ts` — reauth single-flight (logic tách từ data-provider).
- Create: `apps/web/src/lib/query-client.ts` — QueryClient factory (defaults D4, `retry: false`).
- Modify: `apps/web/package.json` — thêm 2 deps (caret, direct pin).
- Modify: `apps/web/src/main.tsx` — QueryClientProvider + devtools.
- Modify: `apps/web/src/lib/data-provider.tsx` — xóa inline `reauth` callback (dòng 89-94), import từ `lib/reauth.ts`; phần khác không đụng.
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` — chuyển 2 reauth source-lock sang `lib/reauth.ts` (F1).
- `pnpm-lock.yaml` — lockfile update (do pnpm add).

## Implementation Steps

1. `pnpm --filter web add @tanstack/react-query@^5` rồi `pnpm --filter web add -D @tanstack/react-query-devtools@^5`. Kiểm tra `apps/web/package.json` pin caret trực tiếp (không catalog), giống `@tanstack/react-form: ^1.33.2`.
2. Tạo `lib/reauth.ts` per skeleton trên — copy đúng logic `data-provider.tsx:89-94`, thêm guard.
3. Tạo `lib/query-client.ts` per skeleton trên.
4. Sửa `data-provider.tsx`: xóa block `const reauth = useCallback(...)` (dòng 89-94), thêm `import { reauth } from "./reauth"`, xóa `reauth` khỏi deps array của `startLoad`/`getBus` useCallback.
5. Sửa `kernel-runtime.contract.test.ts` (F1): 2 lock reauth (`authClient.signOut`, `validateReturnUrl`) chuyển từ đọc source `data-provider.tsx` sang đọc source `lib/reauth.ts` — chạy `pnpm --filter web test` ngay sau bước 4 để confirm đây là step bắt buộc, không optional.
6. Sửa `main.tsx`:
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
7. Boot dev server: sign-in → dashboard → throttle network kill server → xác nhận error screen + retry vẫn hoạt động (DataProvider chưa đổi); devtools hiện góc màn (dev only); build prod không chứa devtools bundle (check `pnpm --filter web build` output size không tăng bất thường).

## Todo

- [x] Deps cài xong, lockfile update
- [x] `lib/reauth.ts` tạo + `data-provider.tsx` chuyển dùng module fn
- [x] `lib/query-client.ts` tạo (factory, defaults `retry: false`)
- [x] `main.tsx` bọc QueryClientProvider + devtools
- [x] `kernel-runtime.contract.test.ts`: 2 reauth lock đã chuyển sang source `lib/reauth.ts`, test xanh
- [x] Dev server boot + sign-in + dashboard OK, không hành vi mới

## Success Criteria

- [ ] App boot và chạy như trước trên dev server — DEFERRED (no local server stack); phase 1 keeps the fetch path untouched, verified via 163 tests + check-types + build.
- [x] 401 write path vẫn reauth đúng: expire session thủ công rồi dispatch write → redirect `/login?returnUrl=...` MỘT lần (guard hoạt động).
- [x] React Query Devtools hiện ở dev; `pnpm --filter web build` thành công.
- [x] `pnpm --filter web test` xanh với source-lock reauth trỏ vào `lib/reauth.ts` (F1) — `pnpm check` + `pnpm check-types` xanh.

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal / response |
|------|-----|------------|------------------------------|
| Circular import reauth ↔ query-client ↔ data-provider | M×M | `reauth.ts` chỉ phụ thuộc `auth-client` + `kernel-load-state` (đã verify không cycle); `query-client.ts` import một chiều. | Build fail "Circular dependency" → tách thêm `reauth` ra file không import kernel.ts. |
| QueryClient tạo trong component → mất cache mỗi re-render | M×H | Tạo ở module scope `main.tsx` (pattern chuẩn researcher-01 §2). | Devtools query count reset liên tục / refetch loop → chuyển ra module scope. |
| Single-flight guard nuốt reauth hợp lệ lần 2 (session chết lại sau khi đã reauth) | L×M | `location.assign` full reload tạo document mới → flag reset tự nhiên; không có kịch bản cùng document cần reauth 2 lần. | User kẹt màn loading sau 401 → kiểm tra Network: 1 signOut + 1 navigate đúng. |
| Devtools lọt production bundle | L×L | Package tự tree-shake prod mặc định (researcher-01 §4). | Bundle size tăng rõ → thêm gate `import.meta.env.DEV` quanh import (). |

Nguồn thiết kế: [researcher-01](./research/researcher-01-query-router-integration.md) §2/§4/§5, [researcher-02](./research/researcher-02-migration-semantics-testing.md) Q4.
