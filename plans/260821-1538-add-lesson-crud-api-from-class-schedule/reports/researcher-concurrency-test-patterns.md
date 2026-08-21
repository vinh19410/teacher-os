# Research report: idempotency, concurrency, routing, tests, contracts, deploy (issue #55)

Worktree: `feat/55-lesson-crud-api-from-class-schedule` (from `develop`). All paths relative to repo root unless absolute.

## Idempotency pattern

**Contract** — `packages/api/src/contracts.ts:140-146`: `commentBankCreateSchema` is `.strict()` with `text: z.string().trim().min(1).max(2000)` + `operationId: z.string().uuid()`. Client generates a UUID per logical operation.

**Backing unique index (org-scoped)** — `packages/db/src/schema/comment-bank.ts:27-30`: `uniqueIndex("comment_bank_org_operation_uidx").on(table.orgId, table.operationId)`; created in `packages/db/src/migrations/0006_pink_ender_wiggin.sql:17`. So dedupe scope is per-org: two orgs may reuse the same operationId.

**Implementation** — `apps/server/src/routes/reporting/index.ts:45-89`, three-branch flow:

1. Server generates a fresh row id (`crypto.randomUUID()`, line 58), then a single atomic INSERT:
   `db.insert(commentBank).values({...}).onConflictDoNothing({ target: [commentBank.orgId, commentBank.operationId] }).returning({ id })` (lines 60-72).
