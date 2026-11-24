---
phase: 2
title: "Phase 2: Instruction Resolution & Multi-Block Deduplication"
status: completed
priority: P1
effort: "50m"
dependencies: [1]
---

# Phase 2: Instruction Resolution & Multi-Block Deduplication

<!-- Updated: Red-Team Review 2026-11-24 - Added 2-tier word-limit extraction (fixes leftmost-first truncation & ONLY ONE WORD guard), safe plain-text extraction before regex, mixed HTML+plain-text block splitting/joining, narrowed shortans regex, word-bank non-peek guard, multi-block inline body peek, and expanded TFNG/YNNG grammar -->

## Goal
Sửa `WORD_LIMIT_REGEX`, `extractWordLimit`, `resolvePartInstruction` và `deduplicateGroupIntroPreamble` trong `packages/ui/src/lib/quiz-instruction.ts` để nhận diện chính xác mọi biến thể giới hạn từ (bao gồm `Use ONE WORD` và `<strong>ONE WORD</strong>`) và gom sạch các cụm hướng dẫn nhiều dòng (`completion`, `tfng`, `ynng`, inline body) trên cả input plain text lẫn hỗn hợp HTML + plain text.

## Files to Create / Modify
- Modify: `packages/ui/src/lib/quiz-instruction.ts`
- Modify: `packages/ui/src/lib/quiz-instruction.test.ts`

## Tasks & Steps

### Task 2.1 — Bổ sung unit tests cho các ca lỗi thật trước khi sửa code (Red phase)
- **Goal:** Viết các unit tests tái hiện chính xác lỗi của **The History of Tea** và toàn bộ edge cases từ dataset + Red-Team.
- **Target files and symbols:** `packages/ui/src/lib/quiz-instruction.test.ts`
- **Steps:**
  1. Thêm tests cho `extractWordLimit` / `resolvePartInstruction`:
     - `sent` với `"Complete the sentences below with words taken from Reading Passage 1. Use ONE WORD for each answer."` → `"Complete the sentences below. Choose ONE WORD from the passage for each answer."` (không còn `NO MORE THAN THREE WORDS`).
     - HTML inline `<strong>`: `"<p>Fill the blanks. Write <strong>ONE WORD</strong> for each answer.</p>"` → `ONE WORD`.
     - Không bị cắt cụt leftmost-first: `"Write ONE WORD AND/OR A NUMBER for each answer."` → `ONE WORD AND/OR A NUMBER`; `"Choose ONE WORD ONLY from the passage"` → `ONE WORD ONLY`; `"Write ONE WORD OR A NUMBER"` → `ONE WORD OR A NUMBER`; `"Write ONE WORD AND/OR NUMBERS"` → `ONE WORD AND/OR NUMBERS`; `"Write ONE WORD AND / OR A NUMBER"` → `ONE WORD AND/OR A NUMBER`; `"Write NO MORE THAN FOUR WORDS"` → `NO MORE THAN FOUR WORDS`; `"Write NO MORE THAN FIVE WORDS"` → `NO MORE THAN FIVE WORDS`; `"Write NO MORE THEN TWO WORDS"` → `NO MORE THAN TWO WORDS`; `"Write TWO WORDS AND/OR A NUMBER"` → `TWO WORDS AND/OR A NUMBER`; `"Use ONE OR TWO WORDS only"` → `ONE OR TWO WORDS ONLY`; `"using ONLY ONE WORD OR A NUMBER"` → `ONLY ONE WORD OR A NUMBER`.
     - Thay trọn cụm giới hạn trong `fill_blank`/`shortans` (`NO MORE THAN THREE WORDS AND/OR A NUMBER` → `ONE WORD`, không sót `AND/OR A NUMBER`), `diagram` (`NO MORE THAN TWO WORDS` → `ONE WORD`), và `form` (`ONE WORD AND/OR A NUMBER` → `ONE WORD`).
     - Guard chống false-positive & spoof: `"There is only one word missing in paragraph 2."`, `"Please change one word"`, `"<a href='https://x/write-one-word'>Link</a>"`, `"<style>use one word for each</style>"` đều KHÔNG ghi đè fallback.
     - `matchedInstruction` nhiều `<p>` (`"<p>Line 1</p><p>Line 2</p>"` và `"<p>Line 1</p ><p>Line 2</p>"`) được giữ nguyên vẹn; `<p>Single</p >` đơn được unwrap sạch.
  2. Thêm tests cho `deduplicateGroupIntroPreamble`:
     - Đề **The History of Tea** (plain-text multi-line intro + bản trộn `<table>` của Group 1 với plain-text 5 dòng TFNG của Group 2): tiêu thụ đúng hướng dẫn từng nhóm, `cleanedPreamble === ""`, không dính chữ kiểu `below.Write`, và giữ nguyên ghi chú giáo viên tiếng Việt nếu có ở đầu/cuối.
     - Cụm TFNG/YNNG biến thể thật: `On your answer sheet please choose`, `On your answer sheet please write`, `choose:`, `Do the following statement agree...`, `Are the following statements YES, NO or NOT GIVEN...`, và phân biệt `tfng` vs `ynng` dựa theo nhãn `TRUE/FALSE` vs `YES/NO`.
     - Cụm completion tách 2–3 dòng (`Complete the summary below.` + `Choose NO MORE THAN TWO WORDS...` + `Write your answers in boxes 10-13...`) và inline body nhiều block (`<h3>Wildfires</h3><p>...</p><p>– movement: [1]...[2]...</p>`).
     - Bảo vệ không cướp hướng dẫn: `shortans` không cướp `"Questions 11–13: Complete the summary below. Choose NO MORE THAN TWO WORDS..."`; word-bank summary (`"Complete the summary using the list of words, A-L, below."`) KHÔNG peek dòng word-limit của nhóm `shortans` kế tiếp; `missingCompletionParts.length === 1` gán đúng khi `[summary, tfng]` cùng thiếu.
     - Bảo vệ không nuốt ghi chú giáo viên tiếng Việt (`"<p>Ghi chú riêng của giáo viên.</p>"`, `"Đọc đoạn văn và chọn TRUE / FALSE / NOT GIVEN."`), không xóa nhầm block ngắn (`"Note"`) trong `ownTexts`, không chấp nhận block ẩn chỉ chứa `<style>...</style>` làm `matchedInstruction`, và giữ nguyên `RT11` canary.
