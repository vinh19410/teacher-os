# Plan: Align Vocab Schema, CSV Import & UI with Lesson CSV (#815)

- **Status:** In progress
- **Issue:** https://github.com/vinh19410/teacher-os/issues/815
- **Target branch:** `develop` (`--beta --merge`)

## Phases & Dependencies

1. **Phase 1 — DB Schema, Migration & Shared API Contracts + CSV Parser** (`packages/db`, `packages/api`)
   - `packages/db/src/schema/vocab.ts`: add `lessonNumber`, `topic` to `vocabDeck`; add `entryType` (`'word' | 'chunk'`, default `'word'`), `pos`, `example` to `vocabWord`.
   - Generate Drizzle migration `0076_*.sql` and add backward-compatible rehearsal test in `packages/db/src/schema/vocab.test.ts`.
   - `packages/api/src/contracts.ts`: extend `KernelVocabDeckRow`, `vocabDeckCreateSchema`, `vocabDeckRenameSchema`, `vocabWordUpsertSchema`, `vocabTeacherWordSchema`, `vocabSessionDeckSchema`, `vocabSessionCardSchema`; add `vocabEntryTypeSchema`, `vocabDeckCsvImportSchema`, `vocabDeckWordsImportSchema`, `vocabCsvImportResponseSchema`.
   - `packages/api/src/lib/vocab-csv.ts` + `packages/api/src/lib/vocab-csv.test.ts`: pure RFC 4180 CSV parser/validator/formatter, sample CSV generator (`Lesson 01 – Friends & Introductions`), grouping by `(lessonNumber, topic)`, deck title formatter (`Lesson 01 – Topic`), tested directly against `docs/vocab-sample/Lesson 01 – Friends & Introductions.csv`.

2. **Phase 2 — Parallel Implementation (depends on Phase 1)**
   - **2A. Backend (`apps/server`):**
     - `snapshot.ts`, `vocab-teacher.ts`, `vocab.ts`, `vocab-provision.ts`, `vocab-library.ts`.
     - Endpoints: `POST /api/kernel/vocab/decks/import-csv` (create grouped decks + chunked D1-safe word inserts) and `POST /api/kernel/vocab/decks/:deckId/words/import` (append words to existing deck starting at `max(sortOrder) + 1`).
     - Update tests in `vocab-teacher.test.ts` and `vocab.test.ts`.
   - **2B. Teacher Web (`apps/web`):**
     - `data-actions.ts`, `repos/kernel.ts`.
     - `vocab-csv-import-dialog.tsx` (both `"create-decks"` & `"append-words"` modes, preview, line-level errors, sample CSV download).
     - `vocab-deck-list.tsx` (Import CSV button, Lesson/Topic fields in create modal, Lesson/Topic metadata display).
     - `vocab-deck-editor.tsx` & `vocab-word-row.tsx` (Import CSV button in editor, `Loại` Word/Chunk, `Từ loại` POS, `Ví dụ` Example).
     - Update/add tests in `vocab-hub.test.tsx`.
   - **2C. Student Web (`apps/student`):**
     - `routes/_auth/practice/vocabulary/$deckId.tsx`, `vocab-session-view.tsx` (`LearnIntroCard`), `prompt-self-check.tsx`, `vocab-feedback-panel.tsx`.
     - Show `Word`/`Chunk` badge, `pos`, and `example` (revealed only after flip in `LearnIntroCard` & `PromptSelfCheck`, and in `VocabFeedbackPanel` & `$deckId.tsx`).
     - Update/add tests in `vocab-session-view.test.tsx` (and `$deckId` if tested).

3. **Phase 3 — Integration, Verification & Ship (`--beta --merge`)**
   - Merge Wave 2 branches into `vinh19410/Sync-vocab` sequentially with test runs after each merge.
   - Update/add E2E test coverage in `apps/e2e/specs/vocab-srs.spec.ts` and run relevant vocab E2E specs (`E2E_API_PORT=8100 ...`).
   - Run `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm design:compare` (if applicable) and capture light/dark 3-viewport screenshots for POT.
   - Isolated code review (`code-reviewer` subagent), fix findings, re-review until clean.
   - Post POT comment on `#815`, open PR into `develop`, move issue labels `in progress` -> `in review` -> `done` -> `shipped`, merge PR.
