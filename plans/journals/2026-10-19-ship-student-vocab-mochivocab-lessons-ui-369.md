---
title: "Ship Beta: Student Vocab Courses & Lessons UI kiểu MochiVocab (#369)"
date: 2026-10-19
summary: "Implemented MochiVocab-style vocabulary course catalog (/vocab/courses) and lesson grid (/vocab/courses/$courseId) with migration 0040 (vocab_library_deck.description), CDN cover images, course switcher dialog, start-here resume, and ?course= session preservation."
---

# Ship Beta: Student Vocab Courses & Lessons UI kiểu MochiVocab (#369)

## What happened

Implemented Phases 1–3 of `plans/261019-2239-student-vocab-mochivocab-lessons-ui/plan.md` for GitHub Issue #369:
1. **Migration `0040_deep_oracle.sql` & Seed (`packages/db`)**:
   - Added nullable `description` column to `vocab_library_deck` (`ALTER TABLE vocab_library_deck ADD description text;`).
   - Updated `parseVocabLibraryCsvTexts` and `buildVocabLibraryUpsertStatements` in `packages/db/src/seed/vocab-library.ts` to read `lessonDescription` from `lessons.csv` and upsert `description = excluded.description`.
   - Hardened `sqlLiteral` to treat `undefined` as `"NULL"`.
2. **Contracts & Server Routes (`packages/api`, `apps/server`)**:
   - Added `description: z.string().nullable()` to `vocabLibraryDeckSchema` and `vocabStudentLibraryDeckSchema` (`.strict()`).
   - Updated both deck producers (`apps/server/src/routes/vocab.ts` and `apps/server/src/routes/vocab-library.ts`) to return `description: deck.description ?? null`.
3. **Student Portal Routes & MochiVocab UI (`apps/student`)**:
   - Replaced inline `VocabCourseCatalog` on `/vocab` with `VocabCoursesCta` (`vocab-courses-cta`) and dedicated routes `/vocab/courses` (20-course catalog with debounced `?q=` search) and `/vocab/courses/$courseId` (MochiVocab lesson grid).
   - Built `VocabLessonCard` with CDN cover image + fallback placeholder on error, `deriveLessonSubtitle` (rendering verbatim numbered Vietnamese CSV description `"1.Trường học"` without duplicating `sortOrder.` and filtering out `"N từ vựng"` noise), `deriveLessonStatus` (`Hoàn thành` / `Đang học x/y` / `N từ`), `findStartHereDeckId` (`▸ Bắt đầu tại đây` badge + one-time `scrollIntoView`), and `VocabCourseSwitcherDialog` (accessible focus-trapped dialog opened from the course ribbon).
   - Preserved `?course=<courseId>` across `/vocab/$deckId` and `/vocab/$deckId/session` (`handleExit`) so students return directly to the course's lesson grid after studying.
4. **Verification**:
   - All local gates passed (`pnpm check`, `pnpm check-types`, `db`, `api`, `server`, `student`, `web` unit tests, and Playwright E2E across `1440×900`, `768×1024`, `375×812` viewports with 9 screenshots).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
