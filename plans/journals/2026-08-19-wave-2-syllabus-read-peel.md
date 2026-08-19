---
title: Wave 2 syllabus read peel
date: 2026-08-19
summary: Peel /syllabus reads to repos (mapSyllabi + useSyllabus); write path frozen; cross-org isolation locked; 89/89 green
---

# Wave 2 syllabus read peel

## What happened
- Wave 2 (issue #12, phase-03): /syllabus list+detail reads moved off the adapter store onto the wave-1 split pattern: NEW `apps/web/src/lib/repos/syllabus.ts` (pure `mapSyllabi` extracted verbatim from `mapKernelSnapshot`) + NEW `repos/use-syllabus.ts` (`useSyllabus()` selector over the kernel-backed store cache). `kernel.ts` reuses `mapSyllabi` (no duplicated mapping). Both routes keep `useData()` for `data.classes` (unpeeled until wave 3). All 5 syllabus modals + assign modal write path untouched.
- TDD: 6 mapping units (totalLessons derives from tree incl. zero-lesson edge case, stored lie ignored; `""`→`undefined` / `""`→`"—"` placeholders; empty org → empty list) + 4 source-parse contract locks with negative backstops (`syllabus-peel.contract.test.ts`).
- Security closure: 6 NEW cross-org isolation tests in `apps/server/src/kernel.test.ts` — org B add/edit module + add/edit lesson under org A ids → 404, org A tree unchanged (existing suite only covered intra-org wrong-parent).

## Decision
- Red-team (2 reviewers) killed the phase's stale premise: seed reads died in wave 0 (`seedData` = 0 runtime imports); "CRUD qua API" was already live via the command bus. Real wave-2 work = read peel, mirroring PR #20 exactly.
- `totalLessons` derives mapping-side, NOT server-side (issue #12 text deviation, documented on the issue): the contract documents the stored column as a dead form value, pinned by `kernel.test.ts:161`; server-side derive would violate the "no contract change" lock.
- Recorded follow-up (out of scope): 6 write endpoints lack input length bounds — wave-0 surface, noted in phase-03 Security.

## Next steps
- Ship beta PR from `feat/wave2-syllabus-peel` (10 files, 89/89 tests, check-types 5/5, biome exit 0).
- Wave 3 (classes peel, issue #13) next; it may peel `data.classes` reads and retire the remaining adapter syllabi consumers (add-class-modal, assign modal).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
