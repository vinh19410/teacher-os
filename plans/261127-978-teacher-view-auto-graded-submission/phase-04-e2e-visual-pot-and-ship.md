---
phase: 4
title: "Phase 4: E2E, Visual POT, Review & Beta Ship"
status: completed
priority: P1
effort: "1h15m"
dependencies: [1, 2, 3]
---

# Phase 4: E2E, Visual POT, Review & Beta Ship

## Goal

Verify the full teacher auto-graded submission review flow end-to-end via targeted E2E specs, inspect 3-viewport × 2-theme POT screenshots, pass local review + `kongming` advisory checkpoints, post POT on issue #978, and ship/review/merge the beta PR into `develop` with green beta CI.

## Files to Create / Modify

- Create: `apps/e2e/specs/teacher-auto-graded-review.spec.ts`
- Create (on POT capture): `plans/reports/978-*.png`

## Tasks & Steps

### Task 4.1 — Create and run targeted E2E spec + POT screenshots (ports 8100..8105)

- **Goal:** Prove all 3 teacher entry points (`ClassAssignmentsTab`, student `Bài tập` tab click & Enter key, `/grading` queue) open auto-graded attempts with questions, student answers, correct answers, and scores, and navigate back cleanly.
- **Target files and symbols:** `apps/e2e/specs/teacher-auto-graded-review.spec.ts`.
- **Steps:**
  1. Write `apps/e2e/specs/teacher-auto-graded-review.spec.ts` seeding a Grammar 3-MC submission (plus verifying `0 bài chờ chấm` on `/grading`).
  2. Guard screenshot capture behind `CAPTURE_POT_ISSUE=978` with `try/finally` restoring viewport and light theme, checking 1440×900, 768×1024, 375×812 (Light & Dark), 320px zero horizontal overflow, and keyboard focus.
  3. Run single specs on isolated ports `8100..8105` (NEVER run full E2E locally).
  4. Visually inspect generated `plans/reports/978-*.png` via `read_file`.
- **Success criteria:** Both `teacher-auto-graded-review.spec.ts` and `teacher-grade-submission.spec.ts` pass; screenshots are visually clean with no overflow or PII leaks.
- **Verify:** `CAPTURE_POT_ISSUE=978 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/teacher-auto-graded-review.spec.ts` and `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts` exit 0.

### Task 4.2 — Local Code Review, Kongming Post-Implementation Gate & Beta Ship

- **Goal:** Complete `/ak-code-review`, `kongming` advisory checkpoints, `/ak-ship beta --advice`, POT comment on #978, `/ak-review-pr --fix --reply --advice`, mandatory post-PR `kongming` gate, merge to `develop`, and watch beta CI to green.
- **Target files and symbols:** `plans/261127-978-teacher-view-auto-graded-submission/plan.md`, GitHub PR, GitHub Issue #978.
- **Steps:**
  1. Run local review (`code-reviewer`) and `kongming` post-implementation checkpoint; fix any Critical/Important findings and rerun affected checks.
  2. Check `docs/` for any documentation impact (beta mode).
  3. Update `plan.md` status to `completed`, commit (conventional commits, no AI refs), push branch, and open beta PR targeting `develop` with `Closes #978`.
  4. Post mandatory POT comment on issue #978 using commit-SHA raw image permalinks (`gh issue comment 978 --body-file ...`) and verify rendered comment.
  5. Run `/ak-review-pr <PR> --fix --reply --advice`, ensure PR checks are terminal green, run mandatory post-PR `kongming` gate posting assessment + next steps to both PR and issue #978, apply `ready to ship beta` label to PR and issue #978 (removing `in progress`), merge PR to `develop`, and watch `develop` CI/deploy workflows to terminal green.
- **Success criteria:** PR merged to `develop`, beta CI/deploy green, POT and Kongming gate posted on #978 and PR.
- **Verify:** `gh run list --branch develop --commit <merge-sha>` shows completed `success`.

## Verification

- `pnpm exec biome check .` exits 0.
- `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` exits 0.
- `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/ui test && pnpm --filter server test && CI=1 pnpm --filter web test` exits 0.
- Targeted single-spec E2E passes.
- Beta merge + `develop` CI green.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
