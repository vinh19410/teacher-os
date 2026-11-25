---
title: "Explain locked submit button while QuizResumeDialog is open and across all disabled states (#885)"
description: "Keep storeActive safely gated behind QuizResumeDialog, add visible helper text inside QuizResumeDialog, harden modal stacking/focus trap, and expose submitDisabledReason on QuizRuntimeHeader with stable-tree aria-describedby + Base UI Tooltip."
status: completed
priority: P2
effort: "2h"
tags: [student, practice, quiz, ux, a11y, bugfix, tdd]
created: 2026-11-25
---

# Explain locked submit button while QuizResumeDialog is open (#885)

Tracking: #885

## Overview

When a student reloads an active `in_progress` quiz/practice attempt that already has saved answers on the server (`serverHasAnswers === true`), `QuizTakeView` (`apps/student/src/components/quiz/quiz-take-view.tsx:167-176`) sets `needsResumeDialog = true` and intentionally delays creating the autosave stores (`storeActive = attempt !== null && attempt.status === "in_progress" && !needsResumeDialog`) so reloading does not prematurely reconcile `localStorage` mirrors or flush/clear them if the student clicks `"Quay lại"`.

Because `!storeActive` and `store === null` feed into `submitDisabled` (`quiz-take-view.tsx:537-543`), `<QuizRuntimeHeader>` (`apps/student/src/components/quiz/quiz-runtime-header.tsx:85-93`) renders the `"Nộp bài"` button visibly dimmed (`disabled:opacity-50 disabled:pointer-events-none`, `packages/ui/src/components/button.tsx:6`) behind `QuizDialog`'s translucent backdrop (`fixed inset-0 z-50 bg-primary/40`, `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:63`). Neither `QuizResumeDialog` (`quiz-lifecycle-dialogs.tsx:127-147`) nor `QuizRuntimeHeader` explains why `"Nộp bài"` is locked or how to unlock it — and other disabled states (Speaking missing media / uploading, autosave halted, submitting) also lack an accessible/hover explanation on the header button.

Because `QuizDialog` covers the full viewport over `<header>` (`z-30`) and traps keyboard focus, a hover tooltip on the header button alone cannot be triggered while the modal is open. This plan implements the refined Option A approved by `kongming` Checkpoint 1 and hardened by Red Team review:
1. Keep `storeActive` safely gated on `!needsResumeDialog` and preserve modal semantics; harden `QuizDialog` (`z-[60]` above `z-50` Tooltip portals, plus `:not([disabled])` & `Shift+Tab` from initial card focus).
2. Add an optional `helperText` block to `QuizDialog` (wired into `aria-describedby`, separate from the existing `<p>` description) and populate it on `QuizResumeDialog` so students immediately see why `"Nộp bài"` is locked and that clicking `"Tiếp tục"` unlocks it.
3. Add `submitDisabledReason?: string | null` to `QuizRuntimeHeader`, keeping a **stable React wrapper tree** (`<TooltipProvider delay={0}><Tooltip disabled={disabledReason === null}><TooltipTrigger disabled={disabledReason === null} render={<span ... />}><Button ...>Nộp bài</Button></TooltipTrigger>...</TooltipProvider>`) so `<Button>` never unmounts/remounts across state transitions, while preserving HTML `disabled`, exact accessible name `"Nộp bài"`, permanently mounted `sr-only` `aria-describedby` reason when disabled, and hover tooltip (`max-w-[calc(100vw-16px)]`) across all non-modal disabled states without breaking SSR `renderToStaticMarkup` tests.
4. Derive `submitDisabledReason` via a pure helper `resolveSubmitDisabledReason(...)` in `quiz-take-view.tsx` covering every disabled condition in strict priority order, derive `submitDisabled = submitDisabledReason !== null` so the boolean flag and reason can never drift, and call `storeRef.current?.halt("auth")` in Speaking `onAuthError` (`quiz-take-view.tsx:672-675`) so Speaking auth expiry disables submit consistently with other skills.

## Scope & Constraints

