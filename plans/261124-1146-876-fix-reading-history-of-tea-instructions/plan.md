---
title: "876-fix-reading-history-of-tea-instructions"
description: "Backfill assignment_prompt.groups from library_test_part and harden QuizPaper/quiz-instruction word-limit extraction and multi-block instruction deduplication for The History of Tea and similar reading tests"
status: completed
priority: P1
effort: "2h"
tags: [reading, quiz, instructions, migration, groups]
created: 2026-11-24
---

# Plan #876 — Sửa lỗi hướng dẫn mâu thuẫn & lẫn nhóm câu ở đề The History of Tea

- **Issue:** [#876](https://github.com/vinh19410/teacher-os/issues/876)
- **Branch:** `vinh19410/fix-reading-the-history-of-tea-q3-ch-m-sai-buddh` → PR vào `develop` (`--ship --beta --advice`)
- **Route:** Bugfix (`/ak-fix --auto --advice`)
- **Handover-ready:** Có — mỗi phase tách task cụ thể kèm lệnh `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng khi verify thất bại.

## Overview

Khắc phục triệt để 3 nguyên nhân gốc rễ khiến đề Reading **The History of Tea** (và các đề Reading/Listening đồng bộ trước migration `0085` hoặc fallback không có `groups`) hiển thị sai giới hạn từ (`NO MORE THAN THREE WORDS` thay vì `Use ONE WORD for each answer.` cho Q1–7, làm học viên gõ `Buddhist monks` bị chấm sai trước key chuẩn `monks`) và hiển thị lẫn hướng dẫn `Use ONE WORD` với `True/False/Not Given` trên cả màn làm bài lẫn trang kết quả `/student/learn/quizzes/attempt/:id/detail`:

1. **RC1 (DB backfill thiếu sau migration `0085`):** `assignment_prompt.groups` mặc định `'[]'` ở mọi bản sao đồng bộ trước commit `5360b4e7`; `syncLibraryTestsToOrg` không backfill dòng cũ nên API trả thiếu `detail.groups` và `QuizPaper` phải fallback sang `buildQuizParts` kèm `detail.intro` bị ghép nối không có marker `Questions X–Y`.
2. **RC2 (`WORD_LIMIT_REGEX` & fallback replacement trong `packages/ui/src/lib/quiz-instruction.ts`):** Không khớp `Use ONE WORD`, `Choose ONE WORD`, `Write ONE WORD` (cũng như `Write <strong>ONE WORD</strong>`) cùng nhiều biến thể thật trong dataset reading/listening; nhánh replace chỉ thay 2 mẫu cố định làm sót đuôi `AND/OR A NUMBER` và bỏ sót `diagram`/`form`; unwrap `<p>` tham lam làm hỏng HTML nhiều đoạn.
3. **RC3 (`QuizPaper` & `deduplicateGroupIntroPreamble`):** Chỉ chạy dedup khi `hasGroupSource === true`, chưa tách dòng plain text xen kẽ HTML, chưa gom cụm instruction nhiều dòng của `tfng`/`ynng` và completion/inline body nhiều block, không tận dụng `matchedInstruction` cho `parsedInlineByPartId`, và truyền `detail.intro` thô làm rò rỉ giới hạn từ giữa các nhóm câu.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Migration `0087_backfill_assignment_prompt_groups.sql` (+ `meta/_journal.json` + `meta/0087_snapshot.json` nối `prevId` từ `0086_snapshot.json` + migration test) với đầy đủ rào bảo vệ SQLite/D1 (`CASE WHEN json_valid`, `json_type = 'array'`, `SUBSTR` prefix, `library_test.status = 'ready'`, kiểm tra cấu trúc nhóm và khớp type câu hỏi, `COALESCE` bảo vệ `NOT NULL`).
  - Mở rộng `packages/ui/src/lib/quiz-instruction.ts` và unit tests (`packages/ui/src/lib/quiz-instruction.test.ts`).
  - Nối lại `packages/ui/src/components/quiz/quiz-paper.tsx` và integration tests (`packages/ui/src/components/quiz/quiz-paper.test.tsx`).
- **Explicit Non-Goals:**
  - Không đổi đáp án `monks` ở Q3 (dataset gốc `Collection-the-history-of-tea.json` quy định `Use ONE WORD for each answer.` và cả 7 đáp án Q1–7 đều 1 từ) và không nới lỏng `gradeQuiz`.
  - Không sửa `flattenLibraryTestPart` (giữ tương thích `study-pack-clone.test.ts` và `study-pack-item-viewer.tsx`).
  - Không sửa cột `intro`, `option_bank`, `questions` trong migration `0087`, không migrate bảng `quiz_attempt`.
  - Không chạy dedup preamble cho đề 1 part khi `!hasGroupSource` (giữ nguyên hành vi đề cũ).
  - Không thay đổi giới hạn `loaded.parts.length === 1` của `student-practice.ts:166` cho multi-part practice tests (toàn bộ 352 bài Reading practice đều 1 part `p1`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Backfill `assignment_prompt.groups` an toàn, idempotent từ `library_test_part` (chỉ đề `ready`, cấu trúc nhóm hợp lệ và khớp bản sao) cho các bản sao pre-0085 | P1 |
| 2 | Nhận diện đúng mọi biến thể word limit (kể cả bọc thẻ `<strong>` và bare `ONE WORD`) và gom sạch cụm hướng dẫn đa dòng (`completion`, `tfng`, `ynng`, inline body) | P1 |
| 3 | Hiển thị hướng dẫn tách bạch, nhất quán trên cả Take screen và Attempt Detail (`/attempt/:id/detail`) cho cả đề có `groups` và fallback không `groups`, không mất memoization | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: DB Migration 0087 Backfill assignment_prompt.groups](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Instruction Resolution & Multi-Block Deduplication](./phase-02-instruction-resolution-and-dedup.md) | Pending |
| 3 | [Phase 3: QuizPaper Wiring, Tests & Full Verification Gates](./phase-03-quiz-paper-wiring-and-verification.md) | Pending |

## Acceptance Criteria

- [x] Migration `0087_backfill_assignment_prompt_groups.sql` đi kèm `meta/0087_snapshot.json` (nối đúng `prevId` từ `0086`) và entry `idx: 87` trong `meta/_journal.json`; test migration xác minh backfill đúng hàng pre-0085 (`'[]'`, `''`, `'[ ]'`), chỉ chạm đề `library_test.status = 'ready'` có `groups` hợp lệ (`<= 20` nhóm, phủ đủ `0..N-1`, khớp `skill`/`part`/`passage` và `question.type`), bỏ qua hàng draft / lệch số câu / đã bị sửa / đã có `groups` / `library_exercise` / `libraryXtestYpart` / JSON corrupt, idempotent khi chạy lại, và `study-pack-migration.test.ts` pass 100%.
- [x] `extractWordLimit` và `resolvePartInstruction` chuyển input sang plain text sạch (loại bỏ `<script>`/`<style>`/`<noscript>`/`<template>`, thẻ/attribute ẩn) trước khi khớp 2 tầng (không bị cắt cụt leftmost-first trên `"Write ONE WORD AND/OR A NUMBER"`, khớp `"Use ONE WORD for each answer."` và `"Write <strong>ONE WORD</strong> for each answer."`, không false-positive trên `"There is only one word missing..."`), thay trọn cụm giới hạn trong fallback cho mọi completion type, và unwrap thẻ `<p>` đơn an toàn kể cả `</p >`.
- [x] `deduplicateGroupIntroPreamble` xử lý sạch input hỗn hợp HTML + plain text (tách `\n` trên đoạn text, không cắt thẻ inline `<strong>`, bọc `<p>` khi join hỗn hợp), gom trọn cụm multi-block `tfng`/`ynng` (kể cả `On your answer sheet please choose/write`, `choose:`, `statement` số ít, phân biệt theo nhãn `TRUE/FALSE` vs `YES/NO`) và completion nhiều dòng + inline body nhiều sibling (`<table>`/`<ul>`/`<ol>`/`<p>`/`<h2>`–`<h4>`), không cướp hướng dẫn (`shortans` chỉ khớp `\banswer\s+the\s+questions?\b`, cấm word-bank summary peek word limit), không nuốt ghi chú giáo viên tiếng Việt hay canary `RT11`.
- [x] Ở đề **The History of Tea** (cả Take lẫn Review `/attempt/:id/detail`, cả khi có `groups` lẫn khi fallback không có `groups`): Q1–7 hiện `"Use ONE WORD for each answer."` (tuyệt đối không có `"NO MORE THAN THREE WORDS"`), Q8–13 hiện hướng dẫn `TRUE / FALSE / NOT GIVEN` đúng cụm, không còn khối hướng dẫn lẫn ở đầu trang, không rò rỉ `contextIntro` khi có `>= 2` nhóm completion, và giữ nguyên memoization `parsedInlineByPartId` theo từng keystroke.
- [x] Toàn bộ gates local (`pnpm exec biome check .`, `pnpm check-types`, unit/integration tests của `@teacher-os/api`, `@teacher-os/ui`, `student`, `server`) xanh 100%.

## Red Team Review

### Session — 2026-11-24
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst (3 parallel subagents)
**Findings:** 6 deduplicated (6 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 3 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Migration 0087 cần kiểm `library_test.status = 'ready'`, cô lập INF-03 (`skill`/`part`/`passage`/khớp `question.type`), validate cấu trúc nhóm `json_each` (`<= 20`, phủ `0..N-1`), dùng `SUBSTR` thay `LIKE`, `COALESCE` bảo vệ `NOT NULL`, xử lý `'[ ]'` | Critical | Accept | Phase 1 |
| 2 | `WORD_LIMIT_REGEX` leftmost-first cắt cụt `ONE WORD AND/OR A NUMBER`, mâu thuẫn `ONLY ONE WORD` không neo với guard false-positive, và thiếu strip HTML/script/style trước regex (gãy `<strong>ONE WORD</strong>` + rủi ro spoof) | Critical | Accept | Phase 2 |
| 3 | Input hỗn hợp HTML + plain text làm gãy `splitIntroBlocks`, `ownTexts` dedup và `join("")` gây dính chữ hoặc nuốt ghi chú giáo viên | High | Accept | Phase 2 |
| 4 | `shortans` (`/\bquestions?\b/i`) cướp hướng dẫn, word-bank summary peek nhầm word limit, peek inline chỉ 1 `<table>`/`<ul>` bỏ sót 64% `body_html` thật, và grammar TFNG/YNNG làm đứt 13–20+ đề thật | High | Accept | Phase 2 |
| 5 | `contextIntro` rò rỉ khi đề có `>= 2` completion parts không khớp keyword, và `introSplit` không memoized phá `useMemo` của `parsedInlineByPartId` theo từng keystroke | High | Accept | Phase 3 |
| 6 | Lệch ranh giới sanitize (`script`/`style` trong `domHtmlToPlainText` có thể làm trống header) và điều kiện unwrap `<p>` bỏ sót `</p >` | Medium | Accept | Phase 2, Phase 3 |

## Validation Log

### Session 1 — 2026-11-24
- `ak plan validate`: `valid: true`, `errors: null`.
- Verification Results: Passed: 6 / 6 Red-Team claims verified against source (`library-test-sync.ts`, `admin-library.ts`, `quiz-instruction.ts`, `quiz-intro-sections.ts`, `quiz-paper.tsx`, `Collection-the-history-of-tea.json`, `Collection-the-perfume-hunters.json`, `C10T4-the-megafires-of-california.json`, `Actual-Test-the-legend-of-tea.json`, `Actual-Test-language-strategy-in-multinational-company.json`, `C10T1-stepwells.json`). Failed: 0.
- Whole-Plan Consistency Sweep: All 3 phases align with Acceptance Criteria, Locked Scope, Non-Goals, and carry literal Failure Protocol blocks.

<!-- slug: 876-fix-reading-history-of-tea-instructions -->
