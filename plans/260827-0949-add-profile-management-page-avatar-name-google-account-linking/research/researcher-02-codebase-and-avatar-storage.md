# Research: Profile page — codebase scan + avatar storage options

Date: 2026-08-27. Scope: Part A codebase facts (file:line cited), Part B avatar storage decision for solo-dev Teacher OS.

---

## PART A — CODEBASE SCAN

### A1. Server: better-auth mount, route organization, uploads

- **Better-auth mount**: `apps/server/src/app.ts:98` — `app.on(["POST", "GET"], "/api/auth/*", (c) => deps.authHandler(c.req.raw))`. `isAuthPath()` (`app.ts:31-33`) exempts `/api/auth` from the bootstrap middleware (`app.ts:46-48`). The auth instance is memoized in `apps/server/src/index.ts:17-33` via `createAuth()` from `packages/auth/src/index.ts:27-65` — better-auth with drizzle sqlite adapter, google social provider (`packages/auth/src/index.ts:37-42`), `emailAndPassword.enabled` (`:43-45`), SameSite=None secure cookies (`:48-63`). **No `account.accountLinking` block → better-auth default (enabled) applies.** better-auth version: `1.6.27` (`pnpm-workspace.yaml:15`).
- **Route organization**: everything hangs off `app.route("/api", kernelRoutes(deps))` (`app.ts:103`). `kernelRoutes` (`apps/server/src/routes/kernel.ts:107`) installs a **CSRF middleware at `kernel.ts:113-124`: every POST must (a) have `Origin === corsOrigin` else 403, and (b) `Content-Type: application/json` else 415.** Sub-routers (`routes/assignments/index.ts`, `routes/reporting/index.ts`) are mounted *inside* `kernelRoutes` via `kernel.route()` so that guard covers them ("never mount this standalone", `routes/assignments/index.ts:9-12`). New API endpoints belong in this chain; a **multipart upload endpoint would violate the JSON-only convention** and needs an explicit carve-out.
- **Existing upload/multipart handling: NONE.** Grep for `multipart|formData|FormData|upload` across `apps/server/src`, `apps/web/src`, `packages/*` returns no route/handler hits. `user.image` column already exists but is unused by app code (`packages/db/src/schema/auth.ts:11` — `image: text("image")`).
- Session resolution server-side: `apps/server/src/session.ts:16-25` — `getSessionUser()` returns only `{ userId, userName }` via `auth.api.getSession({ headers })` (DB-backed lookup). The org bootstrap uses `userName` (`app.ts:64`).

### A2. Web auth guard + routing conventions

- **Guard**: `apps/web/src/routes/_auth/route.tsx:5-22` — `beforeLoad` calls `await authClient.getSession()`; no `session.data` → `redirect({ to: "/login", search: { returnUrl: location.href } })`; returns `{ session }` as route context. Sidebar re-asserts the invariant (`components/layout/sidebar.tsx:194-201`: missing session → `throw redirect({ to: "/login" })`). A new `/_auth/profile` route inherits the guard for free by living under `_auth/`.
- **Naming convention**: flat files under `routes/_auth/` (`settings.tsx`, `dashboard.tsx`, …) plus folders with `index.tsx` + `$param.tsx` (`students/index.tsx`, `students/$studentId.tsx`). Each route is `createFileRoute("/_auth/x")({ component })` (e.g. `settings.tsx:11-13`). **A new page must also be added to `routeTitles` in `apps/web/src/components/layout/app-shell.tsx:7-22`** (keyed by route id, e.g. `"/_auth/profile": "Hồ sơ"`) or the topbar title renders empty.
- `login.tsx:36` uses `authClient.useSession()` for pending state only.

### A3. Where the current user shows today; Profile entry point

- **Topbar shows NO user** — only menu button, page title, search, notif bell (`components/layout/topbar.tsx:41-108`).
- **Sidebar footer is the user display**: `components/layout/sidebar.tsx:256-299`:
  - initials circle (no `<img>`, no `user.image` use): `<span className="inline-grid h-9 w-9 ...">{initials}</span>` (`:258-260`); initials derived from `user.name` (`:203-214`);
  - `<span className="truncate">{displayName}</span>` (`:263`) with hardcoded `PRO` badge (`:264-266`);
  - `<div className="truncate text-muted-fg text-xs">Google</div>` (`:268`) — **hardcoded, not real account status**;
  - sign-out button calling `authClient.signOut` (`:270-297`).
