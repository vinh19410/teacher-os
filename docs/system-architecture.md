# System Architecture

Teacher OS is a three-layer monorepo: a React web app, a Hono server, and shared packages for API contracts, persistence, and deployment wiring. The runtime contract is snapshot-driven: the browser reads a kernel snapshot, sends POST commands, and refreshes the snapshot after each write. Browser E2E coverage lives in [apps/e2e/playwright.config.ts](../apps/e2e/playwright.config.ts), which boots the real server app under Node against a fresh local D1 database so these flows run without Cloudflare credentials.

## Current request flow

1. The auth route in [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) blocks unauthenticated users and sends them to login.
2. [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) subscribes to the shared TanStack Query `['kernel']` entry (`GET /api/kernel`) and waits for it before rendering children; kernel writes refetch that same entry through the command bus.
3. [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) maps UI actions to POST requests and maps kernel snapshots into the legacy UI shape.
4. [apps/server/src/app.ts](../apps/server/src/app.ts) installs CORS, the bootstrap middleware, and the `/api` router chain.
5. [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) enforces origin and JSON checks for POSTs, then executes org-scoped reads and writes.
6. [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) assembles the snapshot from the canonical database tables.
7. [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) is the persistence owner, and [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) is the wire contract owner.
8. [packages/api/src/skeleton.ts](../packages/api/src/skeleton.ts) owns occurrence-identity math (schedule skeleton, `conforms()`, offline backfill planning — issue #98); apps/server consumes it for generation, apps/web never re-implements it.

## Boundary map

| Boundary | Current owner |
| --- | --- |
| Browser shell and route guard | [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) |
| Client kernel store and bus | [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) and [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) |
| App bootstrap and org creation | [apps/server/src/app.ts](../apps/server/src/app.ts) |
| Kernel reads/writes and CSRF checks | [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) |
| Snapshot assembly | [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) |
| Persistent rows and constraints | [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) |
| Kernel DTOs and request bodies | [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) |
| API Cloudflare worker and D1 wiring | [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts) |
| Web asset worker: static assets, SPA routes, HTTP 404 for unknown paths | [apps/web/src/worker.ts](../apps/web/src/worker.ts) with route classification in [apps/web/src/routes-matcher.ts](../apps/web/src/routes-matcher.ts) |
| Syllabus import file parsing (client-side; files never reach the server) | [apps/web/src/lib/syllabus-import.ts](../apps/web/src/lib/syllabus-import.ts) |
| Assignment prompt bank create and per-student grading routes | [apps/server/src/routes/assignments/index.ts](../apps/server/src/routes/assignments/index.ts) (subrouter of the kernel tree) |
| Web security headers and CSP stamping | [apps/web/src/security-headers.ts](../apps/web/src/security-headers.ts), applied by [apps/web/src/worker.ts](../apps/web/src/worker.ts) to every response |
| Deploy topology and auth cookie namespace | [packages/infra/src/topology.ts](../packages/infra/src/topology.ts) (derivation) and [packages/auth/src/topology.ts](../packages/auth/src/topology.ts) (validation) |

## Architectural rules

- Keep org scoping on the server; do not move it into client headers.
- Keep the bootstrap rule idempotent so a new authenticated teacher always lands in a usable workspace.
- Keep the snapshot contract stable for the web adapter; if the server shape changes, the adapter and contracts change with it.
- Keep scheduled lesson actions separate from curriculum lessons.
- Keep entitlement state on `session_package` owned by `student`; `enrollment` is the optional class attachment (a package can be parked without a class).
- Keep deployment wiring in the infra package, not in app code.
- Keep syllabus file parsing in the browser; the server only receives validated JSON module trees (`POST /api/syllabi/:id/replace-content` applies the replacement as one atomic D1 batch).
- Keep the assignments router mounted inside the kernel route tree (`kernel.route("/assignments", ...)`) so the kernel's Origin + JSON CSRF guard covers every assignment write; never mount it standalone.
- Keep the full security-header suite on every host; only the `Content-Security-Policy` header is dropped for localhost/loopback dev HTML (the dev worker serves Vite-transformed HTML whose inline React-Refresh preamble cannot pass `script-src 'self'`), while prod and staging keep it.
- Keep unknown web paths answering HTTP 404 from the asset worker (branded SPA shell for browser navigations, plain text otherwise); never serve unknown paths as a 200 SPA rewrite.
- Keep auth topology (origins, cookie domain, cookie namespace prefix) derived from `APP_DOMAIN` in the topology modules. Because staging is a subdomain of the prod apex, browsers send prod's parent-domain session cookie to the staging API too; any non-prod member of that cookie zone must namespace its auth cookies (`teacheros-staging`) so the foreign cookie cannot shadow its sessions, while prod and local stay on the default `better-auth` names.

