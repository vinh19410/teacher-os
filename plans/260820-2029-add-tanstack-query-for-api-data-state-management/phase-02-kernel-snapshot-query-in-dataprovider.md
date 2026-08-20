---
phase: 2
title: "Kernel snapshot query in DataProvider"
status: todo
priority: P1
effort: "1d"
dependencies: [phase-01]
---

# Phase 2: Kernel snapshot query in DataProvider

## Overview

Chuyển read path của DataProvider từ fetch thủ công (`useState` load/data + `startLoad` + `attemptRef`) sang `useQuery(kernelQueryOptions(baseUrl))`: gate children trên `isPending`, error UI từ `isError` + `refetch()`, `mapKernelSnapshot` chạy qua memo trên snapshot từ cache. Bus ghi tạm dùng `applySnapshot → queryClient.setQueryData` (snapshot từ GET thật do bus fetch — KHÔNG phải dữ liệu bịa từ POST; đây là cầu transitional, phase 3 thay bằng `refetchQueries` và xóa hẳn). Context API (`data`/`dispatch`/`refresh`/lookups) bất biến — 27 call site `useData()` không đổi.

## Requirements

Functional:
- `repos/kernel.ts`: thêm `kernelQueryKey = ['kernel'] as const` + `kernelQueryOptions(baseUrl: string)` — dùng helper `queryOptions` của react-query; queryFn: `({ signal }) => fetchKernelSnapshot(baseUrl, signal)`. KHÔNG có query key kernel thứ hai ở bất kỳ đâu.
- `fetchKernelSnapshot(baseUrl, signal?)`: thêm param signal optional (backward-compatible — caller cũ không truyền vẫn chạy như cũ); compose `AbortSignal.any([signal, AbortSignal.timeout(15_000)])` khi có signal (D3). Shape-guard `isSnapshotShape` + `MalformedSnapshotError` giữ nguyên bên trong queryFn path.
- `data-provider.tsx` rewrite read path:
  - `useQuery(kernelQueryOptions(baseUrl))` → `{ data: snapshot, isPending, isError, error, refetch }`.
  - `isPending || !snapshot` → render `null` (gate — children unmounted).
  - `isError` → `failure = classifyLoadError(error)`; nếu `failure.kind === "reauth"` → `null` (reauth đã fire qua `QueryCache.onError`, single-flight); ngược lại `<KernelLoadError failure={failure} onRetry={() => void refetch()} />` — messages/behavior giữ 1:1.
  - `data = useMemo(() => snapshot ? mapKernelSnapshot(snapshot) : emptyKernelData, [snapshot])` — structural sharing giữ reference snapshot khi data không đổi → context value ổn định, không re-render toàn tree mỗi refetch.
  - Bus deps (transitional): `fetchSnapshot: () => fetchKernelSnapshot(baseUrl)`, `applySnapshot: (s) => queryClient.setQueryData(kernelQueryKey, s)`.
  - `refresh()` = async wrapper `queryClient.refetchQueries({ queryKey: kernelQueryKey, exact: true }, { throwOnError: true })` → resolve `true` / reject → `false`.
- Xóa dead code: `startLoad`, `attemptRef`, state `load`, `beginLoad`/`settleLoadSuccess`/`shouldSettle` usage trong provider (các pure fn trong `kernel-load-state.ts` GIỮ — `classifyLoadError`/`validateReturnUrl` vẫn dùng; `shouldSettle` không còn caller trong provider).
- Không đụng: `data-store.tsx` shim, read hooks, modals, routes, `kernel-load-state.ts` exports.

Non-functional:
- Delta hành vi có chủ ý (duyệt trong D4): transient error (network/5xx/timeout) giờ auto-retry tối đa 2 lần trong QueryClient trước khi error UI hiện — hôm nay error UI hiện ngay ở lần fail đầu. 4xx + malformed vẫn fail-fast không retry. Load gate tổng thể không đổi.
- `emptyKernelData` vẫn là giá trị gate-trước (children không bao giờ thấy empty org).

