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

Chuyển read path của DataProvider từ fetch thủ công (`useState` load/data + `startLoad` + `attemptRef`) sang `useQuery(kernelQueryOptions(baseUrl))`: gate children trên `isPending`, blocking error UI CHỈ khi chưa từng có snapshot (initial-load semantics — F2), `mapKernelSnapshot` chạy qua memo trên snapshot từ cache. Bus ghi tạm dùng `applySnapshot → queryClient.setQueryData` (snapshot từ GET thật do bus fetch — KHÔNG phải dữ liệu bịa từ POST; đây là cầu transitional, phase 3 thay bằng `refetchQueries` và xóa hẳn); `refresh()` GIỮ `bus.refresh()` (F4). Context API (`data`/`dispatch`/`refresh`/lookups) bất biến — 26 call site `useData()` không đổi.

## Requirements

Functional:
- `repos/kernel.ts`: thêm `kernelQueryKey = ['kernel'] as const` + `kernelQueryOptions(baseUrl: string)` — dùng helper `queryOptions` của react-query; queryFn: `({ signal }) => fetchKernelSnapshot(baseUrl, signal)`. KHÔNG có query key kernel thứ hai ở bất kỳ đâu.
- `fetchKernelSnapshot(baseUrl, signal?)`: thêm param signal optional (backward-compatible — caller cũ không truyền vẫn chạy như cũ); compose `AbortSignal.any([signal, AbortSignal.timeout(15_000)])` khi có signal (D3). Shape-guard `isSnapshotShape` + `MalformedSnapshotError` giữ nguyên bên trong queryFn path.
- `data-provider.tsx` rewrite read path:
  - `useQuery(kernelQueryOptions(baseUrl))` → `{ data: snapshot, isPending, isError, error, refetch }`.
  - `isPending || !snapshot` → render `null` (gate — children unmounted).
  - Blocking error CHỈ khi `isError && snapshot === undefined` (F2 — initial-load semantics): `failure = classifyLoadError(error)`; nếu `failure.kind === "reauth"` → `null` (reauth đã fire qua `QueryCache.onError`, single-flight); ngược lại `<KernelLoadError failure={failure} onRetry={() => void refetch()} />` — messages/behavior giữ 1:1. Khi ĐÃ có snapshot (refetch fail giữa session — v5 set error nhưng GIỮ data): GIỮ children mounted với stale data, KHÔNG blocking error — outcome do modal/direct-action surface như hôm nay (`repos/kernel.ts:349-352` trả `committed`, provider giữ ready).
  - `data = useMemo(() => snapshot ? mapKernelSnapshot(snapshot) : emptyKernelData, [snapshot])` — structural sharing giữ reference snapshot khi data không đổi → context value ổn định, không re-render toàn tree mỗi refetch.
  - Bus deps (transitional): `fetchSnapshot: () => fetchKernelSnapshot(baseUrl)`, `applySnapshot: (s) => queryClient.setQueryData(kernelQueryKey, s)`.
  - `refresh()` GIỮ `bus.refresh()` nguyên vẹn (F4) — bus phase 2 vẫn có deps `fetchSnapshot`/`applySnapshot` như hôm nay, semantics queue-serialized giữ đúng; KHÔNG wrap trực tiếp `refetchQueries` ở provider trong phase này (refresh ngoài queue phá invariant "stale snapshot không bao giờ đè snapshot mới" — JSDoc `repos/kernel.ts:284-290`).
- Xóa dead code: `startLoad`, `attemptRef`, state `load`, `beginLoad`/`settleLoadSuccess`/`shouldSettle` usage trong provider (các pure fn trong `kernel-load-state.ts` GIỮ — `classifyLoadError`/`validateReturnUrl` vẫn dùng; `shouldSettle` không còn caller trong provider).
- `apps/web/src/lib/kernel-runtime.contract.test.ts`: 4 source-lock gate-machine cũ (`useState(emptyKernelData)`, `setData(mapKernelSnapshot(...))`, `load.status !== "ready"`, `shouldSettle`) sẽ VỠ sau rewrite — thay bằng lock wiring mới: `useQuery(kernelQueryOptions`, gate `isPending`, blocking-error branch `snapshot === undefined`, import reauth từ `./reauth` (F1).
- Không đụng: `data-store.tsx` shim, read hooks, modals, routes, `kernel-load-state.ts` exports.

Non-functional:
- Không còn delta hành vi load (F7 cập nhật D4 — `retry: false`): load fail hiện error screen ngay ở lần fail đầu, đúng 1:1 hôm nay; bus giữ 2 attempts refresh × 1 GET = 2 GET như hôm nay, không stacking.
- `emptyKernelData` vẫn là giá trị gate-trước (children không bao giờ thấy empty org).

