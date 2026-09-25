---
title: Phase-03 cloze click-to-blank + tablecomp grid editor
date: 2026-09-25
summary: "Implemented phase-03 of plan 260925-0724 via TDD: pure cloze lib, ClozeEditor (visual+raw), TableGridEditor, marker preview on both surfaces, FR7 caps mirror, 9 e2e pass."
---

# Phase-03 cloze click-to-blank + tablecomp grid editor

## What happened
- Phase-03 (plan plans/260925-0724-assignment-authoring-ui-ux) implemented TDD-first on branch vinh19410/feat/assignment-authoring-ui-ux.
- New: apps/web/src/lib/cloze.ts (parseClozeRaw, segmentsToItems, splitStemByMarker, countBlanks, buildClozeSegments, tablecomp grid math + [table] stem prefix) with 56 unit tests; ClozeEditor (paste → tokenize gate → click-to-blank, blank popover answer/alts, raw H5P *answer/alt* mode with \* escape, render cap 5000 tokens, caps block before apply); TableGridEditor (r×c grid, cell→blank captures answer, marker-exempt [table] r{h} c{c}: <row> / <col> stems); shared ClozeStemText for student-preview-paper + prompt-preview-aside (width = answer length + 4ch, key never rendered).
- Integration: question-key-editor embeds cloze editor for the 8 completion types and the grid for tablecomp; shortans keeps phase-01 text rows. FR7 mirror: clozeRowIssue/clozeStemIssue (≥2 markers error, 0 valid, caps 500/200/500/40) wired into canSave, fieldErrors.questions, actionCopyFor, questionRowError.
- E2E: 3 new tests in assignment-prompt-reading-types.spec.ts (4-word click-to-blank summary → 4 preview inputs + leak-check; tablecomp 2×3 with 2 blanks → labeled Hàng/Cột rows; over-40-blanks and >500-char segment block apply). 9/9 spec pass, adjacent specs 13/13 pass.

## Decision
- Marker semantics per red-team #14: exactly 1 marker valid, 0 valid (legacy + tablecomp exemption), ≥2 row error blocking both statuses.
- Blank badge numbers follow TEXT order (= student question numbers) while click order is preserved in state (FR1); answers bind positionally regardless of click order.
- Raw-mode unterminated `*` treated as literal asterisk (predictable over greedy); empty table cells cannot be blanked (no empty answers).
- Confirm-before-overwrite hoisted into the event handler (StrictMode-safe, red-team #8 pattern).

## Next steps
- Phase-04 (image pins) reuses the popover/validate row layer; pins need contract + snapshot read-path (`.strict()` inner).
- ak plan index path quirk: `ak plan status teacher-os/<id>` resolves relative to cwd — use the plan dir path directly (plans/260925-0724-...).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
