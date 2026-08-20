---
phase: 3
title: "Command bus refresh through queryClient"
status: todo
priority: P1
effort: "0.75d"
dependencies: [phase-02]
---

# Phase 3: Command bus refresh through queryClient

## Overview

Hoàn tất D6: bước "refetch snapshot sau POST" của bus chuyển sang `queryClient.refetchQueries({ queryKey: ['kernel'], exact: true }, { throwOnError: true })` — resolve = `refreshed`, throw = `committed`. Bus vẫn là plain module: serial queue + dedupe identical in-flight (JSON compare) + `classifyWriteFailure` + `onAuthLost` giữ nguyên. Xóa transitional `setQueryData` của phase 2. KHÔNG `useMutation`, KHÔNG optimistic updates, KHÔNG setQueryData.

## Requirements

Functional:
- `repos/kernel.ts` — `KernelCommandBusDeps` đổi shape:
  - Xóa `fetchSnapshot` + `applySnapshot`.
  - Thêm `refetch(): Promise<void>` — throw khi refetch fail (upstream là `refetchQueries` với `throwOnError: true`).
  - `postCommand`, `onAuthLost` giữ nguyên.
- `runOne`: vòng `REFRESH_ATTEMPTS = 2` gọi `await deps.refetch()` — resolve → `{ kind: "refreshed", id }`; throw → giữ logic hiện tại: `HttpError` 401 → `deps.onAuthLost()` + return `{ kind: "committed", id }`; error khác → thử tiếp attempt sau; hết attempt → `{ kind: "committed", id }` (2xx ack là durable commit boundary — comment hiện tại giữ).
- `bus.refresh()` (reconcile path): `enqueue(() => deps.refetch().then(() => true).catch(...))` — 401 → `onAuthLost()`; return `false` khi unreachable. Vẫn chain trên write queue như hôm nay.
- `data-provider.tsx` bus wiring:
  ```ts
  busRef.current ??= createKernelCommandBus({
    postCommand: (a) => postKernelCommand(baseUrl, a),
    refetch: async () => {
      await queryClient.refetchQueries({ queryKey: kernelQueryKey, exact: true }, { throwOnError: true });
    },
    onAuthLost: reauth,
  });
  ```
  Xóa `fetchSnapshot`/`applySnapshot` deps + transitional `setQueryData`.
- `provider.refresh()` quay lại `bus.refresh()` (queue-serialized như hôm nay — qua phase 2 nó là direct wrapper; giờ bus dùng đúng QueryClient nên serialization được khôi phục mà vẫn refetch qua cache).
- 401 trên refetch path: fires CẢ `QueryCache.onError` (reauth global) LẪN `deps.onAuthLost` (bus) — single-flight guard phase 1 đảm bảo `reauth()` chạy đúng MỘT lần (đây chính là lý do guard tồn tại).

Non-functional:
- Bus POST (plain module) bypass MutationCache — `onAuthLost` là cơ chế 401 duy nhất của write path (researcher-02 Q3).
- Retry stacking (delta có chủ ý, chấp nhận): queryClient retry (≤2 với network error theo D4) lồng trong mỗi bus attempt → tổng GET attempts khi refresh fail liên tục ~3-4 thay vì 2 hôm nay. Phân loại outcome KHÔNG đổi (chỉ over-fetch tạm thời trên pilot scale).
- Dedupe identical in-flight action: QueryClient không dedupe theo action — bus giữ nguyên `inFlight` map.

## Architecture

```
dispatch(action) → bus.run
  key = JSON(action); in-flight? → share promise (dedupe giữ)
  enqueue (serial queue giữ)
    POST postKernelCommand (timeout 15s, credentials)
      fail → 401? onAuthLost; classify → definite-failure | outcome-unknown
    ok → attempt ≤2: deps.refetch()
         = queryClient.refetchQueries(['kernel'], exact, throwOnError:true)
            → queryFn GET /api/kernel (signal compose, retry D4)
            → cache update → useQuery → mapKernelSnapshot → context
         resolve → refreshed | throw → committed (sau 2 attempts)
```

Tại sao single query key an toàn cho stale-apply: mọi GET (read đầu, bus refresh, manual refresh) cùng MỘT Query entry — fetch mới trên cùng query hủy in-flight cũ qua signal đã compose (D3) → snapshot cũ không bao giờ apply đè snapshot mới. Serialization POST vẫn thuộc bus queue.

```ts
// repos/kernel.ts — deps + runOne (skeleton diff)
export interface KernelCommandBusDeps {
  postCommand(action: KernelAction): Promise<string | undefined>;
  /** Refetch the kernel snapshot through the QueryClient. Throws on failure. */
  refetch(): Promise<void>;
  onAuthLost(): void;
}

// trong runOne, thay deps.applySnapshot(await deps.fetchSnapshot()):
for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
  try {
    await deps.refetch();
    return { kind: "refreshed", id };
  } catch (error) {
    if (isHttpError(error) && error.status === 401) {
      deps.onAuthLost();
      return { kind: "committed", id };
    }
  }
}
return { kind: "committed", id };
```

## Related Code Files