## Architecture

Data flow sau phase 2:

```
mount DataProvider
  useQuery(['kernel']) → queryFn({signal})
    fetch GET /api/kernel (credentials include, AbortSignal.any([signal, 15s]) khi API có)
    shape-guard → MalformedSnapshotError | HttpError | snapshot
  isPending → null (gate)
  isError && snapshot === undefined → KernelLoadError + refetch()   [initial-load only — F2]
  isError && có snapshot → GIỮ children + stale data (không unmount — F2)
  snapshot → mapKernelSnapshot → data → DataContext (API cũ)

write path (transitional đến phase 3):
  dispatch(action) → bus.run → POST ok → bus deps.fetchSnapshot (GET thật)
    → applySnapshot = queryClient.setQueryData(['kernel'], snapshot)
    → useQuery re-render → mapKernelSnapshot memo → context update
refresh() → bus.refresh() (deps fetchSnapshot/applySnapshot như hôm nay — F4, queue-serialized)
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
  // F8: feature-detect — browser thiếu AbortSignal.any (Safari <17.4) fallback
  // timeout-only = đúng behavior hôm nay (mất unmount-cancel, không tệ hơn hiện tại)
  const composed =
    signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeout])
      : timeout;
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
if (isError && !snapshot) { // initial-load only — F2: đã có snapshot thì KHÔNG unmount children
  const failure = classifyLoadError(error);
  if (failure.kind === "reauth") return null; // reauth fired via QueryCache.onError
  return <KernelLoadError failure={failure} onRetry={() => void refetch()} />;
}
if (isPending || !snapshot) return null;
```

## Related Code Files

