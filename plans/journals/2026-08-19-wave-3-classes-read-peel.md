---
title: Wave 3 classes read peel
date: 2026-08-19
summary: Peel /classes reads to repos (pure mapClasses + useClasses hook); roster=enrollment double-locked; write path frozen; 76/76 green
---

# Wave 3 classes read peel

## What happened
- Wave 3 (issue #13, phase-04): /classes list+detail + AssignSyllabusModal reads moved off the adapter store onto a repo: NEW `apps/web/src/lib/repos/classes.ts` (pure `mapClasses` extracted verbatim from `mapKernelSnapshot`; roster `studentIds` derives from `snapshot.enrollments` — invariant 4, never a stored id list) + NEW `repos/use-classes.ts` (`useClasses()` selector over the kernel-backed store cache). `kernel.ts` reuses `mapClasses` (no duplicated mapping; `enrollmentsByClass` block removed). Detail route keeps `useData()` only for unpeeled reads (syllabusById/studentById/lessons) + `dispatch` (notes still `update-class-notes`). Modals' write path untouched; `add-class-modal.tsx` zero-delta (its `data.syllabi` read is wave-2 scope). TDD: 6 mapping units (roster follows snapshot order ≠ id sort, dangling enrollment passes through, null syllabus→"", empty roster, fields/notes passthrough, empty org→[]) + 5 source-parse contract locks with negative backstops (`classes-peel.contract.test.ts`).
- Gates: `pnpm test` 76/76 (web 61 incl. 11 new, server 14, ci-workflow 1), `check-types` 0, `biome check` 0 (no fixes). `add-student-enroll.contract.test.ts` 3/3 stays green; `kernel.test.ts` 18/18.
- Advisory (--advice): kongming GO at post-plan and post-implementation checkpoints; code-review PASS (0 Critical/Important; 2 Minor lock-strengthening fixes applied in-test).

## Decision
- Mirrored the wave-1 split pattern (`repos/<module>.ts` pure map + `repos/use-<module>.ts` hook) exactly — kongming-endorsed standard for waves 2–8.
- `mapClasses(snapshot)` is self-contained (builds its own enrollment index) rather than taking `enrollmentsByClass` as a param: matches `mapStudents(snapshot)` signature convention, keeps the unit fixture style, and removes the index from `kernel.ts` entirely.
- Based on `develop` (not stacked on open PR #20): plan DAG declares waves 1–3 independent; both PRs edit `mapKernelSnapshot` but on distinct lines (additive imports) — conflict is trivial either merge order; verify merged kernel keeps both `mapStudents` + `mapClasses` imports post-merge.
- `sessionsDone` deliberately passthrough (stored value) — wave 4 derives it; the fields/notes unit test is the tripwire against premature derivation.

## Next steps
- Ship beta PR from `feat/wave3-classes-peel` (8 files), merge (mode beta → `develop`), watch CI.
- After PR #20 (wave 1) merges, confirm rebase keeps both extractions and both peel contract suites run.
- Wave 4 (schedule persist) unblocked after this lands; wave 2 (syllabus peel) still open on its own branch.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
