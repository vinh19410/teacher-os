# Project Overview PDR

Teacher OS is a teacher-first operations app for managing classes, students, syllabi, lessons, invoices, assignments, reports, notifications, and feedback. The durable contract is class-centric: a teacher signs in, gets an org-scoped workspace, and the UI reads and writes the kernel through server-owned APIs instead of local mock state.

## Who this serves

- Teachers who need a single workspace for day-to-day class operations.
- AI collaborators that need stable entry points for product, API, schema, and runtime changes.

## Durable product decisions

| Decision | Owner |
| --- | --- |
| Authenticated users are bootstrapped into an org with a `teacher` membership when no membership exists yet. | [apps/server/src/app.ts](../apps/server/src/app.ts) and [packages/db/src/schema/membership.ts](../packages/db/src/schema/membership.ts) |
| The persistent kernel is org-scoped and centers on `organization`, `membership`, `student`, `class`, `enrollment`, `session_package`, and syllabus tables. | [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) |
| Curriculum data stays separate from delivered lessons. | [packages/db/src/schema/syllabus.ts](../packages/db/src/schema/syllabus.ts) and [packages/db/src/schema/lesson.ts](../packages/db/src/schema/lesson.ts) |
| The web app stays behind a load gate until the first kernel snapshot resolves. | [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) |
| Kernel writes are POST-only JSON commands; the client refreshes the snapshot after each write (creation endpoints return the server id, bulk replacements acknowledge with ok). | [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) and [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) |
| A syllabus lesson's `kind` (`lesson`/`midterm`/`final`) is curriculum content copied with the template; `status` is per-class progress that resets to `upcoming` on copy. | [packages/db/src/schema/syllabus.ts](../packages/db/src/schema/syllabus.ts) and [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) |
| Better Auth is the sign-in boundary, and the auth route redirects unauthenticated users to login. | [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) and [apps/server/src/index.ts](../apps/server/src/index.ts) |

## Product requirements

- Keep every user-facing data change org-scoped.
- Keep derived values derived in the adapter or snapshot layer, not duplicated as new source-of-truth columns.
- Keep the kernel transport contract stable unless the web and server owners change together.
- Keep the current auth/bootstrap flow intact unless a new workspace model is explicitly chosen.
- Keep the UI on the kernel snapshot contract; do not reintroduce local mock state as the runtime source of truth.

## Acceptance criteria for future changes

- The signed-in teacher can reach a populated org workspace without manual tenant setup.
- The main data flows still work through the kernel snapshot and command bus.
- Product changes still point to the owning source file instead of copying behavior into docs.