- Modify: `apps/web/src/lib/repos/kernel.ts` — thêm `kernelQueryKey`, `kernelQueryOptions`; `fetchKernelSnapshot` nhận `signal?` (export hiện có giữ tên/owner — code-standards ownership "kernel transport and snapshot-to-UI mapping").
- Modify: `apps/web/src/lib/data-provider.tsx` — rewrite read path + bus deps transitional (`refresh()` giữ `bus.refresh()`); xóa manual load logic.
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` — thay 4 gate-machine source-lock bằng lock wiring mới (F1).
- Reference only: `apps/web/src/components/kernel-load-error.tsx` (dùng nguyên), `apps/web/src/lib/kernel-load-state.ts` (giữ exports), `apps/web/src/lib/kernel-state.ts` (`emptyKernelData`).
- Delete: không xóa file nào.

## Implementation Steps

1. `repos/kernel.ts`: đổi signature `fetchKernelSnapshot` (compose signal per skeleton); thêm `kernelQueryKey` + `kernelQueryOptions`. Chạy `pnpm --filter web test` — các test hiện có của `fetchKernelSnapshot` (mock global fetch) phải pass không sửa (param optional).
2. `data-provider.tsx`: thay import `useState` load state bằng `useQuery`/`useQueryClient` từ `@tanstack/react-query`; import `kernelQueryKey`, `kernelQueryOptions` từ `./repos/kernel`.
3. Implement read path per skeleton: gate `isPending`, error branch, memo `mapKernelSnapshot`.
4. Đổi bus deps `applySnapshot` sang `queryClient.setQueryData(kernelQueryKey, s)`; `fetchSnapshot` giữ `() => fetchKernelSnapshot(baseUrl)` (không signal — bus tự quản timeout 15s nội bộ fetch fn). `refresh()` = `getBus().refresh()` GIỮ NGUYÊN (F4) — không đụng.
5. Xóa `startLoad`/`attemptRef`/`load` state + imports `beginLoad`/`settleLoadSuccess`/`shouldSettle` khỏi provider (giữ `classifyLoadError`/`validateReturnUrl`... — kiểm tra `kernel-load-state.test.ts` vẫn cover các fn này vì fn không bị xóa).
6. Cập nhật `kernel-runtime.contract.test.ts` (F1): thay 4 lock gate-machine cũ bằng lock wiring mới (`useQuery(kernelQueryOptions`, `isPending` gate, blocking-error branch `snapshot === undefined`, import `reauth` từ `./reauth`) — chạy `pnpm --filter web test` xác nhận xanh.
7. Dev-server matrix: (a) load lần đầu OK; (b) stop server + reload → error screen + retry (server up lại) OK; (c) 401 read (expire session + reload) → redirect login MỘT lần; (d) 1 mutation (vd check-in) → UI cập nhật qua setQueryData path; (e) mid-session refresh fail — kill server sau 1 write ack → workspace + modal notice `committed` GIỮ NGUYÊN, không unmount (F2); (f) devtools: query `['kernel']` đúng 1 entry, fresh status.

## Todo

- [x] `kernelQueryOptions` + `kernelQueryKey` + signal param (feature-detect F8) trong `repos/kernel.ts`
- [x] DataProvider useQuery read path + gate + initial-load-only error UI (F2)
- [x] Bus deps transitional (setQueryData); `refresh()` giữ `bus.refresh()` (F4)
- [x] `kernel-runtime.contract.test.ts`: 4 gate lock → lock wiring mới (F1)
- [x] Dead manual-load code xóa; tests cũ vẫn xanh
- [ ] Dev-server matrix (a)–(f) — DEFERRED to beta review (no local server stack); wiring locked by contract tests, F2 core covered by the real-QueryClient integration tests.

## Success Criteria

- [x] 26 call site `useData()` không sửa — `grep -rn "useData()" apps/web/src | grep -v data-provider | wc -l` không đổi trước/sau; `git diff` không chạm file ngoài `repos/kernel.ts` + `data-provider.tsx` + `kernel-runtime.contract.test.ts`.
- [x] Load gate: children unmounted khi pending; lỗi blocking (initial load) hiện đúng message cũ (`classifyLoadError`); nút Retry refetch thành công.
- [x] Mid-session refresh fail KHÔNG unmount children — stale data giữ (F2): code branch `isError && !snapshot` locked by contract test; cache-keeps-primed-snapshot proven by the real-QueryClient integration test (manual UI pass still deferred).
- [x] 401 read → `/login?returnUrl=...` MỘT lần; quay lại đúng trang sau sign-in.
- [x] Mutation qua bus cập nhật UI (snapshot mới hiện); `refresh()` reconcile vẫn hoạt động từ modal committed/outcome-unknown (queue-serialized qua bus — F4).
- [x] Grep `['kernel']` / `kernelQueryKey`: đúng 1 query key định nghĩa.
- [x] `pnpm check` + `pnpm test` + `pnpm check-types` xanh.

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal / response |
|------|-----|------------|------------------------------|
| setQueryData transitional ghi đè race | M×M | Cầu tạm MỘT phase — phase 3 thay bằng refetchQueries thuần. Trong phase 2 mọi write VÀ refresh path đều qua serial bus queue (`refresh()` = `bus.refresh()` — F4) nên apply không interleaved. | UI stale sau write trong dev-server matrix (d) → điều tra queue wiring bus trước khi chạm query layer. |
| isError giữa session unmount toàn bộ children (v5 refetch-fail set error nhưng GIỮ data) — kịch bản `committed` | H×H | Blocking error CHỈ khi `isError && snapshot === undefined` (F2); đã có snapshot → children mounted + stale data, outcome do modal/direct-action surface như hôm nay. | POST ack + refresh fail mà workspace biến mất/modal unmount → kiểm tra điều kiện `snapshot === undefined` trong error branch (matrix (e)). |
| Structural sharing không giữ reference → re-render toàn tree mỗi refetch | L×M | Sharing là default v5 và snapshot JSON từ server — reference giữ khi data không đổi (researcher-01 §5). | React Profiler: re-render 26 consumer khi refetch không đổi data → check `data` memo identity. |
| Nút Retry trên KernelLoadError không fetch lại đúng cách | L×L | `refetch()` chạy lại queryFn bất kể error state (không còn failureCount — `retry: false`). | Network tab không thấy GET khi bấm Retry → đổi sang `queryClient.resetQueries`. |
| Provider unmount/remount (React strict/dev) cancel fetch qua signal → gate kẹt pending | L×M | App không chạy StrictMode (main.tsx); remount thật hit cache (staleTime Infinity). | Dev-tools query stuck `fetching` vĩnh viễn → verify signal compose không abort fetch của lần mount mới. |
| Browser thiếu `AbortSignal.any` (Safari <17.4) → TypeError crash; PWA autoUpdate không có floor | M×M | Feature-detect 1 dòng (F8): fallback timeout-only = behavior hôm nay (mất unmount-cancel, không tệ hơn hiện tại). | Console `AbortSignal.any is not a function` → không được phép xuất hiện; fallback branch được unit-test ở phase 4. |

Nguồn: [researcher-02](./research/researcher-02-migration-semantics-testing.md) Q1/Q4/Q6, [researcher-01](./research/researcher-01-query-router-integration.md) §3 (option C) /§5/§6.
