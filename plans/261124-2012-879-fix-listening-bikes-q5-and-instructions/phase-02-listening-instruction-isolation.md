---
phase: 2
title: "Phase 2: Listening Instruction Isolation in quiz-instruction.ts"
status: completed
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2: Listening Instruction Isolation in `quiz-instruction.ts`

<!-- Updated: Red-Team Review 2026-11-24 - Separated LISTENING_NEXT_TO_QUESTIONS_RE from NAMED_MATCHING_DIRECT_RE to protect 10 2-line MAP_LABELLING tests, replaced local activeDelta with quiz-wide inferQuizInlineDelta + sanitized extractInlineMarkerNumbers, guarded MCQ_SINGLE against >4-option mcq_many (grey-workers) and bare MATCHING_TAIL_DIRECTIVE_RE stealing MCQ, narrowed MCQ_MANY_NEGATIVE_RE, added matchedMcqManyExactLines dedup, corrected C20T3-S3/C20T4-S2 test shapes -->

## Goal
Loại bỏ toàn bộ các ca lẫn chéo và rò hướng dẫn nhóm câu Listening còn tồn tại trên nhánh fallback `!hasGroupSource` trong `packages/ui/src/lib/quiz-instruction.ts` mà bảo toàn 100% các đề Reading và Listening (`MAP_LABELLING` 2 dòng, `grey-workers`, `Collection-nineteenth-century-paperback-literature`, `C13T3-S2`, `Neanderthal`, `Bovids`).

## Files to Create / Modify
- Modify: `packages/ui/src/lib/quiz-instruction.ts`
- Modify: `packages/ui/src/lib/quiz-instruction.test.ts`

## Tasks & Steps

