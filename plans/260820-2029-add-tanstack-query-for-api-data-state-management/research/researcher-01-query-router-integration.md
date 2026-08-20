# Research: TanStack Query v5 × TanStack Router integration (teacher-os)

Researcher agent report, 2026-08-20. Sources at bottom.

## Findings

### 1. Version & install (Vite SPA, React 19)

- `@tanstack/react-query` latest: **5.101.4** (npm, 2026-08-20). DevTools same version.
- Peer dep `react: "^18 || ^19"` → React 19 fully supported, no flags.
- Install: `pnpm add @tanstack/react-query @tanstack/react-query-devtools` in `apps/web`.

### 2. Provider placement + "router with context" pattern

Official pattern: create `QueryClient` outside the router, pass into router context via `createRootRouteWithContext`, wrap `RouterProvider` with `QueryClientProvider` in main.tsx. Loaders (outside React) get the client from router context; components get it from the provider.

```tsx
// main.tsx
const queryClient = new QueryClient()
const router = createAppRouter(queryClient)
createRoot(el).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
```

Note: our chosen design does NOT need router context (no loaders fetch the kernel query; the DataProvider subscribes via `useQuery`), so we only need the `QueryClientProvider` wrap. Router-context wiring is a documented future option if loader-based preloading is ever adopted.

### 3. Query in loaders/beforeLoad — load-gate options compared

Router docs recommend `contextQueryClient.ensureQueryData(options)` awaited in a `loader`; result is cached so children `useQuery` hits cache instantly.

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| (A) `ensureQueryData` in parent-route loader | loader blocks render until snapshot resolves | fetch starts before render; preload on intent | must share one `queryOptions`; error handling moves to router errorComponent |
| (B) `useSuspenseQuery` + pendingComponent | Suspense gate | pure React | fetch starts at mount; **cancellation does not work with suspense hooks** (cancellation guide) → loses 15s abort composition |
| (C) Provider `useQuery` + manual gate on `isPending`/`isError` | keep current gate shape | behavior 1:1 with today's DataProvider gate + blocking error/retry UI | no router preload |

**Chosen for this plan: (C)** — preserves the shipped fail-safe first-load contract (blocking error + retry, 401 re-auth) with minimal behavioral delta. (A) documented as future enhancement.

### 4. DevTools

`@tanstack/react-query-devtools`: `TanStackQueryDevtools` rendered at root. Tree-shakeable and **excluded from production builds by default** — no manual `import.meta.env.DEV` gating needed.

### 5. Defaults for a single-snapshot app

v5 defaults: `staleTime: 0`, `gcTime: 5m`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`, `retry: 3` exponential, structural sharing on.

Recommended for teacher-os (low-traffic pilot, all data = one snapshot, writes refetch it):

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,        // data only changes via own mutations
      gcTime: 5 * 60 * 1000,
      retry: <custom fn>,         // skip 4xx + malformed; cap attempts
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})
```

Keep structural sharing (default) — preserves sub-object references across refetches, avoids re-rendering the whole tree each snapshot refresh.

### 6. Context store → Query migration guidance

No official Context→Query migration doc. Community standard (incl. TkDodo): server state lives in Query cache; Context only for client state. Keeping the provider as a thin `useQuery` subscriber that re-exposes a stable context API is workable; docs favor custom hooks + `select` per consumer long-term. `select` pitfalls: inline `select` re-runs every render (wrap in useCallback / stable ref); `select` is not the place to throw — shape-guard stays in `queryFn`.

### 7. better-auth useSession coexistence

`useSession` is nanostores-atom based inside the better-auth client; no shared state with React Query → no conflict. Do NOT duplicate session into the query cache. Kernel snapshot in Query; session stays in better-auth.

## Adoption risk

- Library risk: low (v5 mature; breaking changes only in v6, not stable).
- Stack conflicts: none (Router v1 file-based + Form unrelated to data layer).
- Main refactor risk: two different queryKeys for the snapshot → centralize ONE exported `kernelQueryOptions`.

## Sources

- https://tanstack.com/query/latest/docs/framework/react/installation
- https://registry.npmjs.org/@tanstack/react-query/latest
- https://tanstack.com/router/latest/docs/framework/react/guide/router-context
- https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading
- https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- https://tanstack.com/query/latest/docs/framework/react/devtools
- https://www.better-auth.com/llms.txt