- **Natural Profile entry points**: (1) wrap the sidebar footer user block (`sidebar.tsx:257-269`) in a `Link to="/profile"`; (2) show `user.image` in the initials slot. Note **`routes/_auth/settings.tsx:59-119` already renders a static, fake "Thông tin giáo viên" card** (hardcoded name "Trần Mai Lan", disabled "Email (Google)" input) — the plan must decide whether profile page replaces that card to avoid two competing name editors.
- Dashboard greeting also reads the name: `routes/_auth/dashboard.tsx:33-37` (`useRouteContext({ from: "/_auth" })` → `session.data.user.name`).

### A4. Form + modal patterns — which one a profile form should follow

Two established patterns:

1. **Kernel data forms** (all `components/modals/*.tsx`): local `useState` fields + `useKernelFormSubmit()` (`apps/web/src/lib/use-kernel-form-submit.ts:18-92`) → `dispatch(KernelAction)` (`lib/data-actions.ts:4-110` union) → `kernelCommand()` maps action→`{path, body}` (`lib/repos/kernel.ts:37-146`) → `postKernelCommand()` `fetch POST` JSON `credentials: "include"` with 15s timeout (`repos/kernel.ts:216-231`) → serialized bus refetches the shared `['kernel']` query (`lib/data-provider.tsx:85-117`). Modal pattern: custom `Modal` (`components/ui/modal.tsx`, focus-trapped), `Field/Input/Select/Textarea` (`components/ui/field.tsx`), inline `<p role="alert">` error + `KernelSubmitNotice` (e.g. `add-student-modal.tsx:77-163`).
2. **Auth forms** (`components/sign-in-form.tsx`, `google-oauth-button.tsx`): `@tanstack/react-form` (dep in `apps/web/package.json`) + direct `authClient.*` calls + `toast.success/error` from sonner (`sign-in-form.tsx:12-50`; `google-oauth-button.tsx:40-55`).

**Profile (name/avatar/Google link) is better-auth user data, NOT kernel/org data — the kernel snapshot does not include the user profile.** Forcing it through `KernelAction`/`data-actions.ts` would pollute the org-scoped command bus with auth concerns. **Recommend pattern 2**: `authClient.updateUser({ name, image })` (better-auth built-in, see Part B sources) inside a page form (not a modal), toast feedback, then refresh session context (`router.invalidate()` or re-`getSession`) so sidebar/dashboard pick up the new name. `linkSocial` for the Google button (Part B). Page-level layout should follow `settings.tsx` (PageHead + Card + Field), not a modal.

### A5. TanStack Query wiring

- One QueryClient from `lib/query-client.ts:13-39`: `staleTime: Infinity`, `retry: false`, `refetchOnWindowFocus/Reconnect: false`, `networkMode: "offlineFirst"`, and a `QueryCache.onError` that fires `reauth()` on any 401.
- Single source of truth: `['kernel']` query via `kernelQueryOptions(baseUrl)` (`repos/kernel.ts`), subscribed in `DataProvider` (`data-provider.tsx:69-75`); writes go through a **custom serialized command bus** (`createKernelCommandBus`, `data-provider.tsx:85-102`) — *not* `useMutation`. No other query keys exist today. A profile mutation that touches auth state needs neither the bus nor the kernel query; keep it direct.

### A6. packages/ui + web-local primitives

- `packages/ui/src/components/`: attachment, bubble, button, card, checkbox, dropdown-menu, empty, input-group, input, label, marker, message-scroller, message, skeleton, sonner, textarea, tooltip. **No Avatar, no dialog** (Base UI style; `dropdown-menu.tsx` uses `MenuPrimitive`).
- The web app mostly uses **its own local primitives** in `apps/web/src/components/ui/`: `avatar.tsx` (initials-only — `text: string` prop, renders `{text}` in a span, **no image src support**, `avatar.tsx:11-31`), `button.tsx` (variants primary/secondary/ghost/danger), `card.tsx` (`variant="white"`), `field.tsx` (`Field`/`Input`/`Select`/`Textarea` with label+error injection), `modal.tsx`, `tabs.tsx`, `badge.tsx`, `page-head.tsx`, `section-label.tsx`. From `@teacher-os/ui` the web app only imports `globals.css`, `cn`, sonner `Toaster`, and one Button (`grep "@teacher-os/ui" apps/web/src`).
- Toast: `<Toaster richColors theme="light" />` mounted in `routes/__root.tsx:41`. Sonner is wired and used (`toast.error` in `google-oauth-button.tsx:53`).

### A7. Feedback patterns; reauth.ts

