# Codebase Summary

This is the navigation surface for the repository. It points to the owning files instead of restating implementation details.

## Main entry points

- [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) - web auth gate and shell entry
- [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) - client kernel store and load gate
- [apps/web/src/lib/query-client.ts](../apps/web/src/lib/query-client.ts) - QueryClient defaults and global 401 reauth
- [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) - kernel transport, snapshot query options, and snapshot mapping
- [apps/web/src/worker.ts](../apps/web/src/worker.ts) - web asset worker entry: static assets, SPA routes, and branded HTTP 404
- [apps/landing/public/index.html](../apps/landing/public/index.html) - static marketing landing page entry (zero-framework, served at apex)
- [apps/admin/src/routes/_auth/route.tsx](../apps/admin/src/routes/_auth/route.tsx) - admin console auth gate (`GET /api/admin/me`, plan #413)
- [apps/server/src/routes/admin-library.ts](../apps/server/src/routes/admin-library.ts) - admin library CRUD + audio routes at `/api/admin/library`, mounted outside the kernel tree (`requireAdmin` gate + `ADMIN_EMAILS` allowlist + R2 bucket `library-audio`)
- [apps/server/src/app.ts](../apps/server/src/app.ts) - server app composition and bootstrap middleware
- [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) - kernel route tree
- [apps/server/src/routes/assignments/index.ts](../apps/server/src/routes/assignments/index.ts) - assignment-prompt bank create and per-student grading routes, mounted inside the kernel tree
- [apps/server/src/routes/exam-imports.ts](../apps/server/src/routes/exam-imports.ts) - AI exam import (`POST /api/exam-imports` raw-body, `GET /:id`, `GET /:id/file`) — reserve → extract (Workers AI, timeout 120s) → settle, catch-all release + `failed_refunded` (#470)
- [apps/server/src/lib/credits/wallet.ts](../apps/server/src/lib/credits/wallet.ts) - credit wallet core: `ensureWallet` (lazy 30 Cr), `reserveCredits`/`settleCredits`/`releaseCredits` nguyên tử qua 1 `db.batch` + sổ cái append-only idempotent (#470)
- [apps/server/src/routes/credits.ts](../apps/server/src/routes/credits.ts) - `GET /api/credits/wallet` — `{balance, held, available}` cho badge màn import đề (#470)
- [apps/server/src/routes/student.ts](../apps/server/src/routes/student.ts) - student portal bridge (provisioning, invitations, multi-org switch, onboarding, enrollment acceptance, class detail for the student's own active enrollment, quiz take/attempt endpoints with answer-key snapshot + server-side grading, speaking media upload/playback via `MediaStore`), mounted standalone at `/api/student`
- [apps/server/src/routes/snapshot.ts](../apps/server/src/routes/snapshot.ts) - snapshot loader
- [apps/server/src/routes/bank-hub-webhooks.ts](../apps/server/src/routes/bank-hub-webhooks.ts) - SePay Bank Hub inbound webhooks (lifecycle events + balance IPN), mounted outside `/api/*` (#320)
- [apps/server/src/routes/bank-link.ts](../apps/server/src/routes/bank-link.ts) - teacher bank-account linking via hosted link + manual reconciliation, kernel-tree subrouter (#320)
- [apps/server/src/lib/payments/ingest-transaction.ts](../apps/server/src/lib/payments/ingest-transaction.ts) - the single ledger write path for inbound transfers (idempotent matching, tenant-scoped codes) (#320)
- [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) - shared API contracts
- [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) - database schema barrel
- [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts) - Cloudflare and D1 wiring

## Directory map

- `apps/web` - route files, UI shell, client state, and kernel-facing repository helpers
- `apps/student` - student portal (React + TanStack Router): login/sign-up, onboarding, overview, class detail (`/classes/$classId`), and quiz take/review routes (`/learn/quizzes/...` with autosave) on its own origin
- `apps/landing` - static landing page, zero-framework, public/index.html from Open Design design, build = copy, serve.mjs :8002, zero dependencies
- `apps/admin` - admin console (React + TanStack Router) on its own origin (`admin.<domain>`, dev 8004/8104): ba lớp gate (`ADMIN_EMAILS` allowlist + `requireAdmin` role/email gate + CSRF theo `ADMIN_ORIGINS`) và màn hình "Thư viện đề" soạn đề Reading/Listening dùng chung (#413)
- `apps/server` - Hono app, auth/session handling, snapshot loaders, and org-scoped kernel routes
- `apps/e2e` - Playwright specs that boot the real server app under Node with a fresh local D1 database
- `packages/api` - Zod request schemas and wire DTOs
- `packages/db` - Drizzle schema definitions and migrations
- `packages/infra` - Alchemy stack definition for local dev and deployment
- `packages/ui` - shared shadcn/ui primitives plus the cross-app render surfaces: the shared quiz paper/review components and the rich-text/cloze renderers used by both the web app and the student portal
- `scripts` - node:test contract tests enforcing CI workflow shape and topology consistency
- `open-design/v1` - visual handoff input for the UI
- `plans` - stateful execution records and past implementation plans

## Where to look first

- If you are changing UI state or kernel writes, start in [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) and [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts); query-layer behavior (keys, retry, refetch policy) lives in [apps/web/src/lib/query-client.ts](../apps/web/src/lib/query-client.ts).
- If you are changing persistence, start in [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) and the individual schema files under `packages/db/src/schema/`.
- If you are changing request bodies or response shapes, start in [packages/api/src/contracts.ts](../packages/api/src/contracts.ts).
- If you are changing syllabus import formats or rules, start in [apps/web/src/lib/syllabus-import.ts](../apps/web/src/lib/syllabus-import.ts) (client-side parser); the overwrite import endpoint it feeds is `POST /api/syllabus-templates/:id/replace-content` in [apps/server/src/routes/syllabus.ts](../apps/server/src/routes/syllabus.ts).
- If you are changing assignment creation, the prompt bank, or the IELTS answer key, start in [apps/web/src/routes/_auth/assignments/new.tsx](../apps/web/src/routes/_auth/assignments/new.tsx) and the 4-skill catalog in [apps/web/src/components/assignments/assignment-presets.ts](../apps/web/src/components/assignments/assignment-presets.ts); the create endpoint is `POST /api/assignments/prompts` in [apps/server/src/routes/assignments/index.ts](../apps/server/src/routes/assignments/index.ts), and the student preview round-trip hands its draft through sessionStorage ([apps/web/src/lib/assignment-preview-draft.ts](../apps/web/src/lib/assignment-preview-draft.ts)) to [apps/web/src/routes/_auth/assignments/preview.tsx](../apps/web/src/routes/_auth/assignments/preview.tsx).
- If you are touching the 7 rich text fields (prompt, passage, intro, transcript, note, description — everything except cuePoints, which stays plain), know that values are HTML strings validated by `richTextField` in [packages/api/src/rich-text.ts](../packages/api/src/rich-text.ts) (plain-text cap + raw cap, `isEmptyRichText` for emptiness gates), authored in [apps/web/src/components/ui/rich-text-editor.tsx](../apps/web/src/components/ui/rich-text-editor.tsx) (Tiptap v3, full-option toolbar — Base UI `Toolbar` với roving tabindex, link chọn qua popover in-app với scheme allowlist authoring-side `http/https/mailto/#//`, H2–H4 — scoped to the `sanitizeRichText` allowlist — new markup kinds must get styles in the shared `RICH_TEXT_CONTENT_CLASSES` in [packages/ui/src/lib/rich-text-content-classes.ts](../packages/ui/src/lib/rich-text-content-classes.ts); base `.ProseMirror` style nằm trong `@layer components` của [packages/ui/src/styles/globals.css](../packages/ui/src/styles/globals.css) nên utility `min-h-*` qua `contentClassName` thắng đúng; legacy plain values must enter it through `normalizeLegacyRichText` in [apps/web/src/lib/rich-text-legacy.ts](../apps/web/src/lib/rich-text-legacy.ts) or newlines are lost), and rendered ONLY through [packages/ui/src/components/assignments/rich-text-body.tsx](../packages/ui/src/components/assignments/rich-text-body.tsx) (`@teacher-os/ui`, the single DOMPurify sink — web surfaces and the shared quiz paper both go through it); never add another `dangerouslySetInnerHTML`.
- If you are changing the IELTS full-test builder (multi-part tests with continuous question numbering), start in [apps/web/src/routes/_auth/assignments/tests/new.tsx](../apps/web/src/routes/_auth/assignments/tests/new.tsx) (shell: [apps/web/src/components/assignment-tests/test-builder-shell.tsx](../apps/web/src/components/assignment-tests/test-builder-shell.tsx)); the slot catalog per skill lives in `ASSIGNMENT_TEST_PRESETS` in [packages/api/src/contracts.ts](../packages/api/src/contracts.ts), and question numbering comes ONLY from [apps/web/src/lib/test-ranges.ts](../apps/web/src/lib/test-ranges.ts) (`computeTestRanges` — the static `qStart` values of the part catalog are forbidden in test-builder code, enforced by a source-parse contract test in [apps/web/src/lib/kernel-runtime.contract.test.ts](../apps/web/src/lib/kernel-runtime.contract.test.ts)); the student-facing paper is [apps/web/src/components/assignment-tests/test-preview-paper.tsx](../apps/web/src/components/assignment-tests/test-preview-paper.tsx) and the paste-key/compare/apply panel is [apps/web/src/components/assignment-tests/answers-checking-panel.tsx](../apps/web/src/components/assignment-tests/answers-checking-panel.tsx).
- If a UI cluster is missing (e.g., the parent-reports section), check the static flags in [apps/web/src/lib/features.ts](../apps/web/src/lib/features.ts) first; `PARENT_REPORTS_ENABLED = false` hides the whole cluster and redirects `/reports` to `/dashboard` without touching backend or schema.
- If you are changing the AI exam import flow (credit hold, Workers AI extraction, or the two-column import workspace), start in [apps/web/src/routes/_auth/assignments/tests/import.tsx](../apps/web/src/routes/_auth/assignments/tests/import.tsx), [apps/server/src/routes/exam-imports.ts](../apps/server/src/routes/exam-imports.ts) and [apps/server/src/lib/credits/wallet.ts](../apps/server/src/lib/credits/wallet.ts); wire contracts (`EXAM_IMPORT_LIMITS`, `extractedExamDraftSchema`, `creditWalletSchema`) live at the tail of [packages/api/src/contracts.ts](../packages/api/src/contracts.ts) (#470).
- If you are adding or renaming web routes, keep [apps/web/src/routes-matcher.ts](../apps/web/src/routes-matcher.ts) in sync; the drift-guard test [apps/web/src/routes-matcher.test.ts](../apps/web/src/routes-matcher.test.ts) fails when a route in `routeTree.gen.ts` is missing from the matcher.
- If you are changing deployment or local runtime wiring, start in [packages/infra/alchemy.run.ts](../packages/infra/alchemy.run.ts); topology derivation (origins, cookie domain, auth cookie namespace prefix) lives in [packages/infra/src/topology.ts](../packages/infra/src/topology.ts) with its validation in [packages/auth/src/topology.ts](../packages/auth/src/topology.ts).
- If you are changing CI gates or workflow triggers, start in `.github/workflows/`; [scripts/ci-workflow.test.mjs](../scripts/ci-workflow.test.mjs) asserts the contract those workflows must keep.

