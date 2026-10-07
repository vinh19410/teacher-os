# System Architecture

Teacher OS is a monorepo: a React teacher web app, a React student portal, a Hono server, and shared packages for API contracts, persistence, and deployment wiring. The runtime contract is snapshot-driven: the browser reads a kernel snapshot, sends POST commands, and refreshes the snapshot after each write. Browser E2E coverage lives in [apps/e2e/playwright.config.ts](../apps/e2e/playwright.config.ts), which boots the real server app under Node against a fresh local D1 database so these flows run without Cloudflare credentials.

## Current request flow

1. Requests to apex and www (`teacheros.io.vn` / `www.teacheros.io.vn`) are served directly by the static landing page Worker (`apps/landing`, via `Cloudflare.Website.StaticSite`). The web app lives at `app.<domain>`, and the API lives at `api.<domain>` (see [packages/infra/src/topology.ts](../packages/infra/src/topology.ts)).
2. The auth route in [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) blocks unauthenticated users and sends them to login.
3. [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) subscribes to the shared TanStack Query `['kernel']` entry (`GET /api/kernel`) and waits for it before rendering children; kernel writes refetch that same entry through the command bus.
4. [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) maps UI actions to POST requests and maps kernel snapshots into the legacy UI shape.
5. [apps/server/src/app.ts](../apps/server/src/app.ts) installs CORS, the bootstrap middleware, and the `/api` router chain.
6. [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) enforces origin and JSON checks for POSTs, then executes org-scoped reads and writes.
7. [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) assembles the snapshot from the canonical database tables.
8. [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) is the persistence owner, and [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) is the wire contract owner.
9. [packages/api/src/skeleton.ts](../packages/api/src/skeleton.ts) owns occurrence-identity math (schedule skeleton, `conforms()`, offline backfill planning — issue #98); apps/server consumes it for generation, apps/web never re-implements it.

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
| Speaking submission files: private R2 bucket bound as `MEDIA`, reached only through an injected `MediaStore` (R2 in production, disk in E2E) and `/api/student/attempts/:id/media`; teacher grading replays the same file through `/api/grading/:attemptId/media` | [apps/server/src/lib/media-store.ts](../apps/server/src/lib/media-store.ts), [apps/server/src/lib/r2-media-store.ts](../apps/server/src/lib/r2-media-store.ts), and [apps/e2e/src/fs-media-store.ts](../apps/e2e/src/fs-media-store.ts) |
| Teacher grading of Writing/Speaking: `/api/grading/:attemptId` (org-scoped, submitted-only), scores stored on `quiz_attempt.grade_*`, band derived by `ieltsOverallBand` | [apps/server/src/routes/grading.ts](../apps/server/src/routes/grading.ts) and [packages/api/src/lib/ielts-band.ts](../packages/api/src/lib/ielts-band.ts) |
| Essay highlights + teacher notes on graded Writing: `/api/grading/:attemptId/annotations[/:id]` (create/patch/delete, each saves immediately; overlaps 409, span validated against the frozen essay by pure `snapSpanToWords`/`overlapsAny`/`segmentEssay` shared with web/student render) stored per-row in `quiz_attempt_annotation` | [apps/server/src/routes/grading.ts](../apps/server/src/routes/grading.ts), [packages/api/src/lib/essay-annotations.ts](../packages/api/src/lib/essay-annotations.ts), and [packages/ui/src/components/quiz/essay-with-highlights.tsx](../packages/ui/src/components/quiz/essay-with-highlights.tsx) |
| Web asset worker: static assets, SPA routes, HTTP 404 for unknown paths | [apps/web/src/worker.ts](../apps/web/src/worker.ts) with route classification in [apps/web/src/routes-matcher.ts](../apps/web/src/routes-matcher.ts) |
| Syllabus import file parsing (client-side; files never reach the server) | [apps/web/src/lib/syllabus-import.ts](../apps/web/src/lib/syllabus-import.ts) |
| Assignment prompt bank create and per-student grading routes | [apps/server/src/routes/assignments/index.ts](../apps/server/src/routes/assignments/index.ts) (subrouter of the kernel tree) |
| Student portal app and its bridge (mounted standalone at `/api/student`, outside the kernel tree; includes quiz attempt endpoints — snapshot at start, atomic autosave, server-side grading) | [apps/student](../apps/student) and [apps/server/src/routes/student.ts](../apps/server/src/routes/student.ts) |
| Web security headers and CSP stamping | [apps/web/src/security-headers.ts](../apps/web/src/security-headers.ts), applied by [apps/web/src/worker.ts](../apps/web/src/worker.ts) to every response |
| Deploy topology and auth cookie namespace | [packages/infra/src/topology.ts](../packages/infra/src/topology.ts) (derivation) and [packages/auth/src/topology.ts](../packages/auth/src/topology.ts) (validation) |
| Static landing page: zero-framework marketing site deployed at apex | [apps/landing](../apps/landing) |
| SePay Bank Hub integration (#320): injected `BankHubContext` client (R2-style optional dep), lifecycle webhooks `X-Secret-Key` at `/webhooks/sepay/bankhub/events`, balance IPN `Apikey` at `/webhooks/sepay/bankhub/ipn`, public pay data at `/public/pay/:token` — all mounted OUTSIDE `/api/*` | [apps/server/src/routes/bank-hub-webhooks.ts](../apps/server/src/routes/bank-hub-webhooks.ts), [apps/server/src/routes/bank-link.ts](../apps/server/src/routes/bank-link.ts), [apps/server/src/routes/public-pay.ts](../apps/server/src/routes/public-pay.ts), and [apps/e2e/src/fake-bank-hub.ts](../apps/e2e/src/fake-bank-hub.ts) (E2E fake) |

## Architectural rules

- Keep org scoping on the server; do not move it into client headers.
- Keep the bootstrap rule idempotent so a new authenticated teacher always lands in a usable workspace.
- Keep the snapshot contract stable for the web adapter; if the server shape changes, the adapter and contracts change with it.
- Keep scheduled lesson actions separate from curriculum lessons.
- Keep entitlement state on `session_package` owned by `student`; the package is always created attached to an `enrollment` — either with the student (package derived from the class) or via `POST /api/classes/:id/enroll` — and a student created without a class starts with no package.
- Keep deployment wiring in the infra package, not in app code.
- Keep syllabus file parsing in the browser; the server only receives validated JSON module trees (`POST /api/syllabi/:id/replace-content` applies the replacement as one atomic D1 batch).
- Keep the assignments router mounted inside the kernel route tree (`kernel.route("/assignments", ...)`) so the kernel's Origin + JSON CSRF guard covers every assignment write; never mount it standalone.
- Keep every rich-text surface (the 7 authoring HTML fields) rendering through the single DOMPurify sink `RichTextBody` in [packages/ui/src/components/assignments/rich-text-body.tsx](../packages/ui/src/components/assignments/rich-text-body.tsx) — the security boundary is having exactly one `dangerouslySetInnerHTML` site, so never add another. `cuePoints` deliberately stays plain text: its contract is one cue per line, not formatted prose.
- Keep the full security-header suite on every host; only the `Content-Security-Policy` header is dropped for localhost/loopback dev HTML (the dev worker serves Vite-transformed HTML whose inline React-Refresh preamble cannot pass `script-src 'self'`), while prod and staging keep it.
- Keep unknown web paths answering HTTP 404 from the asset worker (branded SPA shell for browser navigations, plain text otherwise); never serve unknown paths as a 200 SPA rewrite.
- Keep auth topology (origins, cookie domain, cookie namespace prefix) derived from `APP_DOMAIN` in the topology modules. Because staging is a subdomain of the prod apex, browsers send prod's parent-domain session cookie to the staging API too; any non-prod member of that cookie zone must namespace its auth cookies (`teacheros-staging`) so the foreign cookie cannot shadow its sessions, while prod and local stay on the default `better-auth` names.
- Keep the account-role separation in force across all three layers (plan #260): sign-up stamps `user.role` from the originating app's Origin — with the app server-side-stamped into the OAuth state at `/sign-in/social` initiation so Google callbacks classify correctly even on old client bundles; `databaseHooks.session.create.before` rejects cross-app sign-ins (`ROLE_MISMATCH`); and the API middlewares gate the mismatch (`bootstrapMiddleware` blocks `student` roles with 403 `ACCOUNT_STUDENT_ROLE`, `requireStudent` blocks `teacher` roles with 403 `ACCOUNT_TEACHER_ROLE` before any email match/provisioning). The API gate exists because both apps share one cross-subdomain cookie zone — a portal session is already valid on `app.<domain>` without re-signing-in, so form-level rejection alone is not a security boundary.
- Keep the payment ledger (`payment_transaction`) the single source of truth for `invoice.paid_amount` (#320): every inbound amount goes through `ingestTransaction` (idempotent on `UNIQUE(provider, provider_txn_id)`), and `paid_amount` is always recomputed from `SUM(matched)` — never incremented in place. Only assign/matching writes touch it; no route lets a client write `paid_amount`/`status` directly.
- Keep transfer-matching tenant-scoped: a code is only matched against invoices of the org that owns the receiving `bank_account_xid`; a valid code of another org lands as `foreign_code` under the receiving org with `content`/`payment_code` redacted in DTOs.
- Keep the Bank Hub webhooks and the public pay endpoint mounted outside `/api/*` (bootstrap middleware 403s student roles there and the pay page must work signed-out); webhook auth is the `X-Secret-Key` / `Apikey` headers compared with `timingSafeEqual`. SePay retries only on network errors, so the IPN handler acks even on org-resolution API failure (reconciliation recovers) and answers `{"success": true}` for anything it ignores.

