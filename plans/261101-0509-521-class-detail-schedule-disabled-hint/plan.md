---
title: "Enable 'Sắp xếp buổi' on Empty Classes with Empty-State Explanation and Curriculum Tab CTA (#521)"
description: "Keep the 'Sắp xếp buổi' button on the teacher class detail page enabled when a class has no curriculum attached, and render an actionable empty state in ClassSessionsManageModal explaining why ('Gắn giáo trình cho lớp để sắp xếp buổi.') with a 'Mở tab Giáo trình' CTA."
status: completed
priority: P3
effort: "1h"
tags: [web, classes, ux, a11y, e2e, bugfix]
created: 2026-11-01
---

# 521-class-detail-schedule-disabled-hint

## Overview

On the teacher class detail page (`apps/web/src/routes/_auth/classes/$classId.tsx`), the primary header action button **"Sắp xếp buổi"** is rendered with `disabled={!sy}` (line 241), where `sy = useClassCurriculum(classId)`. When a teacher creates a new class with the default `"— Lớp trống —"` option (no syllabus template attached), `sy` is `null` and the button is disabled without any `title`, `aria-describedby`, tooltip, or explanation. Because `buttonVariants` applies `disabled:pointer-events-none`, hovering or clicking the button produces no feedback, leaving teachers confused about how to manage class sessions.

Meanwhile, `ClassSessionsManageModal` (`apps/web/src/components/class-detail/class-sessions-manage-modal.tsx:68-72`) already contains a `!sy` fallback branch (`!sy ? <p>...</p> : ...`), which was previously unreachable from the UI because the trigger button was disabled.

Per `kongming` advisory review and Red Team review, we resolve Issue #521 using **Option 2** (the first expected outcome in the issue):
1. Remove `disabled={!sy}` from the **"Sắp xếp buổi"** button in `apps/web/src/routes/_auth/classes/$classId.tsx` so it is always interactive via mouse, keyboard, and touch. In its `onClick` handler, only switch `tab` to `"sessions-practice"` (and reset `assignmentsView` to `"list"`) when `sy` is present, so opening and dismissing the modal on an empty class (`!sy`) never yanks the teacher off their active tab.
2. Key `<ClassSessionsManageModal key={\`manage-sessions-${cls.id}\`} ... />` by `cls.id` (matching sibling modals in `$classId.tsx`) and require `onOpenCurriculum: () => void` on `ClassSessionsManageModalProps`.
3. Upgrade the `!sy` empty state in `ClassSessionsManageModal` (`apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`) to use the standard dashed empty-state card (`rounded-lg border border-dashed p-6 text-center`), displaying `"Gắn giáo trình cho lớp để sắp xếp buổi."` and a primary CTA button **"Mở tab Giáo trình"** (`onOpenCurriculum`) that closes the modal and switches to the `"Giáo trình"` tab via `handleTabChange("curriculum")`. Gate child syllabus-mutation modals inside `{sy && (...)}`.

This plan is authored under the `--advice` handover contract and `--tdd` test-first workflow. Each phase carries explicit task-level mechanical verification and a literal Failure Protocol block.

## Advisor Scope Lock