- **Toast (sonner)** for direct actions and auth errors: `lib/kernel-outcome.ts:1,59` (`reportDirectOutcome` decision table), `google-oauth-button.tsx:53`, `sign-in-form.tsx` `onError`.
- **Inline modal error + notice** for kernel forms: `add-student-modal.tsx:135-148`; auth pages use `components/auth/notices.tsx`.
- `lib/reauth.ts:25-32`: **single-flight 401 handler** — best-effort `authClient.signOut()` then full-page `location.assign("/login?returnUrl=…")` (validated URL). Shared by the QueryCache 401 path (`query-client.ts:29-37`) and the write bus (`data-provider.tsx:99`). A profile page hitting 401 gets this for free via better-auth client errors or fetch helpers.

### A8. Tests + CI

- **Contract tests**: vitest, *source-parse style* — they read sibling source files with `readFileSync` and regex-assert structure (e.g. `apps/web/src/lib/kernel-runtime.contract.test.ts:1-80` asserts `useQuery(kernelQueryOptions(`, `onAuthLost: reauth`, etc.; siblings: `students-peel`, `classes-peel`, `add-student-enroll` contract tests). Web tests run via `vitest` (`apps/web/package.json` scripts).
- **Server tests**: colocated `apps/server/src/*.test.ts` (e.g. `kernel.test.ts`, `auth-roundtrip.test.ts`) run against a buildApp with injected deps.
- **E2E**: `apps/e2e/specs/*.spec.ts` (Playwright). **No auth stubbing** — real sign-up through the UI: `specs/helpers.ts:6-19` `signUpViaUi(page)` fills `#su-name/#su-email/#su-password` and expects `/dashboard`. API boots via `pnpm run boot:api` → `apps/e2e/src/boot.ts` (tsx + libsql + real better-auth) on :8000 with `/readyz` health check; web on :8001 (`playwright.config.ts:27-43`). A profile e2e would reuse `signUpViaUi` then navigate to `/profile`.
- **CI**: `.github/workflows/ci.yml` (biome check → `pnpm test` → `check-types` → build) and `.github/workflows/e2e.yml` (Playwright chromium, cached). Root `package.json` also runs `test:ci-workflow` and `test:topology-drift` guards.

### A9. packages/infra — provisioned resources, bindings

- `packages/infra/alchemy.run.ts`: **D1 only** — `Cloudflare.D1.Database("database")` (`:59-61`) + `Cloudflare.Worker("server")` (`:63-82`) with env `DB, CORS_ORIGIN, BETTER_AUTH_SECRET, BETTER_AUTH_URL, COOKIE_DOMAIN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET` (`:69-77`) + `Cloudflare.Website.Vite("web")` (`:94-110`). **No R2, no KV, no object storage anywhere.**
- No wrangler.toml/wrangler.jsonc exists (`find` returned nothing) — worker types derive from Alchemy: `packages/env/env.d.ts` infers `Env` from `ServerEnv` in `alchemy.run.ts`, so adding an R2 binding in `alchemy.run.ts` auto-extends worker types (good), but also changes deployed infra (topology-drift test sensitivity).

### A10. How user data reaches the web app

- **The web app relies on better-auth's session, not a kernel endpoint.** `/api/kernel` returns org data only (students/classes/…; `server/src/routes/kernel.ts:324-327` → `loadSnapshot`). The user object flows: `_auth` `beforeLoad` → `authClient.getSession()` (`route.tsx:8`) → route context → consumers `useRouteContext({ from: "/_auth" })` (`sidebar.tsx:194`, `dashboard.tsx:33`). Login page uses `authClient.useSession()` (`login.tsx:36`). `SessionUser` server-side only carries `{userId, userName}` (`session.ts:3-6`).
- Consequence: after `authClient.updateUser()`, the cached route-context session is stale — the plan needs an explicit refresh (`router.invalidate()` re-runs beforeLoad, or a full reload like the login flow does in `sign-in-form.tsx:41-46`).

---

## PART B — AVATAR STORAGE OPTIONS

### Facts that drive the decision

