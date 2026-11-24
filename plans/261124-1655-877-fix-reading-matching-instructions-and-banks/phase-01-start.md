---
phase: 1
title: "Phase 1: Matching Instruction Clustering, Dynamic Fallback & Bank Partitioning"
status: completed
priority: P1
effort: "60m"
dependencies: []
---

# Phase 1: Matching Instruction Clustering, Dynamic Fallback & Bank Partitioning

<!-- Updated: Red-Team Review 2026-11-24 - Hardened O(N) HTML scanner in toSafePlainText (blocks quoted `>` spoofing, comments, unclosed forbidden containers, ReDoS), bounded scanInlineSiblingEndIdx, unified scopeFlattenedOptionBank({ skill, introPreamble }) returning { partitioned: ReadonlyMap<string, string[]> | null, isBankScoped } aligned 1-to-1 with libraryOptionBankKindFor (no flowchart), added fail-closed guards for bankableParts.length === 1 (collapsed info+info & unmatched summary word-bank), fixed mcq_many/matching/map/sentend/info precedence & negative guards, and removed introPreamble fallback from extractExpectedBankCount -->

## Goal
Mở rộng `packages/ui/src/lib/quiz-instruction.ts` để tách an toàn hướng dẫn `matching`/`mcq`/`mcq_many`/`fill_blank` trong `deduplicateGroupIntroPreamble`, suy luận fallback matching thích ứng theo `partBank` trong `resolvePartInstruction` (có bảo vệ `isBankScoped`), và cung cấp pure helpers `extractExpectedBankCount` + `scopeFlattenedOptionBank` fail-closed bám chặt contract `skill`, kèm unit tests TDD đầy đủ trong `packages/ui/src/lib/quiz-instruction.test.ts`.

## Files to Create / Modify
- Modify: `packages/ui/src/lib/quiz-instruction.ts`
- Modify: `packages/ui/src/lib/quiz-instruction.test.ts`

## Tasks & Steps

