---
title: "877-fix-reading-matching-instructions-and-banks"
description: "Isolate mixed reading matching option banks and resolve conflicting/inaccurate matching instructions in Neanderthal Technology, Bovids, and grouped/fallback reading quizzes"
status: completed
priority: P1
effort: "2h"
tags: [reading, quiz, matching, option-bank, instructions]
created: 2026-11-24
---

# Plan #877 — Sửa lỗi hướng dẫn và ngân hàng lựa chọn bị trộn ở đề Neanderthal Technology và Bovids

- **Issue:** [#877](https://github.com/vinh19410/teacher-os/issues/877)
- **Branch:** `vinh19410/fix-reading-h-ng-d-n-v-ng-n-h-ng-l-a-ch-n-b-tr-n` → PR vào `develop` (`--ship --beta --advice`)
- **Route:** Bugfix (`/ak-fix --auto --advice`)
- **Handover-ready:** Có — mỗi phase tách task tự chứa với `Goal`, `Target files and symbols`, `Steps`, `Success criteria`, `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng khi verify thất bại.

## Overview

Khắc phục triệt để 3 nguyên nhân gốc rễ khiến đề Reading **Neanderthal Technology** (Q1–5 `headings` trộn `i–xi` và mâu thuẫn `i–viii` vs `i–vi`; Q6–10 `info` hiện `"Which section… A–H"` kèm lựa chọn `A–K` thay vì 5 địa danh `A–E`), đề **Bovids** (Q4–8 `info` hiện `"Which section… A–H"` thay vì 4 phân họ `A–D`), và các đề Reading/Listening matching tương tự hiển thị sai hướng dẫn và trộn ngân hàng lựa chọn:

1. **RC1 (`deduplicateGroupIntroPreamble` trong `packages/ui/src/lib/quiz-instruction.ts`):** Hiện chỉ nhận diện cụm `tfng`/`ynng` và `COMPLETION_TYPE_REGEX`, bỏ qua hoàn toàn các nhóm matching (`headings`, `info`, `features`, `match_names`, `matching`, `sentend`, `map`, `match2`, `match`), `mcq`/`mcq_many`, và câu mở đầu `"Answer the questions below."` của `fill_blank`. Trên đường fallback `!hasGroupSource` (đề pre-0085, `PreviewQuizSimulation`, tab `"Làm thử"` của `StudyPackItemViewer`, multi-part) hoặc nhóm trống `instructionHtml`, các hướng dẫn này bị bỏ lại trên `introPreamble` và mỗi nhóm rơi về chuỗi fallback tĩnh sai.
2. **RC2 (`resolvePartInstruction` trong `packages/ui/src/lib/quiz-instruction.ts`):** Ngay cả khi có `groups` (`hasGroupSource === true`) nhưng nhóm trống `instructionHtml`, hoặc fallback không có hướng dẫn khớp, `resolvePartInstruction` vẫn trả nguyên fallback tĩnh từ `QUIZ_TYPE_DISPLAY` (`headings` cứng `i–viii` dù 34/52 đề dataset khác 8 heading; `info` cứng `"Which section contains the following information? Write the correct letter A–H."` dù 26/130 đề đọc và 13/13 đề nghe là danh sách có tên như phân họ Bovids `A–D` hay địa danh Neanderthal `A–E`; `sentend`/`map`/`match2`/`match` cứng `A–H`).
3. **RC3 (`QuizPaper` trong `packages/ui/src/components/quiz/quiz-paper.tsx`):** Khi `!hasGroupSource`, `detail.optionBank` nối phẳng nhiều bank (Neanderthal: 6 headings + 5 địa danh = 11 mục) khiến top `<OptionBankList>` trộn `i–xi`, Q1–5 nhận `i–xi` và Q6–10 nhận `A–K`; với đề trộn có 1 nhóm bankable sạch (Bovids: `mcq` + `info` + `fill_blank`), `<OptionBankList>` bị đẩy lên đầu bài trên cả Q1–3 MCQ thay vì nằm trong nhóm Q4–8 `info`.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - `packages/ui/src/lib/quiz-instruction.ts` và `packages/ui/src/lib/quiz-instruction.test.ts`:
    - Siết `toSafePlainText` bằng scanner tuyến tính `O(N)` (chặn `>` trong attribute ngoặc kép, HTML comments, thẻ `<script|style|noscript|template|iframe|svg|math|textarea|title|object|embed>` kể cả chưa đóng thẻ, tránh ReDoS trên `intro` lớn tới 255 KB).
    - Mở rộng `deduplicateGroupIntroPreamble` theo thứ tự ưu tiên chặt (`isDuplicate` → `tfng`/`ynng` → `matching` → `mcq`/`mcq_many` → `completion` kèm mở rộng có điều kiện cho `fill_blank` và `summary` `"Complete the following paragraph"`), với `scanInlineSiblingEndIdx` có giới hạn biên (không chạy cho `headings`, tối đa 2 block không-marker dẫn đầu, đối chiếu phạm vi số câu, không vượt quá 30 block).
    - Mở rộng `resolvePartInstruction` với `isBankScoped?: boolean` và `isPositionalSectionBank` để suy luận dải số La Mã / chữ cái động theo `partBank` đã cô lập, phân biệt `info` theo đoạn văn vs danh sách có tên, và fail-safe trung tính khi `isBankScoped === false`.
    - Thêm pure helpers `extractExpectedBankCount` và `scopeFlattenedOptionBank` (một nguồn sự thật trả `{ partitioned: ReadonlyMap<string, string[]> | null; isBankScoped: boolean }`) bám chặt contract theo `skill` của `libraryOptionBankKindFor`, fail-closed nghiêm ngặt cho cả nhánh `bankableParts.length === 1` lẫn `>= 2`.
  - `packages/ui/src/components/quiz/quiz-paper.tsx` và `packages/ui/src/components/quiz/quiz-paper.test.tsx`:
    - Đồng bộ `isPositionalOnlyBank` (nhánh `"letter"`) dùng `isPositionalSectionBank` (khắc phục hộp thừa `"Paragraph A..H"` trên 6 đề Cambridge + 4 bài seed).
    - Memoize `scopedBankResult = scopeFlattenedOptionBank(...)` (không phụ thuộc `answers`/`currentQuestion` khi `parts` ổn định như màn học viên Take/Review), bảo toàn guard `#875` cho câu `summary`/`flow` bên trong part `source: "intro"` trộn dạng, giữ guard `partBankToRender.length > 0` bảo vệ RT2, và nối `effectivePartBank` + `isBankScoped` nhất quán.
    - Bổ sung integration tests DOM thực tế (không dùng phantom selector `[data-testid='option-bank-list']`) cho **Neanderthal Technology**, **Bovids**, các ca fail-closed multi-bank/collapsed-info/word-bank-summary, và kiểm chứng memoization bằng `vi.spyOn`.
- **Explicit Non-Goals:**
  - Không thêm DB migration mới (`0087_backfill_assignment_prompt_groups.sql` và `materializePrompts` đã xử lý đầy đủ tầng DB/sync với guard INF-03).
  - Không sửa `QUIZ_TYPE_DISPLAY` trong `packages/api/src/contracts.ts`, không sửa `library-contracts.ts`, `option-bank-list.tsx`, `flattenLibraryTestPart`, hay `student-practice.ts:165`.
  - Không thêm `groups` vào `StudyPackItemDetailView` hoặc sửa tab mặc định `"Đề & Đáp án"` (`activeTab === "key"`) của `StudyPackItemViewer` (vốn render trực tiếp `detail.optionBank` mà không qua `QuizPaper`) hay cơ chế tạo mới `parts` mỗi render của `PreviewQuizSimulation` trong lượt #877 — chỉ màn học viên Take/Review và tab `"Làm thử"` (`sim`) đi qua `QuizPaper` hưởng lợi trực tiếp; đồng bộ tab `"key"` có thể mở follow-up riêng nếu cần.
  - Không ẩn `showDetailBank` khi `parts.length === 1` hoặc `bankableParts.length === 0` (bảo toàn test `map` pin tại `apps/student/test/quiz-paper.test.tsx:130-151`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Gom trọn hướng dẫn `matching`, `mcq`/`mcq_many`, và `fill_blank` trong `deduplicateGroupIntroPreamble` an toàn trước HTML spoofing, ReDoS và xung đột giữa các nhóm Reading/Listening | P1 |
| 2 | Thích ứng fallback hướng dẫn matching trong `resolvePartInstruction` theo `partBank` thực tế (phạm vi `i–vi` / `A–D` / `A–E` và tách ngữ nghĩa `info` đoạn văn vs danh sách có tên), fail-safe trung tính khi `isBankScoped === false` | P1 |
| 3 | Tách `detail.optionBank` gộp qua `scopeFlattenedOptionBank` (fail-closed ở cả nhánh 1 lẫn `>= 2` bankable parts, đồng bộ `skill` & `isPositionalSectionBank`, giữ guard `#875` và RT2) tại `QuizPaper` | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Matching Instruction Clustering, Dynamic Fallback & Bank Partitioning](./phase-01-start.md) | Completed |
| 2 | [Phase 2: QuizPaper Bank Scoping Wiring & Integration Tests](./phase-02-quiz-paper-bank-scoping-and-tests.md) | Completed |
| 3 | [Phase 3: Full Verification Gates & Regression Audit](./phase-03-verification-and-gates.md) | Completed |

## Acceptance Criteria

- [x] **Neanderthal Technology (cả Take & Review, cả có `groups` lẫn fallback `!hasGroupSource`, có và không có `body_html`):**
  - Q1–5 (`headings`) chỉ hiển thị 6 tiêu đề `i–vi` (không trộn 5 địa danh `vii–xi`), 6 nút chọn `i–vi`, và hướng dẫn `i–vi` (không mâu thuẫn `i–viii`).
  - Q6–10 (`info`) chỉ hiển thị 5 địa danh `A–E` (không hiện `A–K` và không ẩn địa danh sang `vii–xi`), 5 lựa chọn `A–E`, và hướng dẫn địa danh `A–E` (tuyệt đối không có `"Which section… A–H"`).
  - Q11–13 (`summary`) vẫn là ô nhập chữ với `"NO MORE THAN TWO WORDS"`, Q14 là MCQ `A–D`, không lặp preamble.
- [x] **Bovids (cả Take & Review, cả có `groups` lẫn fallback `!hasGroupSource`, cả khi có lẫn trống `instructionHtml`):**
  - Q4–8 (`info`) hiển thị đúng 4 phân họ `A–D` ngay trong nhóm Q4–8 (không treo lên đầu Q1–3 MCQ) và hướng dẫn khớp `A–D` (tuyệt đối không có `"Which section… A–H"`).
  - Q9–13 (`fill_blank`) gom đủ `"Answer the questions below."` + `"NO MORE THAN THREE WORDS"` + boxes 9–13, `introPreamble` sạch.
- [x] **An toàn tổng quát & chống hồi quy (351 đề Reading + Listening dataset & biên bảo mật):**
  - `toSafePlainText` tuyến tính, không rò rỉ text từ `>` trong quoted attributes, comments, hay thẻ `<style>`/`<script>`/`<svg>`/`<textarea>`/`<iframe>` (kể cả chưa đóng thẻ).
  - `extractExpectedBankCount` chỉ đọc instruction riêng/matched của part (không fallback `introPreamble`), không lấy số đoạn (`"five sections"`, `A-F`) cho `headings`, và chặn xung đột range / vượt `[2..20]`.
  - `scopeFlattenedOptionBank` bám chặt contract theo `skill` (không xếp `flowchart` hay `flow` Reading vào optional bank), trả `string[]` tương thích `OptionBankList`, và fail-closed sạch trên toàn bộ 76 đề multi-bank Reading (0 ca cắt/gán sai, kể cả 6 đề `info+info` liền kề và các đề có word-bank `summary`) cũng như các đề Listening `mcq_many + matching`.
  - `isPositionalOnlyBank` đồng bộ với `isPositionalSectionBank` trên `"Paragraph A..H"`; bảo toàn guard `#875` cho câu `summary` trong `source: "intro"`, guard RT2 (`partBankToRender.length > 0`), `RT11`, ghi chú tiếng Việt, `map` pin (`apps/student/test/quiz-paper.test.tsx:130-151`), và memoization `QuizPaper` theo keystroke (`vi.spyOn`).
- [x] Toàn bộ gates local (`pnpm exec biome check .`, `pnpm check-types`, unit/integration tests `@teacher-os/ui`, `student`, `@teacher-os/api`, `web` preview sim, `admin` preview overlay) pass 100%.

## Red Team Review

### Session — 2026-11-24
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Contract Verifier), Failure Mode Analyst (Fact Checker + Flow Tracer) — 3 parallel subagents
**Findings:** 11 deduplicated from 21 raw findings (11 accepted, 0 rejected)
**Severity breakdown:** 5 Critical, 5 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Nhánh `bankableParts.length === 1` bỏ qua `exactSum` + `isBankScoped` tách rời làm gán trộn bank trên 10+ đề multi-bank thật (`info+info` liền kề, `summary` word-bank không khớp regex) | Critical | Accept | Phase 1, Phase 2 |
| 2 | Lệch contract `flowchart` (và `flow` trên `reading`, `map` trên `writing`/`reading`) giữa `partitionFlattenedOptionBank` với `libraryOptionBankKindFor` / `questionChoiceRows` / `QuizPaper` | Critical | Accept | Phase 1, Phase 2 |
| 3 | Lệch parse HTML `toSafePlainText` vs `DOMPurify` (`>` trong quoted attributes, comments, unclosed `<style>`/`<script>`, `<svg>`/`<textarea>`/`<iframe>`) + rủi ro ReDoS `O(N²)` trên `intro` lớn | Critical | Accept | Phase 1 |
| 4 | `scanInlineSiblingEndIdx` không chặn biên trên `matching` cho phép nuốt ghi chú/`RT11`/`body_html` nhóm khác và bị `parseInlineInstruction` positive-delta đánh tráo câu hỏi | Critical | Accept | Phase 1 |
| 5 | Gãy kiểu TS `TS4104` (`readonly string[]` vs mutable `OptionBankList.bank: string[]`) và nguy cơ vỡ alert RT2 nếu bỏ guard `partBankToRender.length > 0` | Critical | Accept | Phase 1, Phase 2 |
| 6 | `detectMcqCluster` `mcq_many` bỏ sót `correct` (104/212 nhóm thật) và thiếu negative guard `from the (box|list)` khiến cướp hướng dẫn `MATCHING` trên 18 đề Listening thật | High | Accept | Phase 1 |
| 7 | Ba xung đột matcher `map`↔`diagram`, `info`↔`features` (non-person), `sentend`↔`sent` (`Collection-diabetes.json`) và thiếu peek `"One of the headings has been done..."` + `"Label the plan"` | High | Accept | Phase 1 |
| 8 | Drift giữa `isPositionalSectionBank` và `isPositionalOnlyBank` (`quiz-paper.tsx:74-86`) khiến 6 đề Cambridge Reading + 4 bài study-pack seed vẫn hiện hộp thừa `A Paragraph A..H` | High | Accept | Phase 2 |
| 9 | Bỏ mất guard `#875` (`isQOptionalBank`) ở nhánh `hasPartitionedBanks` làm tái phát radio cho câu `summary` trong part `source: "intro"` trộn dạng | High | Accept | Phase 1, Phase 2 |
| 10 | `extractExpectedBankCount` đọc `introPreamble` chung và chưa lọc dải đoạn văn xung đột / cap `[2..20]` gây rủi ro cắt lệch qua `exactSum` | High | Accept | Phase 1, Phase 2 |
| 11 | Phantom selector `[data-testid='option-bank-list']`, phantom memoization test Case 5, và mô tả chưa chính xác về tab `"key"` của `StudyPackItemViewer` / `PreviewQuizSimulation` | Medium | Accept | Plan, Phase 2 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-quiz-paper-bank-scoping-and-tests.md`, `phase-03-verification-and-gates.md`
- Decision deltas checked: 11 (đổi `partitionFlattenedOptionBank` → `scopeFlattenedOptionBank` trả `{ partitioned: ReadonlyMap<string, string[]> | null; isBankScoped: boolean }`; bỏ `flowchart` khỏi optional bank; thêm `skill` + `introPreamble` fail-closed guard; harden `toSafePlainText` `O(N)`; bound `scanInlineSiblingEndIdx`; fix `mcq_many` + `map`/`info`/`sentend` matchers; unify `isPositionalOnlyBank`; giữ `#875` + RT2 guards; bỏ phantom test selectors; sửa Non-Goals `StudyPackItemViewer`)
- Reconciled stale references: 11/11 (0 tên hàm/chữ ký/giả định cũ còn sót)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-24
- `ak plan validate`: `valid: true`, `errors: null`.

### Verification Results
- **Tier:** Standard (3 phases — Fact Checker + Contract Verifier)
- **Claims checked:** 18
- **Verified:** 18 | **Failed:** 0 | **Unverified:** 0
- Verified symbols & paths: `packages/ui/src/lib/quiz-instruction.ts` (1 production caller `quiz-paper.tsx:48-50,534,579,584,861,876,880` + 1 test file `quiz-instruction.test.ts`), `packages/ui/src/components/quiz/quiz-paper.tsx` (`isPositionalOnlyBank:74-86`, `NON_INLINE_QUESTION_TYPES:99-106`, `choiceRowsByQ:651-686`, `parts.map:843-956`), `packages/ui/src/components/assignments/option-bank-list.tsx:26-42`, `packages/api/src/library-contracts.ts:202-279`, `packages/api/src/contracts.ts:608-689,806-905`, `packages/api/src/lib/quiz-parts.ts:48-78,127-140`, `apps/student/test/quiz-paper.test.tsx:130-151,772-791`, `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`, `apps/admin/src/components/library/test-preview-overlay.test.tsx`.

<!-- slug: 877-fix-reading-matching-instructions-and-banks -->
