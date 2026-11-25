---
phase: 2
title: "Phase 2: TranscriptBody UI, Integration & Verification"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: TranscriptBody UI, Integration & Verification

## Goal

Create the shared `<TranscriptBody>` component in `@teacher-os/ui`, wire it into `QuizPaper` and `StudyPackItemViewer`, verify component, Node SSR safety, leak-canary, and regression tests, and run full local quality gates + 3-viewport light/dark UI checks.

## Files to Create / Modify

- Create: `packages/ui/src/components/quiz/transcript-body.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `apps/web/src/components/study-packs/study-pack-item-viewer.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-paper.test.tsx`
- Modify: `apps/student/test/quiz-paper.test.tsx`
- Modify: `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx`
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`

## Tasks & Steps

### Task 2.1 — Add failing component, SSR safety, and leak-canary tests (Red Phase)
- **Goal:** Specify structured plain-text transcript rendering, flat `<p>`/`<br>` extraction, rich HTML sanitization, hook stability across rerenders, Node SSR behavior, and `mode="take"` privacy before changing `QuizPaper`.
- **Target files and symbols:**
  - `packages/ui/src/components/quiz/quiz-paper.test.tsx` (new `describe("QuizPaper — listening transcript formatting", ...)` block)
  - `apps/student/test/quiz-paper.test.tsx` (Node SSR `renderToStaticMarkup` assertions)
  - `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx` (listening transcript take-mode leak canary + review-mode structured rendering)
