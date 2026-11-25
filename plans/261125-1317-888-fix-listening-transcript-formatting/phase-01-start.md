---
phase: 1
title: "Phase 1: Pure Transcript Parser & Corpus TDD"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Pure Transcript Parser & Corpus TDD

## Goal

Implement a 100% pure, DOM-free TypeScript transcript parser (`parseTranscript`, `splitMonologueParagraphs`, and `classifyTranscriptInput`) in `@teacher-os/ui` verified test-first under `// @vitest-environment node` against real edge cases, adversarial performance inputs, and all 498 listening library tests + 60 study-pack listening exercises.

## Files to Create / Modify

- Create: `packages/ui/src/lib/transcript.ts`
- Create: `packages/ui/src/lib/transcript.test.ts`

## Tasks & Steps

### Task 1.1 — Write failing TDD test suite covering real edge cases, adversarial perf, and corpus invariants (Red Phase)
- **Goal:** Establish failing unit tests, DOM-free Node assertions, ReDoS/perf tests, and a 498+60 corpus invariant test that specify every parsing contract before writing parser code.
- **Target files and symbols:** `packages/ui/src/lib/transcript.test.ts` (imports `parseTranscript`, `splitMonologueParagraphs`, `classifyTranscriptInput`, `type TranscriptTurn` from `@teacher-os/ui/lib/transcript`).
- **Steps:**
  1. Create `packages/ui/src/lib/transcript.test.ts` starting with BOTH `// @vitest-environment node` and `/// <reference types="node" />` on lines 1–2 (<!-- Updated: Red Team RT-11 -->). Add an explicit test asserting `typeof document === "undefined"` and `typeof DOMParser === "undefined"` so DOM-free purity is enforced mechanically.
  2. Add focused unit tests for:
     - Empty / whitespace-only inputs returning `[]`; label-only input (`"Speaker 1: Agent:"`) falling back to `[{ speaker: null, paragraphs: ["Speaker 1: Agent:"] }]` so callers never render an empty shell (<!-- Updated: Red Team RT-13 -->).
     - `classifyTranscriptInput(text)`:
       - Plain text containing `&amp;` / `&quot;` / `&#39;` and `\n` (no HTML tags) classifies as `{ kind: "plain", text }` (never routed to `RichTextBody` HTML branch).
       - Flat Tiptap/legacy HTML containing ONLY bare `<p>` / `</p>` / `<br>` / `<br/>` tags (zero attributes, zero other tags, e.g. `<p>Speaker 1: Agent: Hi.<br>Speaker 2: Customer: Hello &amp; welcome.</p>`) classifies as `{ kind: "plain", text: ... }` preserving `\n` / `\n\n` breaks and decoding standard HTML entities safely for React text rendering (<!-- Updated: Red Team RT-4 -->).
       - Rich HTML (`<p><strong>Agent:</strong> Hello</p>`, `<ul>`, `<table>`, `<a>`) AND `<head>`-scoped / unclosed dangerous tags (`<script>alert(1)</script>Agent: Hello`, `<style>body{}</style>Hi`, `<svg onload=alert(1)>Hi`) classify as `{ kind: "html" }` consistently in Node (no DOM) so they ALWAYS go through `RichTextBody` DOMPurify (<!-- Updated: Red Team RT-3 -->).
     - *City Health Services* real fixture (`docs/listening_ielts/Actual-Test-S1-city-health-services.json`): double prefixes `Speaker 1: Agent:` / `Speaker 2: Customer:` normalized to `Agent` / `Customer`; unambiguous bare `Speaker 1:` / `Speaker 2:` lines resolved to `Agent` / `Customer`; mid-line inline turns (`Customer: ... Agent: ... Customer: ...`) split cleanly; consecutive same-speaker turns (`Agent: Excellent. Agent: Any extra...`) merged into one turn with multiple paragraphs; zero `Speaker 1:` or `Speaker 2:` left in rendered text.
     - *Talking about the history of bikes* real fixture (`docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json`): single turn with `speaker: "NARRATOR"` and `>= 14` paragraphs; prose colons (`Machine Age: people wanted`, `comfortably: "OH NO!`) preserved intact without false splits.
     - Inline multi-speaker dialogue with zero newlines: `Actual-Test-S1-apartment-in-arillas.json` (`Receptionist` & `Tourist`), `Other-sources-S3-the-cartesian-diver-experiment.json` (`Bob`, `Julia`, `Tara`), and `Collection-S1-rental-property-application-form-ac0672f7.json` (`][1]} Peter:` after `}` closing marker) (<!-- Updated: Red Team RT-12 -->).
     - Missing-space inline discovery without leading occurrences (<!-- Updated: Red Team RT-1 -->): `Forecast-Quy-2-2025-S3-medicine-courses.json` (`.MARY:`, `?MARY:`, `.PROFESSOR:`, while `.Have` is NOT split), `Collection-S1-tour-to-japan.json` (`?CUSTOMER:`/`.CUSTOMER:`), `Forecast-Quy-2-2025-S1-voluntary-job-hunting.json` (`?Man:`/`.Man:`), `Forecast-Quy-2-2025-S3-bachelor-of-science-degree.json` (`.HENRY:`/`?HENRY:`), and `Collection-S3-course-research.json` (`?Dr.Twain:`).
     - Standalone speaker-header lines (<!-- Updated: Red Team RT-2 -->): `first-step-gt2.json` `sysex-first-step-gt2-b18` (`LISA:\n\n...`) and `sysex-first-step-gt2-b38` (`KATIE:\n\n\n\n...`, `joe:\n\n\n\n...`), plus `docs/listening_ielts/Actual-Test-S4-bislama-the-pidgin-english-language-of-vanuatu.json` (`Lectuerer:\nSpeaker 1:...`) and `docs/listening_ielts/Collection-S2-clifton-bird-park.json` (`Sandra Hayes:\nSpeaker 1:...`) preserve speaker names and emit zero empty paragraphs.
     - Generic solo speaker suppression (`C17T4-S2-hotel-staff-turnover.json` 12× `SPEAKER:` -> `speaker: null`, `>= 12` paragraphs; `Actual-Test-S2-the-pre-school-family-centre.json` solo `Speaker:` -> `speaker: null`), while preserving meaningful solo roles (`Lecturer`, `NARRATOR`, `Radio Presenter (Anna)`, `Manager`).
     - ASR diarization drift safety (`Actual-Test-S3-the-invention-of-the-ballpoint-pen.json` and `C19T1-S1-hinchingbrooke-country-park.json`): ambiguous `Speaker N` mapping to multiple roles preserves `Speaker N`; unprefixed continuation line before mid-line `JOHN:` attaches cleanly without losing text.
     - False-speaker & glossary guards (<!-- Updated: Red Team RT-3, RT-8 -->): `SCRIPT:` (`Forecast-Quy-2-2025-S3-biology-lecture-ebc23247.json`), `(Note:` (`Collection-S3-research-project.json`), `Useful vocabulary` glossary terms (`first-step-gt2.json` `b24` `Contagious (Adj):`, `b08` `Puke:`), title dots (`MR. SMITH:`, `Dr. Rubin:` never split into `SMITH`/`Rubin`), blank-line unprefixed dialogues (`first-step-gt2.json` `b58` and `b62` never misattribute all subsequent turns to `Simon`/`D`), `Manager :` (space before colon), `09:30`, `10a.m`, `radio program:`, `three main headings:`, non-greedy `Speaker 1: No red meat. Officer: I see.`, and angle-bracket text `<tag>Name:` rejected by speaker character allowlist.
     - Per-paragraph monologue splitting (<!-- Updated: Red Team RT-9 -->): runs on every paragraph `> 550` chars & `>= 5` sentences in BOTH single-line (`Actual-Test-S4-a-museum-in-japan.json`, `Actual-Test-S2-gisborne-s-tourism.json`, `Forecast-Quy-2-2025-S4-canadian-puffins.json` with `.Many`/`.Puffins` missing-space sentences) and multi-line transcripts (`Actual-Test-S4-suburbs.json`, `Actual-Test-S4-bislama...`, `first-step-gt2.json` `b48`), protecting abbreviations (`Mr.`, `Dr.`, `U.S.`, `a.m.`, `e.g.`, `Ph.D.`), decimals (`3.5`), domains (`.com`), and lowercase quote continuations (`"..." they` in `foun-gt1-discipline.json`). Short single-sentence texts (`"Sample transcript"`, `"Receptionist: Welcome to Central Library."`) stay 1 paragraph.
     - Adversarial performance tests (<!-- Updated: Red Team RT-6, Failure Protocol Phase 2.2 -->): 25 KB unclosed-tag payload (`"<a".repeat(4999) + " ".repeat(15000) + "x"`) and 1,600-line distinct-speaker payload (`Aaa: x\nAab: x\n...`) complete `classifyTranscriptInput` + `parseTranscript` in `< 500 ms` under multi-worker CI (`< 50 ms` solo).
     - **Full corpus invariant test**: reads all 498 `docs/listening_ielts/*.json` (excluding `_index.json`) and all 60 listening transcripts from `packages/db/seed-data/study-packs/foun-gt1-discipline.json` and `first-step-gt2.json`; asserts for every file: no thrown errors, `turns.length >= 1`, every turn has non-empty trimmed paragraphs, no transcript `> 800` chars collapses into a single paragraph, and lossless word preservation (after normalizing out intentionally stripped `Speaker \d+:` prefixes and extracted speaker labels on the source side, every content token appears in order in the parsed paragraphs — <!-- Updated: Checkpoint 2 kongming #4 -->).
  3. Run vitest on `packages/ui/src/lib/transcript.test.ts` to confirm Red state.
- **Success criteria:** Test file exists and fails specifically because `@teacher-os/ui/lib/transcript` does not exist yet.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/lib/transcript.test.ts` exits non-zero with module-not-found / import error (passing here is a failure of the TDD red phase).

### Task 1.2 — Implement pure `classifyTranscriptInput`, `parseTranscript`, and `splitMonologueParagraphs` (Green Phase)
- **Goal:** Implement `packages/ui/src/lib/transcript.ts` so every unit test, adversarial performance test, and the full 498+60 corpus invariant test pass with zero DOM dependencies.
- **Target files and symbols:** `packages/ui/src/lib/transcript.ts` (exports `TranscriptTurn`, `TranscriptClassification`, `classifyTranscriptInput`, `parseTranscript`, `splitMonologueParagraphs`).
- **Steps:**
  1. Create `packages/ui/src/lib/transcript.ts` with zero DOM/browser globals (`DOMParser`, `document`, `window` must never be referenced).
  2. Export `TranscriptTurn` (`{ speaker: string | null; paragraphs: string[] }`) and `TranscriptClassification` (`{ kind: "html" } | { kind: "plain"; text: string }`).
  3. Implement `classifyTranscriptInput(raw: string): TranscriptClassification` (<!-- Updated: Red Team RT-3, RT-4, RT-6 -->):
     - Guard O(N²) tag regexes with linear `raw.includes("<")` first. If `!raw.includes("<")`, return `{ kind: "plain", text: raw }` (plain text with `&amp;` stays plain text and never loses `\n`).
     - Detect unclosed dangerous/head-scoped tags in O(N): `/<(?:script|style|svg|iframe|object|embed|math|title|noscript|link|base)\b/i.test(raw)` -> immediately `{ kind: "html" }`.
     - If `!raw.includes(">")`, return `{ kind: "plain", text: raw }` (prevents O(N²) backtracking on `"<a".repeat(5000)`!).
     - Check flat `<p>`/`<br>`-only HTML: if `raw` matches `/<(?:p|br)\b/i` and after stripping ONLY bare `/<\/?p>|<br\s*\/?>/gi` (zero attributes!) there are NO remaining `<` or `>` characters, replace in strict order: (a) `/<br\s*\/?>/gi` -> `"\n"`, (b) `/<\/p>\s*<p>/gi` -> `"\n\n"`, (c) any remaining `/<\/?p>/gi` -> `"\n"`, collapse `/\n{3,}/g` -> `"\n\n"` and `.trim()`, then decode standard entities in a SINGLE pass (`/&(?:nbsp|amp|lt|gt|quot|#0*39|#x0*27);/gi` lookup table — preventing double-decode of `&amp;lt;`) and return `{ kind: "plain", text }` (<!-- Updated: Checkpoint 2 kongming #2 -->).
     - Otherwise, if `raw` contains any paired or void HTML tag (`/<\/[a-z][a-z0-9]*\s*>/i` with opening `/<[a-z]/i`, or `/<(?:br|hr|img)\b[^>]*>/i`, or explicit structural tag `/<(?:head|body|html|meta|details|dialog|template|form|input|textarea|select|button|audio|video|source|track|marquee)\b[^>]*>/i`), return `{ kind: "html" }`; else `{ kind: "plain", text: raw }` (e.g. math comparison `"a < b > c"` stays plain text) (<!-- Updated: Checkpoint 2 kongming #2 -->).
  4. Implement Pass 1 (newline normalization + standalone speaker-header merging) (<!-- Updated: Red Team RT-2, Checkpoint 2 kongming #4 -->):
     - Normalize `\r\n` / `\r` -> `\n`, collapse `\n{3,}` -> `\n\n`, trim outer whitespace, return `[]` if empty.
     - Pre-scan capitalized/TitleCase standalone and line-start speaker labels so a standalone lowercase label (`^[a-z]{2,20}:$`, like `joe:` in `b38`) is recognized ONLY when the transcript already uses standalone speaker headers (and not in blocklist / prose like `for example:`).
     - Track paragraph-break metadata (`hadBlankLineBefore: boolean`) for each non-empty line.
     - Detect standalone speaker-header lines (`^<validLabel>\s*:$` with empty remainder). Attach `pendingSpeaker` to the next non-empty line: if the next line begins with bare `Speaker \d+:` (no role yet), combine into `Speaker N: <pendingSpeaker>: <text>` (updating `spToRoles`); otherwise attach `pendingSpeaker` as that line's leading role (even across blank lines like `LISA:\n\nOK, Greg...`). Never emit an empty paragraph.
  5. Implement Pass 2 (strict leading label parser, blocklist, character allowlist, roster, and unambiguous `Speaker N -> Role` alias map) (<!-- Updated: Red Team RT-1, RT-3, RT-8, Checkpoint 2 kongming #4 -->):
     - Enforce explicit character allowlist on speaker labels: only Unicode letters, spaces, `'`, `’`, `-`, title dots (`Dr.`, `Mr.`, `Mrs.`, `Ms.`, `Prof.`, `St.`), optional balanced parenthetical `(Name)` (excluding part-of-speech abbreviations `(n)`, `(v)`, `(adj)`, `(adv)`, `(prep)`, `(conj)`, `(phr)`, `(idiom)`), and digits ONLY inside `Speaker \d+`. Reject labels starting with `(`, labels containing `<`, `>`, `{`, `}`, `;`, `=`, quotes, labels > 40 chars or > 4 words.
     - On a standalone `"Useful vocabulary"` heading line, set `activeSpeaker = null` AND stop promoting speaker labels for all subsequent lines so neither glossary entries nor prior speaker labels leak into the vocabulary section.
     - Reject blocklisted non-speaker words (case-insensitive): `SCRIPT`, `NOTE`, `EXAMPLE`, `PART`, `SECTION`, `TRANSCRIPT`, `AUDIO`, `QUESTION`, `ANSWER`, `TIP`, `SUMMARY`, `TIME`, `DATE`, `ADDRESS`, `PHONE`, `EMAIL`, `HEADINGS`, `TOPICS`, `WARNING`, `REMEMBER`, `RULE`, `RESULT`, `REASON`, `CONCLUSION`, `IMPORTANT`, `FIRST`, `SECOND`, `THIRD`, `FINALLY`, `HOWEVER`, `NOW`, `WELL`, `YES`, `NO`, `OKAY`, `RIGHT`, `SURE`, `ALSO`, `PLUS`, `WAIT`, `LOOK`, `LISTEN`, `HERE`, `THERE`, `TODAY`, `TOMORROW`, `YESTERDAY`, weekdays, or non-`Speaker \d+` labels ending in digits.
     - Record `spToRoles` ONLY when a line has both `rawSpeakerId` (`Speaker N`) and an accepted leading role (including merged standalone headers). Build `unambiguousAlias` strictly when `roles.size === 1`.
     - Discover additional inline speaker candidates: match labels appearing `>= 2` times immediately followed by `\s*:` after start-of-line OR after sentence-ending punctuation `[.!?…]["”’)\]}]?` — requiring `\s+` for general multi-word candidates and permitting `\s*` for strict single-word / title+word Title-Case or ALL-CAPS labels (`[A-Z][a-z]+`, `[A-Z]{2,}`, `(?:Dr|Mr|Mrs|Ms|Prof|St)\.\s*[A-Z][a-zA-Z]+`) so `.MARY:`, `?CUSTOMER:`, `?Man:`, `.HENRY:`, `?Dr.Twain:` are discovered while NEVER splitting after a title dot (`MR. SMITH:` stays intact, never discovers `SMITH`).
     - Combine `lineStartRoles ∪ discoveredInlineRoles` into `confirmedRoster`.
  6. Implement Pass 3 (bounded inline splitting on `confirmedRoster` + `Speaker \d+`) (<!-- Updated: Red Team RT-6, RT-8, RT-12 -->):
     - Cap dynamic inline regex splitting: run Pass 3 only when `confirmedRoster.size > 0 && confirmedRoster.size <= 24 && normalized.length <= 25_000`; otherwise stick to O(N) line-based segments.
     - Escape all regex metacharacters (`() . + * ? ^ $ [ ] { } | \`) in roster labels, sort longest-first, and match `(^|[.!?…]["”’)\]}]?\s*)(ConfirmedLabel|Speaker\s+\d+)\s*:\s*` while skipping matches whose boundary `.` belongs to a title abbreviation (`Mr.`, `Mrs.`, `Ms.`, `Dr.`, `Prof.`, `St.`).
     - Resolve bare `Speaker N` through `unambiguousAlias` (keeping `Speaker N` when ambiguous or unmapped).
     - Attach an unprefixed continuation segment to `activeSpeaker` ONLY when `!hadBlankLineBefore` (or when preceded on the same line before an inline switch like `I'm one of the rangers. JOHN: ...`); after a blank line `\n\n` (when no standalone `NAME:` header preceded it), emit unprefixed paragraphs with `speaker: null` so partially labeled dialogues (`b58`, `b62`) are never misattributed!
  7. Implement Pass 4 (consecutive same-speaker merge + solo generic speaker cleanup + non-empty fallback) (<!-- Updated: Red Team RT-13 -->):
     - Merge adjacent segments with matching non-null normalized speaker (trimmed, case-insensitive; preserve first display casing) into one `TranscriptTurn` with multiple `paragraphs`; merge adjacent `speaker: null` segments into one `speaker: null` turn.
     - If the entire transcript has only 1 distinct non-null speaker and it matches `/^speaker(?:\s+\d+)?$/i`, set `speaker = null` while preserving all paragraph breaks.
     - If `turns` is empty for a non-empty trimmed input (e.g. label-only `"Speaker 1: Agent:"`), fall back to `[{ speaker: null, paragraphs: [trimmed] }]`.
  8. Implement Pass 5 (`splitMonologueParagraphs`) (<!-- Updated: Red Team RT-9 -->):
     - Run per-paragraph whenever `text.length > 550` and sentence count `>= 5` (applies cleanly to both single-line and multi-line transcripts).
     - Tokenize sentences while protecting common abbreviations (`Mr.`, `Mrs.`, `Ms.`, `Dr.`, `Prof.`, `St.`, `Sr.`, `Jr.`, `vs.`, `etc.`, `e.g.`, `i.e.`, `Fig.`, `No.`, `Inc.`, `Ltd.`, `Co.`, `U.S.`, `U.K.`, `Ph.D.`, `a.m.`, `p.m.`), single-letter initials, decimals (`3.5`), domains (`.com`, `.org`, `.net`, `.edu`, `.gov`, `.uk`, `.vn`), ellipses, and lowercase quote continuations (`"..." they`). Also recognize missing-space sentence boundaries `[a-z][.!?][A-Z][a-z]` (outside abbreviations/domains) so `canadian-puffins.json` splits cleanly!
     - Group into ~3–4 sentences (~350–550 chars), preferring breaks before IELTS discourse markers (`First of all`, `Firstly`, `Secondly`, `Thirdly`, `Finally`, `However`, `Moving on`, `Now,`, `Next,`, `For example`, `In addition`, `On the other hand`, `So,`, `Well,`, `Right,`, `Let's look at`, `Turning to`, `To conclude`, `In conclusion`, `To sum up`, `Before we`, `Another`) once current group has `>= 2` sentences or `>= 220` chars.
     - Merge a trailing 1-sentence orphan into the previous paragraph ONLY when `groups.length > 2` AND the previous paragraph is `<= 750` chars (never collapsing a 2-paragraph split back into a single block — <!-- Updated: Checkpoint 2 kongming #3 -->).
  9. Run vitest on `packages/ui/src/lib/transcript.test.ts` and verify every unit test, perf test, and all 498+60 corpus invariants pass.
- **Success criteria:** All unit tests, perf checks, and 498+60 corpus invariants in `packages/ui/src/lib/transcript.test.ts` pass under `node` environment; zero type errors in `@teacher-os/ui`.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/lib/transcript.test.ts && pnpm --filter @teacher-os/ui check-types` exits 0 with all tests passed.

## Verification

- `pnpm --filter @teacher-os/ui exec vitest run src/lib/transcript.test.ts`
- `pnpm --filter @teacher-os/ui check-types`

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
