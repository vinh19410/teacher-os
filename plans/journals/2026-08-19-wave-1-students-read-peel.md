---
title: Wave 1 students read peel
date: 2026-08-19
summary: Peel /students reads to repos (pure mapStudents + useStudents hook); write path frozen; 73/73 green
---

# Wave 1 students read peel

## What happened
- Wave 1 (issue #11, phase-02): /students list+detail reads moved off the adapter store onto a repo: NEW `apps/web/src/lib/repos/students.ts` (pure `mapStudents` extracted verbatim from `mapKernelSnapshot`) + NEW `repos/use-students.ts` (`useStudents()` selector over the kernel-backed store cache). `kernel.ts` reuses `mapStudents` (no duplicated mapping). Detail route keeps `useData()` only for lessons/invoices/assignments (unpeeled until waves 4-7). AddStudentModal write path untouched (enroll contract 3/3 green).
- TDD: 4 mapping units (newest ACTIVE pkg wins, classless → zero pkg, empty org → empty list) + 4 source-parse contract locks with negative backstops (`students-peel.contract.test.ts`).

## Decision
- Hook lives in `use-students.ts`, NOT `students.ts`: colocating pulled `@teacher-os/env/web` (env-validating provider) into every pure unit test and broke `kernel.test.ts` at import. Split = pure mapping + hook file, both under `repos/`. Kongming endorsed; **standardize `repos/<module>.ts` (pure map) + `repos/use-<module>.ts` (hook) for waves 2-8.**
- Reads select the single kernel snapshot cache (no second fetch) so command-bus writes land immediately; re-render granularity = useData parity until a later wave narrows it.
- Deferred verbatim: createdAt tie-break in pkg selection (DB-order dependent on ties), duplicate provider `studentById` until remaining consumers migrate.

## Next steps
- Ship beta PR from `feat/wave1-students-peel` (7 files, 73/73 tests, check-types 0, biome 0 errors).
- Waves 2/3 (syllabus/classes peel) should mirror the split pattern.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