### Task 1.1 — Viết TDD unit tests cho RC1, RC2, bảo mật HTML và `scopeFlattenedOptionBank` (Red phase)
- **Goal:** Tạo bộ test tái hiện đầy đủ triệu chứng của *Neanderthal Technology*, *Bovids*, các biến thể dataset Reading/Listening thật, các vector Hidden-Markup Spoofing, và toàn bộ ca fail-closed trước khi sửa code.
- **Target files and symbols:** `packages/ui/src/lib/quiz-instruction.test.ts`
- **Steps:**
  1. Import thêm `extractExpectedBankCount`, `isEffectivelyEmptyInstruction`, `isPositionalSectionBank`, `scopeFlattenedOptionBank` từ `./quiz-instruction`.
  2. Thêm tests bảo mật & an toàn `toSafePlainText` / `isEffectivelyEmptyInstruction`:
     - `<p title="x > Choose the correct heading, i-vi"></p>` → `isEffectivelyEmptyInstruction` trả `true`, `extractExpectedBankCount("headings", ...)` trả `null`.
     - `<a href="https://example.com/?x=>Match each finding A-E">Lưu ý thi</a>` → không trích ra `A-E`, không bị `deduplicateGroupIntroPreamble` nuốt.
     - `<!-- > Choose the correct heading i-vi -->`, `<style data-x=">">i-vi</style>`, `<style>i-vi` (không đóng thẻ), `<svg><title>i-vi</title></svg>`, `<textarea>A-E</textarea>`, `<iframe>A-E</iframe>` → đều trả `isEffectivelyEmptyInstruction === true` và `extractExpectedBankCount === null`.
     - Input `<style>...</style>` trong `deduplicateGroupIntroPreamble` tạo `clean === ""`, không bao giờ được gán làm `matchedInstruction`.
  3. Thêm tests cho `deduplicateGroupIntroPreamble`:
     - **Neanderthal Technology** (`[headings, info, summary, mcq]` với flattened intro nguyên văn từ `Collection-neanderthal-technology.json`, cả bản plain text lẫn bản có `body_html` ở `info` và `<table>` ở `summary`): gom sạch cả 4 cụm, `cleanedPreamble === ""`, `headings` giữ trọn 2 dòng gồm `i-vi`, `info` giữ trọn `"Look at the following findings..."` + `"NB: You may use any letter more than once."` (+ `body_html` nếu có), `summary` giữ `NO MORE THAN TWO WORDS`, `mcq` giữ `"Choose the correct answer, A, B, C or D."`.
     - **Bovids** (`[mcq, info, fill_blank]` với flattened intro nguyên văn từ `Collection-bovids.json`): gom sạch cả 3 cụm, `cleanedPreamble === ""`, `info` giữ trọn 3 dòng sub-family `A, B, C or D` + `NB`, `fill_blank` gom trọn `"Answer the questions below."` + `"Choose NO MORE THAN THREE WORDS..."` + `"Write your answers in boxes 9-13..."`.
     - **Multi-matching & Listening edge cases từ dataset thật:**
       - 2 nhóm `info` cùng loại (`Actual-Test-return-of-monkey-life.json`: `info` positional `A–G` + `summary` + `info` named locations `A–C`): gán đúng thứ tự cho từng `info`.
       - `info(pos)` + `features(non-person)` (`C14T3-the-concept-of-intelligence.json` `"list of theories"` đứng trước/khi `info` trống): `features` luôn được ưu tiên nhận named-matching trước `info`.
       - `sentend` (`"Complete each sentence with the correct ending, A-F, below."` và `"Complete the following sentences with the best endings from the box below."` của `Collection-diabetes.json`) đứng cùng `sent`: `sent` KHÔNG cướp `sentend`.
       - `Forecast-Quy-2-2025-smell-and-memory.json` (`"Match each ending with the correct researcher"`): gán cho `match_names`/`features`, KHÔNG bị `sentend` cướp.
       - `mcq_many` khớp `"Choose TWO correct answers."` (`Actual-Test-playing-with-science.json`), và trong Listening (`C13T3-S2-physical-activities.json`, `C17T2-S3-romeo-and-juliet.json`) `mcq_many` tuyệt đối KHÔNG cướp `"Choose SIX answers from the box and write the correct letter, A-G, next to Questions 11-16"` của `matching`!
       - `mcq` KHÔNG cướp `"Choose the correct letter, A-H, in boxes 14-20"` của `info`.
       - `map` khớp `"Label the map below."` và `"Label the plan below."` (`C11T4-S2-basement-of-museum.json`), nhưng KHÔNG cướp `"Label the map or diagram below. Choose NO MORE THAN TWO WORDS..."` của `diagram`.
       - `headings` peek `"One of the headings has been done for you as an example."` + `Example` + `Paragraph H` (`Actual-Test-what-is-a-dinosaur.json`), và KHÔNG chạy `scanInlineSiblingEndIdx` (không nuốt ghi chú/`RT11`/`body_html` nhóm khác có `[11]..[14]`).
       - Negative guards: ghi chú tiếng Việt và `RT11` canary giữ nguyên trong `cleanedPreamble`.
  4. Thêm tests cho `isPositionalSectionBank` và `resolvePartInstruction`:
     - `isPositionalSectionBank`: `["A".."F"]` → `true`; `["Paragraph A".."Paragraph H"]` → `true`; `["Section A","Section B"]` → `true`; `["Antelope","Bovinae","Caprinae","Cephalophinae"]` → `false`; `["The Périgord region","Moldova"]` → `false`; `[]` → `false`.
     - `headings`: 6 mục → `...roman numeral i–vi.`; 12 mục → `...roman numeral i–xii.`; `isBankScoped: false` → fallback trung tính không ghi `i–viii` hay `i–xi`.
     - `info`: 4 phân họ Bovids (named) → `"Match each item with the correct option from the list below. Write the correct letter A–D."`; 5 địa danh Neanderthal (named) → `"...Write the correct letter A–E."`; 6 đoạn positional `["A".."F"]` hoặc `["Paragraph A".."Paragraph F"]` → `"Which section contains the following information? Write the correct letter A–F."`; `isBankScoped: false` → fallback trung tính không chứa `"A–H"` hay `"A–K"`.
     - `sentend`, `map`, `match2`, `match` với 5 mục → `A–E`; với `isBankScoped: false` → trung tính không ghi `A–H` hay `A–K`.
  5. Thêm tests cho `extractExpectedBankCount` và `scopeFlattenedOptionBank`:
     - `extractExpectedBankCount("headings", "Reading Passage 3 has five sections... Choose the correct number, i-vi, in boxes 27-31.")` → `6`.
     - `extractExpectedBankCount("headings", "Reading passage has six paragraphs, A-F. Choose the correct heading...")` → `null` (KHÔNG lấy `A-F`).
     - `extractExpectedBankCount("info", "...correct place A-E.")` → `5`; `"...correct sub-family, A, B, C or D."` → `4`; xung đột 2 dải lựa chọn khác nhau (`A-E` và `A-G`) → `null`.
     - `scopeFlattenedOptionBank` trên **Neanderthal Technology** (`skill: "reading"`, `6 + 5 = 11`, `[headings, info, summary(passage), mcq]`): `{ partitioned: Map(part-1 → 6 headings, part-2 → 5 places, part-3 → [], part-4 → []), isBankScoped: true }`.
     - `scopeFlattenedOptionBank` trên **Bovids** (`skill: "reading"`, `[mcq, info, fill_blank]`, 4 phân họ): `{ partitioned: Map(part-1 → [], part-2 → 4 sub-families, part-3 → []), isBankScoped: true }`.
     - `scopeFlattenedOptionBank` trên `headings` (7) + word-bank `summary` (`using the list of words, A-G, below`, 7) với 14 mục: tách đúng `7 + 7`, `isBankScoped: true`.
     - **Fail-closed tests (`{ partitioned: null, isBankScoped: false }`):**
       - 2 nhóm `info` liền kề bị gộp thành 1 part: tiền tố positional (`Collection-why-don-t-we-sleep.json`: `["A".."I", "Giulio Tononi", ...]` = 14 mục) VÀ hậu tố positional (`Forecast-Quy-2-2025-world-ecotourism-in-developing-countries.json`: `["Cuba", ..., "Belize", "A".."G"]` = 12 mục).
       - `Collection-book-review-the-discovery-of-slowness...json` (`info` 8 + `summary` `"Write the correct answer with ONE WORD chosen from the box below"` 11 = 19 mục, không loại nhầm chỉ vì `extractWordLimit !== null`).
       - Đề 1 nhóm matching có `"Reading Passage 1 has eight paragraphs, A-H."` còn sót trong `introPreamble` vẫn đạt `isBankScoped: true` (Condition 4 loại `PASSAGE_STRUCTURE_RE` trước khi kiểm tra).
       - `Collection-satellite-technology.json` (`headings` `i-ix` 9 mục + `summary` không khớp word-bank directive, tổng 15 mục).
       - `Collection-improving-patient-safety.json` (`match_names` 4 + `summary` `"Complete the summary below."` 7 = 11 mục).
       - `Other-sources-delivering-the-goods.json` (`info` 9 + `summary` `instructions: ""` 11 = 20 mục).
       - `Forecast-Quy-2-2025-learning-theory.json` (`info` 7 + `tfng` + word-bank `summary` không nêu range, 17 mục).
       - `Actual-Test-what-is-a-dinosaur.json` (`13 + 8 = 21` bị `.slice(0, 20)` → tổng lệch).
       - `Actual-Test-griffith-and-american-films.json` (`headings` thiếu `i-vii`).
       - `flowchart` trên `reading` (KHÔNG nằm trong optional bank của `libraryOptionBankKindFor` → không được tách làm ẩn `showDetailBank`).
       - Part `source: "intro"` chứa hỗn hợp 2 required-bank type khác nhau (`headings` + `info` trong cùng 1 part).
       - `parts.length === 1` (`map` pin test): `{ partitioned: null, isBankScoped: true }`.
