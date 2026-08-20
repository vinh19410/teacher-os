---
phase: 4
title: "Tests docs và CI verification"
status: todo
priority: P2
effort: "0.75d"
dependencies: [phase-03]
---

# Phase 4: Tests docs và CI verification

## Overview

Thêm các test bắt buộc (kongming-mandated, node env — KHÔNG jsdom), đồng bộ 3 docs (code-standards ownership, system-architecture request flow, codebase-summary map), chạy đủ 4 gate. Mọi test colocated theo convention hiện có trong `apps/web/src/lib` (15 file test hiện tại đều colocated).

## Requirements

Functional (test cases — theo skeleton đã duyệt):
- `apps/web/src/lib/query-client.test.ts` (create mới):
  - Defaults test (F7 — thay cho retry-policy test cũ): `createKernelQueryClient().getDefaultOptions().queries` — assert `retry === false`, `staleTime === Infinity`, `refetchOnWindowFocus === false`, `refetchOnReconnect === false`.
  - QueryCache.onError + single-flight (F3): REAL `reauth` — KHÔNG `vi.mock("@/lib/reauth")` (mock module là loại đúng cái guard cần chứng minh); thay vào đó `vi.mock("@/lib/auth-client")` (spy `signOut`) + `vi.stubGlobal("window", { location: { assign: spy, pathname: "/", search: "", hash: "" } })`; real `createKernelQueryClient()`; mock global `fetch` reject `HttpError(401)`; 2 `queryClient.fetchQuery` 401 concurrent (query key khác nhau → onError fire 2 lần) → assert `signOut` + `location.assign` MỖI CÁI đúng 1 lần — single-flight guard chính là thứ được test.
- `apps/web/src/lib/reauth.test.ts` (create mới): single-flight — `vi.stubGlobal("window", { location: { assign: vi.fn(), pathname: "/x", search: "", hash: "" } })` + `vi.mock("@/lib/auth-client")` (signOut resolve); gọi `reauth()` 2 lần liên tiếp → `signOut` + `location.assign` mỗi cái đúng 1 lần; returnUrl encode đúng `/login?returnUrl=%2Fx`.
- `apps/web/src/lib/repos/kernel.test.ts` (extend — thêm 2 describe):
  - queryFn abort composition (F10): mock global `fetch` trả promise never-resolve nhưng reject với `signal.reason` THẬT khi abort (`signal.addEventListener("abort", () => reject(signal.reason))` — propagate reason, KHÔNG hardcode DOMException); test `fetchKernelSnapshot(baseUrl, ...)` với `AbortSignal.timeout(50)` real (không fake timers — test chỉ ~50ms): case timeout → reject, `reason.name === "TimeoutError"`; case 2: external controller abort sau 10ms → reject với `reason.name === "AbortError"` (compose `AbortSignal.any` hoạt động cả 2 chiều).
  - Bus 4-state integration với real QueryClient: `const qc = createKernelQueryClient()` (defaults đã `retry: false` — F7, deterministic 1 GET/refetch); mock global fetch: POST `ok:true` → GET `/api/kernel` trả fixture snapshot hợp lệ (dùng shape từ `apps/web/test/fixtures/mock-data.ts` nếu tương thích, không thì inline minimal snapshot đủ `SNAPSHOT_COLLECTION_KEYS`); bus deps `refetch: () => qc.refetchQueries(...)` thật. Assert: POST ok + refetch ok → `refreshed`; POST ok + GET fail (fixture 5xx — KHÔNG dùng 401 ở đây để real `reauth` không đụng `window` trong node env, F3) → `committed`; POST 404 → `definite-failure`; POST 500 → `outcome-unknown`.
- Provider gate (skeleton 5): **KHÔNG viết vitest** — assert "isPending giữ children unmounted" cần DOM render (jsdom/happy-dom). Repo test env là node thuần (`vitest run` không jsdom) — thêm DOM env chỉ cho case này không đáng (researcher-02 Q5). Thay bằng: manual/dev-server verification checklist (bước 5 dưới) — documented tại đây như một explicit decision.
- Docs updates:
  - `docs/code-standards.md` — Ownership rules thêm hàng: `apps/web/src/lib/query-client.ts` | "QueryClient defaults, kernel query retry policy, and global 401 reauth"; cập nhật hàng `repos/kernel.ts` thành "kernel transport, snapshot query options, and snapshot-to-UI mapping"; hàng `data-provider.tsx` giữ "client load gate and store wiring".
  - `docs/system-architecture.md` — "Current request flow" bước 2 sửa: data-provider subscribes the shared TanStack Query `['kernel']` entry (GET `/api/kernel`) và waits for nó trước khi render children; ghi chú writes refetch cùng entry qua command bus. Boundary map "Client kernel store and bus" owner không đổi file.
  - `docs/codebase-summary.md` — Main entry points thêm `query-client.ts`; "Where to look first" câu data-layer nhắc thêm query layer.

Non-functional:
- Không thêm jsdom/happy-dom dependency. Không đổi vitest config.
- CI (`.github/workflows/ci.yml`) không cần sửa — chạy lại 4 gate là đủ verification.

## Architecture

Test layout (mới in đậm):

```
apps/web/src/lib/
  kernel-load-state.test.ts   (giữ)
  kernel-runtime.contract.test.ts (đã adapt phase 1: reauth locks → lib/reauth.ts; phase 2: gate locks → wiring mới — F1)
  **query-client.test.ts**    defaults (retry:false) + QueryCache.onError/single-flight
  **reauth.test.ts**          single-flight + returnUrl encode
  repos/
    kernel.test.ts            (bus suite đã adapt phase 3)
      + **queryFn abort composition** (real short timeout 50ms)
      + **bus 4-state qua real QueryClient** (mock global fetch)
```

