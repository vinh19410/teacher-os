# Plan #814: Sync First Step/GT2 Self-Study Pack with R2 Audio & Production Promote CLI

- **Issue:** [#814](https://github.com/vinh19410/teacher-os/issues/814)
- **Branch:** `vinh19410/Sync-Bộ-Đề-Self-Study-First-Step` → merge target `develop` (`--merge --beta`)
- **Status:** Done

## Objective

Sync the 62 deduplicated Reading and Listening exercises from tab `First Step/GT2` (`gid=743681389`, skipping duplicate rows B37 and B39) of the Google Sheet into system `study_pack` (`syspack-first-step-gt2`, level `IELTS First Step`, status `ready`), add R2 `LIBRARY_AUDIO` `audioKey` support for `study_pack_exercise` and `assignment_prompt`, ensure CI staging seeds D1 automatically on `develop`, provide a 1-command R2 audio sync CLI (staging & source-driven), and provide a manual production promote CLI (`--dry-run`, `--allow-prod`, `--verify`) without auto-seeding prod in `deploy.yml`.

## Phases

1. **Phase 1 — Extract & Validate Dataset (`first-step-gt2.json`)**
   - Parse all 62 unique `mini-ielts.com` exercises (30 Reading, 32 Listening) + solution pages (`Answer Table`, inline `<span class="answer">`, `explainq*` anchors, transcripts).
   - Map every question cleanly to `assignmentQuestionSchema` (`tfng`, `ynng`, `mcq`, `mcq1`, `mcq_many` + `answerSet`, `headings`/`info`/`features`/`sentend`/`match2` + `optionBank`, `sent`/`note`/`summary`/`tablecomp`/`form`/`notes`/`sent4`/`shortans`).
   - Extract & verify YouTube Listening MP3s locally (never committed to git) under `LIBRARY_AUDIO_MAX_BYTES`.
2. **Phase 2 — DB Schema, Migration, Contracts & R2 Audio Serving**
   - Add nullable `audio_key` to `study_pack_exercise` and `assignment_prompt` (`0076_study_pack_audio_key.sql`).
   - Update `packages/api/src/contracts.ts` (`libraryExerciseBaseSchema` multi-type skill support + `LIBRARY_OPTION_BANK_MAX`, `study-pack-seed.contracts.test.ts`).
   - Unify R2 + external MP3 audio streaming in `apps/server/src/lib/study-pack-audio.ts`, `study-pack-clone.ts`, `study-pack.ts`, `assignments/index.ts`, and `student.ts` (preserving DTO isolation without exposing `audioKey`).
3. **Phase 3 — Generalize Seed Pipeline, R2 Audio Sync & Production Promote CLI**
   - Generalize `packages/db/src/seed/study-packs.ts` & `seed-study-packs.ts` to manage multi-bundle system packs (`foun-gt1-` + `first-step-gt2`) while never touching custom admin rows (`syspack-admin-custom`).
   - Add `packages/db/scripts/sync-study-pack-audio.ts` (staging/target R2 upload from local MP3 cache or `yt-dlp`) and `packages/db/scripts/promote-study-packs-prod.ts` (`--dry-run`, `--allow-prod`, R2 staging→prod copy + D1 prod upsert + `--verify`).
   - Document operations in `docs/study-packs-runbook.md` and link it from `docs/index.md`.
4. **Phase 4 — Verification, Isolated Review & Beta Merge**
   - Run `pnpm check`, `pnpm check-types`, `@teacher-os/api`, `@teacher-os/db`, server route/migration unit tests, and `scripts/ci-workflow.test.mjs`.
   - Run isolated `code-reviewer` subagent; resolve all findings until clean.
   - Post POT on issue #814, open PR and merge into `develop`, verify staging CI deploy runs.