- **Success criteria:** Tests mới thất bại (Red) khi chạy vitest.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/lib/quiz-instruction.test.ts` exits non-zero with import/assertion failures on the new cases (passing test is a failure).

### Task 1.2 — Cài đặt logic đã gia cố trong `packages/ui/src/lib/quiz-instruction.ts` (Green phase)
- **Goal:** Cài đặt đầy đủ scanner `toSafePlainText` `O(N)`, matching/MCQ/`fill_blank` clustering có giới hạn biên, `isPositionalSectionBank`, dynamic `resolvePartInstruction`, `extractExpectedBankCount`, và `scopeFlattenedOptionBank` pass 100% unit tests cũ và mới.
- **Target files and symbols:** `packages/ui/src/lib/quiz-instruction.ts` (`ResolvePartInstructionOptions`, `FlattenedOptionBankScope`, `isPositionalSectionBank`, `resolvePartInstruction`, `deduplicateGroupIntroPreamble`, `extractExpectedBankCount`, `scopeFlattenedOptionBank`)
- **Steps:**
  1. Import `extendedAnswerChoices` từ `@teacher-os/api/contracts`.
  2. Thay thế `toSafePlainText` bằng scanner tuyến tính `O(N)` một lượt (không regex `[\s\S]*?` backtracking):
     - Khi gặp `<!--`, nhảy tới `-->` (hoặc hết chuỗi nếu chưa đóng).
     - Khi gặp thẻ mở `<tagName...>`, parse tên thẻ và bỏ qua phần attributes có tôn trọng dấu ngoặc đơn/kép (`'...'` / `"..."`) để dấu `>` trong attribute không bao giờ thoát ra ngoài.
     - Nếu `tagName` thuộc tập container không hiển thị (`script`, `style`, `noscript`, `template`, `iframe`, `svg`, `math`, `textarea`, `title`, `object`, `embed`) và không self-closing: tìm thẻ đóng `</tagName` bằng `indexOf` (không phân biệt hoa thường), bỏ qua toàn bộ nội dung bên trong (đến hết chuỗi nếu chưa đóng thẻ).
     - Nếu thẻ là `br` hoặc thẻ đóng block (`p|div|li|h1-h6|tr|blockquote|pre|td|th`), chèn 1 dấu cách; bỏ qua mọi thẻ còn lại.
     - Decode basic entities + `collapseWhitespace`.
     - Đồng bộ `isTfngSelfContained` dùng kiểm tra tuyến tính không có cặp `[\s\S]*` lồng nhau.
  3. Cài đặt `isPositionalSectionBank(bank: readonly string[]): boolean`:
     - Kiểm tra `bank.length > 0 && bank.length <= 20`.
     - Khớp từng phần tử với `extendedAnswerChoices("letter")[index]` sau `entry.trim().replace(/^(?:paragraph|section)\s+/i, "").toUpperCase()`.
  4. Cập nhật `ResolvePartInstructionOptions` thêm `isBankScoped?: boolean` và cập nhật `resolvePartInstruction`:
     - Giữ nguyên thứ tự ưu tiên 1 (`matchedInstruction`), 2 (`summary`/`flow`/`flowchart` có `partBank`), 3 (`mcq`), 4 (`completion` với `contextIntro`).
     - Với `headings`, `info`, `sentend`, `map`, `match2`, `match`:
       - Nếu `options?.isBankScoped === false`: trả chuỗi fallback trung tính không hardcode dải `i–viii`/`A–H`.
       - Ngược lại nếu `partBank` có `2 <= len <= 20`:
         - `headings`: `Write the correct roman numeral i–${lastRoman}.`
         - `info`: nếu `isPositionalSectionBank(partBank)` → `"Which section contains the following information? Write the correct letter A–${lastLetter}."`; ngược lại → `"Match each item with the correct option from the list below. Write the correct letter A–${lastLetter}."`.
         - `sentend`: `"Complete each sentence with the correct ending A–${lastLetter}."`
         - `map`: `"Label the map below. Write the correct letter A–${lastLetter} for each location."`
         - `match2` / `match`: `"Choose your answers from the option bank A–${lastLetter}."`
  5. Cài đặt helper `scanInlineSiblingEndIdx(blocks, cleans, startAfterIdx, candidatePart, missingParts)` có giới hạn biên an toàn:
     - Không bao giờ chạy cho `candidatePart.typeId === "headings"`.
     - Tối đa `30` block quét, tối đa `2` block không-marker liên tiếp trước khi gặp marker đầu tiên, dừng ngay tại block không khớp `INLINE_SIBLING_BLOCK_RE`, block có anchor nhóm khác (`detectTfngCluster`, `detectMatchingAnchor`, `detectMcqAnchor`, `isAnotherCompletionAnchor`, `extractWordLimit`), hoặc block không chứa nội dung ASCII/English hợp lệ dạng đề (chặn ghi chú tiếng Việt).
     - Khi tìm được marker `[N]`/`<strong>(N)</strong>` (`>= 2` marker): nếu `candidatePart.questions.length > 0`, kiểm tra tập số marker không thuộc riêng dải 1-based (`delta = 0`) của một `missingPart` khác trong khi không khớp `candidatePart` ở `delta = 0`.
  6. Cập nhật `deduplicateGroupIntroPreamble` đúng thứ tự ưu tiên chặt:
     - Bước 1: `isDuplicate` (giữ nguyên).
     - Bước 2a: `detectTfngCluster` (giữ nguyên).
     - Bước 2b: `detectMatchingCluster(blocks, cleans, idx, missingParts)`:
       - Xử lý câu dẫn `PASSAGE_STRUCTURE_RE` đứng ngay trước anchor `headings` hoặc `info` (positional).
       - Xử lý câu hỏi dẫn Listening (`^(?:what|which)\b[\s\S]{0,160}\b(?:each\s+of\s+the\s+following|these)\b`) đứng ngay trước `"Choose <N> answers from the box..."`.
       - Nhận diện anchor:
         - `headings`: `/\b(?:list\s+of\s+headings?|correct\s+headings?|suitable\s+headings?|heading\s+for\s+(?:each|paragraphs?|sections?)|match\s+(?:each\s+of\s+the\s+following\s+)?headings?)\b/i`.
         - `info` (positional): `/\bwhich\s+(?:paragraphs?|sections?)\s+(?:contains?|states?|has|mentions?)\s+(?:the\s+following\s+)?information\b/i`.
         - `sentend`: `/\bcomplete\s+(?:each|the(?:\s+following)?)\s+sentences?\s+with\s+(?:the\s+)?(?:correct|best)\s+(?:endings?|letters?)\b/i`.
         - `map`: `extractWordLimit(clean) === null && /\blabel\s+the\s+(?:map|plan|floor\s*plan)\b/i.test(clean)` (khi `map` có trong `missingParts`).
         - Named matching (`features`, `match_names`, `matching`, `match2`, `match`, `info`): khớp `^look at the following` (kèm `list of` hoặc dòng kế tiếp `^match (?:each|the)`), `match (?:each|the) (?:statement|finding|characteristic|feature|item|event|year|company|researcher|person|technique|use|ending|following)`, `use the information in the passage to match`, `classify the following`, `choose your answers? from the option bank`, hoặc `choose (?:\w+|\d+) answers? from the (?:box|list)`. **Chọn ứng viên:** luôn ưu tiên nhóm chuyên biệt (`features`, `match_names`, `matching`, `match2`, `match` — ưu tiên khớp từ khóa người/công ty nếu có nhiều nhóm chuyên biệt) TRƯỚC `info`, rồi mới chọn `info` đầu tiên trong `missingParts`.
       - Peek đuôi hợp lệ: `^match (?:each|the)`, `^(?:choose|write) (?:the )?(?:correct|appropriate) (?:heading|number|letter|ending|option|person|place|location|researcher|date|event|answer)s?`, `^choose (?:\w+|\d+) answers? from the (?:box|list)`, `^nb\b`, `^you may (?:use|choose) any letter more than once`, `^write (?:your |the correct |the appropriate )?(?:letters?|answers?) in (?:the )?boxes?`, và với `headings`: `^one of the headings has been done\b`, `^example(?:\s+answer)?[:.\s]*$` (+ tối đa 1 dòng `^(?:paragraph|section)\s+[A-Z]\b`), `^example(?:\s+answer)?\s*:`. Sau đó gọi `scanInlineSiblingEndIdx` (đã chặn `headings`).
     - Bước 2c: `detectMcqCluster(blocks, cleans, idx, missingParts)`:
       - `mcq_many`: khớp `/\b(?:choose|select|pick)\s+(?:two|three|four|five|\d+)\s+(?:(?:correct|appropriate|best)\s+)?(?:letters?|answers?|options?)\b/i` hoặc `/^which\s+(?:two|three|four|five|\d+)\b/i`, **với negative guard bắt buộc** loại `/\bfrom\s+the\s+(?:box|list)\b/i`, `/\bnext\s+to\s+questions?\b/i`, `/\bwrite\s+the\s+correct\s+letter,?\s*A\s*[-–—]/i`. Peek tối đa các dòng `^which (?:two|three|four|five|\d+)`, `^write (?:your |the correct )?(?:letters?|answers?) in (?:the )?boxes?`, `^nb\b.*any\s+order`.
       - `mcq`/`mcq1`/`mcq3`: khớp `/^choose\s+the\s+correct\s+(?:letter|answer)\b/i` với negative guard loại `two|three|four|five`, `headings?`, `endings?`, `from\s+the\s+(?:list|box)`, và dải `[A-T]\s*[-–—]\s*[B-T]`. Peek tối đa 1 dòng `write (?:your |the correct )?(?:letters?|answers?) in (?:the )?boxes?`.
     - Bước 2d: Nhánh `completion`:
       - Mở rộng `fill_blank` khi `missingParts` không có `shortans`/`notes`/`diagram` tương ứng để khớp `/\b(?:answer\s+the\s+questions?|complete\s+the\s+notes?|label\s+the\s+diagrams?)\b/i`.
       - Mở rộng `summary` nhận `"complete the following paragraph"` khi `WORD_BANK_DIRECTIVE_RE` hoặc word limit đi kèm (phủ `C15T3-why-fairy-tales-are-really-scary-tales.json`).
       - Chặn completion nuốt dòng đơn không có word limit / không có inline marker nếu dòng `idx + 1` là anchor matching rõ ràng (`C13T3 Harappan`).
  7. Cài đặt và export `extractExpectedBankCount(typeId: string, instruction: string): number | null` và `scopeFlattenedOptionBank(parts: readonly QuizPart[], optionBank: readonly string[], matchedInstructionsByPartId: ReadonlyMap<string, string>, options: { skill: string; introPreamble?: string }): FlattenedOptionBankScope`:
     - `extractExpectedBankCount`: luôn chạy `toSafePlainText(instruction)`.
       - `headings`: chỉ tìm roman lowercase `/\bi\s*(?:[-–—]|to)\s*([ivx]{1,4})\b/g`, tra `extendedAnswerChoices("roman")`, đòi đúng 1 giá trị duy nhất trong `[2..20]`.
       - Các dạng chữ cái khác: tìm case-sensitive `/\bA\s*[-–—]\s*([B-T])\b/g` và danh sách liệt kê nối tiếp bắt đầu từ `A` với quantifier có trần (`\bA(?:\s*,\s*[B-T]){0,18}\s*(?:,?\s*or\s+|\s*&\s*)([B-T])\b`, xác nhận dãy liên tiếp `A, B, C...`). Nếu tìm được nhiều giá trị khác nhau và văn bản có mệnh đề cấu trúc đoạn văn (`/(?:the\s+)?reading\s+passage(?:\s+\d+)?\s+(?:has|contains)\s+[^.!?\n]+/gi`), thử loại bỏ mệnh đề cấu trúc đoạn văn đó để giữ riêng dải lựa chọn; nếu vẫn còn `!= 1` giá trị khác nhau trong `[2..20]` → trả `null` (fail-closed).
     - `scopeFlattenedOptionBank`:
       - Tập bankable theo `skill` khớp 1-1 với `libraryOptionBankKindFor`:
         - Required bank: `reading`: `headings`, `info`, `features`, `match_names`, `matching`, `sentend`; `listening`: `match2`, `matching`, `info`, `match_names`, `features`, `map`; `vocabulary`: `match`.
         - Optional word-bank: `reading`: `summary`; `listening`: `summary`, `flow` (tuyệt đối KHÔNG `flowchart`).
       - Kiểm tra part có chứa `>= 2` required-bank type khác nhau bên trong `part.questions` (`source: "intro"`) → fail-closed `{ partitioned: null, isBankScoped: false }`.
       - Helper `hasMixedPositionalRun(bank)`: trả `true` khi `!isPositionalSectionBank(bank)` VÀ (có tiền tố độ dài `>= 2` dạng positional HOẶC tồn tại `offset > 0` với `bank.length - offset >= 2` sao cho `isPositionalSectionBank(bank.slice(offset))` là `true`) — bắt trọn cả 7 đề `info+info` bị `clusterByType` gộp (gồm cả `Forecast-Quy-2-2025-world-ecotourism-in-developing-countries.json`).
       - Helper `hasWordBankDirective(plain, typeId, effInstr)`: `(WORD_BANK_DIRECTIVE_RE.test(plain) || extractExpectedBankCount(typeId, effInstr) !== null) && !/\bfrom\s+the\s+passage\b/i.test(plain)`. Một part optional-bank (`summary` ở `reading`; `summary`/`flow` ở `listening`) chỉ vào `bankableParts` khi `hasWordBankDirective` đúng (không loại trừ chỉ vì `extractWordLimit !== null`).
       - Khi `optionBank.length === 0`: `{ partitioned: null, isBankScoped: true }`.
       - Khi `parts.length <= 1`: kiểm tra `countMismatch` (nếu có 1 bankablePart và `extractExpectedBankCount` trả `count !== null && count !== optionBank.length`) hoặc `hasMixedPositionalRun(optionBank)` → `{ partitioned: null, isBankScoped: !(countMismatch || mixedRun) }` (giữ `partitioned: null` để không làm đổi hành vi `showDetailBank` cho đề 1 part như `map` pin test).
       - Khi `bankableParts.length === 0`: `{ partitioned: null, isBankScoped: !hasMixedPositionalRun(optionBank) }`.
       - Khi `bankableParts.length === 1`: kiểm tra 4 điều kiện fail-closed:
         1. `extractExpectedBankCount(bp.typeId, bpEffInstr)` trả `count !== null && count !== optionBank.length`.
         2. `hasMixedPositionalRun(optionBank)` là `true`.
         3. Tồn tại part optional-bank (`summary` ở `reading`, `summary`/`flow` ở `listening`, kể cả kiểm tra `part.questions`) khác trong `parts` có `hasWordBankDirective` hoặc thiếu bằng chứng điền-từ-đoạn-văn (`extractWordLimit(effInstr) === null && !/\bfrom\s+the\s+passage\b/i.test(plain)`).
         4. `options.introPreamble` (sau khi strip `PASSAGE_STRUCTURE_RE`) vẫn còn chứa chỉ thị word-bank chặt (`list of words/phrases`, `from the list/box`, `box/list below`, `using ... A–Z` — không bắt bare `A-Z`) hoặc anchor matching chưa tiêu thụ.
         Nếu bất kỳ điều kiện nào đúng → `{ partitioned: null, isBankScoped: false }`; ngược lại trả `{ partitioned: Map(bp.id → [...optionBank], others → []), isBankScoped: true }`.
       - Khi `bankableParts.length >= 2`: đọc CHỈ instruction riêng/matched của từng `bp` (tuyệt đối không fallback `introPreamble`), yêu cầu mọi `bp` có `count !== null && count >= 2` và `sum(counts) === optionBank.length`; nếu khớp cắt mảng mới `.slice(offset, offset + count)` (kiểu `string[]`), trả `{ partitioned, isBankScoped: true }`; ngược lại `{ partitioned: null, isBankScoped: false }`.
- **Success criteria:** Toàn bộ tests cũ và mới trong `quiz-instruction.test.ts` pass 100%, không lỗi TypeScript.
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
