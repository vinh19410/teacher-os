---
phase: 3
title: "Command bus refresh through queryClient"
status: todo
priority: P1
effort: "1d"
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
- `provider.refresh()` GIỮ NGUYÊN `bus.refresh()` từ phase 2 (đã queue-serialized — F4): không đụng wiring refresh của provider trong phase này; chỉ internals bus đổi qua QueryClient.
- 401 trên refetch path: fires CẢ `QueryCache.onError` (reauth global) LẪN `deps.onAuthLost` (bus) — single-flight guard phase 1 đảm bảo `reauth()` chạy đúng MỘT lần (đây chính là lý do guard tồn tại).

Non-functional:
- Bus POST (plain module) bypass MutationCache — `onAuthLost` là cơ chế 401 duy nhất của write path (researcher-02 Q3).
- Không retry stacking (F7 — `retry: false` từ phase 1): mỗi `deps.refetch()` = đúng 1 GET; bus 2 attempts × 1 GET = 2 GET như hôm nay, worst case serial-block ~30s giữ nguyên.
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
- Modify: `apps/web/src/lib/repos/kernel.test.ts` — adapt `describe("createKernelCommandBus")` (dòng 479-773, ĐẦY ĐỦ 17 test — F5): harness `makeHarness` thay `pendingFetches`/`applied` bằng deferred `refetch` mock; bảng map 17 test ở Implementation Steps — KHÔNG xóa/tóm lược kịch bản nào.
- Reference only: `apps/web/src/lib/query-client.ts` (không sửa — chỉ dùng client instance), `use-kernel-form-submit.ts`, `use-direct-kernel-action.ts` (consumers của `dispatch` — không đổi).

## Implementation Steps

1. `repos/kernel.ts`: đổi `KernelCommandBusDeps` per skeleton; rewrite `runOne` refresh loop + `refresh()`. Giữ nguyên: `enqueue`, `inFlight` map, `run` dedupe, 401 classification comments.
2. `data-provider.tsx`: wiring per skeleton; xóa `applySnapshot` callback + `fetchSnapshot` dep + `mapKernelSnapshot` khỏi bus path (memo read path giữ). Wiring `refresh()` KHÔNG ĐỔI (F4) — đã là `bus.refresh()` từ phase 2.
3. `kernel.test.ts` adapt harness — cơ chế quan sát QUYẾT ĐỊNH TRƯỚC (F5): deferred-refetch ordering cho ordering/assert theo bước (mỗi `deps.refetch()` push 1 deferred vào `pendingRefetches`; index = thứ tự gọi); các assert "snapshot nào được apply" (observable `applied` cũ) chuyển sang real QueryClient ở integration case: `queryClient.getQueryData(kernelQueryKey)` + `queryCache.subscribe` ghi nhận thứ tự cache-update:
   ```ts
   function makeHarness() {
     const postCalls: string[] = [];
     const authLostCalls: number[] = [];
     const refetchCalls: number[] = [];
     const pendingPosts: Array<Deferred<string | undefined>> = [];
     const pendingRefetches: Array<Deferred<void>> = [];
     const bus = createKernelCommandBus({
       postCommand: (action) => { postCalls.push(action.type); const d = deferred<string | undefined>(); pendingPosts.push(d); return d.promise; },
       refetch: () => { refetchCalls.push(refetchCalls.length); const d = deferred<void>(); pendingRefetches.push(d); return d.promise; },
       onAuthLost: () => authLostCalls.push(authLostCalls.length),
     });
     return { bus, postCalls, authLostCalls, refetchCalls, pendingPosts, pendingRefetches };
   }
   ```
   Bảng map ĐẦY ĐỦ 17 test cũ → mới (F5 — không xóa kịch bản nào):

   | # | Test cũ (kernel.test.ts) | Map sang |
   |---|---------------------------|----------|
   | 1 | :534 writes serialize — POST 2 chờ apply write 1 | POST 2 không start trước khi `pendingRefetches[0]` settle; resolve tuần tự refetch[0] → p1 `refreshed`, POST 2 chạy sau |
   | 2 | :547 4xx → definite-failure, queue không block | Giữ nguyên (không đụng refetch — POST reject 409) |
   | 3 | :569 transport loss → outcome-unknown | Giữ nguyên (POST reject TypeError) |
   | 4 | :577 5xx → outcome-unknown | Giữ nguyên (POST reject 504) |
   | 5 | :584 refresh failure → committed | Reject `pendingRefetches[0]` + `[1]` (2 attempts) → `committed` |
   | 6 | :596 refresh succeed on retry → refreshed | Reject refetch[0], resolve refetch[1] → `refreshed` + id |
   | 7 | :622 comment ack committed, không replay | POST resolve `comment-1`, reject refetch ×2 → `committed` id `comment-1`, đúng 1 POST |
   | 8 | :642 dedupe in-flight — không POST trùng | Giữ nguyên (đếm `postCalls`) |
   | 9 | :656 identical action sau settle POST lại | Giữ nguyên + resolve refetch tương ứng từng lượt |
   | 10 | :673 bus.refresh() applies latest, `true` | Resolve refetch[0] → `true`; integration: `getQueryData` nhận snapshot mới nhất |
   | 11 | :681 bus.refresh() unreachable → `false` | Reject refetch[0] → `false` |
   | 12 | :688 bus.refresh() 401 → onAuthLost | Reject refetch[0] HttpError 401 → `false` + `authLostCalls` 1 lần |
   | 13 | :698 bus.refresh() serialize sau write (stale không đè mới) | `refetchCalls` rỗng đến khi write settle; resolve tuần tự refetch[0]=write, refetch[1]=reconcile; ordering cache assert qua `queryCache.subscribe`/`getQueryData` (integration) — newest wins |
   | 14 | :715 refresh 401 không retry → committed + onAuthLost | Reject refetch[0] 401 → `committed` NGAY, `refetchCalls` dài 1 (không attempt 2), onAuthLost 1 lần |
   | 15 | :731 refresh 401 → committed với comment id | Như 14 + id `comment-1` |
   | 16 | :747 write 401 → definite-failure + onAuthLost | Giữ nguyên (POST reject 401, không đụng refetch) |
   | 17 | :760 non-401 refresh KHÔNG onAuthLost | Reject refetch[0] 503, reject refetch[1] TypeError → `committed`, `authLostCalls` 0 |

