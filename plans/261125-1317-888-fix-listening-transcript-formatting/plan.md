---
title: "888-fix-listening-transcript-formatting"
description: "Format listening transcripts into readable paragraphs and clean speaker turns at render time in @teacher-os/ui, preserving rich-text HTML security boundaries and Node SSR safety."
status: completed
priority: P1
effort: "3h"
tags: [bugfix, listening, ui, transcript, issue-888]
created: 2026-11-25
---

# Fix Listening Transcript Formatting (#888)

## Overview

On the Listening attempt review page (`/student/learn/quizzes/attempt/:attemptId/detail`, rendered by `QuizPaper`) and Study Pack detail/simulation views, listening transcripts currently render as an unbroken wall of text without paragraph separation or speaker hierarchy:

1. `packages/ui/src/components/quiz/quiz-paper.tsx:864-877` dumps raw `{transcript}` into a single `<div className="mt-2 whitespace-pre-line text-muted-foreground leading-relaxed">`. Even line-delimited transcripts (e.g., *City Health Services*, 37 single-`\n` lines, 0 blank lines) stack flush with zero vertical spacing, uniform muted text, and redundant ASR diarization prefixes (`Speaker 1: Agent:`). Authored Tiptap HTML transcripts (`richTextField(10000)`) also dump literal HTML tags instead of using the single `RichTextBody` DOMPurify sink (`docs/system-architecture.md:60`).
2. Across the 498 listening tests in `docs/listening_ielts/` and 60 study-pack exercises in `packages/db/seed-data/study-packs/`:
   - 361/498 have single `\n` only (180 with double `Speaker N: Role:` prefixes, 15 leading-label ASR diarization drift files where one `Speaker N` maps to multiple roles, 80 with mid-line inline speaker switches including 7 with missing spaces like `.MARY:` / `?Dr.Twain:` / `?CUSTOMER:` / `.HENRY:` / `?Man:`, 6 with standalone speaker header lines above `Speaker N:`, and 133 multi-line files containing long 1,200–4,989 char monologue lines).
   - 137/498 have 0 newlines: 15 with inline speaker transitions (e.g., *Talking about the history of bikes* with 14 inline `NARRATOR:` markers, *Apartment in Arillas* with 44 `Receptionist:`/`Tourist:` turns) and 122 unbroken 3,000–5,000 char monologues (including `Forecast-Quy-2-2025-S4-canadian-puffins.json` with 34 missing-space sentence boundaries `.Many`/`.Puffins`). In study packs: `foun-gt1-discipline.json` has 20 zero-newline and 8 multi-paragraph listening transcripts; `first-step-gt2.json` has 32 listening transcripts including 7 standalone speaker header dialogues (`LISA:\n\n...`), `\n\n\n\n\n` blank runs, `Useful vocabulary` glossaries, and 2 partially unprefixed dialogues (`b58`, `b62`).
3. Because `apps/server/src/lib/library-test-sync.ts:38-39` copies library tests into org-local `assignment_prompt` snapshots (`INF-03`) without overwriting existing copies, fixing formatting at render time in `@teacher-os/ui` immediately fixes all existing attempts, cloned org tests, study packs, and plain/flat-`<p>`/`<br>` teacher-pasted transcripts with zero DB migration risk.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Pure DOM-free transcript parser (`packages/ui/src/lib/transcript.ts`) + comprehensive unit, adversarial performance, and 498+60 corpus invariant tests (`packages/ui/src/lib/transcript.test.ts` running under `// @vitest-environment node`).
  - Shared `<TranscriptBody>` component (`packages/ui/src/components/quiz/transcript-body.tsx`) wired into `packages/ui/src/components/quiz/quiz-paper.tsx:864-877` (Student attempt review detail + Study Pack `PreviewQuizSimulation`) and `apps/web/src/components/study-packs/study-pack-item-viewer.tsx:614` (Study Pack `"Đề & Đáp án"` tab).
  - Component, Node SSR safety, leak-canary (`preview-quiz-simulation.test.tsx`), and regression tests across `packages/ui`, `apps/student`, and `apps/web`, plus 3-viewport light/dark UI verification.