### Task 2.1 — Viết TDD unit tests cho các ca rò/nuốt chéo hướng dẫn Listening & regression guards (Red phase)
- **Goal:** Bổ sung test cases trong `packages/ui/src/lib/quiz-instruction.test.ts` tái hiện chính xác các lỗi vẫn còn trên HEAD `9a0c8930` và ghim chặt toàn bộ ranh giới hồi quy từ Red-Team.
- **Target files and symbols:** `packages/ui/src/lib/quiz-instruction.test.ts`
- **Steps:**
  1. Thêm khối `describe("deduplicateGroupIntroPreamble — Issue #879 Listening instruction isolation", ...)` gồm các test cases:
     - **Bikes (`tablecomp` Q1–7 + `mcq_many` Q8–10, `!hasGroupSource`):** `flattenedIntro` chứa bảng Q1–7 (`easier; ride <strong>(5)</strong>`) + `<p>Choose THREE letters, A-F, and write them next to questions 8-10. The invention of different gears on a bicycle affected which THREE of the following?</p>`. Assert `cleanedPreamble === ""`, `part-1` nhận bảng Q1–7, `part-2` (`mcq_many`) nhận đúng dòng `Choose THREE letters...`.
     - **City Health Services (`form` Q1–4 + `mcq1` Q5–7 + `sent4` Q8–10, cả `hasGroupSource` lẫn `!hasGroupSource`):** Assert `cleanedPreamble === ""`, `part-1` (`form`) và `part-3` (`sent4`) không chứa `"Choose the correct answer."`, `part-2` (`mcq1`) nhận đúng `"Choose the correct answer."`.
     - **Cross-group leak `C14T3-S3` & `C15T3-S3` (`notes` 21–26 + `matching` 27–30 trên local `1–6` và `7–10`):** Assert `part-1` (`notes`) CHỈ chứa nội dung `(21)..(26)`, KHÔNG chứa `"Choose the correct answer and move it into the gap"`, và `part-2` (`matching`) nhận trọn instruction + danh sách `(27)..(30)` với `cleanedPreamble === ""`.
     - **Biến thể thiếu `"it"` khớp đúng cấu trúc thật `C20T3-S3` (`mcq3` 21–26 + `matching` 27–30) và `C20T4-S2` (`mcq_many` 11–14 gồm 2 nhóm liền nhau + `matching` 15–20):** Assert `"Choose the correct answer and move into the gap."` đi vào `matching`, dòng `"Choose TWO correct answers."` trùng lặp ở `C20T4-S2` được dedupe sạch, `cleanedPreamble === ""`.
     - **Quiz-wide `inferQuizInlineDelta` & chống spoof trong `extractInlineMarkerNumbers`:**
       - `part-1` (`notes` `1..6`, markers `(21)..(26)`) liền trước block inline `(27)..(30)` của `part-2` (`7..10`) không có anchor chuẩn → dừng ngay trước `(27)`, kể cả khi bảng `part-1` có marker đảo thứ tự `(22), (21)` hoặc có comment/attribute giả `<!-- [100] -->` / `<p title="[99]">`.
       - **Chống bịa delta (`HIGH-2a` offset variant):** `part-1` (`info`, `1..5`, không có inline body) đứng trước `part-2` (`summary`, `6..8`, body `[19], [20], [21]`) — `inferQuizInlineDelta` không bịa `delta = 18` (giữ `0`).
       - **Va chạm `delta = 0` (`Collection-nineteenth-century-paperback-literature` shape):** `part-1` (`1..6`, markers `14..19`) + `part-2` (`7..14`, markers `20..27`) → `inferQuizInlineDelta` xác định `delta = 13`, block 1 chứa `[14]` thuộc `part-1` không bị cắt nhầm sang `part-2`.
       - **HTML spoofing guard:** `<p title="[21][22]">Ghi chú</p>` và `<p><a href="https://example.com/[21]/[22]">Link</a></p>` không sinh marker ảo trong `extractInlineMarkerNumbers`.
     - **Listening 2-line matching & `Choose from the list` (`C11T3-S3`, `C11T4-S1`, `Actual-Test-S2-radio-program-singing-in-the-choir`, `Actual-Test-S3-report-writing`, `Collection-S3-climate-change-and-allergies`):** Assert `matching`/`features` nhận trọn cụm 2 dòng (`Who/Which ...` + `Write/Choose the correct letter... next to questions` / `Choose from the list A-G`), `mcq1`/`mcq3` không cướp dòng `next to questions`.
     - **Listening single-MCQ & `Which are the TWO` & duplicate `mcq_many` variants:** `"Choose the correct option."`, `"Choose the correct option A, B or C"`, `"Choose the correct letters, A, B or C"`, `"Circle the correct answer A, B, C or D."`, `"Part 2 — Multiple choice. Choose the correct letter A, B, C or D."`, `"Which are the TWO main duties for Personal Support Workers (PSWs)?"`, `"Choose TWO answers and write them next to questions 11-12."`, và 2 nhóm `mcq_many` liền nhau lặp `"Choose TWO letters, A-E."` (`C13T3-S2` shape) đều gán đúng nhóm với `cleanedPreamble === ""`.
     - **Regression guards bắt buộc từ Red-Team:**
       - **2-line `MAP_LABELLING` (`C16T1-S2-plan-of-stevensons-site`):** `<p>Label the map below.</p><p>Write the correct letter, A-J, next to Questions 15-20.</p>` giữ nguyên trọn 2 dòng trong `map`, `cleanedPreamble === ""`, và `scopeFlattenedOptionBank` trả `isBankScoped: true` + `partitioned` đủ 10 mục cho `map`.
       - **5-option `mcq_many` + `mcq` (`Forecast-Quy-2-2025-grey-workers`):** `<p>Choose the correct letter, A, B, C, D or E.</p>` KHÔNG bị `mcq` (4 lựa chọn) cướp mất; `mcq` nhận đúng `"Choose the correct letter, A, B, C or D."`.
       - **Lead-in + bare `"Choose the correct answer."` không cướp `mcq`:** Trong đề `[mcq1, matching]`, một dòng preamble `<p>What do these speakers disagree about?</p>` đứng trước `<p>Choose the correct answer.</p>` KHÔNG được ghép thành `matching` mà vẫn để `mcq1` nhận `"Choose the correct answer."`.
       - **`C13T3-S2` matching `from the box`** vẫn đi vào `matching`, KHÔNG bị `mcq_many` cướp; Reading `MCQ` (`"Choose the correct letter, A, B, C, or D. Write the correct letter in boxes 1-5 on your answer sheet."`) vẫn đi vào `mcq`.
