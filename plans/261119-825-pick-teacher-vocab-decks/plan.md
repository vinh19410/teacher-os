# Plan #825 — Pick & Clone Teacher-Created Vocab Decks

- **Issue**: [#825](https://github.com/vinh19410/teacher-os/issues/825)
- **Target branch**: `develop` (`--merge --beta`)
- **Status**: `done`

## Objective
Mở rộng modal **Thêm từ thư viện** (`VocabLibraryDialog`) để giáo viên có thể chọn và nhân bản độc lập (clone) các bộ từ vựng đã tạo trong tổ chức (bộ Riêng ở `/vocab` và bộ từ các lớp khác) sang lớp hiện tại hoặc về Hub `/vocab`.

## Phases & File Ownership

### Phase 1 — Schema, Migration, Shared Contracts & Backend API
**Owned files:**
- `packages/db/src/schema/vocab.ts`
- `packages/db/src/migrations/` (generated `0079_*.sql` + `meta/`)
- `packages/db/src/schema/vocab.test.ts`
- `packages/api/src/contracts.ts`
- `packages/api/src/vocab-contracts.test.ts`
- `apps/server/src/routes/snapshot.ts`
- `apps/server/src/routes/vocab-teacher.ts`
- `apps/server/src/routes/vocab-teacher.test.ts`

**Requirements:**
1. Add nullable `source_deck_id` (`sourceDeckId`) column (no hard FK) + index `vocab_deck_source_deck_idx` to `vocab_deck`, generate Drizzle migration `0079_*`, rehearse migration on populated DB in `vocab.test.ts` (and keep `0077` test selecting only 0077-era columns).
2. Add `sourceDeckId?: string | null` to `KernelVocabDeckRow`, add `vocabDeckCloneSchema` (`{ classId?: string | null, deckIds: string[] }` 1..50, strict) and error codes if needed (`DECK_CLONE_TOO_LARGE`, `DECK_CLONE_DUPLICATE_DECK` or reuse consistent vocab error codes) in `packages/api/src/contracts.ts`. Expose `sourceDeckId: row.sourceDeckId ?? null` in `snapshot.ts`.
3. Add `POST /api/kernel/vocab/decks/clone` in `vocab-teacher.ts`:
   - Enforce `if (!ctx) return 401`, parse JSON & strict envelope, reject duplicate `deckIds` in request (`400`), enforce IDOR check on `classId` (if non-null) and all requested `deckIds` (`eq(vocabDeck.orgId, ctx.orgId)` -> `404` if any missing/cross-org).
   - Enforce batch cap: `deckIds.length <= 50` and `sourceDecks.length + sourceWords.length <= 500` (`422`).
   - Query existing `sourceDeckId` at destination (`orgId` + `classId === null ? isNull(classId) : eq(classId)`) for `duplicates` array.
   - Clone `vocab_deck` (`title`, `lessonNumber`, `topic`, `lang`, `sourceLibraryDeckId`, `sourceDeckId: src.id`) and all `vocab_word` (`word`, `entryType`, `ipa`, `pos`, `translation`, `example`, `audioKey`, `audioUrl`, `sortOrder`) in a single `db.batch` using `MAX_WORD_INSERT_CHUNK = 8` for word inserts.
   - Return `{ id: firstDeckId, updated: sourceDecks.length, duplicates }` with HTTP `201`.
4. Protect shared R2 `audioKey` in `PUT /words/:wordId/audio`: before `store.delete(oldKey)`, verify no other `vocab_word` row references `oldKey`.
5. Add comprehensive tests in `vocab.test.ts`, `vocab-contracts.test.ts`, and `vocab-teacher.test.ts`.

### Phase 2 — Web Command Bus, `VocabLibraryDialog` Tabs & Unit Tests
**Owned files:**
- `apps/web/src/lib/data-actions.ts`
- `apps/web/src/lib/repos/kernel.ts`
- `apps/web/src/components/vocab/vocab-library-dialog.tsx`
- `apps/web/src/components/vocab/vocab-teacher-decks-tab.tsx` (new focused sub-component for the teacher decks tab)
- `apps/web/src/components/vocab/vocab-library-dialog.test.tsx`

**Requirements:**
1. Add `clone-vocab-teacher-decks` action mapping to `POST /api/kernel/vocab/decks/clone`.
2. Add segmented `Tabs` (`Thư viện hệ thống` default | `Bộ từ đã tạo`) inside `VocabLibraryDialog`. Switching tabs clears current selection, cap hint, and status notice.
3. In `Bộ từ đã tạo` tab:
   - Source list comes from `data.vocabDecks` filtered by `(deck.classId ?? null) !== targetClassId` (class mode shows `Riêng` + other classes; Hub mode shows class decks).
   - Debounced 300ms search across title, topic, and source class name (`Riêng` / class name).
   - Source filter `<Select>` (`Tất cả`, `Riêng` when present, plus each source class that has decks).
   - Multi-select checkboxes, `Chọn theo lượt` respecting `MAX_CLONE_DECKS = 50` and `MAX_CLONE_STATEMENTS = 500`, source badge (`Riêng` / `Lớp ...`), lesson/topic metadata pill when present, duplicate chip (`Đã có trong lớp` / `Đã có trong hub`) when destination already has a deck with `sourceDeckId === deck.id`, word count (`tabular-nums`), `aria-live="polite"` result/selection announcements, clean empty states.
   - Footer shows `Đã chọn X bộ · Y từ` and `Thêm vào lớp` / `Thêm bộ từ` button; handles `refreshed`, `committed`, `definite-failure`, unknown network states with toasts matching built-in tab.
   - Follow `DESIGN.md` (neutral oklch tokens, `focus-visible`, `border-input`, no hard-coded hex, accessible controls, clean mobile/tablet/desktop layout).
4. Add unit tests covering tab switching, search, source filter, multi-select, batch cap, duplicate chip, class mode & Hub mode clone dispatch, and verifying existing built-in tab tests remain intact.

### Phase 3 — E2E Spec, Visual Verification (3 Viewports + Light/Dark) & Isolated Review
**Owned files:**
- `apps/e2e/specs/vocab-teacher-deck-clone.spec.ts` (new focused E2E spec)
- `plans/reports/825-*.png` (POT screenshots)

**Requirements:**
1. Add focused E2E spec testing: teacher creates independent deck + class A deck with words -> opens Class B -> `Thêm từ thư viện` -> `Bộ từ đã tạo` -> searches/filters -> clones both into Class B -> verifies DB rows (`source_deck_id`, metadata, words), UI list, re-open `Đã có trong lớp` chip, student access to cloned deck, keyboard navigation, and captures Light/Dark + 3 viewport (1440×900, 768×1024, 375×812) + 320px reflow checks.
2. Run local quality gates (`pnpm exec biome check .`, `pnpm check-types`, targeted package/app tests, E2E spec with port override 8100–8105).
3. Run isolated `code-reviewer` subagent against diff + brief + `REVIEW.md` + `DESIGN.md`. Fix any findings and re-review until clean.
4. Commit, push, open PR targeting `develop`, verify & post POT comment on `#825`, merge PR into `develop`, update issue label to `shipped`.