- **Explicit Non-Goals:**
  - No edits to `packages/db/src/seed/listening-library.ts`, `packages/db/seed-data/study-packs/*.json`, or DB migrations.
  - No edits to `apps/web/src/routes/_auth/assignments/preview.tsx` (teacher assignment preview does not currently pass `transcript` to `PreviewQuizSimulation`; outside #888 student review scope).
  - No edits to Speaking AI transcripts or `PlacementErrorHighlighter` (character-offset dependent).
  - No edits to `RICH_TEXT_CONTENT_CLASSES`, `rich-text-sanitize.ts`, or `normalizeLegacyRichText` (avoids global side effects on `intro`, `note`, `explanation`, `optionBank`).
  - No second `dangerouslySetInnerHTML` sink (all rich HTML transcripts delegate exclusively to `RichTextBody`).
  - Transcript remains strictly hidden in `mode="take"`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Parse plain-text and flat `<p>`/`<br>` listening transcripts deterministically into structured speaker turns and readable paragraphs with zero content loss, bounded O(N) safety, and zero false splits across all 498 library tests and 60 study-pack exercises | P1 |
| 2 | Render structured plain-text transcripts (full Node SSR parity) and sanitized rich HTML transcripts (via `RichTextBody` single DOMPurify sink, fail-closed in Node SSR) cleanly in `QuizPaper` and `StudyPackItemViewer` with DESIGN.md neutral tokens and full regression coverage | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Pure Transcript Parser & Corpus TDD](./phase-01-start.md) | Completed |
| 2 | [Phase 2: TranscriptBody UI, Integration & Verification](./phase-02-transcript-ui-and-verification.md) | Completed |

## Acceptance Criteria

