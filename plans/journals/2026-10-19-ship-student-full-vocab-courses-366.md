---
title: "Ship Beta: Student Full Vocabulary Courses (#366)"
date: 2026-10-19
summary: "Implemented and shipped direct student access to all 20 built-in vocabulary courses (968 decks / 10,160 words) with polymorphic vocab_card.word_id (migration 0039) and D1-safe dual-source SRS."
---

# Ship Beta: Student Full Vocabulary Courses (#366)

## What happened

Implemented Phases 1–5 of `plans/261019-0648-student-full-vocab-courses/plan.md` for GitHub Issue #366:
1. **Migration `0039_ambiguous_prowler.sql` (`packages/db`)**: Recreated `vocab_card` without `FOREIGN KEY (word_id) REFERENCES vocab_word(id)` while preserving `FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE cascade` and all 3 indexes (`vocab_card_student_word_uq`, `vocab_card_student_due_idx`, `vocab_card_word_idx`). Added orphan `vocab_card` cleanup (`word_id LIKE 'libword-%' AND NOT EXISTS (...)`) at the end of `buildVocabLibraryUpsertStatements` when `prune: true`.
2. **Contracts & D1-Safe Dual-Source SRS (`packages/api`, `apps/server`)**:
   - Blocked reserved `/^(libcourse|libdeck|libword)-/i` IDs on `vocabDeckCreateSchema.id` and `vocabWordUpsertSchema.id`, and guarded teacher `vocab_card` deletes with `word_id NOT LIKE 'libword-%'`.
   - Added `vocabStudentLibraryCoursesResponseSchema` and `vocabStudentLibraryDecksResponseSchema` (including `reviewWordCount`/`reviewCount` for immediate post-Learn progress).
   - Extended `ensureDeckCards` (chunked `<= 10` words/insert = 90 SQL params, anchored at `LIBRARY_DECK_BASE_MS`), `loadWordsAndCardsForAccessibleDecks` (chunked `<= 50` deck IDs/query), `loadPool` (`currentDeckId` priority + same-course fallback + `LIMIT 100` + `(word, translation)` deduplication), `loadOwnedSessionCard`, `GET /vocab/audio/:wordId` (innerJoin `vocab_card` + null guard), and `GET /api/student/vocab/library/courses[/:courseId/decks]` (`INNER JOIN vocab_library_deck WHERE course_id = ?`).
3. **Student Portal & Teacher Progress UI (`apps/student`, `apps/web`)**:
   - Created `VocabCourseCatalog` on `/vocab` with `courseId` and debounced `q` (`300ms`) persisted in URL search params (`validateSearch`) and cache invalidation on `useVocabSessionData` and `handleExit`.
   - Updated `VocabProgressTab` to parse API responses with `vocabStudentProgressResponseSchema.parse` and display `Khóa ${deck.className}` for `source === "library"`.
4. **Verification**: Enabled explicit `PRAGMA foreign_keys = ON` after `migrate()` across `db`, `server`, and `e2e` suites; all unit tests and E2E specs pass across 3 viewports (`1440×900`, `768×1024`, `375×812`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