- **Success criteria:** Các test mới thất bại trên code hiện tại (Red).
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/lib/quiz-instruction.test.ts` exits non-zero with assertion failures on the new test cases (passing test is a failure).

### Task 2.2 — Cài đặt sửa `packages/ui/src/lib/quiz-instruction.ts` (Green phase)
- **Goal:** Cài đặt đầy đủ logic trích xuất plain-text an toàn, khớp word-limit 2 tầng, tách/nối block hỗn hợp HTML + plain text, và gom cụm đa block để mọi test cũ và mới trong `quiz-instruction.test.ts` pass 100%.
- **Target files and symbols:** `packages/ui/src/lib/quiz-instruction.ts` (`COMPLETION_TYPE_REGEX`, `WORD_LIMIT_REGEX`, `extractWordLimit`, `resolvePartInstruction`, `deduplicateGroupIntroPreamble`, `isEffectivelyEmptyInstruction`)
- **Steps:**
  1. Viết helper nội bộ `toSafePlainText(input: string): string` (loại bỏ `<script>`/`<style>`/`<noscript>`/`<template>` cùng nội dung bên trong, bỏ toàn bộ tag/attribute HTML, decode entity cơ bản, và `collapseWhitespace`) — nhất quán ở cả browser/jsdom lẫn Node.
  2. Thu hẹp `COMPLETION_TYPE_REGEX.shortans` thành `/\banswer\s+the\s+questions?\b/i`.
  3. Viết `extractWordLimit(text: string): string | null` dùng 2 tầng trên `toSafePlainText(text)` (và cập nhật `WORD_LIMIT_REGEX` đồng bộ):
     - **Tầng 1 (mẫu dài/cụ thể):**
       - `no\s+more\s+th[ae]n\s+(?:one|two|three|four|five|\d+)\s+words?(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?`
       - `(?:(?:choose|write|use|using|with)\s+)?(only\s+one\s+word\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)` hoặc `(?:choose|write|use|using|with)\s+(only\s+one\s+word)\b` hoặc `\b(only\s+one\s+word)(?=\s+(?:from\s+the\b|for\s+each\b|in\s+each\b|per\b))`
       - `one\s+or\s+two\s+words(?:\s+only)?`
       - `one\s+word\s+only(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?`
       - `(?:one|two|three|four|five|\d+)\s+words?\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?`
     - **Tầng 2 (chỉ chạy khi Tầng 1 trả `null`, bare `ONE WORD` có neo + negative lookahead):**
       - `(?:choose|write|use|using|with)\s+(one\s+word)\b(?!\s+(?:only|and\s*\/\s*or|or)\b)` hoặc `\b(one\s+word)\b(?=\s+(?:from\s+the\b|for\s+each\b|in\s+each\b|per\b))`
     - Chuẩn hoá output: uppercase, `\bNO\s+MORE\s+THEN\b` → `NO MORE THAN`, `\s*\/\s*` → `/`, collapse whitespace.
  4. Trong `resolvePartInstruction`:
     - Chỉ unwrap thẻ `<p>` đơn khớp `/^<p(?:\s[^>]*)?>([\s\S]*)<\/p\s*>$/i` khi `!/<\/p\b/i.test(inner)`.
     - Dùng `FALLBACK_WORD_LIMIT_REGEX` (nhánh có `AND/OR A NUMBER` trước) thay trọn cụm giới hạn trong `fallback`.
  5. Trong `deduplicateGroupIntroPreamble`:
     - Viết `splitMixedIntroBlocks(input: string): string[]`: chỉ tách theo top-level block HTML (`p|div|table|ul|ol|blockquote|h[1-6]|pre|hr`) khi có tag đóng/void thực sự (không cắt thẻ inline `<strong>`/`<em>`, không để thẻ chưa đóng nuốt phần sau), và tách tiếp mọi đoạn text ngoài thẻ theo `\n`.
     - Khi xây `ownTexts` từ các part đã có `instructionHtml`: lưu cả tập sub-block chuẩn hoá (tách cả `<br>` và `\n`) để so exact lẫn full text chuẩn hoá; chỉ dùng `includes` hai chiều khi chuỗi ngắn hơn có độ dài `>= 20` ký tự.
     - Nhánh `tfng`/`ynng`: nhận anchor tiếng Anh (`Do the following statements? agree...`, `Are the following statements (?:TRUE|YES)...`, hoặc `In (?:the )?boxes?...` / `On your answer sheet...` kèm dòng legend phía sau), gom liền dòng trung gian (`write`/`choose`/`chose`, `in (?:the )?boxes?...`, `on your answer sheet...`) và dòng nhãn (`TRUE`/`FALSE`/`YES`/`NO`/`NOT GIVEN` kèm giải thích tiếng Anh), dừng sau `NOT GIVEN` hoặc khi gặp block ngoài cụm; xác định target `tfng` vs `ynng` dựa theo nhãn `TRUE/FALSE` vs `YES/NO` thực tế trong cụm.
     - Nhánh completion: đếm riêng `missingCompletionParts.length === 1`; cấm peek word-limit khi block hiện tại đã chỉ định chọn từ danh sách/hộp (`list of words/phrases`, `from the list/box`, `box below`, `list below`, `A-Z`); khi hợp lệ, peek dòng word-limit liền kề, tối đa 1 dòng `write (your )?answers? in boxes?`, và chuỗi sibling block inline (`<table>`/`<ul>`/`<ol>`/`<p>`/`<h2>`–`<h4>`) nếu đoạn sibling đó chứa `>= 2` marker `[N]`/`<strong>(N)</strong>` (dừng ngay khi gặp anchor nhóm khác).
     - Không gán `matchedInstruction` nếu `toSafePlainText(joined)` rỗng.
     - Viết `joinMixedBlocks(blocks: string[]): string`: nếu tất cả là plain text → `join("\n")`; nếu tất cả có block HTML → `join("")`; nếu hỗn hợp HTML + plain text → bọc block plain text bằng `<p>${escapeHtml(b)}</p>` trước khi nối `""`.
- **Success criteria:** Toàn bộ tests trong `quiz-instruction.test.ts` pass 100%.
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