- [x] *Talking about the history of bikes* renders as a clean `NARRATOR` speaker header followed by separated readable paragraphs (14 `NARRATOR:` transitions split into 18 balanced paragraphs via Pass 5), without splitting prose colons (`Machine Age:`, `comfortably:`).
- [x] *City Health Services* strips redundant `Speaker 1: Agent:` / `Speaker 2: Customer:` double prefixes, maps unambiguous bare `Speaker 1:` / `Speaker 2:` turns to `Agent` / `Customer`, splits mid-line inline turns, and merges consecutive same-speaker blocks.
- [x] Ambiguous ASR diarization drift files (e.g., `Speaker 1` mapping to both `JOHN` and `SALLY`) preserve raw `Speaker N` rather than misattributing dialogue; standalone speaker headers (`LISA:\n\n...`, `Lectuerer:\nSpeaker 1:...`) and missing-space inline turns (`.MARY:`, `?CUSTOMER:`, `?Dr.Twain:`, `.HENRY:`, `?Man:`) parse cleanly without glossary/note false badges.
- [x] Long unbroken paragraphs (`> 550` chars and `>= 5` sentences, whether in single-line or multi-line transcripts, including missing-space sentence joins like `.Many`) split cleanly into readable ~3–4 sentence paragraphs without breaking abbreviations (`Dr.`, `U.S.`, `a.m.`), decimals (`3.5`), or lowercase quote continuations (`"..." they`).
- [x] Flat `<p>`/`<br>` HTML from Tiptap pastes / `normalizeLegacyRichText` (zero attributes, zero rich formatting tags) extracts cleanly to plain text and formats through `parseTranscript`; rich HTML transcripts (including `<head>`-scoped tags like `<script>`/`<style>` and unclosed dangerous tags like `<svg onload=...>`) route exclusively through `RichTextBody` (single DOMPurify sink, XSS stripped in browser/jsdom, fail-closed escaped text in Node SSR without throwing); `mode="take"` never renders transcript.
- [x] All 498 `docs/listening_ielts/*.json` + 60 study-pack transcripts pass lossless corpus invariants, adversarial 25 KB / 1,600-line perf checks run in `< 500 ms` under multi-worker CI (`< 50 ms` solo), and `pnpm exec biome check .`, `pnpm check-types`, targeted vitest suites (`@teacher-os/ui`, `student`, `web`), and 3-viewport light/dark UI checks pass.

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker) + Assumption Destroyer (Fact Checker)
**Findings:** 13 unique findings after deduplicating 3 overlaps (13 accepted, 0 rejected)
**Severity breakdown:** 5 Critical, 4 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Pass 2 inline discovery `\s+` missed `.MARY:`, `?CUSTOMER:`, `?Man:`, `.HENRY:` | Critical | Accept | Phase 1 |
| 2 | Standalone speaker header lines (`LISA:\n\n...`, `Lectuerer:\nSpeaker 1:...`) across 13 files | Critical | Accept | Phase 1 |
| 3 | DOMPurify bypass on `<head>`-scoped (`<script>`, `<style>`) / unclosed dangerous tags + missing speaker character allowlist | Critical | Accept | Phase 1, Phase 2 |
| 4 | Flat `<p>`/`<br>` Tiptap/legacy HTML bypassed parser & plain-text `&amp;` broke `\n` in `RichTextBody` | Critical | Accept | Plan, Phase 1, Phase 2 |
| 5 | SSR parity claim overstated for rich HTML in `node` (`RichTextBody` fail-closed escaped text) | Critical | Accept | Plan, Phase 2 |
| 6 | O(N²) ReDoS in unmemoized HTML tag regexes + unbounded dynamic `new RegExp` roster | High | Accept | Phase 1, Phase 2 |
| 7 | React Rules of Hooks violation (`useMemo` after early return) in `<TranscriptBody>` spec | High | Accept | Phase 2 |
| 8 | False speaker badges on glossary `(Adj):` / `(Note:`, title dot split `MR. SMITH`, and blank-line unprefixed dialogues `b58`/`b62` | High | Accept | Phase 1 |
| 9 | Pass 5 trigger contradiction ("no author line breaks") + missing-space sentences in `canadian-puffins.json` | High | Accept | Plan, Phase 1 |
| 10 | Missing `min-w-0 break-words` and table horizontal-scroll guard in `<TranscriptBody>` classNames | Medium | Accept | Phase 2 |
| 11 | `transcript.test.ts` runs in `jsdom` unless pinned with `// @vitest-environment node` and `/// <reference types="node" />` | Medium | Accept | Phase 1 |
| 12 | Inline speaker after `}` marker (`][1]} Peter:`), Biome fix command (`pnpm check:fix`), and corpus counts | Medium | Accept | Plan, Phase 1, Phase 2 |
| 13 | Empty `<details>` shell on label-only input + missing transcript canary test in `preview-quiz-simulation.test.tsx` + `assignments/preview.tsx` scope clarity | Medium | Accept | Plan, Phase 1, Phase 2 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-transcript-ui-and-verification.md`
- Decision deltas checked: 13
- Reconciled stale references: 7 (`pnpm check` -> `pnpm check:fix`, SSR parity wording, `foun-gt1-discipline.json` counts, `no author line breaks` removed, `PreviewQuizSimulation` caller clarity, `useMemo` ordering, flat HTML extraction)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-25
### Verification Results
- **Tier:** Light (2 phases; Fact Checker verified via Red Team + `ak plan validate`)
- **Claims checked:** 16
- **Verified:** 16 | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-transcript-ui-and-verification.md`
- Decision deltas checked: 13
- Reconciled stale references: 0 (all reconciled in Red Team pass)
- Unresolved contradictions: 0

## Handover Note (`--advice`)

This plan is handover-ready for lower-capability executor models: every phase decomposes into self-contained tasks with explicit target symbols, mechanical `Verify` pass conditions (including explicit TDD red-phase pass conditions), and a materialized `## Failure Protocol` block requiring escalation to `kongming` on any failed check.

<!-- slug: 888-fix-listening-transcript-formatting -->