### Locked In-Scope
- `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx`: add optional `helperText?: string` to `QuizDialog` (separate `<p id={helperId}>` linked in `aria-describedby`), raise modal backdrop to `z-[60]` (above `z-50` Base UI tooltip portal), harden `Shift+Tab` + `:not([disabled])` focus trap, and pass `'Hãy chọn "Tiếp tục" để khôi phục bài làm và mở khóa nút "Nộp bài".'` in `QuizResumeDialog`.
- `apps/student/src/components/quiz/quiz-runtime-header.tsx`: add optional `submitDisabledReason?: string | null` to `QuizRuntimeHeader`; keep a stable `<TooltipProvider><Tooltip><TooltipTrigger render={<span />}><Button disabled={submitDisabled}>Nộp bài</Button></TooltipTrigger>` tree (no `nativeButton` prop, no `tabIndex={0}` on `<span>`, no `title` alongside `<Tooltip>`) with `aria-describedby` pointing to a permanently mounted `sr-only` span whenever `disabledReason !== null` and `<TooltipContent side="bottom" align="end" className="max-w-[calc(100vw-16px)] rounded-md text-center">`. Keep clean fallback (`<span title={disabledReason}>` + `sr-only` `aria-describedby` in a stable wrapper) only if Base UI Tooltip proves incompatible with Node `renderToStaticMarkup` in Phase 1 TDD verification.
- `apps/student/src/components/quiz/quiz-take-view.tsx`: add and export pure `resolveSubmitDisabledReason(...)` covering all 7 branches (`attempt.status !== "in_progress"`, `needsResumeDialog`, `submitMutation.isPending`, `haltedReason` [`auth` / `org_mismatch` / fallback], `isSpeaking && mediaUploading`, `isSpeaking && media === null`, `store === null || (hasHybridWriting && essayStore === null)`), derive `submitDisabled = submitDisabledReason !== null`, pass `submitDisabledReason` to `QuizRuntimeHeader`, and add `storeRef.current?.halt("auth")` in Speaking `onAuthError` (`quiz-take-view.tsx:672-675`).
- `apps/student/test/quiz-navigator.test.tsx`: TDD SSR/markup unit tests for `QuizResumeDialog` helper text (preserving exact original description) and `QuizRuntimeHeader` `submitDisabledReason` (`renderToStaticMarkup`, `aria-describedby`, `disabled`, single `<button>`, no `text-bg`).
- `apps/student/test/quiz-take-view.test.tsx`: TDD component + unit tests covering reload resume dialog helper + locked/unlocked `"Nộp bài"` transition (asserting stable button DOM identity), `Shift+Tab` focus-trap guard on `QuizResumeDialog`, `resolveSubmitDisabledReason` priority across all disabled branches (including Speaking `mediaUploading` before `media === null`, halted states, pending), and hover tooltip visibility in jsdom (`ResizeObserver` stub + `fireEvent.mouseEnter` + `[data-slot="tooltip-content"]`).
- `apps/e2e/specs/student-practice.spec.ts`: extend reload/resume assertions to verify helper text inside `QuizResumeDialog`, `"Nộp bài"` disabled with safe multi-ID `aria-describedby` lookup while open, zero horizontal overflow while dialog is open, and `"Nộp bài"` re-enabled after clicking `"Tiếp tục"`.
- Visual verification in `plans/reports/885-*.png` captured against the unified E2E LMS stack (`apps/e2e/playwright.config.ts` on `E2E_API_PORT=8100`, `E2E_LMS_PORT=8101`) covering `QuizResumeDialog` at `1440×900`, `768×1024`, `375×812`, `320×568` (Light & Dark) plus real-browser hover `<TooltipContent>` on a non-modal disabled state (Speaking without media).

