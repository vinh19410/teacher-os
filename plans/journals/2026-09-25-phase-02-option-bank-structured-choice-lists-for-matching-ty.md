---
title: "Phase-02 option bank: structured choice lists for matching types"
date: 2026-09-25
summary: Full-stack option_bank column + contract rules + composer bank editor with positional reset; e2e round-trip via snapshot
---

# Phase-02 option bank: structured choice lists for matching types

## What happened
Implemented plans/260925-0724-assignment-authoring-ui-ux/phase-02-option-bank.md end to end on branch vinh19410/feat/assignment-authoring-ui-ux (worktree teacher-os-vinh19410-feat-assignment-authoring-ui-ux), 5 commits a19e598..72e1bf8, nothing pushed.

- FR1: `assignment_prompt.option_bank` TEXT NOT NULL DEFAULT "[]" (migration 0028_salty_purifiers.sql, header carries the deploy-order note: db:migrate:deploy BEFORE worker deploy or every prompt creation 500s).
- FR2: contracts.ts — optionBank array (trim, 1-200 chars, max 8, default []), ASSIGNMENT_OPTION_BANK_TYPES skill-qualified set (writing task1 `map` NOT bankable), ready-gated superRefine: bank 2..8 and >= questions, questions <= 8, every answer a label whose index < bank length, sentend answers pairwise distinct; non-bankable prompts reject a non-empty bank.
- FR7 write/read chain: insert map option_bank + snapshot destructure + parseOptionBank (legacy/corrupt -> []) + KernelAssignmentPromptRow.optionBank + repo projection + mock-data type + PreviewDraft + autosave draft shape validation.
- FR3/FR4/FR5 web: option-bank-editor.tsx (positional labels via bankLabel, removeBankRow resets keys at/after the deleted label — red-team #4), answer-key-grid chips sourced from bank positions, sentend reuse blocked via disabled chips, TYPE_HINTS features/sentend no longer tell teachers to list A–H in the intro.
- FR6: student-preview-paper + prompt-preview-aside render the bank as a labeled list; empty bank on bankable types keeps the intro fallback AND warns "Thiếu ngân hàng lựa chọn".

## Decision
- Bank row delete resets (never re-binds) keyed answers positionally; bank survives only bankable->bankable same-skill type changes (items still reset).
- optionBankIssue() in composer-transitions.ts mirrors the contract so the web blocks save with the same message the server would 400 on; item-level rules block drafts too (contract parses them strictly).
- e2e asserts through the bank page (snapshot read path), not just POST 201.

## Verification
pnpm test exit 0 (web 857, server 359, student 47, auth 59, infra 17); web/server/api/db biome clean; web+e2e tsc clean; Playwright assignment-prompt-reading-types.spec.ts 6/6 on E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 (includes legacy-row seeding into local.db). `pnpm --filter db exec tsc --noEmit` fails on ../infra/alchemy.run.ts TS5097 — pre-existing (fails on stashed baseline too), not a phase-02 gate.

## Next steps
Phase 3 (cloze click-to-blank) builds on the phase-01 grid; phase-4 pins depend on this phase's bank for listening map. PR body must repeat the migration deploy-order note.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
