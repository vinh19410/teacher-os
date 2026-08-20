# Phase 5 — Action-to-caller matrix (required artifact)

Every `KernelAction` member (14) mapped to its dispatch call sites (16), acknowledgment
shape, replay safety, and the caller gating rule after the phase-5 contract. Verified by
grep over `apps/web/src` on branch `feat/32-truthful-mutation-outcomes`.

| Action | Kind | Server ack | Replay safety | Callers | Gating |
|---|---|---|---|---|---|
| `add-student` | create | `{ id }` 201 | unsafe — duplicate student/package | `modals/add-student-modal.tsx:42` | close-as-success: reset+close only on `refreshed` |
| `add-class` | create | `{ id }` 201 | unsafe — duplicate class | `modals/add-class-modal.tsx:35` | close-as-success |
| `add-syllabus` | create | `{ id }` 201 | unsafe — duplicate syllabus | `modals/add-syllabus-modal.tsx:35` | close-as-success; `onCreated(id)` navigates only on `refreshed` (stale-store 404 guard) |
| `assign-syllabus` | update | `{ ok: true }` 200 | safe (reassign same value) | `modals/assign-syllabus-modal.tsx:35` | close-as-success |
| `add-module` | create | `{ id }` 201 | unsafe — duplicate module | `modals/add-module-modal.tsx:32` | close-as-success |
| `edit-module` | update | `{ ok: true }` 200 | safe (overwrite) | `modals/edit-module-modal.tsx:42` | close-as-success |
| `add-lesson` | create | `{ id }` 201 | unsafe — duplicate lesson | `modals/add-lesson-modal.tsx:37` | close-as-success |
| `edit-lesson` | update | `{ ok: true }` 200 | safe (overwrite) | `modals/edit-lesson-modal.tsx:52` | close-as-success |
| `grade-assignment` | update | `{ id }` 200 (exception: update returning id) | safe (score overwrite) | `modals/grade-modal.tsx:77` | close-as-success; two-step grade→comment sequence, each step reacts to its own result |
| `add-comment-bank` | create | `{ id }` 201 / `{ id }` 200 on operationId dedupe | safe **only with the same `operationId`** | `modals/grade-modal.tsx:90` | close-as-success; `operationId` kept stable across outcome-unknown replay, regenerated after definite-failure retry (edited text) |
| `check-in` | update | `{ ok: true }` 200 | server 409 duplicate-guard | `components/schedule/lesson-modal.tsx:75`, `routes/_auth/dashboard.tsx:74` | direct action: await + per-target pending + visible outcome; lesson-modal closes immediately (close-as-navigation), outcome surfaces via toast |
| `cancel-lesson` | update | `{ ok: true }` 200 | server 409 duplicate-guard | `components/schedule/lesson-modal.tsx:66` | direct action; close-as-navigation like check-in |
| `mark-invoice-paid` | update | `{ ok: true }` 200 | replay overwrites (idempotent) | `routes/_auth/tuition.tsx:174` | direct action: await + per-invoice pending + visible outcome |
| `update-class-notes` | update | `{ ok: true }` 200 | overwrite idempotent | `routes/_auth/classes/$classId.tsx:224` | direct action: await + pending on save button + visible outcome |

## Result contract (client)

```ts
type KernelCommandResult =
  | { kind: "refreshed"; id?: string }                                  // 2xx + snapshot applied
  | { kind: "committed"; id?: string }                                  // 2xx + refresh failed (id = metadata)
  | { kind: "definite-failure"; status: number; error: unknown }        // 4xx (server did not commit)
  | { kind: "outcome-unknown"; error: unknown };                        // 5xx / 408 / 429 / transport loss
```

- `id` presence: `add-*` and `grade-assignment` resolve a server id; `{ ok: true }` updates do not. `id` is never the success signal — the `kind` is.
- Classification happens at the transport boundary (`postKernelCommand` throws `KernelHttpError` carrying the HTTP status; native errors are transport losses). 408/429 are treated as outcome-unknown: a timeout/rate-limited response can follow a committed write.
- Unresolved callers: none.
