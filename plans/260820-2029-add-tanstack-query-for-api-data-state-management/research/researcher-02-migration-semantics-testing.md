# Research: TanStack Query v5 migration semantics + testing (teacher-os)

Researcher agent report, 2026-08-20. Sources at bottom.

## Findings

### Q1. Snapshot read: `['kernel']` + AbortSignal composition

`queryFn` receives `{ signal }`. Standard pattern:

```ts
queryFn: async ({ signal }) => {
  const composed = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  const res = await fetch('/api/kernel', { signal: composed, credentials: 'include' })
  // shape-guard → return snapshot | throw MalformedSnapshotError
}
```

- Semantics change vs manual fetch: consuming the signal means unmount-cancel aborts the fetch and reverts query state (documented).
- `AbortSignal.any`: Safari 17.4+ / Node 20.3+ (MDN). CI runs Node 24 → vitest OK. Fallback (manual AbortController + listener) documented in cancellation guide if a target browser needs it.
- Default retry = 3 with exponential backoff; use a `retry` function to fail fast on 4xx/MalformedSnapshotError and cap attempts.

### Q2. Post-write refresh: preserve the 4-state KernelCommandResult

Semantics (QueryClient reference + invalidation guide):

- `invalidateQueries`: marks stale + refetches ACTIVE queries (default `refetchType: 'active'`). For an always-mounted snapshot query ≈ refetch.
- `refetchQueries`: forced refetch by filter; await-able; `{ throwOnError: true }` makes it THROW on refetch failure (default: only logs).
- `setQueryData`: NOT applicable (POST returns `{ok:true}`, not the new snapshot).

Pattern preserving the existing contract:

```ts
async function runCommand(cmd: KernelAction): Promise<KernelCommandResult> {
  try {
    await postCommand(cmd)
  } catch (e) {
    return classifyWriteFailure(e) // definite-failure (4xx) | outcome-unknown (5xx/408/429/network)
  }
  try {
    await queryClient.refetchQueries({ queryKey: ['kernel'], exact: true }, { throwOnError: true })
    return { state: 'refreshed' }
  } catch {
    return { state: 'committed' } // 2xx committed, refresh failed — current contract
  }
}
```

### Q3. Serialized queue + dedupe: keep the plain module bus

- v5 `useMutation` `scope: { id }` serializes mutations in a queue (isPaused → auto-resume) — but has NO dedupe, and hook callbacks are last-write-wins.
- Plain-module bus POSTs bypass MutationCache entirely → `MutationCache.onError` CANNOT catch bus POST errors (incl. 401). Bus must keep its own 401 handling (`onAuthLost`).
- **Recommendation (ranked):** keep the existing bus (serialize + JSON dedupe + classify) as a module; it drives `queryClient.refetchQueries` after POST. `useMutation` adoption deferred.

### Q4. Global 401 handling + retry policy

- `QueryCache`/`MutationCache` accept `onError` at construction; global cache callbacks are ALWAYS called (cannot be overridden per-query).
- Read path: `QueryCache.onError` → if HttpError 401 → reauth(). Write path: bus keeps `onAuthLost`.
- **Race risk (kongming-confirmed):** concurrent read+write 401s can double-call reauth() → guard reauth single-flight (module flag reset on navigation/sign-in).
- Retry as function:

```ts
retry: (failureCount, error) => {
  if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false
  if (error instanceof MalformedSnapshotError) return false
  return failureCount < 2
}
```

- `throwOnError` on `useQuery`: keep default false (provider renders the gate/error UI from status). Only the explicit `refetchQueries` call uses `throwOnError: true`.
- Mutations default `retry: 0` — matches bus self-managed classification (do not enable mutation retry).

### Q5. Testing with vitest (node env, no jsdom)

- Official testing guide documents renderHook + wrapper (needs DOM). For node-env repo: queryFn is "a function returning a promise" → test `await queryFn({ signal })`, bus serialization/dedupe/classify as pure modules (mock global fetch) with NO render.
- `queryClient.fetchQuery(options)` executes the real queryFn through the cache without React → node-safe integration test of queryFn + retry + cache behavior.
- If hook-level tests ever needed: add jsdom/happy-dom env for those files only; disable retry (`retry: false`) in test clients; beware fake timers × retryDelay.
- `QueryCache.onError` testing: construct a real QueryClient with the onError spy in node, call `fetchQuery` with a failing queryFn, assert the callback fired (no DOM needed).

### Q6. Provider vs hooks

Docs favor custom hooks calling useQuery directly; a Context provider wrapping useQuery and re-exposing a STABLE api is workable. Pitfalls: expose fine-grained values (not whole result object) to limit re-renders; selectors need stable references; do NOT use `useSuspenseQuery` for the kernel (loses cancellation).

## Architecture recommendations

1. Read: `useQuery` on single exported `kernelQueryOptions`; `AbortSignal.any` 15s; retry fn skipping 4xx/malformed, cap 2.
2. Write: keep module bus (serialize + dedupe + classify); bus uses `queryClient.refetchQueries({queryKey:['kernel'], exact:true}, {throwOnError:true})` → refreshed/committed. No setQueryData.
3. 401: `QueryCache.onError` → reauth() with single-flight guard; bus keeps onAuthLost (same guard).
4. Tests: pure node-env tests for queryFn/bus/classify + QueryClient.fetchQuery integration; no jsdom.
5. Provider: thin `useQuery` subscriber preserving existing context API; no suspense.

## Sources

- https://tanstack.com/query/latest/docs/framework/react/guides/queries
- https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
- https://tanstack.com/query/latest/docs/framework/react/guides/mutations
- https://tanstack.com/query/latest/docs/framework/react/reference/useMutation
- https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- https://tanstack.com/query/latest/docs/reference/QueryClient
- https://tanstack.com/query/latest/docs/framework/react/guides/query-retries
- https://tanstack.com/query/latest/docs/reference/QueryCache
- https://tanstack.com/query/latest/docs/reference/MutationCache
- https://tanstack.com/query/latest/docs/framework/react/reference/useQuery
- https://tanstack.com/query/latest/docs/framework/react/guides/testing
- https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations
- https://tkdodo.eu/blog/testing-react-query
- https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static