## Architecture

Data flow sau phase 2:

```
mount DataProvider
  useQuery(['kernel']) → queryFn({signal})
    fetch GET /api/kernel (credentials include, AbortSignal.any([signal, 15s]))
    shape-guard → MalformedSnapshotError | HttpError | snapshot
  isPending → null (gate)          isError → KernelLoadError + refetch()
  snapshot → mapKernelSnapshot → data → DataContext (API cũ)

write path (transitional đến phase 3):
  dispatch(action) → bus.run → POST ok → bus deps.fetchSnapshot (GET thật)
    → applySnapshot = queryClient.setQueryData(['kernel'], snapshot)
    → useQuery re-render → mapKernelSnapshot memo → context update
refresh() → queryClient.refetchQueries(['kernel'], exact, throwOnError) → boolean
```

Vì staleTime Infinity: mount lại DataProvider (route transitions trong app-shell) hit cache, không refetch — khác hôm nay (unmount provider = mất state chỉ khi whole shell unmount; app-shell mount 1 lần nên thực tế tương đương).

```ts
// repos/kernel.ts ( thêm vào — skeleton )
import { queryOptions } from "@tanstack/react-query";

export const kernelQueryKey = ["kernel"] as const;

export function kernelQueryOptions(baseUrl: string) {
  return queryOptions({
    queryKey: kernelQueryKey,
    queryFn: ({ signal }) => fetchKernelSnapshot(baseUrl, signal),
  });
}

// fetchKernelSnapshot — đổi signature:
export async function fetchKernelSnapshot(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<KernelSnapshot> {
  const timeout = AbortSignal.timeout(15000);
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(`${baseUrl}/api/kernel`, { credentials: "include", signal: composed });
  // ...phần còn lại giữ nguyên (HttpError / MalformedSnapshotError / isSnapshotShape)
}
```

```tsx
// data-provider.tsx (read path — skeleton)
const queryClient = useQueryClient();
const { data: snapshot, isPending, isError, error, refetch } = useQuery(kernelQueryOptions(baseUrl));
const data = useMemo(
  () => (snapshot ? mapKernelSnapshot(snapshot) : emptyKernelData),
  [snapshot],
);
// ...
if (isError) {
  const failure = classifyLoadError(error);
  if (failure.kind === "reauth") return null; // reauth fired via QueryCache.onError
  return <KernelLoadError failure={failure} onRetry={() => void refetch()} />;
}
if (isPending || !snapshot) return null;
```

## Related Code Files

- Modify: `apps/web/src/lib/repos/kernel.ts` — thêm `kernelQueryKey`, `kernelQueryOptions`; `fetchKernelSnapshot` nhận `signal?` (export hiện có giữ tên/owner — code-standards ownership "kernel transport and snapshot-to-UI mapping").
- Modify: `apps/web/src/lib/data-provider.tsx` — rewrite read path + bus deps transitional + refresh wrapper; xóa manual load logic.
- Reference only: `apps/web/src/components/kernel-load-error.tsx` (dùng nguyên), `apps/web/src/lib/kernel-load-state.ts` (giữ exports), `apps/web/src/lib/kernel-state.ts` (`emptyKernelData`).
- Delete: không xóa file nào.

## Implementation Steps

