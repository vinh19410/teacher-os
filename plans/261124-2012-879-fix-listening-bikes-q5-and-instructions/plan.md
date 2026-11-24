---
title: "879-fix-listening-bikes-q5-and-instructions"
description: "Fix Talking about the history of bikes Q5 blank/key grammatical mismatch in source JSON and D1 (migration 0089), and harden listening instruction isolation in quiz-instruction.ts with Bikes and City Health Services regression tests"
status: completed
priority: P1
effort: "2h"
tags: [listening, quiz, instructions, migration, dataset]
created: 2026-11-24
---

# Plan #879 — Sửa lỗi Q5 đề Listening History of Bikes & chống lẫn hướng dẫn nhóm câu (City Health Services và các đề Listening)

- **Issue:** [#879](https://github.com/vinh19410/teacher-os/issues/879)
- **Branch:** `vinh19410/fix-listening-history-of-bikes-q5-p-n-more-smoot` → PR vào `develop` (`--ship --beta --advice`)
- **Route:** Bugfix (`/ak-fix --auto --advice`)
- **Handover-ready:** Có — mỗi phase phân rã thành các task tự chứa với `Goal`, `Target files and symbols`, `Steps`, `Success criteria`, lệnh `Verify` cơ học (gồm rõ điều kiện Red/Green cho `--tdd`) và khối `## Failure Protocol` nguyên văn buộc dừng khi verify thất bại.

## Overview

Khắc phục triệt để 2 nhóm nguyên nhân gốc rễ của issue [#879](https://github.com/vinh19410/teacher-os/issues/879):

1. **RC1 — Lỗi dữ liệu nguồn & bản đã lưu trên D1 cho đề Listening *Talking about the history of bikes* (Q5):**
   - Trong `docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json` (6 vị trí: `body.text`, `body.html`, `question_groups[0].body`, `body_table[2][2]`, `body_html`, `questions[4].text`), ô Advantage giai đoạn 1860s ghi `easier and [5] ride`, nhưng audio bất biến đọc `"But it made the ride so much easier. As a result, the good thing was that you could ride a lot more smoothly and with very little effort."` và key chuẩn là `"more smoothly"` (audio không hề có từ `"smoother"`). Ghép `"more smoothly"` vào `easier and (5) ride` tạo cụm sai ngữ pháp `"easier and more smoothly ride"`.
   - Trên Staging, `deploy-staging.yml` tự động áp Drizzle D1 migrations qua Alchemy (`packages/infra/src/flat-migrations.ts`, còn `import-listening-staging.yml` chỉ chạy thủ công) và `syncLibraryTestsToOrg` (`apps/server/src/lib/library-test-sync.ts:38-40`) giữ invariant INF-03 không ghi đè bản sao `assignment_prompt` đã clone cho org. Do đó phải đồng bộ cả file JSON nguồn lẫn migration `0089` (cập nhật an toàn, idempotent, bảo vệ INF-03 trên cả `library_test_part` lẫn `assignment_prompt` gồm `questions`, `groups` và `intro`).
2. **RC2 — Lẫn hướng dẫn nhóm câu ở *City Health Services* và các đề Listening trên nhánh fallback `!hasGroupSource`:**
   - Khi QA kiểm thử trên Staging tại commit `52cf3063` (trước `#875/#876/#877`), `QuizPaper` chưa có `deduplicateGroupIntroPreamble` nên render nguyên khối `detail.intro` (do `flattenLibraryTestPart` nối cả 3 nhóm `form` + `mcq1` `"Choose the correct answer."` + `sent4`), khiến `"Choose the correct answer."` hiện lẫn ngay khu vực điền từ của **City Health Services**. Trên HEAD `9a0c8930`, **City Health Services** đã tách sạch ở cả nhánh có `groups` lẫn `!hasGroupSource`, nhưng chưa có regression test DOM ghim chặt.
   - Audit toàn bộ 498 file `docs/listening_ielts/*.json` + 352 file `docs/reading-ielts/reading-practice/*.json` trên HEAD `9a0c8930` phát hiện các ca lẫn/rò hướng dẫn Listening **vẫn còn xảy ra** trên nhánh `!hasGroupSource` (`PreviewQuizSimulation`, `StudyPackItemViewer` tab `"Làm thử"`, fallback không `groups`):
     - `Unknown-S4-talking-about-the-history-of-bikes.json` Q8–10 (`mcq_many`): `"Choose THREE letters, A-F, and write them next to questions 8-10..."` bị rò ra `cleanedPreamble` vì `MCQ_MANY_NEGATIVE_RE` chặn cứng `\bnext\s+to\s+questions?\b`.
     - `C14T3-S3-background-on-school-marching-band.json` và `C15T3-S3-analyzing-media-coverage.json` (`notes` 21–26 + `matching` 27–30), cùng các đề `matching` dùng `"Choose the correct answer and move (it )?into the gap"` (`C20T3-S3` là `mcq3` + `matching`, `C20T4-S2` là `mcq_many`×2 + `matching`), `"Choose from the list A-G"` (`Collection-S3-climate-change-and-allergies.json`), `"Who/Which ... each ..."` + `"Write/Choose the correct letter ... next to questions"` (`C11T3-S3`, `C11T4-S1`, `Actual-Test-S2-radio-program-singing-in-the-choir`): `isMatchingAnchorAt` bỏ sót, đồng thời `scanInlineSiblingEndIdx` chỉ so khớp marker ở `delta = 0` và đọc HTML thô chưa lọc comment/attribute/tag ẩn nên ở Section 2/3/4 (`21–30` vs local `1–10`) quét xuyên qua nhóm `matching` kế tiếp.
     - 43 đề Listening có 2+ nhóm `mcq_many` liên tiếp (`C13T3-S2`, `C20T4-S2`, `C21T3-S2`, ...) bị `clusterByType` gộp thành 1 part nên dòng lặp hệt `"Choose TWO letters, A-E."` / `"Choose TWO correct answers."` bị rò lên `cleanedPreamble` phía trên cả nhóm `matching`.
     - Một số đề Listening MCQ đơn dùng `"Choose the correct option..."`, `"Choose the correct letters, A, B or C"`, `"Circle the correct answer..."`, `"Part 2 — Multiple choice. Choose the correct letter..."` và `"Which are the TWO..."` bị rò ra `cleanedPreamble`.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - **Source JSON:** Cập nhật đúng 6 chỗ `"easier and [5] ride"` → `"easier; ride [5]"` trong `docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json`; giữ nguyên `answer: "more smoothly"`, `alts: ""`, `transcript`, `quotes`, `question_groups[1]`.
  - **DB Migration `0089` + Drizzle metadata + tests:**
    - Tạo `packages/db/src/migrations/0089_fix_listening_bikes_q5_blank.sql` (2 statement đều kết thúc bằng `;` tương thích Alchemy flat D1 runner `packages/infra/src/flat-migrations.ts` và ngăn bằng `--> statement-breakpoint`), cập nhật `packages/db/src/migrations/meta/_journal.json` (`idx: 89`, `when > entry[88].when`, `breakpoints: true`) và tạo `packages/db/src/migrations/meta/0089_snapshot.json` nối `prevId` từ `0088_snapshot.json` (`01c8de55-ee46-4d4c-8fea-5bb51674306b`).
    - Statement 1 cập nhật `library_test_part` (`id = 'lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'`) trên `questions`, `groups`, `intro`, `updated_at` với đầy đủ nested 2-tầng `CASE WHEN json_valid(...) = 1` (theo precedent `0087`), kiểm tra `json_type` cho mọi trường con (`stem`/`answer`/`alts`/`instruction`), kiểm tra `alts = ''`, đồng bộ guard `groups`/`intro` ngay trong `WHERE` (chống split-brain), và khoanh vùng `REPLACE` theo đúng ô bảng `'<td><p>easier and <strong>(5)</strong> ride</p></td>'` → `'<td><p>easier; ride <strong>(5)</strong></p></td>'`.
    - Statement 2 cập nhật `assignment_prompt` (`library_ref = 'library_test_part:lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'`, `skill = 'listening'`, `part = 's4'`) trên cả `questions`, `groups` và `intro` (KHÔNG chạm `updated_at` vì bảng không có cột này), giữ chặt INF-03 (`answer = 'more smoothly'`, `alts = ''`, `type` null hoặc `'tablecomp'`, `stem`/`intro`/`groups[0].instruction` chưa bị sửa tay, `REPLACE` khoanh đúng ô `<td><p>...</p></td>`), không dựa vào `COALESCE` bọc ngoài `json_set`, idempotent, không lỗi khi gặp JSON corrupt một phần hay toàn phần. Ghi nhận rõ chính sách: vẫn cập nhật `assignment_prompt` nguyên mẫu dù org đã có lượt practice `quiz_attempt` (vì QA trên Staging đã tạo attempt và mọi lượt practice mới đều đọc `assignment_prompt`), đồng thời tuyệt đối không sửa `quiz_attempt.questions_snapshot` (bảo toàn RT#3).
    - Bổ sung `apps/server/src/listening-bikes-q5-migration.test.ts` kiểm chứng cả thực thi từng statement, `client.executeMultiple(rawSql)` (Alchemy D1), nâng cấp qua `drizzle-orm/libsql/migrator` (`_journal.json` `when`), INF-03 (tách riêng `org_id`), partial/full corrupt JSON trên cả 2 bảng, và idempotency với `updated_at` cố định.
  - **Instruction Isolation (`packages/ui/src/lib/quiz-instruction.ts`) + Tests:**
    - Tinh chỉnh `CHOOSE_FROM_BOX_RE` (thêm `options?` và cho phép `"Choose from the list/box"` không cần số lượng), `NAMED_MATCHING_DIRECT_RE` (thêm `choose the correct answer and move(?:\s+it)? into the gap`, **KHÔNG** đưa `write/choose ... letter ... next to questions` vào đây để bảo toàn 10 đề `MAP_LABELLING` 2 dòng!), tách riêng `LISTENING_NEXT_TO_QUESTIONS_RE` chỉ dùng làm dòng 2 sau `LISTENING_MATCHING_LEAD_IN_RE` (và `WRITE_LETTER_DIRECTIVE_RE` chỉ bắt động từ `write`, tuyệt đối không ghép `"Choose the correct answer."` vào matching!).
    - Siết `MCQ_MANY_NEGATIVE_RE` (hẹp chính xác, bỏ `(?!s)` thừa, không chặn `answers ... next to questions` hay `write the correct letter in boxes`), mở rộng `MCQ_MANY_WHICH_RE` (`Which are the TWO...`), mở rộng `MCQ_SINGLE_ANCHOR_RE` + `MCQ_SINGLE_NEGATIVE_RE` (tuyệt đối không thêm `\bin\s+boxes?\b`) và chặn `mcq_single` trong `isMcqAnchorAt` khi `extractExpectedBankCount("mcq", clean) > 4` (bảo vệ đề 5 lựa chọn `Forecast-Quy-2-2025-grey-workers.json`).
    - Deduplicate chính xác các dòng `mcq_many` lặp hệt (`matchedMcqManyExactLines`) cho 43 đề có 2+ nhóm `mcq_many` liên tiếp khi `!hasGroupSource`.
    - Làm sạch `extractInlineMarkerNumbers` (loại HTML comment, forbidden containers, thẻ `<a>` và attribute trước khi trích `[N]` / `<strong>(N)</strong>`), và thay `activeDelta` cục bộ bằng hàm suy luận **`inferQuizInlineDelta(blocks, allParts)` toàn cục** (chỉ chốt `delta > 0` khi tất cả marker hợp lệ `<= 60` rơi vào `1..totalQuestions`, phủ `>= 2` part khác nhau, và là ứng viên duy nhất đạt cực đại — triệt tiêu hoàn toàn fabrication delta, bảng đảo thứ tự, và va chạm `delta = 0`).
    - Bổ sung unit tests trong `packages/ui/src/lib/quiz-instruction.test.ts` và integration DOM tests Take + Review trong `packages/ui/src/components/quiz/quiz-paper.test.tsx`.
- **Explicit Non-Goals:**
  - Không đổi đáp án `"more smoothly"` sang `"smoother"` và không thêm `"smoother"` hay `"smoothly"` vào `alts` (audio gốc đọc `"ride a lot more smoothly"`, không có `"smoother"`).
  - Không sửa `quiz_attempt.questions_snapshot` của các lượt làm bài lịch sử (giữ immutability RT#3).
  - Không sửa typo distractor Q7 option C (`"lean and dry the clothes"`) trong `docs/listening_ielts/Actual-Test-S1-city-health-services.json` (ngoài phạm vi #879; ghi nhận vào follow-up).
  - Không sửa 8 word-limit mismatch ở các file Listening không liên quan (`Actual-Test-S4-cubes-houses.json`, v.v.; ghi nhận vào follow-up).
  - Không gom các nhóm matching 1 dòng không có câu lệnh directive (như `Actual-Test-S1-apartment-in-arillas.json` Q8–10 `"What is the theme of each of the following museums?"` hay `Actual-Test-S1-employment-agency-possible-jobs.json` dùng `"Choose the correct letter, A, B or C."` dễ tranh chấp MCQ) — giữ fail-safe không cướp hướng dẫn MCQ.
  - Không sửa `StudyPackItemViewer` tab `"key"` hoặc `flattenLibraryTestPart` hay chạy full E2E local.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Khớp ngữ pháp và ngữ cảnh Q5 đề *Talking about the history of bikes* (`easier; ride [5]` ↔ `more smoothly`) đồng bộ giữa JSON nguồn và D1 (`library_test_part` + `assignment_prompt` chưa bị chỉnh tay) | P1 |
| 2 | Ngăn tuyệt đối việc lẫn/rò hướng dẫn giữa các nhóm câu Listening (`mcq_many`, `mcq1`/`mcq3`, `matching`, `notes`/`form`/`tablecomp`) trên cả nhánh có `groups` và fallback `!hasGroupSource` mà đạt 0 hồi quy trên toàn bộ 850 đề Reading + Listening | P1 |
| 3 | Ghim chặt hành vi Take & Review cho *Talking about the history of bikes* và *City Health Services* bằng regression tests tự động và vượt 100% local quality gates | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Bikes Q5 Source JSON & Drizzle Migration 0089](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Listening Instruction Isolation in quiz-instruction.ts](./phase-02-listening-instruction-isolation.md) | Completed |
| 3 | [Phase 3: QuizPaper Regression Tests & Full Verification Gates](./phase-03-quiz-paper-regression-and-verification.md) | Completed |

## Acceptance Criteria

- [x] `docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json` cập nhật đủ 6 chỗ `"easier and [5] ride"` → `"easier; ride [5]"`, giữ nguyên `answer: "more smoothly"`, `alts: ""`, `transcript`, `quotes`; `loadListeningLibraryDataset` + `listening-library-import.test.ts` pass 100% (498 tests, 497 ready, 1 draft).
- [x] Migration `0089_fix_listening_bikes_q5_blank.sql` có 2 statement kết thúc `;` + `--> statement-breakpoint`, đủ entry `idx: 89` (`when > 1795538532220`, `breakpoints: true`) trong `meta/_journal.json` và `meta/0089_snapshot.json` nối `prevId` từ `0088_snapshot.json`; cập nhật đúng `library_test_part` (`questions`, `groups`, `intro`, `updated_at`) và `assignment_prompt` (`questions`, `groups`, `intro`), bảo vệ INF-03 (kể cả `alts = 'smoother'` và ô bảng `<td><p>...</p></td>`), không split-brain, không throw với JSON corrupt (toàn phần & một phần trên cả 2 bảng), idempotent khi chạy lại lần 2 (xác minh với `updated_at` mốc cố định), không chạm `quiz_attempt`, pass cả `client.executeMultiple(rawSql)` (Alchemy D1), `drizzle-orm/libsql/migrator`, `listening-bikes-q5-migration.test.ts`, `study-pack-migration.test.ts`, và `packages/infra/src/flat-migrations.test.ts`.
- [x] `packages/ui/src/lib/quiz-instruction.ts` phân tách chính xác với **0 hồi quy trên toàn bộ 498 Listening + 351 Reading JSON** (`0` different-type cross-group leaks, `0` `cleanedPreamble` regressions, `0` `scopeFlattenedOptionBank` regressions — gồm bảo toàn 10 đề `MAP_LABELLING` 2 dòng như `C16T1-S2`, `Forecast-Quy-2-2025-grey-workers.json`, `Collection-nineteenth-century-paperback-literature.json`, `C13T3-S2`, `Neanderthal`, `Bovids`):
  - Bikes Q8–10 (`mcq_many`) trên `!hasGroupSource` không rò ra `cleanedPreamble`.
  - `C14T3-S3` / `C15T3-S3` (`notes` 21–26 + `matching` 27–30), `C20T3-S3` (`mcq3` + `matching`), `C20T4-S2` (`mcq_many`×2 + `matching`), `C11T3-S3`, `C11T4-S1`, `Actual-Test-S2-radio-program-singing-in-the-choir`, `Collection-S3-climate-change-and-allergies` phân tách sạch và không nuốt chéo.
  - `extractInlineMarkerNumbers` miễn nhiễm comment/attribute/forbidden-tag spoofing, và `inferQuizInlineDelta` toàn cục chặn lệch offset mà không tự bịa delta.
  - Các đề có 2+ nhóm `mcq_many` liên tiếp không rò dòng `"Choose TWO..."` trùng lặp lên `cleanedPreamble`.
  - Các biến thể Listening single-MCQ (`Choose the correct option`, `Choose the correct letters`, `Circle the correct answer`, `Part 2 — Multiple choice...`) và `Which are the TWO...` khớp đúng nhóm mà không cướp `matching` hay phá Reading `MCQ` (`in boxes`).
- [x] `QuizPaper` (cả Take lẫn Review, cả `hasGroupSource` lẫn `!hasGroupSource`):
  - **Talking about the history of bikes:** Q5 hiển thị `easier; ride` cạnh inline input `(5)`, chấm đúng `"more smoothly"`, Q8–10 hiển thị đúng hướng dẫn `mcq_many` trong nhóm và `cleanedPreamble` sạch.
  - **City Health Services:** `"Choose the correct answer."` chỉ nằm trong `Questions 5–7`, tuyệt đối không lẫn vào `Questions 1–4` (`form`), `Questions 8–10` (`sent4`), hay preamble đầu trang.
- [x] Toàn bộ local gates (`pnpm exec biome check .`, `pnpm check-types`, vitest suites `@teacher-os/db`, `@teacher-os/ui`, `@teacher-os/infra`, `server`, `student`, `web`, `admin`) pass 100%.

## Red Team Review

### Session — 2026-11-24
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Contract Verifier), Failure Mode Analyst (Flow Tracer) — 3 parallel hostile subagents
**Findings:** 9 deduplicated from 23 raw findings (9 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 5 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `NAMED_MATCHING_DIRECT_RE` chứa `write/choose ... letter ... next to questions` phá 10 đề `MAP_LABELLING` 2 dòng tại `quiz-instruction.ts:1116` (20 hồi quy `scopeFlattenedOptionBank` + rò preamble) | Critical | Accept | Phase 2, Phase 3 |
| 2 | `activeDelta = collectedMarkers[0] - minOwnNumber` tự bịa delta để cướp body nhóm sau (`HIGH-2a` offset), lệch ±1 trên bảng đảo thứ tự/marker ví dụ, gãy va chạm `delta = 0` (`Collection-nineteenth-century-paperback-literature.json`), và `extractInlineMarkerNumbers` dễ bị spoof bởi HTML comment/attribute/`<a>`/forbidden tags | Critical | Accept | Phase 2 |
| 3 | Migration `0089` thiếu guard `questions[4].alts` (vi phạm INF-03), thiếu guard `groups`/`intro` ở Statement 1 (gây split-brain nhân đôi bảng trong `QuizPaper`), dùng `COALESCE` quanh `json_set` không chặn được `json_set(..., NULL)`, thiếu `json_type` + nested `CASE WHEN`, cần khoanh `REPLACE` vào đúng `<td><p>...</p></td>`, và cần chốt chính sách với prompt đã có `quiz_attempt` + tách `org_id` / mốc `updated_at` cố định / test corrupt từng phần | High | Accept | Plan, Phase 1 |
| 4 | Lệnh `pnpm --filter @teacher-os/db db:generate -- --custom` fail exit 1 trên pnpm 10.33.1 (`Unrecognized options: --`) | High | Accept | Phase 1 |
| 5 | Thiếu kiểm chứng 2 migration runner thật: Alchemy flat SQL runner (`client.executeMultiple(rawSql)` + dấu `;` + `packages/infra/src/flat-migrations.test.ts`) và Drizzle `migrate()` (`_journal.json` `when` monotonicity) + thiếu `study-pack-clone.test.ts` | High | Accept | Phase 1, Phase 3 |
| 6 | Ghép `LISTENING_MATCHING_LEAD_IN_RE` với `MATCHING_TAIL_DIRECTIVE_RE` trần (`Choose the correct answer.`) có nguy cơ cướp hướng dẫn `mcq` ở `detectMatchingCluster`; đồng thời bổ sung `"Choose from the list/box"` (`Collection-S3-climate-change-and-allergies`) và tách rõ Explicit Non-Goals cho matching 1 dòng không directive | High | Accept | Plan, Phase 2 |
| 7 | Nới `MCQ_SINGLE_ANCHOR_RE` (`letters?`) khiến `mcq` cướp `mcq_many` 5 lựa chọn (`Forecast-Quy-2-2025-grey-workers.json`: `A, B, C, D or E`) và `MCQ_MANY_NEGATIVE_RE` quá rộng (`answers? ... next to questions`, `(?!s)` thừa) | High | Accept | Phase 2 |
| 8 | Sai mô tả cấu trúc nhóm thật của `C20T3-S3` (`mcq3` + `matching`) và `C20T4-S2` (`mcq_many`×2 + `matching`); đồng thời 43 đề có 2+ nhóm `mcq_many` liên tiếp rò dòng `"Choose TWO..."` lặp hệt lên `cleanedPreamble` khi `!hasGroupSource` | Medium | Accept | Plan, Phase 2, Phase 3 |
| 9 | Phase 3 Task 3.2 dùng sai `pnpm check` (đọc-only, phải là `pnpm check:fix`), chạy `tsx` từ `@teacher-os/db` thiếu workspace dep `@teacher-os/ui`/`@teacher-os/api`, và audit gate thiếu so sánh baseline-diff `cleanedPreamble` + `scopeFlattenedOptionBank` trên cả 498 Listening + 352 Reading JSON | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-listening-instruction-isolation.md`, `phase-03-quiz-paper-regression-and-verification.md`
- Decision deltas checked: 9 (tách `LISTENING_NEXT_TO_QUESTIONS_RE` khỏi `NAMED_MATCHING_DIRECT_RE`; đổi `activeDelta` cục bộ → `inferQuizInlineDelta` toàn cục + làm sạch `extractInlineMarkerNumbers`; siết migration `0089` với `alts`, nested `CASE WHEN`, `json_type`, `<td><p>...</p></td>`, Statement 1 `WHERE` nhất quán, không dựa `COALESCE(json_set)`, tách `org_id` + cố định `updated_at` trong test; sửa `drizzle-kit generate --custom`; thêm test `executeMultiple` + `migrate()` + `flat-migrations.test.ts` + `study-pack-clone.test.ts`; cấm `MATCHING_TAIL_DIRECTIVE_RE` trần ghép `LISTENING_MATCHING_LEAD_IN_RE` + thêm `Choose from the list`; chặn `mcq_single` khi `> 4` chữ cái + thu hẹp `MCQ_MANY_NEGATIVE_RE`; sửa mô tả `C20T3-S3`/`C20T4-S2` + dedupe `matchedMcqManyExactLines`; nâng cấp audit 850 file baseline-diff + sửa `pnpm check:fix`)
- Reconciled stale references: 9/9 (0 tên hàm/regex/câu lệnh cũ còn sót)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-24
- `ak plan validate`: `valid: true`, `errors: null`.
- Kongming post-plan-gates counsel: Conditional GO applied — updated `inferQuizInlineDelta` to exclude `NON_INLINE_PART_TYPES` and score solely by `(cleanClusters, exactBoundaryHits)` (verified 0 wrong positives across all 849 JSON tests: 498 Listening + 351 Reading), normalized `matchedMcqManyExactLines` with `MATCHING_TAIL_BOXES_RE`/`MCQ_MANY_TAIL_NB_RE` support, and refined Bikes DOM assertion in Phase 3.

### Verification Results
- **Tier:** Standard (3 phases — Fact Checker + Contract Verifier + Flow Tracer)
- **Claims checked:** 23
- **Verified:** 23 | **Failed:** 0 | **Unverified:** 0
- Verified symbols & paths: `docs/listening_ielts/Unknown-S4-talking-about-the-history-of-bikes.json:12,13,20,32,48,82-86,105-203`, `docs/listening_ielts/Actual-Test-S1-city-health-services.json:13-149`, `docs/listening_ielts/C16T1-S2-plan-of-stevensons-site.json:109-110`, `docs/listening_ielts/C14T3-S3-background-on-school-marching-band.json`, `docs/listening_ielts/C15T3-S3-analyzing-media-coverage.json`, `docs/listening_ielts/C20T3-S3-theatre-programmes.json:18-19,157-158`, `docs/listening_ielts/C20T4-S2-football-stadium-visit.json:18-19,79-80,140-141`, `docs/reading-ielts/reading-practice/Forecast-Quy-2-2025-grey-workers.json:72-73`, `docs/reading-ielts/reading-practice/Collection-nineteenth-century-paperback-literature.json:18-39`, `packages/db/src/schema/library-test.ts:59-103`, `packages/db/src/schema/assignment-prompt.ts:18-73`, `packages/db/src/migrations/meta/0088_snapshot.json:4`, `packages/db/src/migrations/meta/_journal.json:622-627`, `packages/db/src/migrations/0087_backfill_assignment_prompt_groups.sql:16-28`, `packages/infra/src/flat-migrations.ts:1-23`, `packages/infra/src/flat-migrations.test.ts:46-56`, `packages/ui/src/lib/quiz-instruction.ts:104-166,713-724,830-885,947-1188,1218-1314,1616-1772`, `packages/ui/src/components/quiz/quiz-paper.tsx:560-678,846-957`, `apps/server/src/study-pack-migration.test.ts:283-302`, `apps/server/src/lib/study-pack-clone.test.ts:293,364`, `package.json:24-25`.

<!-- slug: 879-fix-listening-bikes-q5-and-instructions -->