- **D1 limits** (developers.cloudflare.com/d1/platform/limits/): max string/BLOB/row size **2 MB**; max SQL statement length **100 KB** (drizzle uses bound parameters, so a large TEXT value is fine; inline literals are not); DB size 10 GB paid / 500 MB free.
- **better-auth sessions** (better-auth.com/docs/concepts/session-management): default is **database-backed sessions with an opaque `session_token` cookie** — the user object is NOT in the cookie. `getSession` joins session→user in the DB per request (cookie cache optional and not enabled here — `packages/auth/src/index.ts` has no `session.cookieCache`). So `user.image` never inflates cookies; it only inflates the JSON body of `/api/auth/get-session` responses (fetched by `beforeLoad` on entry to `_auth`, not on every child navigation).
- **better-auth updateUser** (better-auth.com/docs/concepts/users-accounts): `await authClient.updateUser({ name, image })` is a built-in client call; no documented format constraint on `image` (schema column is plain `text`).
- **Account linking** (same page): `await authClient.linkSocial({ provider: "google", callbackURL })` links Google to the signed-in user; default `accountLinking.enabled` is true; same-email OAuth sign-ins auto-link for trusted providers. Status can be read from the `account` table (`packages/db/src/schema/auth.ts:42-70`, `providerId`) or `authClient.listAccounts()`.
- **R2** (developers.cloudflare.com/r2/pricing/): free tier 10 GB-month storage, 1M Class A + 10M Class B ops/month, **zero egress**. Alchemy provisions R2 as `Cloudflare.R2.Bucket` + a Worker binding (alchemy.run/cloudflare/data/r2/; github.com/alchemy-run/alchemy README shows `bindings: { Bucket }`). Workers accept request bodies up to 100 MB.
- Current infra has **zero** storage resources; the kernel POST middleware is **JSON-only** (`routes/kernel.ts:113-124`) — an upload endpoint is a new convention, not an extension.

### Option comparison

| Dimension | A: data URL in `user.image` | B: R2 + upload endpoint | C: URL input only |
| --- | --- | --- | --- |
| Infra change | none | new R2 bucket + binding + alchemy redeploy | none |
| New server code | none (authClient.updateUser) | multipart/raw POST route outside JSON guard, or presigned-URL flow; serve via r2.dev/custom domain or /api proxy | none |
| D1 impact | row +~20-100 KB, bound-param safe, ≪2 MB limit | row +~60 B (URL) | negligible |
| Session payload | get-session JSON grows by data URL (~20-100 KB) on each `_auth` entry | grows by ~60 B | negligible |
| Cookie size | unchanged (opaque token, DB session) | unchanged | unchanged |
| Caching/CDN | none (but inline, zero requests) | excellent (edge cache) | n/a |
| Failure surface | smallest | CORS + presign + bucket policy + drift tests | smallest |
| UX | real upload after client resize | real upload, original quality | worst (teacher must host image) |
| Effort (solo dev) | ~1 day | ~3-5 days incl. infra + tests | hours |

### Recommendation: **Option A** — client-side resize → data URL → `user.image`

Resize on the client with `<canvas>` to ≤256×256 JPEG (quality ~0.8), yielding ~15-40 KB binary → ~20-55 KB base64. Enforce a hard cap (e.g. reject if encoded length >100 KB) in the form before calling `authClient.updateUser({ image: dataUrl })`. Rationale:

1. Zero new infra, zero new endpoints, zero CSRF-middleware carve-outs — matches KISS and the repo rule "keep POST writes JSON-only" (`docs/code-standards.md` "Writing conventions").
2. The `user.image` column already exists (`packages/db/src/schema/auth.ts:11`); better-auth owns its shape and `updateUser` is first-party.
3. Cookie-size fear is unfounded here: sessions are DB-backed with an opaque token cookie (verified above). The only cost is a fatter get-session response on `_auth` entry — at ≤100 KB this is acceptable for a single-user app.
4. D1 2 MB row limit gives 20-40× headroom; drizzle binds params so the 100 KB statement cap never applies.
5. R2 is the "right" architecture at scale (CDN, any file size) but buys nothing for one avatar; it adds an alchemy resource, a binding, a non-JSON upload path, and serving/CORS decisions — the exact complexity a solo dev should defer until multi-image features exist.

Guards for the plan: cap encoded size ≤100 KB; extend the local `Avatar` component (`apps/web/src/components/ui/avatar.tsx`) with an optional `src` (img with initials fallback); sidebar falls back to initials when `image` is empty.

---

## Unresolved questions

1. Does `router.invalidate()` after `authClient.updateUser` re-run `_auth` `beforeLoad` cheaply enough, or should the profile save do a full `window.location.assign` like the login flow (`sign-in-form.tsx:41-46`)? Verify during implementation.
2. Replace or keep the static "Thông tin giáo viên" card in `settings.tsx:59-119` (product decision — two name editors is a bug magnet).
3. Google link status source: `authClient.listAccounts()` vs a server read of the `account` table — pick one; no existing code reads `account`.
4. Whether to also show the avatar in the topbar (currently no user element there at all) — scope decision for the planner.

## Key sources (Part B)

- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- better-auth session management: https://www.better-auth.com/docs/concepts/session-management
- better-auth users/accounts + updateUser + linkSocial: https://www.better-auth.com/docs/concepts/users-accounts
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Alchemy R2: https://alchemy.run/cloudflare/data/r2/ and https://github.com/alchemy-run/alchemy