### Explicit Non-Goals
- Do NOT modify `packages/ui/src/components/button.tsx` or `packages/ui/src/components/tooltip.tsx`.
- Do NOT mount a global `TooltipProvider` in `apps/student/src/routes/__root.tsx`.
- Do NOT modify `apps/student/src/components/quiz/speaking-submission-panel.tsx` (tracking Speaking `deleting` busy state is a separate follow-up outside #885).
- Do NOT add an unrequested persistent `org_mismatch` banner (`org_mismatch` already surfaces a toast; outside #885).
- Do NOT change `storeActive` gating, `needsResumeDialog` logic, or `createQuizAttemptStore` reconciliation in `apps/student/src/lib/quiz-attempt-store.ts`.
- Do NOT change `QuizResumeDialog` title (`"Tiếp tục bài làm"`), exact original description (`"Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?"`), or button labels (`"Quay lại"`, `"Tiếp tục"`, `"Nộp bài"`).
- Do NOT add `tabIndex={0}` to the disabled-button wrapper `<span>`, do NOT switch `<Button>` to `focusableWhenDisabled`, and do NOT attach both `title` and `<Tooltip>` to the same element.
- Do NOT add a third `"Nộp bài"` button inside `QuizResumeDialog` or hide `"Nộp bài"` on reload.
- Do NOT run the full E2E suite locally (`AGENTS.md`); run only the targeted `student-practice.spec.ts` with port overrides `8100–8105`.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Show clear Vietnamese explanation inside `QuizResumeDialog` when reload locks `"Nộp bài"` (with hardened `z-[60]` stacking & focus trap) | P1 |
| 2 | Expose accessible `aria-describedby` + stable-tree hover tooltip explanation on `QuizRuntimeHeader` `"Nộp bài"` across all disabled states | P1 |
| 3 | Lock every disabled reason priority, E2E reload transition, real-browser hover tooltip, and 320px–1440px Light/Dark visual verification | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Resume Dialog Helper, Header Disabled Reason & TDD Tests](./phase-01-resume-dialog-and-header-reason.md) | Completed |
| 2 | [Phase 2: Targeted E2E Assertion, Visual Verification & Quality Gates](./phase-02-e2e-visual-verification.md) | Completed |

## Success Criteria

- [x] TDD Red phase fails on unmodified code for `QuizResumeDialog` helper text, `QuizRuntimeHeader` `submitDisabledReason`, and `QuizTakeView` reload locked→unlocked transition + reason priority.
- [x] While `QuizResumeDialog` is open on reload, the dialog displays `'Hãy chọn "Tiếp tục" để khôi phục bài làm và mở khóa nút "Nộp bài".'` in a separate `<p>` wired into `aria-describedby`, preserves exact description `"Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?"`, stacks at `z-[60]`, and traps `Shift+Tab` from initial focus.
- [x] While `"Nộp bài"` is disabled for any reason (resume pending, submitting, halted, speaking uploading, speaking missing media, store syncing), `<Button disabled>` preserves exact accessible name `"Nộp bài"` and stable DOM node identity, exposes `aria-describedby` pointing to a permanently mounted `sr-only` element with the exact Vietnamese reason, and shows a viewport-safe hover tooltip on desktop when not covered by a modal.
- [x] Clicking `"Tiếp tục"` dismisses `QuizResumeDialog`, enables `"Nộp bài"` without remounting the `<button>`, removes `aria-describedby`, and disables the tooltip.
- [x] All quality gates pass: `pnpm --filter student test`, `pnpm exec biome check .`, `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`, `VITE_SERVER_URL=http://localhost:8000 pnpm --filter lms build` (or `pnpm build`), and targeted E2E `E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-practice.spec.ts`.
- [x] Visual check on the unified E2E LMS stack confirms zero horizontal overflow (`scrollWidth <= clientWidth`) at 1440×900, 768×1024, 375×812, and 320×568 in both Light and Dark themes (including while `QuizResumeDialog` is open and on real-browser non-modal hover `<TooltipContent>`), with screenshots archived in `plans/reports/` for PR & Issue #885 POT.

## Validation Log

### Session 1 — 2026-11-25
**Trigger:** Mandatory `ak-vibe` pre-implementation plan validation gate for #885.
**Questions asked:** 0 (scope, non-goals, and acceptance criteria are fully determined by Issue #885, codebase evidence, and `kongming` Checkpoint 1 counsel with zero unresolved product ambiguities).

### Verification Results
- **Tier:** Light (2 phases; Fact Checker)
- **Claims checked:** 16
- **Verified:** 16 | **Failed:** 0 | **Unverified:** 0 (after applying Red Team Session 1 corrections below)
  - `apps/student/src/components/quiz/quiz-take-view.tsx:167-176,191-192,223-224,537-543,570-577,672-675,688-696` — VERIFIED
  - `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:33-60,63,70,90,127-147` — VERIFIED
  - `apps/student/src/components/quiz/quiz-runtime-header.tsx:25-42,44,85-93` — VERIFIED
  - `packages/ui/src/components/button.tsx:6,40-53` — VERIFIED
  - `packages/ui/src/components/tooltip.tsx:6-65` (`TooltipPrimitive.Trigger` has no `nativeButton` prop; `TooltipPrimitive.Positioner` has `z-50`; `TooltipPrimitive.Popup` has `data-slot="tooltip-content"`, no `role="tooltip"`) — VERIFIED
  - `packages/ui/src/components/date-picker-input.test.tsx:14-22` (`ResizeObserver` jsdom stub precedent) — VERIFIED
  - `apps/student/test/quiz-navigator.test.tsx:140-334` — VERIFIED
  - `apps/student/test/quiz-take-view.test.tsx:614-654` — VERIFIED
  - `apps/e2e/specs/student-practice.spec.ts:221-260` — VERIFIED
  - `apps/e2e/playwright.config.ts:8-12,26-33,70-101` (unified `apps/lms` on `E2E_LMS_PORT`/`E2E_WEB_PORT`, `VITE_STUDENT_PRACTICE_ENABLED=true`, `LMS_REBUILD_PORTALS=1`) — VERIFIED
  - `apps/e2e/src/boot.ts:36-40,132-137` (`LMS_ORIGIN` single-origin CORS & Better Auth) — VERIFIED
  - `package.json:24-25` (`"check": "biome check ."`, `"check:fix": "biome check --write ."`) — VERIFIED
  - `.github/workflows/quality.yml:48-50` (`biome check .`, `check-types`, `build`) — VERIFIED

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-resume-dialog-and-header-reason.md`, `phase-02-e2e-visual-verification.md`
- Decision deltas checked: 8 (removed `nativeButton={false}`, unified E2E LMS stack for Task 2.2, `z-[60]` + `Shift+Tab` focus-trap fix in `QuizDialog`, stable React tree in `QuizRuntimeHeader`, Speaking `onAuthError` `halt("auth")`, explicit jsdom `mouseEnter` + `ResizeObserver` + `[data-slot="tooltip-content"]` contract, real-browser hover Tooltip verification + Dark mobile screenshot, `pnpm check:fix` + `lms build` + safe ARIA `IDREFS` lookup)
- Reconciled stale references: 8
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Fact Checker)
**Findings:** 8 deduplicated (7 accepted / partial-accepted, 1 sub-item deferred as out-of-scope follow-up)
**Severity breakdown:** 2 Critical, 5 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `@base-ui/react@1.7.0` `TooltipTrigger` does not declare `nativeButton` prop (breaks `check-types` and emits React DOM warning) | Critical | Accept | `plan.md`, `phase-01` (Task 1.3) |
| 2 | Phase 2 Task 2.2 used standalone `student` preview on `:8103` + external scratch import instead of unified E2E `apps/lms` stack on `:8101` (breaks CORS, Better Auth, `/login`, practice flag, `@playwright/test` resolve) | Critical | Accept | `plan.md`, `phase-02` (Task 2.2) |
| 3 | `QuizDialog` `Shift+Tab` from initial card focus escapes modal (`:not([disabled])` missing) and `z-50` modal conflicts with `z-50` `TooltipContent` portal at end of `document.body` | High | Accept | `plan.md`, `phase-01` (Task 1.1, Task 1.2) |
| 4 | Conditional `<TooltipProvider>` wrapper remounts `<Button>` DOM node on `disabledReason` toggle (`null ↔ string`), breaking retained RTL refs and dropping focus on retry | High | Accept (stable React tree; defer unrequested `org_mismatch` banner) | `plan.md`, `phase-01` (Task 1.1, Task 1.3) |
| 5 | jsdom hover tooltip test requires `ResizeObserver` stub, `fireEvent.mouseEnter` (not `pointerEnter`), and `[data-slot="tooltip-content"]` query (disambiguating from `sr-only` duplicate text) | High | Accept | `phase-01` (Task 1.1) |
| 6 | First monorepo consumer of `packages/ui/src/components/tooltip.tsx` lacked real-browser hover verification, `max-w-[calc(100vw-16px)]`, and Dark mobile screenshot | High | Accept | `plan.md`, `phase-01` (Task 1.3), `phase-02` (Task 2.2) |
| 7 | Speaking `onAuthError` (`quiz-take-view.tsx:672-675`) omitted `storeRef.current?.halt("auth")`; Speaking `deleting` state separate from `mediaUploading` | High | Partial Accept (add `halt("auth")` in `quiz-take-view.tsx`; defer `SpeakingSubmissionPanel` `deleting` to follow-up outside #885) | `plan.md`, `phase-01` (Task 1.4) |
| 8 | Phase 2 Task 2.3 cited read-only `pnpm check` instead of `pnpm check:fix`, omitted unified `lms` build, and Task 2.1 interpolated `aria-describedby` directly into CSS `[id="..."]` selector | Medium | Accept | `plan.md`, `phase-02` (Task 2.1, Task 2.3) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-resume-dialog-and-header-reason.md`, `phase-02-e2e-visual-verification.md`
- Decision deltas checked: 8
- Reconciled stale references: 8
- Unresolved contradictions: 0

<!-- slug: 885-fix-resume-dialog-submit-explanation -->