2. Row returned → **201** with the new id (line 73).
3. No row (conflict swallowed) → SELECT existing by `(orgId, operationId)` (lines 75-83):
   - missing row → 409 `"comment write conflict"` (line 84, defensive; shouldn't happen),
   - payload mismatch (`existing.text !== body.data.text`) → 409 `"operation payload conflict"` (lines 85-87) — same operationId with different content is never silently overwritten,
   - exact match → **200** with the SAME original id `{ id: existing.id }` (line 88).

**Replay semantics, test-proven** — `apps/server/src/kernel.test.ts:1241-1293`:
- Retry after a lost ACK → 200 + same id, snapshot still has exactly 1 row (1254-1265).
- Same operationId + changed text → 409, no row written (1267-1277).
- Same operationId from org B → 201, distinct row in org B (1279-1292) — org scoping of the index verified.

**Reuse for #55**: this exact shape (uuid operationId + org-scoped unique index + `onConflictDoNothing` + payload-conflict 409 + replay 200-with-same-id) is the house pattern if idempotent lesson generation is required. Note it needs a schema column + index (i.e. a small forward migration), which collides with "no big schema change" — see Recommendations.

## Concurrency & batch semantics

**Conditional-UPDATE transition guard (check-in)** — `apps/server/src/routes/kernel.ts:312-352` (`lessonStatusAction`):
1. Pre-read joined lesson+enrollment for friendly errors only: 404 unknown id, 409 enrollment-class mismatch, 409 wrong status (lines 323-331).
2. The authoritative write repeats the guard IN the WHERE clause (comment at 334-336: "the status guard must also live in the WHERE clause so two concurrent POSTs (two tabs) cannot both pass the pre-read"):
   `UPDATE lesson SET status = :next WHERE id = :id AND org_id = :org AND status = 'upcoming' RETURNING id` (lines 337-347).
3. Zero returned rows → 409 (lines 348-350). The UPDATE itself is the atomic compare-and-set; the pre-read is UX, not correctness.
Related naturally-idempotent single-write: mark-paid `kernel.ts:362-382` (org predicate + RETURNING; replay overwrites method by design).

**`db.batch()` usage precedent** — two sites, both build an array of pre-built statements with server-generated UUIDs, no inter-statement reads:
- Student create with enrollment+package atomically: `kernel.ts:173-206` (typed `[BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]`, import from `drizzle-orm/batch` line 25).
- Org bootstrap: `apps/server/src/app.ts:63-71`, with an explicit race note at lines 72-73 ("a racing request may have created an earlier org — first wins") — i.e., the repo already accepts read-then-batch races at bootstrap rather than paying for dedupe.

**What batch guarantees on D1 vs libsql**:
- Prod type: `apps/server/src/app.ts:12` `Db = DrizzleD1Database`; tests cast libsql to it (`kernel.test.ts:46-48`). Drizzle's D1 session maps `db.batch()` to `D1Database.batch(statements)` (`@cloudflare/workers-types/index.d.ts:13971`). Cloudflare D1 documents batched statements as an implicit SQL transaction: statements execute sequentially and a failure aborts the sequence — so a multi-statement batch is atomic on D1.
- Tests: drizzle libsql session `batch(...)` delegates to the libsql client (`node_modules/drizzle-orm/libsql/session.d.ts:32`); libsql/Hrana executes a batch as one implicit transaction on a single connection. In-memory `file::memory:` is a single connection, so tests see serialized, atomic behavior.
- Caveats that matter for #55: (a) batch is fixed-statement-list only — you cannot branch on an earlier statement's result inside the batch; pre-generate all ids with `crypto.randomUUID()` (existing style) and read `.returning()` results from the per-statement result array afterwards; (b) atomic ≠ deduped — a transaction prevents partial "class without lessons", but two concurrent identical requests still both commit unless a unique index/onConflictDoNothing or conditional predicate rejects one.

**Implication for "create class + insert N lessons"**: one `db.batch([insertClass, ...insertLessons])` is atomic on both D1 and test libsql → no orphan class/lessons. To also survive a double-submit of the same logical create, either add the comment-bank index pattern, or accept the bootstrap precedent (app.ts:40-79: detect-on-read, earliest wins). Cancel/edit of generated lessons should reuse the conditional-UPDATE guard verbatim.

## Route organization

- `apps/server/src/routes/kernel.ts` = 566 lines, one factory `kernelRoutes(deps)`; CSRF middleware `kernel.use("*")` at lines 42-53 (Origin equality for POST + JSON content-type).
- Sub-router convention (`apps/server/src/routes/assignments/index.ts`, 78 lines; `routes/reporting/index.ts`, 91 lines):
  - export `xxxRoutes(deps: { getDb(): Db })` building a local `Hono<{ Variables: { kernelCtx } }>`,
  - local duplicates of `unauthorized` + `readBody` helpers (assignments/index.ts:22-43) — deliberately copied, not shared,
  - mounted INSIDE kernel after the Origin middleware: `kernel.route("/assignments", assignmentRoutes(deps))` etc. at `kernel.ts:550-553`; doc comment assignments/index.ts:13-18: "Mounted INSIDE kernelRoutes via kernel.route() so the kernel router's Origin + JSON content-type CSRF guard covers these routes too — never mount this standalone."
- `docs/code-standards.md:18-19`: kernel.ts owns "kernel mutations and org-scoped reads"; snapshot.ts owns snapshot assembly. Lines 29-31: CSRF/content-type checks stay in the route layer owning the mutation. No file-size lint rule exists (`biome.json` has no size/organization rules; meta snapshots are merely excluded from biome).
- Existing lesson endpoints live in kernel.ts: `/lessons/:id/check-in` + `/lessons/:id/cancel` (kernel.ts:354-360) and class endpoints `/classes`, `/classes/:id/*` (kernel.ts:223-304).

**Recommendation for #55**: keep the new endpoints in `kernel.ts`. Rationale: the routes span two prefixes (`POST /classes/:id/lessons`-style create-from-schedule and `/lessons/:id/*` edit/cancel); a Hono sub-router owns exactly one prefix, so extracting only the `/lessons/*` half would split sibling endpoints across files, and a second mount for class-scoped paths adds no value. code-standards.md explicitly assigns kernel mutations to kernel.ts, and 566 → ~700 lines has no lint/standards violation. Trigger for extraction later: if lessons grow a loader/domain file, mirror `routes/reporting/` (index.ts + loaders.ts) and mount at one prefix.

## Test harness & migration conventions

**Harness** — `apps/server/src/kernel.test.ts:44-284` (`createTestApp`):
- `createClient({ url: "file::memory:" })` + `drizzle(client, { schema })` + REAL migrations: `migrate(libsql, { migrationsFolder: MIGRATIONS_DIR })` pointing at `packages/db/src/migrations` (lines 33-47, drizzle `libsql/migrator`). Cast to prod `Db` type (line 48) — same app code path as D1.
- Only seam: `getSessionUser` reads a better-auth `session_token` cookie against the real `auth` schema (lines 50-65). `insertUser` seeds user+session (75-88); `call(path, {method, session, origin, body})` sets cookie/origin/content-type (90-111) — `origin: null` and `origin: "https://evil.example"` drive the 403 guard tests (646-696).
- Domain helpers to reuse: `kernel(session)` snapshot fetch (186-190), `createClass` (192-213, posts the structured-schedule body), `addStudent` (248-268), and `insertLesson` (131-159) — direct-row seed whose doc comment (126-130) says "no lesson-create endpoint exists yet (non-goal)": that comment/expectation flips with #55; new tests should create lessons via the API and keep `insertLesson` only for adversarial rows (e.g. mismatched enrollment binding, done at 1520-1540).
- Canonical test shapes to copy: check-in/cancel transitions + 409s (1456-1518), guards no-Origin/form/extra-key (1542-1570), cross-org 404 + unchanged snapshot (1582-1629), comment-bank idempotent replay (1241-1293).

**Commands gating PRs** — `.github/workflows/ci.yml` (PR + push to main/develop): `pnpm install --frozen-lockfile` → `pnpm exec biome check .` → `pnpm test` → `pnpm check-types` → `pnpm build`. Root `pnpm test` = `turbo run test && pnpm test:ci-workflow && pnpm test:topology-drift` (root package.json); apps/server runs `vitest run` with `vitest.config.ts` include `src/**/*.test.ts`. So: biome + full test suite + tsc build are all PR gates.

**Migration conventions** — `packages/db/src/migrations/`:
- 8 SQL files `0000_*.sql` … `0007_class_type_skills.sql`, statements separated by `--> statement-breakpoint`.
- 0007 (PR #47, hand-built): pure ALTER/UPDATE chain (ALTER ADD type, RENAME skill→skills, three guarded UPDATEs) — the hand-written alternative to drizzle-kit's table-rebuild style (risk noted in plans/260820-2048 phase-01: "Drizzle sinh table-rebuild thay vì RENAME").
- Registration: `meta/_journal.json` gains `{ idx: 8, version: "6", when: <ms>, tag: "0008_<name>", breakpoints: true }` (0007's entry at idx 7). A `meta/0008_snapshot.json` is also expected — one exists for every idx including 0007 (produced via `pnpm db:generate` then reconciled by hand; drizzle.config.ts = d1-http driver, schema `./src/schema`).
- The matching drizzle table def must be updated in `packages/db/src/schema/*.ts` (e.g. `lesson.ts`) in the same change.
- Tests automatically exercise a new migration: the in-memory libsql migrator replays every SQL file from the journal — a wrong 0008 fails ALL kernel tests, not just new ones.

## Contract packaging

`packages/api/package.json`: **no build/dist at all** — `"exports": { "./*": { "default": "./src/*.ts" } }` and only a `check-types` script. Consumers (`apps/server`, `apps/web`) import `@teacher-os/api/contracts` which resolves directly to `packages/api/src/contracts.ts` TypeScript source. Same convention for `@teacher-os/db` (`./*` → `./src/*.ts`). apps/server's tsdown build (`tsdown.config.ts`, entry `src/index.ts`) and web's Vite bundler both compile the workspace TS source; turbo orchestrates but adds no package build.

**Implication**: adding schemas/types to `packages/api/src/contracts.ts` needs ZERO build steps — server, web, and vitest all see changes immediately. The only gates are `check-types` (tsc -b) and biome formatting. Precedent: 0007's wire changes added `classCreateSchema` fields + `KernelClassRow` fields in the same file with no packaging churn.

## Deploy sequence

- Infra: `packages/infra/alchemy.run.ts` defines the D1 resource with `Cloudflare.D1.Database("database", { migrationsDir: "../../packages/db/src/migrations" })` (lines 59-61) and the Worker (`main: apps/server/src/index.ts`, binding `DB: db`, `nodejs_compat`).
- Alchemy semantics (`node_modules/alchemy/src/Cloudflare/D1/Database.ts:80-97`): pending `.sql` migrations are detected and **applied automatically as part of every deploy** (resource update), tracked in the wrangler-compatible `d1_migrations` table (DEFAULT_MIGRATIONS_TABLE, line 41). Note: this ledger is separate from drizzle's `drizzle_migrations` used only by the libsql test migrator — same SQL files, two ledgers.
- `docs/production-release-runbook.md:119-121`: "Alchemy applies D1 migrations as part of the deploy. Migrations are forward-only: never edit, reorder, or delete an applied migration file." Preflight (63-86) requires named operator, staging rehearsal of any pending migration (lines 82-84), and green local gates (`pnpm test`, `check-types`, `biome check`, `build`).
- Deploy command chain: root `pnpm deploy` → turbo `-F @teacher-os/infra` → `pnpm alchemy deploy --stage <staging|prod>` (runbook 94-107, 108+).
- Established breaking-change convention (plans/260820-2048 phase-01 "Rollout / Deploy" + plan.md:70): when a migration breaks the running old server (0007's RENAME), sequence is **stop server → migrate → deploy server + web together** (one monorepo release), rollback forward-only; stale web bundle 400s accepted pre-pilot.

**For #55**: if the only schema change is additive (new nullable/defaulted columns or a new unique index), the 0007 stop-window is NOT needed — a single `pnpm deploy` per stage applies the migration then uploads the new worker; old code is indifferent to extra columns/indexes. Sequence: green local gates → staging deploy + verify (`SELECT name FROM d1_migrations`, runbook 176-184) → prod deploy. A unique index creation on existing rows is the only hazard (duplicate historical rows would fail the CREATE UNIQUE INDEX) — lesson table currently has no writer in prod beyond tests/seeds, so risk is nil; if paranoid, pre-check duplicates on staging.

## Recommendations

Ranked, concrete:

1. **Concurrency primitive for lesson cancel/edit**: copy `lessonStatusAction` verbatim (`kernel.ts:312-352`) — pre-read for 404/409 UX, then conditional UPDATE with `id + orgId + status` in WHERE, `.returning({id})`, 0 rows → 409. Edit (reschedule/topic) should guard on `status = 'upcoming'` so completed/cancelled lessons are immutable history.
2. **Generation at class create**: build `[insertClass, ...insertLessons]` with pre-generated `crypto.randomUUID()` ids and commit via one `db.batch(statements)` — atomic on D1 (implicit transaction) and on test libsql, matching the student-create precedent (`kernel.ts:173-206`). No reads inside the batch; derive lesson rows (day/time/dur from class schedule + sessionsTotal) BEFORE the batch.
3. **Idempotency of create**: unless the issue explicitly demands replay-safe create, do NOT add an operationId column (violates "no big schema change"). If demanded, the comment-bank pattern is the exact template (org-scoped unique index + `onConflictDoNothing` + payload-conflict 409 + replay 200 same-id; migration 0008 + schema edit). Otherwise accept the bootstrap precedent (read-then-batch, earliest-wins) — concurrent identical class creates are a pre-existing, tolerated behavior.
4. **Routing**: extend `kernel.ts` (owns `/classes/*` and `/lessons/*` today; sub-router can't span both prefixes; code-standards.md assigns kernel mutations there). Extract later only if a lessons loader/domain emerges (then mirror `routes/reporting/{index,loaders}.ts`).
5. **Contracts**: add zod schemas + `KernelLessonRow` changes to `packages/api/src/contracts.ts` — zero build steps; keep `.strict()` on action bodies (lessonActionSchema precedent, contracts.ts:153).
6. **Tests**: new `describe` blocks in `kernel.test.ts` following the Wave-4 shapes; create lessons via the new API in happy paths, keep `insertLesson` for adversarial bindings; update its stale doc comment (126-130). Cover: generation count/mapping from schedule, cancel/edit transitions + 409s, cross-org 404s, guards (403/415/400), double-cancel, edit-after-complete.
7. **Migration (if any)**: hand-write `0008_*.sql` (additive only), add `meta/0008_snapshot.json`, append `_journal.json` idx 8, update `schema/lesson.ts`; tests replay it automatically. Deploy staging-first via `pnpm deploy`; no stop-server window for additive changes.

## Limitations

- libsql/Hrana batch atomicity asserted from drizzle types + single-connection `file::memory:` behavior, not from libsql client source (no repo-local doc); D1 batch transactionality from workers-types + Cloudflare docs — no runtime experiment run against real D1.
- Did not read `apps/web` consumers of contracts (asserted from the workspace exports map + tsdown/vite entry points), nor `routes/snapshot.ts` lesson ordering — relevant later for how generated lessons surface in the UI, out of scope here.
- Did not audit `scripts/ci-workflow.test.mjs` / `topology-drift.test.mjs` contents (they run in `pnpm test` and gate CI; a new workflow change would need them, this task doesn't).

## Unresolved questions

1. Should lesson create-from-schedule also fire when a class is edited (schedule change → regenerate future upcoming lessons)? Issue says create/edit/cancel of lessons; regeneration policy is unspecified.
2. Does the issue want POST /classes/:id/lessons (create one lesson) AND bulk generation at class create, or only the latter? Both fit the routing recommendation; contract shape differs.
3. Is replay-safe class create (operationId) actually required by the client (web double-submit concerns)? Decides whether recommendation 3's fallback is acceptable.
