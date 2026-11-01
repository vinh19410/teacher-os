---
name: verify-teacher-os
description: "Drive Teacher OS the way a teacher does in the browser: launch the local e2e stack (API + web/student/admin), doctor-check it, exercise mapped features via Playwright, and keep proof artifacts. Use when asked to verify Teacher OS UI behavior, prove a fix in the app, or capture screenshots/ARIA evidence."
---

# Verify Teacher OS

Agent-facing control skill for the teacher web app. Read cold: launch a disposable local stack, confirm it is healthy, drive one mapped feature with real UI selectors, keep evidence, then tear down only the instance.

Primary surface: **teacher web** at `VERIFY_WEB_URL` (default `http://localhost:8101`). Secondary surfaces (same API): student portal `:8103`, admin console `:8104`. Do not use `alchemy`/`pnpm dev` here — that path needs Cloudflare credentials. Verification uses the same Node+libsql boot as CI e2e (`apps/e2e` `boot:api`).

Never drive an instance you did not start with this skill. Prefer `localhost` over `127.0.0.1` (CORS allowlist is `localhost`).

## Launch

From the **repo root**, with **Node ≥ 24** on `PATH` (CI pin; if `node -v` shows v22, prepend `~/.nvm/versions/node/v24.*/bin`):

```bash
chmod +x .cursor/skills/verify-teacher-os/scripts/*.sh
.cursor/skills/verify-teacher-os/scripts/launch.sh
```

What it starts (dedicated ports, override via `E2E_*_PORT` if needed):

| Process | Default port | Ready signal |
| --- | --- | --- |
| `pnpm --filter e2e run boot:api` | 8100 | log `[e2e-boot] api on …` **and** `GET /readyz` 200 (migrations + vocab seed finished) |
| `pnpm --filter web exec vite --port 8101 --strictPort` | 8101 | `GET /` 2xx |
| `pnpm --filter student exec vite --port 8103 --strictPort` | 8103 | `GET /login` 2xx |
| `pnpm --filter admin exec vite --port 8104 --strictPort` | 8104 | `GET /` status &lt; 404 |

State:

- Disposable DB: `apps/e2e/local.db` (wiped on every `boot:api`).
- Run metadata + PIDs + logs: `/tmp/verify-teacher-os/<RUN_ID>/instance/`
- Evidence (survives cleanup): `/tmp/verify-teacher-os/<RUN_ID>/evidence/`
- Current run pointer: `/tmp/verify-teacher-os/current-run`

Launch refuses busy ports (`reuseExistingServer` is forbidden). If launch fails, it runs cleanup for that attempt.

Teardown: see **Cleanup**.

## Doctor

```bash
.cursor/skills/verify-teacher-os/scripts/doctor.sh
```

Read-only. Requires the instance meta from launch. Passes only when recorded PIDs are alive, `/readyz` is OK, web/student/admin answer, Node is v24.x, and `apps/e2e/local.db` exists. Run doctor whenever anything looks off before driving.

## Drive

Prefer the mapped recipes under `features/`. Harness is Playwright from `apps/e2e` (already a workspace dependency). Helper entrypoint:

```bash
node .cursor/skills/verify-teacher-os/scripts/drive.mjs <command> [flags]
```

Stable handles used by this repo (do not invent CSS-class selectors):

- Sign-up: `#su-name`, `#su-email`, `#su-password`, button `Create account` → URL `/dashboard`; sidebar link `Lớp học` proves kernel bootstrap.
- Classes: sidebar text `Lớp học` → `/classes`; button `+ Tạo lớp`; dialog `Tạo lớp mới`; label `Tên lớp *`; skill chip `Writing`; weekday chips `T2`/`T4`; submit `Tạo lớp`.
- Tuition: sidebar `Doanh thu` → `/tuition`; `data-testid="create-invoice"`; dialog heading `Tạo hóa đơn`.
- Schedule: sidebar `Lịch dạy` → `/schedule`.
- Tabs on class detail: `role="tab"` names `Học viên`, `Buổi học & luyện tập`.

Timezone for browser contexts: `Asia/Ho_Chi_Minh` (matches `apps/e2e/playwright.config.ts`).

Example — drive the seeded sign-up feature:

```bash
node .cursor/skills/verify-teacher-os/scripts/drive.mjs signup
```

Example — create-class journey (includes sign-up):

```bash
node .cursor/skills/verify-teacher-os/scripts/drive.mjs create-class --name "Verify Writing Evening"
```

For journeys not yet wrapped in `drive.mjs`, write a one-off Playwright script that imports selectors from the matching `features/*.md` recipe, or run the existing e2e spec as a regression harness:

```bash
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 \
  pnpm --filter e2e e2e specs/login.smoke.spec.ts
```

Only do that when no verification instance is already bound to those ports (Playwright config sets `reuseExistingServer: false` and will fight launch.sh). Prefer `drive.mjs` against an already-launched instance.

## Evidence

Proof standards:

1. Exercise the **real user path** (UI sign-up / clicks), not test-only seed endpoints for the claim under test. `seedStudent` helpers are allowed only as preconditions the feature map names.
2. Capture **action + resulting state** (URL, visible row/heading, ARIA snapshot), not only a final screenshot.
3. Confirm side effects when claimed (row survives reload, `POST` happened, DB row) alongside the visible UI.
4. Mocks only at production boundaries already faked by `boot:api` (fake AI grader, fake Bank Hub, recording mailer) — do not add new mocks for teacher CRUD.

Artifact locations (named by feature id):

```text
/tmp/verify-teacher-os/<RUN_ID>/evidence/<feature-id>/
  result.json
  *.png
  *.aria.txt
```

Record the feature id and entry point in `result.json`. Cleanup must not delete this tree.

## Cleanup

```bash
.cursor/skills/verify-teacher-os/scripts/cleanup.sh
```

Stops only PIDs recorded under the current run's `instance/*.pid` (and their children). Never `killall node` / never match by process name. Removes instance scratch pointers; **retains** `/tmp/verify-teacher-os/<RUN_ID>/evidence/`. After every failed launch/drive iteration, run cleanup so ports are not stranded.

## Helpers

| Script | Role |
| --- | --- |
| `scripts/common.sh` | Ports, paths, Node 24 PATH fix — sourced by other scripts |
| `scripts/launch.sh` | Start stack, wait until usable, write meta |
| `scripts/doctor.sh` | Read-only health |
| `scripts/drive.mjs` | Playwright commands: `signup`, `create-class`, `screenshot`, `aria`, `goto` |
| `scripts/cleanup.sh` | Stop launched PIDs; keep evidence |

All `.sh` files must be executable. Invoke them with paths relative to the repo root as shown above.

## Feature map

Index: [`features/README.md`](features/README.md). Treat the map as the maintained verification source. A proof that only hits a convenient shortcut while the map lists other entry points is incomplete for those entries — report unmet preconditions in that feature's Gotchas instead of weakening the journey.

## Isolation

Two verification instances can run side by side **only** if they use disjoint `E2E_*_PORT` sets and disjoint `VERIFY_RUN_ID` values. They **cannot** share `apps/e2e/local.db` (`boot:api` deletes it). If you need a second instance, stop the first or give the second a separate worktree. Refusing to double-drive a shared DB beats corrupting the run.

## Other surfaces (noted, not primary)

- Student portal and admin console boot with launch.sh but are not the default drive target; add feature files before claiming coverage.
- `pnpm design:compare` and agentic `e2e` package are separate tools — out of scope for this skill unless a feature file says otherwise.