1. `repos/kernel.ts`: đổi signature `fetchKernelSnapshot` (compose signal per skeleton); thêm `kernelQueryKey` + `kernelQueryOptions`. Chạy `pnpm --filter web test` — các test hiện có của `fetchKernelSnapshot` (mock global fetch) phải pass không sửa (param optional).
2. `data-provider.tsx`: thay import `useState` load state bằng `useQuery`/`useQueryClient` từ `@tanstack/react-query`; import `kernelQueryKey`, `kernelQueryOptions` từ `./repos/kernel`.
3. Implement read path per skeleton: gate `isPending`, error branch, memo `mapKernelSnapshot`.
4. Đổi bus deps `applySnapshot` sang `queryClient.setQueryData(kernelQueryKey, s)`; `fetchSnapshot` giữ `() => fetchKernelSnapshot(baseUrl)` (không signal — bus tự quản timeout 15s nội bộ fetch fn).
5. Đổi `refresh()` sang wrapper `refetchQueries(..., { throwOnError: true })` → boolean.
6. Xóa `startLoad`/`attemptRef`/`load` state + imports `beginLoad`/`settleLoadSuccess`/`shouldSettle` khỏi provider (giữ `classifyLoadError`/`validateReturnUrl`... — kiểm tra `kernel-load-state.test.ts` vẫn cover các fn này vì fn không bị xóa).
7. Dev-server matrix: (a) load lần đầu OK; (b) stop server + reload → error screen + retry (server up lại) OK; (c) 401 read (expire session + reload) → redirect login MỘT lần; (d) 1 mutation (vd check-in) → UI cập nhật qua setQueryData path; (e) devtools: query `['kernel']` đúng 1 entry, fresh status.

## Todo

- [ ] `kernelQueryOptions` + `kernelQueryKey` + signal param trong `repos/kernel.ts`
- [ ] DataProvider useQuery read path + gate + error UI
- [ ] Bus deps transitional (setQueryData) + refresh() wrapper
- [ ] Dead manual-load code xóa; tests cũ vẫn xanh
- [ ] Dev-server matrix (a)–(e) pass

## Success Criteria

- [ ] 27 call site `useData()` không sửa — `git diff` không chạm file ngoài `repos/kernel.ts` + `data-provider.tsx`.
- [ ] Load gate: children unmounted khi pending; lỗi blocking hiện đúng message cũ (`classifyLoadError`); nút Retry refetch thành công.
- [ ] 401 read → `/login?returnUrl=...` MỘT lần; quay lại đúng trang sau sign-in.
- [ ] Mutation qua bus cập nhật UI (snapshot mới hiện); `refresh()` reconcile vẫn hoạt động từ modal committed/outcome-unknown.
- [ ] Grep `['kernel']` / `kernelQueryKey`: đúng 1 query key định nghĩa.
- [ ] `pnpm check` + `pnpm test` + `pnpm check-types` xanh.

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal / response |
|------|-----|------------|------------------------------|
| setQueryData transitional ghi đè race với refetchQueries | M×M | Cầu tạm MỘT phase — phase 3 thay bằng refetchQueries thuần; trong phase 2 mọi write path đều qua serial bus queue nên apply không interleaved. | UI stale sau write trong dev-server matrix (d) → hotfix: đưa refresh() về bus.refresh() tới khi phase 3 land. |
| Structural sharing không giữ reference → re-render toàn tree mỗi refetch | L×M | Sharing là default v5 và snapshot JSON từ server — reference giữ khi data không đổi (researcher-01 §5). | React Profiler: re-render 27 consumer khi refetch không đổi data → check `data` memo identity. |
| `isPending` vs hôm nay "loading rồi error ngay": retry 2 lần làm chậm error screen với server chết | M×L | Delta có chủ ý (D4) — đúng semantic bus refresh hôm nay (≤2 retries); 4xx/malformed fail-fast. | Server off → error screen sau ~vài giây thay vì tức thì; Retry vẫn tay. Chấp nhận. |
| `refetch()` sau retry-exhausted không reset failureCount đúng cách | L×M | v5 reset failureCount sau success; user-click refetch chạy lại queryFn bất kể count. | Retry button không fetch lại (Network tab) → gọi `queryClient.resetQueries` thay `refetch()`. |
| Provider unmount/remount (React strict/dev) cancel fetch qua signal → gate kẹt pending | L×M | App không chạy StrictMode (main.tsx); remount thật hit cache (staleTime Infinity). | Dev-tools query stuck `fetching` vĩnh viễn → verify signal compose không abort fetch của lần mount mới. |

Nguồn: [researcher-02](./research/researcher-02-migration-semantics-testing.md) Q1/Q4/Q6, [researcher-01](./research/researcher-01-query-router-integration.md) §3 (option C) /§5/§6.