- **Steps:**
  1. In `packages/ui/src/components/quiz/quiz-paper.test.tsx` (`jsdom` env), add tests asserting:
     - Multi-speaker dialogue (*City Health Services* excerpt with `Speaker 1: Agent:` / `Speaker 2: Customer:` and inline turns) renders structured `<div data-testid="transcript-turn">` blocks with styled `<span data-testid="transcript-speaker">Agent:</span>` / `Customer:` labels and multiple `<p>` paragraphs, without raw `Speaker 1:` noise.
     - Single-speaker narrator transcript (*Talking about the history of bikes* excerpt with repeated `NARRATOR:`) renders one `NARRATOR:` label at the start of the run and multiple `<p>` paragraphs with prose colons intact.
     - Long unbroken monologue without newlines splits into multiple `<p>` elements.
     - Flat Tiptap/legacy HTML (`<p>Speaker 1: Agent: Hi.<br>Speaker 2: Customer: Hello &amp; welcome.</p>`) formats cleanly into `Agent:` and `Customer:` turns with decoded `&` via React text nodes (<!-- Updated: Red Team RT-4 -->).
     - Rich HTML transcript (`<p><strong>Agent:</strong> Hello</p><p>Second paragraph</p><script>alert(1)</script>`) renders through `RichTextBody` with DOMPurify stripping `<script>` completely (absent from both DOM and `textContent`), preserving `<p>` / `<strong>`, and applying `[&_p+p]:mt-2.5` spacing. Standalone `<head>`-scoped XSS (`<script>alert(1)</script>Agent: Hello`) and unclosed dangerous tags (`<svg onload=alert(1)>Hi`) also route to `RichTextBody` fail-closed escaped-text branch: assert `container.querySelector("script, svg") === null`, no unescaped `<script` or `<svg` in `container.innerHTML`, and zero executable nodes (<!-- Updated: Red Team RT-3, Checkpoint 2 kongming #1 -->).
     - Re-rendering the same `QuizPaper` instance switching `transcript` from rich HTML to plain text and back succeeds with zero React Rules of Hooks error (<!-- Updated: Red Team RT-7 -->).
     - `mode="take"` never renders `data-testid="quiz-review-transcript"` even if `transcript` prop is passed.
  2. In `apps/student/test/quiz-paper.test.tsx` (`node` env), add an SSR test using `renderToStaticMarkup` verifying (<!-- Updated: Red Team RT-5 -->):
     - Plain-text multi-speaker transcript and flat `<p>`/`<br>` transcript render full structured `<div data-testid="transcript-body">`, `data-testid="transcript-speaker"`, and `<p>` tags cleanly in `node` without referencing `document`/`DOMParser`.
     - Rich HTML transcript containing `<script>alert(1)</script>` fails closed through `RichTextBody`'s escaped-text branch in `node` (does not throw, does not emit unescaped `<script>` in static HTML markup).
  3. In `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`, add a listening transcript test verifying `PreviewQuizSimulation` hides `transcript` in take mode and renders structured `<TranscriptBody>` in review mode after submit (<!-- Updated: Red Team RT-13 -->).
  4. Run vitest on `packages/ui/src/components/quiz/quiz-paper.test.tsx` to confirm Red state.
- **Success criteria:** New tests fail against the old raw-`<div>` rendering in `QuizPaper`.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx` exits non-zero with assertion failure on the new transcript formatting tests (passing is a failure of the TDD red phase).

### Task 2.2 — Create `<TranscriptBody>` and wire into `QuizPaper` and `StudyPackItemViewer` (Green Phase)
- **Goal:** Render rich HTML transcripts (via `RichTextBody` single DOMPurify sink) and plain/flat-HTML transcripts (structured turns + inline speaker labels + spaced paragraphs) cleanly across `QuizPaper` and `StudyPackItemViewer` with hook safety and overflow protection.
- **Target files and symbols:**
  - `packages/ui/src/components/quiz/transcript-body.tsx` (export `TranscriptBody`)
  - `packages/ui/src/components/quiz/quiz-paper.tsx` (lines 864–877, replace raw `{transcript}` `<div>` with `<TranscriptBody>`)
  - `apps/web/src/components/study-packs/study-pack-item-viewer.tsx` (lines 612–620, replace `<RichTextBody text={detail.transcript} ... />` with `<TranscriptBody text={detail.transcript} ... />`)
  - `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx` (lines 261–263 and 322–324: verify speaker label + utterance text with structured `<span>` markup)
- **Steps:**
  1. Create `packages/ui/src/components/quiz/transcript-body.tsx`:
     - Accept `{ text: string; className?: string }`.
     - Call ONE unconditional `useMemo` at the top of the component BEFORE any `return` (<!-- Updated: Red Team RT-6, RT-7 -->):
       ```ts
       const model = useMemo(() => {
         const classified = classifyTranscriptInput(text);
         if (classified.kind === "html") {
           return { kind: "html" as const };
         }
         return {
           kind: "plain" as const,
           turns: parseTranscript(classified.text),
         };
       }, [text]);
       ```
     - When `model.kind === "html"`, render `<RichTextBody text={text} className={cn("min-w-0 break-words text-foreground/90 leading-[1.7] [&_p+p]:mt-2.5 [&_ul]:my-2 [&_ol]:my-2 [&_table]:block [&_table]:overflow-x-auto", className)} />` (<!-- Updated: Red Team RT-10 -->). Never add `dangerouslySetInnerHTML`.
     - Otherwise, if `model.turns.length === 0`, return `null`.
     - Render `<div className={cn("min-w-0 space-y-3 break-words text-foreground/90 leading-[1.7]", className)} data-testid="transcript-body">` (<!-- Updated: Red Team RT-10 -->):
       - For each turn (deterministic `key` from turn index + speaker + first 24 chars), render `<div className="space-y-2" data-testid="transcript-turn">`:
         - Paragraph 0: `<p>{turn.speaker ? <><span className="font-semibold text-foreground" data-testid="transcript-speaker">{turn.speaker}:</span>{" "}</> : null}{firstParagraph}</p>`
         - Remaining paragraphs `paragraphs.slice(1)`: `<p key={...}>{paragraph}</p>`
     - Ensure tokens follow `DESIGN.md` strictly (shadcn neutral monochrome: `text-foreground`, `text-foreground/90`, `border-border`, `bg-muted/40`; no hard-coded hex or off-palette colors; accessible in both light and dark themes).
  2. Update `packages/ui/src/components/quiz/quiz-paper.tsx:864-877`:
     - Keep `<details open className="rounded-lg border border-border bg-muted/40 p-4 text-sm" data-testid="quiz-review-transcript">` and `<summary className="cursor-pointer rounded-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring">Transcript bài nghe</summary>`.
     - Replace the raw `<div className="mt-2 whitespace-pre-line text-muted-foreground leading-relaxed">{transcript}</div>` with `<TranscriptBody text={transcript} className="mt-3" />`.
  3. Update `apps/web/src/components/study-packs/study-pack-item-viewer.tsx:614`:
     - Import `TranscriptBody` from `@teacher-os/ui/components/quiz/transcript-body`.
     - Replace `<RichTextBody text={detail.transcript} legacyWhitespace="pre-wrap" className="font-normal text-foreground text-sm leading-[1.85]" />` with `<TranscriptBody text={detail.transcript} className="text-sm leading-[1.7]" />`.
  4. Update `apps/web/src/components/study-packs/study-pack-item-viewer.test.tsx` lines 261–263 and 322–324 so assertions verify the structured speaker label (`Receptionist:`) and utterance (`Welcome to Central Library.`) rendered by `<TranscriptBody>` without weakening coverage.
- **Success criteria:** All tests in `packages/ui`, `apps/student`, and `apps/web` pass; zero new `dangerouslySetInnerHTML` occurrences exist.
- **Verify:** `pnpm --filter @teacher-os/ui test && pnpm --filter student test && pnpm --filter web exec vitest run src/components/study-packs/study-pack-item-viewer.test.tsx src/components/assignments/preview-quiz-simulation.test.tsx` exits 0 with all suites passing.

### Task 2.3 — Run full local quality gates and 3-viewport light/dark UI verification
- **Goal:** Verify lint, formatting, type safety, affected test suites, and visual rendering across 1440×900, 768×1024, and 375×812 in both light and dark modes (per `REVIEW.md` and `AGENTS.md`).
- **Target files and symbols:** Whole workspace verification; screenshots saved to `plans/reports/888-listening-transcript-*.png` for PR/POT evidence.
- **Steps:**
  1. Run `pnpm exec biome check .` (fix with `pnpm check:fix` if needed and re-check) and `pnpm check-types` (<!-- Updated: Red Team RT-12 -->).
  2. Run `pnpm --filter @teacher-os/ui test && pnpm --filter student test && pnpm --filter web test`.
  3. Run a targeted Playwright visual verification rendering real *Talking about the history of bikes* and *City Health Services* transcripts on the student review surface (ports 8100/8101/8103 — **never** full E2E suite!) at 1440×900, 768×1024, and 375×812 in light & dark themes, verifying zero horizontal overflow (including 320px), readable contrast, and keyboard toggle of `<details>/<summary>`. Save clean screenshots under `plans/reports/` (no secrets/PII).
- **Success criteria:** Biome check exits 0, `pnpm check-types` exits 0, all targeted unit tests exit 0, and 3-viewport light/dark screenshots show clearly paragraphed, speaker-labeled transcripts with zero overflow.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/ui test && pnpm --filter student test && pnpm --filter web test` exits 0.

## Verification

- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter @teacher-os/ui test`
- `pnpm --filter student test`
- `pnpm --filter web test`
- Visual verification screenshots at 1440×900, 768×1024, 375×812 (light & dark) in `plans/reports/`

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