4. Verify 4-state contract tests xanh: cả 4 nhánh được assert (map #5/#6/#14 — refreshed/committed; #2 — definite-failure; #4 — outcome-unknown).
5. Dev-server matrix: (a) mutation thường → `refreshed`, modal close/reset; (b) kill server giữa POST-ack + refresh (dùng network throttle) → `committed` notice + reconcile; (c) 4xx thật (vd add-class trùng tên nếu server validate, hoặc tạm curl) → `definite-failure` retryable; (d) expire session rồi dispatch → MỘT redirect login (guard: QueryCache.onError + onAuthLost cùng fire).

## Todo

- [x] Bus deps đổi sang `refetch()`; serial/dedupe/classify/onAuthLost giữ
- [x] Provider wiring + xóa setQueryData transitional; `refresh()` wiring không đổi (F4)
- [x] `kernel.test.ts` bus suite adapt theo bảng map đủ 17 test (F5)
- [x] Dev-server matrix (a)–(d) pass

## Success Criteria

- [x] KernelCommandResult 4-state giống hệt: 17 test cũ đều map + xanh, chứng minh refreshed / committed (refresh fail + refetch-401) / definite-failure (4xx) / outcome-unknown (5xx + TypeError) — `pnpm --filter web test` xanh.
- [x] Dedupe: dispatch cùng action 2 lần liên tiếp → 1 POST (test giữ từ suite cũ).
- [x] Serialize: POST thứ 2 không bắt đầu trước khi write thứ 1 apply xong (test giữ).
- [x] Không còn `setQueryData` trong data-provider (`grep setQueryData apps/web/src` = 0 hits).
- [x] Dev-server: mutations end-to-end OK; 401 mid-write redirect MỘT lần.
- [x] `pnpm check` + `pnpm test` + `pnpm check-types` xanh.

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal / response |
|------|-----|------------|------------------------------|
| Double reauth: refetch 401 fires cả QueryCache.onError lẫn onAuthLost | H×M | Single-flight guard (D5, phase 1) — thiết kế đã tính; test đơn giản assert reauth spy gọi 1 lần khi cả 2 path fire. | Network: 2 signOut / redirect loop → kiểm tra flag `started` trong reauth.ts được set trước await. |
| refetchQueries resolve `undefined` khi query không có observer (gate unmount) → `refreshed` sai | M×M | DataProvider luôn mounted quanh dispatch (modals sống trong shell); `refetchQueries` fetch force kể cả inactive — throwOnError vẫn throw khi fail. | `committed` báo sai khi snapshot thật sự chưa load → assert query state trong onError test; nếu thật: dùng `fetchQuery` thay `refetchQueries` cho determinism. |
| Bus test rewrite làm mất coverage serialize/dedupe | M×M | Bảng map ĐẦY ĐỦ 17 test (Steps 3, F5) — KHÔNG xóa kịch bản nào; cơ chế quan sát quyết định trước (deferred-refetch ordering + `getQueryData`/`queryCache.subscribe`). | Coverage report giảm ở describe bus → restore test đã bỏ sót theo bảng. |
| `refresh()` wiring provider bị đụng nhầm trong phase này | L×L | F4: wiring giữ nguyên từ phase 2 — diff phase 3 không chứa thay đổi `refresh` của provider. | Reconcile chậm/đổi hành vi → revert phần diff đó. |

Nguồn: [researcher-02](./research/researcher-02-migration-semantics-testing.md) Q2/Q3/Q4.