- **Success criteria:** Các test case mới cho Bikes `!hasGroupSource`, `C14T3-S3`/`C15T3-S3`, `C20T3-S3`/`C20T4-S2`, `inferQuizInlineDelta`, `C11T3-S3`, `Collection-S3-climate-change-and-allergies`, `Choose the correct option/letters`, `Circle...`, `Which are the TWO...`, và duplicate `mcq_many` thất bại (Red) trước khi sửa `quiz-instruction.ts`.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/lib/quiz-instruction.test.ts` exits non-zero with assertion failures on the new #879 test cases (passing test is a failure).

### Task 2.2 — Hardening `packages/ui/src/lib/quiz-instruction.ts` (Green phase)
- **Goal:** Cập nhật các regex, `extractInlineMarkerNumbers`, `inferQuizInlineDelta`, `scanInlineSiblingEndIdx`, `isMatchingAnchorAt`, `detectMatchingCluster`, `isMcqAnchorAt`, và `deduplicateGroupIntroPreamble` trong `packages/ui/src/lib/quiz-instruction.ts` để pass 100% test mới & cũ mà đạt 0 hồi quy trên 850 đề Reading + Listening.
- **Target files and symbols:** `packages/ui/src/lib/quiz-instruction.ts` (`LISTENING_MATCHING_LEAD_IN_RE`, `CHOOSE_FROM_BOX_RE`, `NAMED_MATCHING_DIRECT_RE`, `LISTENING_NEXT_TO_QUESTIONS_RE`, `MCQ_MANY_WHICH_RE`, `MCQ_MANY_NEGATIVE_RE`, `MCQ_SINGLE_ANCHOR_RE`, `MCQ_SINGLE_NEGATIVE_RE`, `extractInlineMarkerNumbers`, `inferQuizInlineDelta`, `isMatchingAnchorAt`, `isMcqAnchorAt`, `scanInlineSiblingEndIdx`, `detectMatchingCluster`, `deduplicateGroupIntroPreamble`)
- **Steps:**
  1. Cập nhật `LISTENING_MATCHING_LEAD_IN_RE` (lines 121-122):
     `/^(?:what|which|who)\b[^\n]{0,160}\b(?:each\s+(?:of\s+the\s+(?:following|\w+)|\w+)|these|the\s+following)\b/i`
     *(Chỉ kích hoạt khi dòng kế tiếp là dấu hiệu matching rõ ràng ở Step 7, nên không bao giờ cướp MCQ trần.)*
  2. Cập nhật `CHOOSE_FROM_BOX_RE` (lines 131-132):
     `/\bchoose\s+(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:(?:correct|appropriate|best)\s+)?(?:answers?|letters?|options?)\s+)?from\s+the\s+(?:box|list|options?)\b/i`
     *(Phủ cả `"Choose from the list A-G."` ở `Collection-S3-climate-change-and-allergies` lẫn `"Choose ... answers from the options A-E"` ở `Actual-Test-S3-report-writing`.)*
  3. Cập nhật `NAMED_MATCHING_DIRECT_RE` (lines 135-136): bổ sung **CHỈ** `\bchoose\s+the\s+correct\s+answer\s+and\s+move(?:\s+it)?\s+into\s+the\s+gap\b`. **KHÔNG** đưa `write/choose ... letter ... next to questions` vào `NAMED_MATCHING_DIRECT_RE` (để không làm `nextMatchKind !== kind` cắt đứt 10 đề `MAP_LABELLING` 2 dòng tại line 1116!).
  4. Thêm hằng số riêng ngay sau `NAMED_MATCHING_DIRECT_RE`:
     - `const LISTENING_NEXT_TO_QUESTIONS_RE = /\b(?:write|choose)\s+(?:the\s+(?:correct|appropriate)\s+)?letter\b[^\n]{0,60}\bnext\s+to\s+questions?\b/i;`
     - `const WRITE_LETTER_TAIL_RE = /^write\s+(?:the\s+)?(?:correct|appropriate)\s+letter\b/i;`
  5. Cập nhật `MCQ_MANY_WHICH_RE` và `MCQ_MANY_NEGATIVE_RE` (lines 154-156):
     - `MCQ_MANY_WHICH_RE = /^which(?:\s+(?:are|were))?(?:\s+the)?\s+(?:two|three|four|five|\d+)\b/i`
     - `MCQ_MANY_NEGATIVE_RE = /\bfrom\s+the\s+(?:box|list|options?)\b|\b(?:write|choose)\s+(?:the\s+(?:correct|appropriate)\s+)?letter\s*,?\s*A\s*[-–—]\s*[B-T]\b[^\n]{0,40}\bnext\s+to\s+questions?\b/i`
  6. Cập nhật `MCQ_SINGLE_ANCHOR_RE`, `MCQ_SINGLE_NEGATIVE_RE` (lines 159-161) và `isMcqAnchorAt` (lines 869-885):
     - `MCQ_SINGLE_ANCHOR_RE = /^(?:part\s+\d+\s*[—–\-:]\s*(?:multiple\s+choice\.?\s*)?)?(?:choose|circle)\s+the\s+correct\s+(?:letter|answer|option)s?\b/i`
     - `MCQ_SINGLE_NEGATIVE_RE = /\b(?:two|three|four|five|headings?|endings?)\b|\bfrom\s+the\s+(?:list|box|options?)\b|\bnext\s+to\s+questions?\b|\bmove(?:\s+it)?\s+into\s+the\s+gap\b/i` (tuyệt đối KHÔNG thêm `\bin\s+boxes?\b`).
     - Trong `isMcqAnchorAt` nhánh `mcq_single`: thêm guard `const declaredCount = extractExpectedBankCount("mcq", clean); if (declaredCount !== null && declaredCount > 4) return null;` (chặn `A, B, C, D or E` của `mcq_many` 5 lựa chọn như `Forecast-Quy-2-2025-grey-workers.json`).
  7. Trong `isMatchingAnchorAt` (lines 859-865) và `detectMatchingCluster` (lines 1061-1069):
     - Viết helper `isListeningMatchingLine2(nextClean: string): boolean` trả `true` khi `CHOOSE_FROM_BOX_RE.test(nextClean) || NAMED_MATCHING_DIRECT_RE.test(nextClean) || LISTENING_NEXT_TO_QUESTIONS_RE.test(nextClean) || WRITE_LETTER_TAIL_RE.test(nextClean)` (KHÔNG chấp nhận `"Choose the correct answer."` trần hay `"Choose the correct letter, A, B or C."` trần không có `next to questions`).
     - Khi dòng hiện tại khớp `LISTENING_MATCHING_LEAD_IN_RE` và `isListeningMatchingLine2(nextClean)` trả `true` → phân loại `"named"` (`anchorIdx = startIdx + 1` trong `detectMatchingCluster`).
     - Trong vòng `while` của `detectMatchingCluster` (`quiz-instruction.ts:1103-1118`): vì `LISTENING_NEXT_TO_QUESTIONS_RE` không nằm trong `NAMED_MATCHING_DIRECT_RE`, `MAP_LABELLING` 2 dòng vẫn gom trọn dòng 2 qua `MATCHING_TAIL_DIRECTIVE_RE` với `nextMatchKind === null`.
  8. Làm sạch `extractInlineMarkerNumbers(block)` (lines 713-724):
     - Dùng linear single-pass HTML scanner (tái dùng cùng quy tắc bỏ comment `<!-- ... -->`, bỏ `FORBIDDEN_CONTAINER_TAGS` + thẻ `<a>...</a>` cùng nội dung, bỏ toàn bộ tag/attribute tôn trọng ngoặc đơn/kép giống `toSafePlainText`), chỉ giữ:
       - `[N]` trong text hiển thị ngoài thẻ `<a>`, và
       - leaf `<strong>(N)</strong>` (không có child element, ngoài thẻ `<a>`).
     - Nhờ đó `<p><!-- [100] -->...</p>`, `<p title="[21][22]">...</p>`, `<a href=".../[21]">` không bao giờ sinh marker giả.
  9. Thêm `inferQuizInlineDelta(blocks, allParts)` toàn cục và nối vào `scanInlineSiblingEndIdx` (lines 947-1034):
     - Khai báo `const NON_INLINE_PART_TYPES = new Set(["mcq", "mcq1", "mcq3", "mcq_many", "tfng", "ynng", "headings"]);` (khớp `NON_INLINE_QUESTION_TYPES` ở `quiz-paper.tsx:107-114` và `headings` ở `quiz-instruction.ts:954`).
     - Trong `deduplicateGroupIntroPreamble`, sau khi có `blocks`, gọi `const quizInlineDelta = inferQuizInlineDelta(blocks, parts)`:
       - Tính `totalQuestions = allParts.reduce((sum, p) => sum + p.questions.length, 0)` và ánh xạ `ownerByNumber` từ từng `q.number` tới `part` sở hữu nó. Nếu `totalQuestions === 0 || allParts.length < 2`, trả `0`.
       - Gom các chuỗi block `INLINE_SIBLING_BLOCK_RE` liên tiếp có `extractInlineMarkerNumbers(block).length > 0` (lọc `1 <= m <= 60`) thành mảng `clusters: number[][]`, đồng thời gộp tập duy nhất `validMarkers`. Nếu `validMarkers.size < 2`, trả `0`.
       - Nếu mọi `m` trong `validMarkers` đều đã nằm trong `1..totalQuestions` (`directInRange === validMarkers.size`), trả `0`.
       - Xét mọi ứng viên `delta` nguyên từ `1` tới `40`:
         - Bỏ qua nếu tồn tại bất kỳ `m` trong `validMarkers` mà `m - delta < 1 || m - delta > totalQuestions` HOẶC part sở hữu `m - delta` thuộc `NON_INLINE_PART_TYPES`.
         - Tính `coveredInlineParts`: số part inline khác nhau chứa ít nhất 1 marker `m - delta`. Bỏ qua nếu `coveredInlineParts.size < 2` (chặn fabrication delta kiểu `HIGH-2a` offset).
         - Chấm điểm ứng viên CHỈ bằng cặp `(cleanClusters, exactBoundaryHits)` (tuyệt đối KHÔNG tối đa hoá `coveredParts` hay `inRangeCount` để tránh lệch biên +1..+3 chạm part non-inline trên `C10T3-S2`, `C18T2-S3`, `Actual-Test-S3-effects-of-music-on-consumer-behaviour`, `Collection-nineteenth-century-paperback-literature`):
           - `cleanClusters`: số cluster mà mọi marker `m - delta` đều thuộc về **cùng 1** inline part `owner`;
           - `exactBoundaryHits`: tổng số lần `Math.min(...shifted) === owner.qStart` hoặc `Math.max(...shifted) === ownerLastQ` trên các clean cluster.
       - Chỉ trả về `delta` nếu có **đúng 1** ứng viên đạt cực đại `(cleanClusters, exactBoundaryHits)` (hoà hoặc không có → fail-closed trả `0`).
     - Truyền `quizInlineDelta` vào `scanInlineSiblingEndIdx(..., quizInlineDelta)`:
       - Helper `isStrictlyOther(markers)`: kiểm tra với `delta = quizInlineDelta` rằng `!markers.some((m) => ownNumbers.has(m - delta)) && otherPartNumberSets.some((otherNums) => markers.every((m) => otherNums.has(m - delta)))`.
       - Áp dụng ở cả chốt `break` trong vòng `while` (lines 999-1007) lẫn kiểm tra cuối hàm (lines 1021-1031).
  10. Trong `deduplicateGroupIntroPreamble` (lines 1242-1315):
      - Thêm helper chuẩn hoá dòng `normalizeMcqManyLine(line: string): string` (đổi `[–—]` → `-`, bỏ dấu câu cuối `[.,;:!?]+`, collapse whitespace, lowercase) và khai báo `const matchedMcqManyExactLines = new Set<string>();`.
      - Khi `mcqCluster` gán cho một part có `typeId === "mcq_many"`, lưu `normalizeMcqManyLine(toSafePlainText(b))` của toàn bộ block trong `blocks.slice(idx, mcqCluster.endIdx + 1)` vào `matchedMcqManyExactLines`.
      - Khi `detectMcqCluster` trả `null` (hoặc ngay ở bước kiểm tra trùng): nếu `(isMcqAnchorAt(clean) === "mcq_many" || MATCHING_TAIL_BOXES_RE.test(clean) || MCQ_MANY_TAIL_NB_RE.test(clean)) && matchedMcqManyExactLines.has(normalizeMcqManyLine(clean))` → `continue` (loại bỏ cả dòng tiêu đề `"Choose TWO..."` lẫn dòng đuôi `"Write your answers in boxes..."` trùng hệt trên các cặp `mcq_many` liên tiếp đã bị `clusterByType` gộp).
- **Success criteria:** Toàn bộ `quiz-instruction.test.ts` pass 100% (cả test mới lẫn toàn bộ regression Reading/Listening cũ).
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/lib/quiz-instruction.test.ts` exits 0 and reports all tests passed.

## Verification
- `pnpm --filter @teacher-os/ui exec vitest run src/lib/quiz-instruction.test.ts`

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
