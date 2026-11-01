---
title: "Localize Class Detail Tab Label and Format Start Date as dd/mm/yyyy (#520)"
description: "Localize the teacher class detail default tab label from 'Sessions & practice' to 'Buổi học & luyện tập' and format the student stat card startDate subtitle as dd/mm/yyyy ('Từ dd/mm/yyyy') using fmtDue, migrating all unit/E2E callers and design docs."
status: pending
priority: P3
effort: "1h"
tags: [web, classes, i18n, date-format, e2e, bugfix]
created: 2026-11-01
---

# 520-class-detail-vi-date-format

## Overview

On the teacher app class detail page (`apps/web/src/routes/_auth/classes/$classId.tsx`), two UI inconsistencies survived the design v2 migration (#391):

1. **English default tab label (`"Sessions & practice"`)**:
   - Line 280 defines `{ id: "sessions-practice", label: "Sessions & practice" }` alongside four Vietnamese tabs (`"Học viên"`, `"Giáo trình"`, `"Từ vựng"`, `"Ghi chú"`).
   - Changing `label` to `"Buổi học & luyện tập"` while preserving `id: "sessions-practice"` localizes the tab without altering URL search parameter routing (`?tab=sessions-practice` or legacy `?tab=sessions` / `?tab=assignments`).
2. **Raw ISO `cls.startDate` in the first `<StatCard>` subtitle (`"Từ 2026-11-03"`)**:
   - Line 260 passes ``sub={`Từ ${cls.startDate}`}``, rendering raw `YYYY-MM-DD` strings (`"Từ 2026-11-03"`, `"Từ 2026-10-29"`) next to `dd/mm/yyyy` dates on the same page (`ClassAssignmentsTab` uses `fmtDue(ca.due)` from `@/components/assignments/assignment-status` to render `"Hạn 28/11/2026"`).
   - Wrapping `cls.startDate` with `fmtDue(cls.startDate)` and guarding empty/whitespace strings (`sub={cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined}`) converts ISO `YYYY-MM-DD` calendar dates to `DD/MM/YYYY` purely by string splitting (zero `Date` timezone shift), preserves non-ISO legacy fixture values (such as `"01/08"` in `classRow()`), and avoids rendering a dangling `"Từ "` when `startDate` is empty (`""`).

This plan is authored under the `--advice` handover contract and `--tdd` test-first workflow. Each phase carries explicit task-level mechanical verification and a literal Failure Protocol block.

## Advisor Scope Lock

- **Locked Scope:**
  - `apps/web/src/routes/_auth/classes/$classId.tsx` (import `fmtDue` from `@/components/assignments/assignment-status`, format `sub={cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined}`, and set tab label to `"Buổi học & luyện tập"`).
  - `apps/web/src/components/class-detail/class-sessions-section.tsx` (update JSDoc comment at line 38 referencing the tab label).
  - `apps/web/src/routes/_auth/classes/$classId.test.tsx` and `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx` (TDD unit tests for `"Buổi học & luyện tập"` tab label, `"Từ dd/mm/yyyy"` formatted `startDate` subtitle, legacy `"01/08"` passthrough, empty `""` subtitle omission, `?tab=assignments` legacy URL routing, and updated tab click helpers).
  - Playwright E2E helper & specs clicking or referencing the tab (`apps/e2e/specs/helpers.ts`, `apps/e2e/specs/class-assign.spec.ts`, `apps/e2e/specs/class-operations.spec.ts`, `apps/e2e/specs/class-roster-tuition-debt.spec.ts`, `apps/e2e/specs/class-sessions-manage-modal.spec.ts`, `apps/e2e/specs/enroll-existing-student.spec.ts`, `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`, `apps/e2e/specs/notifications-ac-001.spec.ts`, `apps/e2e/specs/projected-sessions.spec.ts`, `apps/e2e/specs/self-study-plan.spec.ts`, `apps/e2e/specs/session-occurrence.spec.ts`, `apps/e2e/specs/syllabus-class-curriculum.spec.ts`, `apps/e2e/specs/syllabus-test-session-mark.spec.ts`).
  - Documentation & verification skill references (`DESIGN.md`, `.cursor/skills/verify-teacher-os/SKILL.md`, `.cursor/skills/verify-teacher-os/features/enroll-activate-student.md`).
- **Explicit Non-Goals:**
  - Do NOT change the tab `id: "sessions-practice"` or `validateClassDetailSearch` URL parameter handling (`?tab=sessions-practice`, `?tab=sessions`, `?tab=assignments`).
  - Do NOT modify `apps/web/src/components/assignments/assignment-status.ts`, `<Section title="Sessions">` in `apps/web/src/components/class-detail/class-sessions-section.tsx`, or dashboard date formatting (not requested in #520).
  - Do NOT edit historical plan files under `plans/**` or historical entries in `CHANGELOG.md` (only add a new entry for #520 at ship time).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Localize the first tab label on `/classes/$classId` from `"Sessions & practice"` to `"Buổi học & luyện tập"` while keeping `id: "sessions-practice"` intact | P3 |
| 2 | Format the first `<StatCard>` subtitle on `/classes/$classId` using `cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined` so ISO `YYYY-MM-DD` dates display as `"Từ dd/mm/yyyy"` and empty `startDate` omits the subtitle | P3 |
| 3 | Migrate all unit tests, Playwright E2E specs/helpers, and docs/skill references to `"Buổi học & luyện tập"` and verify across 3 viewports (`1440×900`, `768×1024`, `375×812`) + keyboard focus | P3 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD Class Detail Tab Localization, Date Formatting & Caller Migration](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] `apps/web/src/routes/_auth/classes/$classId.tsx` renders tab label `"Buổi học & luyện tập"` (with `id: "sessions-practice"`) and stat card subtitle `sub={cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined}`.
- [ ] Unit tests in `apps/web/src/routes/_auth/classes/$classId.test.tsx` and `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx` assert the 5 Vietnamese tab labels `["Buổi học & luyện tập", "Học viên", "Giáo trình", "Từ vựng", "Ghi chú"]`, verify that ISO `startDate: "2026-11-03"` renders `"Từ 03/11/2026"` (not `"Từ 2026-11-03"`), legacy `"01/08"` renders `"Từ 01/08"`, empty `""` omits `"Từ"`, and `?tab=assignments` selects `"Buổi học & luyện tập"`.
- [ ] Zero occurrences of `"Sessions & practice"` remain in `apps/`, `packages/`, `scripts/`, `DESIGN.md`, or `.cursor/` (`! grep -rn "Sessions & practice" apps packages scripts DESIGN.md .cursor`).
- [ ] `pnpm check-types`, `pnpm exec biome check .`, `pnpm --filter web test`, and Playwright E2E specs (`projected-sessions.spec.ts`, `class-assign.spec.ts`, `class-operations.spec.ts`) pass with 0 errors, including 3-viewport (`1440×900`, `768×1024`, `375×812`) overflow checks and keyboard focus verification.

## Red Team Review

### Session — 2026-11-01
**Findings:** 7 (6 accepted, 1 accepted-modified)
**Severity breakdown:** 0 Critical, 4 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Empty/whitespace `cls.startDate` (`""` default in DB schema/API contract) renders a dangling `"Từ "` subtitle unless guarded with `cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined` | High | Accept ( modified: guard empty string in `$classId.tsx:260` while keeping `assignment-status.ts` out of scope) | Plan Overview, Scope Lock, Phase 1 (Tasks 1.1 & 1.2) |
| 2 | Self-contradiction in Task 1.3 Step 3: instructing `DESIGN.md` to include the literal English string `"Sessions & practice"` violates the zero-matches grep gate on `DESIGN.md` | High | Accept | Phase 1 (Task 1.3 Step 3 & Verify) |
| 3 | Task 1.3 Step 1 specifies quoted `"Sessions & practice"`, which misses 4 unquoted occurrences in E2E test titles/comments (`class-operations.spec.ts:150`, `manual-student-and-trial-grading.spec.ts:87`, `projected-sessions.spec.ts:42`, `session-occurrence.spec.ts:3`), and `Verify` lacks a mechanical `grep` check | High | Accept | Phase 1 (Task 1.3 Step 1 & Verify) |
| 4 | Missing 3-viewport (`1440×900`, `768×1024`, `375×812`) no-overflow check, keyboard focus assertion on `"Buổi học & luyện tập"` tab (`AGENTS.md:22`), and deterministic `dd/mm/yyyy` vs `mm/dd/yyyy` check (`"Từ 04/01/2027"` on `START = "2027-01-04"` in `projected-sessions.spec.ts:41`) | High | Accept | Phase 1 (Task 1.3 Step 2) |
| 5 | Missing unit assertions for stated contracts: legacy `startDate: "01/08"` passthrough, empty `startDate: ""` omitting `"Từ"`, and `?tab=assignments` selecting `"Buổi học & luyện tập"`; plus line-drift order in `$classId.test.tsx` | Medium | Accept | Phase 1 (Task 1.1) |
| 6 | E2E verification gate omits `specs/class-operations.spec.ts`, leaving the updated `openClassScheduleTab` helper in `apps/e2e/specs/helpers.ts:216` unexercised | Medium | Accept | Plan Success Criteria, Phase 1 (Task 1.3 Verify) |
| 7 | Handover precision: quote `'src/routes/_auth/classes/$classId.test.tsx'` in shell commands so `$classId` is never expanded by double-quoted subshells, and provide verbatim Vietnamese text for `DESIGN.md` | Medium | Accept | Phase 1 (Tasks 1.1, 1.2, 1.3) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 7
- Reconciled stale references: 6
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 8
- **Verified:** 8 | **Failed:** 0 | **Unverified:** 0
- **Key decisions confirmed:**
  1. `apps/web/src/routes/_auth/classes/$classId.tsx` localizes tab label to `"Buổi học & luyện tập"` (`id: "sessions-practice"` unchanged) and formats `sub={cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined}`.
  2. All 18 non-historical files referencing `Sessions & practice` are explicitly listed and verified by `! grep -rn "Sessions & practice" apps packages scripts DESIGN.md .cursor`.
  3. Unit tests and E2E specs (`projected-sessions.spec.ts`, `class-assign.spec.ts`, `class-operations.spec.ts`) mechanically verify `dd/mm/yyyy` formatting, 3 viewports (`1440×900`, `768×1024`, `375×812`), and keyboard focus.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 7
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: 520-class-detail-vi-date-format -->