Tất cả test node-env thuần: queryFn/bus/refetch là promise thuần; `queryClient.fetchQuery`/`refetchQueries` chạy queryFn qua cache KHÔNG cần React/DOM (researcher-02 Q5).

## Related Code Files

- Create: `apps/web/src/lib/query-client.test.ts`
- Create: `apps/web/src/lib/reauth.test.ts`
- Modify: `apps/web/src/lib/repos/kernel.test.ts` — thêm 2 describe (abort composition, bus-QueryClient integration)
- Modify: `docs/code-standards.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`
- Reference only: `apps/web/test/fixtures/mock-data.ts` (fixture snapshot nếu dùng)

## Implementation Steps

1. Viết `query-client.test.ts` per Requirements — lưu ý fetchQuery với queryFn throw → catch per-call; assert reauth spy count sau khi cả 2 settle.
2. Viết `reauth.test.ts` — stubGlobal window; unstub trong afterEach; assert signOut/assign mỗi cái 1 lần sau 2 lời gọi.
3. Extend `kernel.test.ts`:
   - abort test: fake fetch never-resolve + reject với `signal.reason` khi abort; case timeout: `await fetchKernelSnapshot(baseUrl, AbortSignal.timeout(50))` reject với `reason.name === "TimeoutError"`; case controller-abort sau 10ms → `reason.name === "AbortError"`; case 3 (F8 fallback): stub `AbortSignal.any` về undefined → fetch với external signal + `AbortSignal.timeout(50)` vẫn reject timeout (fallback timeout-only hoạt động).
   - integration: build `createKernelQueryClient()` — dùng defaults (`retry: false` từ F7, KHÔNG cần override test instance); wire bus qua deps thật (postCommand = global fetch POST mock; refetch = qc.refetchQueries throwOnError); assert 4 outcome + id propagation.
4. Docs edits per Requirements (3 file, minimal diff).
5. Manual verification (thay test skeleton 5 — explicit decision): dev server + (a) throttle GET `/api/kernel` chậm → confirm SPA không render children (blank, không empty-org) trong lúc pending; (b) server 500 → error screen + Retry; (c) 401 → login redirect MỘT lần; (d) mid-session refresh fail — kill server sau 1 write ack → workspace + modal notice `committed` GIỮ NGUYÊN, KHÔNG unmount (F2); (e) full pass: sign-in, dashboard, 3 mutations đại diện (check-in, add-student, grade), reconcile sau committed.
6. Full gates tại repo root: `pnpm check` && `pnpm test` && `pnpm check-types` && `pnpm build` — tất cả xanh; push branch và confirm CI xanh.

## Todo

- [x] `query-client.test.ts` (defaults + onError/single-flight real-reauth)
- [x] `reauth.test.ts` (single-flight + returnUrl)
- [x] `kernel.test.ts` extend (abort compose theo signal.reason + bus 4-state integration, GET-fail 5xx)
- [x] 3 docs cập nhật
- [x] Full gates xanh local (check/test/check-types/build — 174 tests)
- [ ] Manual matrix (a)–(e) — DEFERRED to beta review (no local server stack)
- [ ] CI trên branch — pending push/PR

## Success Criteria

- [x] 5 test skeleton đều cover: (1) abort compose reject theo `signal.reason` từng case, (2) defaults test (`retry === false` + staleTime/refetch flags), (3) onError 401 + reauth single-flight (REAL reauth, 2 fetchQuery concurrent → signOut/assign mỗi cái 1 lần), (4) bus 4-state qua real QueryClient (GET-fail 5xx), (5) gate = manual verification documented (explicit, không vitest).
- [x] 26 call site `useData()` không đổi — grep verified trước/sau; app full-chức năng pass trên dev server DEFERRED to beta review.
- [x] Docs 3 file phản ánh đúng lớp Query mới (ownership + request flow + code map).
- [x] `pnpm check`, `pnpm test`, `pnpm check-types`, `pnpm build` xanh local — re-verified after review fixes; CI trên branch — pending push/PR.
- [x] `grep -r "setQueryData" apps/web/src` = 0; `grep -rn "queryKey.*kernel"` chỉ ra đúng 1 định nghĩa `kernelQueryKey`.

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal / response |
|------|-----|------------|------------------------------|
| Node env thiếu `window`/`location` → reauth test flaky | M×M | `vi.stubGlobal` + `vi.mock("@/lib/auth-client")`; cleanup afterEach. Nếu vẫn vướng: extract guard decision thành pure fn `shouldReauth(flag)` test thuần, window-touch giữ ngoài. | Test fail "window is not defined" → áp fallback pure-fn. |
| Real 50ms timeout test chậm/flaky trên CI runner load | L×L | 50ms là ngưỡng an toàn lớn hơn jitter CI; không dùng fake timers (phức tạp hóa AbortSignal.timeout). | Flaky CI → nâng 100-150ms (vẫn <vitest default timeout 5s). |
| Bus integration test phụ thuộc retry của client | L×L | Defaults đã `retry: false` (F7) — deterministic 1 GET/lần refetch, không cần override test instance. | Outcome nhảy giữa các run → verify defaults được dùng (không client nào còn retry). |
| Docs sửa lan man gây conflict với plan production-readiness | L×L | Minimal diff 3 file; chỉ thêm/không xóa dòng ownership hiện có. | Conflict merge sau này → resolve giữ cả hai hàng ownership. |
| CI đỏ do lockfile/dep mismatch trên turbo cache | L×M | `pnpm install` lại trước push; turbo cache key tự theo lockfile. | CI fail ở install step → rerun với `--force` một lần rồi điều tra. |

Nguồn: [researcher-02](./research/researcher-02-migration-semantics-testing.md) Q5 (node-env testing patterns).
