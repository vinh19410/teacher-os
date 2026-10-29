---
title: "Plan: Student Full Vocabulary Courses (#366)"
date: 2026-10-19
summary: "Planned direct student access to all 20 built-in vocabulary courses (968 decks / 10,160 words) with polymorphic vocab_card.word_id and D1-safe dual-source SRS."
---

# Plan: Student Full Vocabulary Courses (#366)

## What happened

Created and red-teamed implementation plan `plans/261019-0648-student-full-vocab-courses/` (GitHub Issue #366) so students on the Student Portal (`apps/student`) can browse and study all 20 built-in vocabulary courses (`vocab_library_course` -> 968 `vocab_library_deck` -> 10,160 `vocab_library_word`) without waiting for a teacher to clone decks into a class or send a `vocab_suggestion`.

## Key Decisions

1. **Direct Dual-Source SRS (`vocab_card.word_id` without FK to `vocab_word.id`) instead of Lazy Cloning**:
   - Lazy cloning into `vocab_deck`/`vocab_word` would multiply 10,160 rows per organization and pollute `snapshot.ts` (`data.vocabDecks`) in the Teacher Hub.
   - Instead, Migration `0039` recreates `vocab_card` without `FOREIGN KEY (word_id) REFERENCES vocab_word(id)` while preserving `FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE cascade` and `UNIQUE(student_id, word_id)`.
2. **Red-Team Hardening**:
   - **Cloudflare D1 100-bound-parameter limit**: Replaced `inArray(..., deckIds)` on 120–140-deck courses (`libcourse-6`, `libcourse-15`) with `INNER JOIN vocab_library_deck WHERE course_id = ?`; chunked `ensureDeckCards` inserts to <= 10 words/statement (`90 < 100` params); chunked `loadWordsAndCardsForAccessibleDecks` by <= 50 deck IDs.
   - **Cross-tenant SRS protection**: Blocked reserved `/^(libcourse|libdeck|libword)-/i` IDs on teacher deck/word creation schemas and scoped teacher `vocab_card` deletes with `word_id NOT LIKE 'libword-%'`.
   - **True FK enforcement in tests**: Added explicit `PRAGMA foreign_keys = ON;` after Drizzle `migrate()` in `db`, `server`, and `e2e` test suites.
   - **Immediate Level-1 progress & URL state**: Added `reviewWordCount`/`reviewCount` (`state === 'review'`) so completing a Learn session shows immediate progress on course/deck cards, invalidated React Query caches (`staleTime: 60_000`) on `useVocabSessionData` and `handleExit`, and persisted `courseId` + debounced search (`300ms`) in URL search params.

## Next steps

- Execute `/ak:cook plans/261019-0648-student-full-vocab-courses/plan.md` across Phases 1–5.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