- **Locked Scope:**
  - `apps/web/src/routes/_auth/classes/$classId.tsx` (remove `disabled={!sy}` on `"Sắp xếp buổi"` button, guard `if (sy) { setTab("sessions-practice"); setAssignmentsView("list"); }` before `setManageOpen(true)`, add `key={\`manage-sessions-${cls.id}\`}`, and pass required `onOpenCurriculum` to `ClassSessionsManageModal` calling `setManageOpen(false)` and `handleTabChange("curriculum")`).
  - `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` (add required `onOpenCurriculum: () => void` prop, render the dashed empty-state card with `"Gắn giáo trình cho lớp để sắp xếp buổi."` and `"Mở tab Giáo trình"` button when `!sy`, and gate child mutation modals behind `{sy && (...)}`).
  - `apps/web/src/routes/_auth/classes/$classId.test.tsx` (TDD unit test covering clicking `"Sắp xếp buổi"` when `syllabusId: null`, verifying that dismissing the modal preserves the current tab, and clicking `"Mở tab Giáo trình"` closes the modal, resets `assignmentsView` to `"list"`, and selects the `"Giáo trình"` tab).
  - `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (extend Test B's empty-class flow to keyboard-focus and activate `"Sắp xếp buổi"` via `Enter`, verify visibility and zero horizontal overflow across 3 viewports `1440×900`, `768×1024`, `375×812` while `"Quản lý buổi của lớp"` is open, assert `"Gắn giáo trình cho lớp để sắp xếp buổi."`, and keyboard-activate `"Mở tab Giáo trình"` to navigate to the `"Giáo trình"` tab).
  - `DESIGN.md`, `CHANGELOG.md`, and `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/*` (document the empty-class modal flow under `#391`/`#521`, add a `### Fixed` entry under `## 2026-11-01` in `CHANGELOG.md`, and regenerate `t-class-detail` visual comparison screenshots where the primary button now renders at full opacity matching Design v2).
- **Explicit Non-Goals:**
  - Do NOT add class metadata editing (`PATCH/PUT /classes/:id`), which Issue #521 explicitly notes is a separate feature request.
  - Do NOT change the button label `"Sắp xếp buổi"` or modal title `"Quản lý buổi của lớp"`.
  - Do NOT alter the `sy`-present branch of `ClassSessionsManageModal` or any backend/kernel endpoints.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Keep `"Sắp xếp buổi"` enabled when `!sy` (without mutating `tab` on modal open) and display `"Gắn giáo trình cho lớp để sắp xếp buổi."` + `"Mở tab Giáo trình"` CTA inside `ClassSessionsManageModal` | P3 |
| 2 | Close `ClassSessionsManageModal` and switch to the `"Giáo trình"` tab (`handleTabChange("curriculum")`) when the teacher activates `"Mở tab Giáo trình"` | P3 |
| 3 | Verify with TDD unit tests, Playwright E2E across 3 viewports (`1440×900`, `768×1024`, `375×812`) + keyboard focus while the modal is open, and `pnpm design:compare` | P3 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD Empty-Curriculum Session Management Modal, E2E & Design Verification](./phase-01-start.md) | Completed |

## Success Criteria

- [x] `apps/web/src/routes/_auth/classes/$classId.tsx` renders `<Button size="sm" ...>Sắp xếp buổi</Button>` without `disabled={!sy}`, only switches to `"sessions-practice"` (and resets `assignmentsView` to `"list"`) on button click when `sy` is present, and passes `key={\`manage-sessions-${cls.id}\`}` and required `onOpenCurriculum` to `ClassSessionsManageModal`.
- [x] `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` requires `onOpenCurriculum: () => void`, renders `"Gắn giáo trình cho lớp để sắp xếp buổi."` and a `"Mở tab Giáo trình"` button when `!sy`, gates child syllabus-mutation modals behind `{sy && (...)}`, and clicking `"Mở tab Giáo trình"` closes the dialog and activates the `"Giáo trình"` tab (resetting `assignmentsView` to `"list"`).
- [x] Unit tests in `apps/web/src/routes/_auth/classes/$classId.test.tsx` and Playwright E2E specs (`syllabus-class-curriculum.spec.ts`, `class-sessions-manage-modal.spec.ts`, `syllabus-test-session-mark.spec.ts`) pass with 0 errors, including 3-viewport (`1440×900`, `768×1024`, `375×812`) overflow checks and keyboard focus/activation while `ClassSessionsManageModal` is open.
- [x] `pnpm check-types`, `pnpm exec biome check .`, `pnpm --filter web test`, and `rm -rf scripts/design-compare/.state/raw/new/t-class-detail plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail && pnpm design:compare --screens t-class-detail --side both --label new` exit 0, with `DESIGN.md` and `CHANGELOG.md` updated.

## Red Team Review

### Session — 2026-11-01
**Findings:** 8 deduplicated (6 accepted, 2 rejected)
**Severity breakdown:** 1 Critical, 3 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `capture.mjs:665` skips composite PNG generation if `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/*.png` already exist on disk (`if (existsSync(outFile)) continue;`), leaving the 6 tracked screenshots untouched unless deleted before `pnpm design:compare` | Critical | Accept | Plan Success Criteria, Phase 1 (Task 1.3 Step 4 & Verify) |
| 2 | Clicking `"Sắp xếp buổi"` unconditionally runs `setTab("sessions-practice")`, kicking a teacher on an empty class off their active tab if they dismiss the modal without clicking `"Mở tab Giáo trình"`, and leaving `assignmentsView === "assign"` stuck when `sy` is present | High | Accept | Plan Overview, Scope Lock, Success Criteria, Phase 1 (Tasks 1.1 & 1.2) |
| 3 | `<ClassSessionsManageModal>` lacks `key={\`manage-sessions-${cls.id}\`}` (unlike sibling modals in `$classId.tsx:448,454`) and renders the 5 child mutation modals outside `{sy && (...)}` | High | Accept | Plan Overview, Scope Lock, Success Criteria, Phase 1 (Task 1.2) |
| 4 | E2E 3-viewport (`1440×900`, `768×1024`, `375×812`) overflow loop and keyboard checks in `syllabus-class-curriculum.spec.ts` run before opening `ClassSessionsManageModal` instead of while the modal is open, and use `.click()` instead of keyboard `Enter` activation | High | Accept | Plan Scope Lock, Success Criteria, Phase 1 (Task 1.3 Step 1) |
| 5 | Passing `--keep-design` to `pnpm design:compare` skips `fetch-design.sh stop` (`capture.mjs:162-167`), leaking an orphaned background `vite` process on a randomized port | Medium | Accept | Plan Success Criteria, Phase 1 (Overview, Task 1.3, Verification) |
| 6 | Typing `onOpenCurriculum?: () => void` as optional on `ClassSessionsManageModalProps` allows callers to omit the required `"Mở tab Giáo trình"` CTA | Medium | Accept | Plan Overview, Scope Lock, Success Criteria, Phase 1 (Task 1.2) |
| 7 | `CHANGELOG.md` omitted from Advisor Scope Lock and `Files to Create / Modify` despite `## 2026-11-01` → `### Fixed` tracking all bugfixes (`#520`, `#518`, `#517`) and `CHANGELOG.md:135` documenting the prior disabled behavior | Medium | Accept | Plan Scope Lock, Success Criteria, Phase 1 (Files & Task 1.3 Step 3) |
| 8 | Add `disabled={busy}` to `"Sắp xếp buổi"` / `"Mở tab Giáo trình"` AND override `Modal` close focus restoration with async `requestAnimationFrame` | Medium | Reject (opening a dialog / switching tabs is read-only navigation, not a kernel write — `$classId.sessions.test.tsx:183,212` explicitly switches tabs while `busy`; async `requestAnimationFrame` focus after synchronous modal unmount risks post-`cleanup()` JSDOM test pollution) | None |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 7
- Reconciled stale references: 7
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 7
- **Verified:** 7 | **Failed:** 0 | **Unverified:** 0
- **Key decisions confirmed:**
  1. `apps/web/src/routes/_auth/classes/$classId.tsx` removes `disabled={!sy}`, only switches to `"sessions-practice"` (and resets `assignmentsView`) on `"Sắp xếp buổi"` click when `sy` is truthy, and passes `key={\`manage-sessions-${cls.id}\`}` + required `onOpenCurriculum` to `ClassSessionsManageModal`.
  2. `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` requires `onOpenCurriculum: () => void`, renders `"Gắn giáo trình cho lớp để sắp xếp buổi."` + `"Mở tab Giáo trình"` inside `rounded-lg border border-dashed p-6 text-center` when `!sy`, and gates child mutation modals behind `{sy && (...)}`.
  3. E2E Test B in `apps/e2e/specs/syllabus-class-curriculum.spec.ts` activates `"Sắp xếp buổi"` via keyboard `Enter`, verifies 3 viewports (`1440×900`, `768×1024`, `375×812`) while `emptyManageDialog` is open, and activates `"Mở tab Giáo trình"` via keyboard `Enter`.
  4. `rm -rf scripts/design-compare/.state/raw/new/t-class-detail plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail && pnpm design:compare --screens t-class-detail --side both --label new` regenerates all 6 `t-class-detail` composite screenshots without leaking a background Vite server.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 7
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: 521-class-detail-schedule-disabled-hint -->
