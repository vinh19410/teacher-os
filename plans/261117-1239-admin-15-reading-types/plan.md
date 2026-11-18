# Plan: 15 IELTS Reading Question Types for Admin Library

Issue: #762 (`https://github.com/vinh19410/teacher-os/issues/762`)
Date: 2026-11-17

## Context & Confirmed Scope
Implement the 15 IELTS Reading question types derived from `docs/reading-ielts/reading-practice/_index.json` into the Admin library test builder (`library_test`), removing unsupported legacy Reading types (`note`, `tablecomp`, `flowchart`) from Admin creation while keeping `apps/web` (`ASSIGNMENT_PART_TYPES.reading`) intact and maintaining read/preview fallback for legacy DB records.

### 15 Reading Types Mapping
1. `summary` (`SUMMARY_COMPLETION`): Cloze or Table (`TableGridEditor`), optional Word Bank (`A–T`, max 20)
2. `tfng` (`TRUE/FALSE/NOT GIVEN`)
3. `info` (`MATCHING_INFORMATION`): Option Bank `A–T` (max 20)
4. `mcq` (`MULTIPLE_CHOICE_ONE`): 4 options `A–D`, single choice
5. `ynng` (`YES/NO/NOT GIVEN`)
6. `headings` (`MATCHING_HEADINGS`): Option Bank `i–xx` (max 20)
7. `mcq_many` (`MULTIPLE_CHOICE_MANY`): Grouped multi-select cluster (1 shared stem, 5–8 options `A–H`, tick K answers → generates K items sharing `answerSet`)
8. `sent` (`SENTENCE_COMPLETION`): Cloze / completion
9. `match_names` (`MATCHING_NAMES`): Option Bank `A–T` (max 20)
10. `features` (`MATCHING_FEATURES`): Option Bank `A–T` (max 20)
11. `sentend` (`MATCHING_ENDINGS`): Option Bank `A–T` (max 20)
12. `fill_blank` (`FILL_BLANK`): Cloze or Table (`TableGridEditor`)
13. `shortans` (`SHORT_ANSWER`): Short answer text
14. `diagram` (`MAP_DIAGRAM_LABEL`): Image URL + Cloze/list (`PinEditor` optional, not required for `ready`)
15. `matching` (`MATCHING`): Option Bank `A–T` (max 20)

## Execution Phases & Ownership
- **Phase 1 (`packages/api`)**: Contracts (`LIBRARY_READING_TYPES`, `LIBRARY_OPTION_BANK_MAX = 20`, `EXTENDED_ANSWER_CHOICES`, `opts.max(8)`, `QUIZ_TYPE_DISPLAY`, `answerKindByType`), `library-contracts.ts` validation rules (summary optional bank, reading diagram optional pin, library cloze types, bank coverage), `library-quiz-preview.ts` (`answerSet` passthrough on `QuizPartQuestion`, `libraryOptionBankKindFor`), unit tests.
- **Phase 2A (`packages/ui`)**: `McqManyEditor`, `QuestionKeyEditor` (mode toggle Cloze/Table for `summary`/`fill_blank`, optional Word Bank toggle for `summary`, `maxBank`, `diagram` ClozeEditor + optional pin), `OptionBankEditor`/`OptionBankList`/`AnswerKeyGrid` up to 20, `ClozeStemText` table rendering for `summary`/`fill_blank`, `QuizPaper`/`QuizQuestionItem` multi-select cluster UI & `summary` word bank support, unit tests.
- **Phase 2B (`apps/server`)**: Update `study-pack-clone.ts` optionBank cap to 20, expand `admin-library.test.ts` & `assignment-rich-text-contract.test.ts`.
- **Phase 3 (`apps/admin`)**: Update `part-form.tsx`, `group-card.tsx`, `part-content-fields.tsx`, `part-issues.ts` to use `librarySkillTypes("reading")` (15 types), `LIBRARY_OPTION_BANK_MAX`, `LIBRARY_CLOZE_TYPES`, friendly labels, legacy fallback, and tests.
- **Phase 4 (Verification & Isolated Review & Ship)**: Run `pnpm exec biome check .`, `pnpm check-types`, targeted test suites (`packages/api`, `packages/ui`, `apps/admin`, `apps/server`, `apps/web`), run isolated `code-reviewer` subagent, fix any findings, ship/merge PR to `develop` (`--merge --beta`), update issue #762 with POT.
