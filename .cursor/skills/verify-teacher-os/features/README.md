# Teacher OS verification map

This directory is the maintained source for verifying user-facing Teacher OS behavior (teacher web primary). Read the index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch via `.cursor/skills/verify-teacher-os/scripts/launch.sh` (default web `http://localhost:8101`, API `http://localhost:8100`).
- Node ≥ 24 on `PATH`.
- Run `.cursor/skills/verify-teacher-os/scripts/doctor.sh` and require `doctor: HEALTHY`.
- Disposable DB is `apps/e2e/local.db` (wiped each launch).
- Never drive an instance that was not started by this verification run.
- Prefer `localhost` URLs (CORS); do not use `127.0.0.1`.

## Driving conventions

- Start every recipe from a fresh sign-up unless its preconditions say otherwise (`drive.mjs signup` or the sign-up steps in the feature file).
- Prefer ARIA roles and accessible names (`getByRole`, `getByLabel`, `getByText` with `exact: true` where e2e does) over CSS selectors or DOM position.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Browser actions go through `node .cursor/skills/verify-teacher-os/scripts/drive.mjs …` or an equivalent Playwright script using the same selectors.
- Timezone for the browser context: `Asia/Ho_Chi_Minh`.
- Restore disposable state by re-launching (DB wipe) rather than hand-editing SQLite during a proof.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with Teacher OS chrome visible (sidebar / product shell).
- Mutation proof includes a second user-facing view (reload or navigate away and back) of the stored value.
- Record the feature ID and entry point used with every artifact under `/tmp/verify-teacher-os/<RUN_ID>/evidence/<feature-id>/`.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-teacher-os` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Sign up and open dashboard](./sign-up-dashboard.md) — create a teacher account and land in an org-scoped shell.
- [Create a class](./create-class.md) — open the create-class dialog and persist a scheduled class.
- [Enroll and activate a student](./enroll-activate-student.md) — add an existing student to a class and activate enrollment.
- [Create an invoice](./create-invoice.md) — create a tuition invoice for an active enrollment.
- [Open the teaching schedule](./schedule-view.md) — navigate the week schedule and see class occurrences.