- Modify: `apps/web/src/lib/repos/kernel.ts` — deps interface + `runOne` + `refresh()` internals; header comment "the provider wires the transport" cập nhật ý (provider wires QueryClient refetch).
- Modify: `apps/web/src/lib/data-provider.tsx` — bus deps wiring, xóa transitional setQueryData, `refresh()` → `bus.refresh()`.
- Modify: `apps/web/src/lib/repos/kernel.test.ts` — adapt `describe("createKernelCommandBus")` (dòng 479+): harness `makeHarness` thay `pendingFetches`/`applied` bằng deferred `refetch` mock; 7 test hiện có giữ kịch bản, đổi cơ chế assert.
- Reference only: `apps/web/src/lib/query-client.ts` (không sửa — chỉ dùng client instance), `use-kernel-form-submit.ts`, `use-direct-kernel-action.ts` (consumers của `dispatch` — không đổi).

## Implementation Steps

1. `repos/kernel.ts`: đổi `KernelCommandBusDeps` per skeleton; rewrite `runOne` refresh loop + `refresh()`. Giữ nguyên: `enqueue`, `inFlight` map, `run` dedupe, 401 classification comments.
2. `data-provider.tsx`: wiring per skeleton; xóa `applySnapshot` callback + `fetchSnapshot` dep + `mapKernelSnapshot` khỏi bus path (memo read path giữ); `refresh = useCallback(() => bus.refresh(), ...)`.
3. `kernel.test.ts` adapt harness:
   ```ts
   function makeHarness() {
     const pendingRefetches: Array<Deferred<void>> = [];
     const bus = createKernelCommandBus({
       postCommand: ... as before ...,
       refetch: () => { const d = deferred<void>(); pendingRefetches.push(d); return d.promise; },
       onAuthLost: ... as before ...,
     });
     return { bus, postCalls, authLostCalls, pendingPosts, pendingRefetches };
   }
   ```
   Map test cũ → mới: "writes serialize" (resolve refetch[0] → p1 refreshed; POST 2 bắt đầu sau); "4xx → definite-failure"; "transport loss/5xx → outcome-unknown" (giữ — không đụng refetch); "refresh failure → committed" (reject refetch 2 lần); "refresh succeed on retry → refreshed"; thêm "refetch 401 → committed + onAuthLost".
4. Verify 4-state contract tests xanh: cả 4 nhánh được assert.
5. Dev-server matrix: (a) mutation thường → `refreshed`, modal close/reset; (b) kill server giữa POST-ack + refresh (dùng network throttle) → `committed` notice + reconcile; (c) 4xx thật (vd add-class trùng tên nếu server validate, hoặc tạm curl) → `definite-failure` retryable; (d) expire session rồi dispatch → MỘT redirect login (guard: QueryCache.onError + onAuthLost cùng fire).

## Todo

- [ ] Bus deps đổi sang `refetch()`; serial/dedupe/classify/onAuthLost giữ
- [ ] Provider wiring + xóa setQueryData transitional
- [ ] `kernel.test.ts` bus suite adapt + case refetch-401 mới
- [ ] Dev-server matrix (a)–(d) pass

## Success Criteria

- [ ] KernelCommandResult 4-state giống hệt: tests chứng minh refreshed / committed (refresh fail + refetch-401) / definite-failure (4xx) / outcome-unknown (5xx + TypeError) — `pnpm --filter web test` xanh.
- [ ] Dedupe: dispatch cùng action 2 lần liên tiếp → 1 POST (test giữ từ suite cũ).
- [ ] Serialize: POST thứ 2 không bắt đầu trước khi write thứ 1 apply xong (test giữ).
- [ ] Không còn `setQueryData` trong data-provider (`grep setQueryData apps/web/src` = 0 hits).
- [ ] Dev-server: mutations end-to-end OK; 401 mid-write redirect MỘT lần.
- [ ] `pnpm check` + `pnpm test` + `pnpm check-types` xanh.

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal / response |
|------|-----|------------|------------------------------|
| Double reauth: refetch 401 fires cả QueryCache.onError lẫn onAuthLost | H×M | Single-flight guard (D5, phase 1) — thiết kế đã tính; test đơn giản assert reauth spy gọi 1 lần khi cả 2 path fire. | Network: 2 signOut / redirect loop → kiểm tra flag `started` trong reauth.ts được set trước await. |
| refetchQueries resolve `undefined` khi query không có observer (gate unmount) → `refreshed` sai | M×M | DataProvider luôn mounted quanh dispatch (modals sống trong shell); `refetchQueries` fetch force kể cả inactive — throwOnError vẫn throw khi fail. | `committed` báo sai khi snapshot thật sự chưa load → assert query state trong onError test; nếu thật: dùng `fetchQuery` thay `refetchQueries` cho determinism. |
| Retry stacking (query retry × bus attempts) over-fetch khi server chết sau write | M×L | Delta chấp nhận — pilot scale; phân loại outcome không đổi. Consolation: tổng attempt vẫn bounded. | Log nhiều GET 5xx liên tiếp sau 1 write → giảm `REFRESH_ATTEMPTS` về 1 (query retry đã cover). |
| Bus test rewrite làm mất coverage serialize/dedupe | M×M | Steps 3 map tường minh từng test cũ → mới, KHÔNG xóa kịch bản nào; thêm mỗi refetch-401. | Coverage report giảm ở describe bus → restore test đã bỏ sót. |
| `refresh()` đổi từ direct (phase 2) về bus-serialized reintroduce queue-blocking | L×L | Đúng semantic hôm nay (reconcile chờ write queue) — đã là contract document trong `KernelCommandBus.refresh` JSDoc. | Reconcile chậm khi write pending dài → đúng hành vi cũ, chấp nhận. |

Nguồn: [researcher-02](./research/researcher-02-migration-semantics-testing.md) Q2/Q3/Q4.
