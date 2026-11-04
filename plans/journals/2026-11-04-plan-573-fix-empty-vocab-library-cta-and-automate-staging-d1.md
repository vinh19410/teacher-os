---
title: "Plan #573: Fix empty vocab library CTA and automate staging D1 seed"
date: 2026-11-04
summary: "Validated and red-teamed 2-phase TDD handover plan for issue #573"
---

# Plan #573: Fix empty vocab library CTA and automate staging D1 seed

## What happened
- Investigated GitHub issue #573 (`fix(vocab): trang khóa học từ vựng trống dù quảng cáo 20 khóa, 968 bài`) via `ak-debug` and verified live against `https://api.staging.teacheros.io.vn/api/student/vocab/library/courses` (`200 {"courses":[]}`).
- Authored 2-phase TDD handover plan in `plans/261104-0644-vocab-courses-empty-cta/` under `--advice` supervision (`KongmingPostDebug`) and ran hostile 2-lens Red-Team review (`RedTeamSecurity` + `RedTeamAssumptions`), resolving all 8 findings (`tsx` + `check-types` in `@teacher-os/db`, fail-closed `D1_DATABASE_ID` + prod DB guard + `total_count` pagination, post-`/readyz` staging seed without junk `student` provisioning, SHA-256 content parity on `--if-needed`, column-0 `::add-mask::` + error redaction, parallel `useVocabLibraryCourses` + catalog empty copy).

## Decision
- Keep `GET /api/student/vocab/overview` unchanged; reuse `useVocabLibraryCourses()` across `/practice/vocabulary`, `/practice/vocabulary/courses`, and `/` (`StudentVocabEntrySection`).
- Automate staging-only D1 seed via `--d1 --d1-stage staging --if-needed --verify` in `deploy-staging.yml` while mechanically blocking `deploy.yml` and `teacher-os-database-prod-*` until the content license gate opens.

## Next steps
- Commit/push plan & journal via `ak-git cp`, sync GitHub issue #573 (`ready to cook` -> `in progress`), and execute Phase 1 & Phase 2 via `ak-fix --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
