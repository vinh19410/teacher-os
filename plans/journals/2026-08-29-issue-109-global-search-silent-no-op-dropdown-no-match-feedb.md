---
title: "issue-109 global search silent no-op: dropdown + no-match feedback"
date: 2026-08-29
---

# issue-109 global search silent no-op: dropdown + no-match feedback

Root cause (verified from code): Topbar submitSearch only matched student
names and returned silently on no match; no dropdown UI ever existed
(topbar.tsx). Fix: pure searchGlobal module (normalizeVi NFD both sides,
per-type caps 5 students + 3 classes), dropdown in a new relative wrapper,
Enter=first match with IME isComposing guard, Escape close, no-match empty
state, aria combobox/listbox. TDD: 9 unit tests + 4 e2e cases
(match→navigate, no-match→empty, class click, Escape). Verified: 367 unit,
typecheck, biome (pre-existing warnings only), full e2e 33 pass/1 skip.
Red-team had found the "field clears" symptom has a second plausible path —
kernel load-gate remount (data-provider renders null while pending) — kept
out of scope, documented in plan + issue. Note: kongming advice checkpoints
could not spawn on this host (provider not configured) — recorded as
non-fatal advisory failures; authoritative gates all ran.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
